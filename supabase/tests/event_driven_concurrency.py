"""Disposable LOCAL PostgreSQL only: real independent transactions, no mock locks.

Use DATABASE_TEST_CONTAINER for docker exec, otherwise local psql on port 54322.
Each test owns a random synthetic member and removes only its own fixtures.
"""
import concurrent.futures
import json
import os
import subprocess
import time
import uuid

container = os.environ.get("DATABASE_TEST_CONTAINER")
command = (["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres"]
           if container else ["psql", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"])
command += ["-X", "-At", "-v", "ON_ERROR_STOP=1"]


def sql(statement, ok=True):
    result = subprocess.run(command, input=statement, text=True, capture_output=True, check=False)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    return result


def literal(value):
    return "'" + json.dumps(value, separators=(",", ":")) + "'::jsonb"


uid = str(uuid.uuid4())
mid = str(uuid.uuid4())
tag = "Q" + uid.replace("-", "")[:8]
kind = sql("select id from schedule_kinds where variant_id='nitro' and limit_id='50' limit 1;").stdout.strip()
day = sql("select (current_date+735)::text;").stdout.strip()
cell = {"date": day, "half": 20, "level": 0, "tables": 3}
empty = {"date": day, "half": 20, "level": 0, "member_id": None, "tables": None}
occupied = dict(empty, member_id=mid, tables=3)
auth = f"select set_config('request.jwt.claim.sub','{uid}',true);"


def v2(place, remove, expected):
    return (f"select apply_schedule_edit_v2('{uuid.uuid4()}','{kind}','{mid}',"
            f"{literal(place)},{literal(remove)},'[]',{literal(expected)});")


def race(first, second):
    # First transaction holds its mutation open. Poll pg_stat_activity to prove
    # the second request starts while the first sleeps with uncommitted changes.
    marker = "realtime-contract-" + str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor() as pool:
        pending = pool.submit(sql, f"begin; set application_name='{marker}'; {auth} {first} select pg_sleep(2); commit;")
        for _ in range(80):
            waiting = sql(f"select count(*) from pg_stat_activity where application_name='{marker}' and wait_event='PgSleep';").stdout.strip()
            if waiting == "1":
                break
            time.sleep(0.025)
        else:
            pending.result()
            raise AssertionError("first transaction did not hold the expected lock")
        losing = sql(f"begin; {auth} {second} commit;", ok=False)
        pending.result()
    assert losing.returncode != 0, "stale concurrent write unexpectedly succeeded"
    assert any(message in losing.stderr for message in ("schedule-conflict", "duplicate key", "seat taken")), losing.stderr


try:
    sql(f"""
      begin;
      insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at)
        values('{uid}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','{uid}@example.invalid',now(),now());
      insert into members(id,auth_user_id,public_code,access_status,mark_tag)
        values('{mid}','{uid}','RP-{uid}','active','{tag}');
      insert into member_roles(member_id,role_id) values('{mid}','root');
      insert into player_limits(player_id,variant_id,limit_id)
        select id,'nitro','50' from players where member_id='{mid}' on conflict do nothing;
      commit;
    """)
    # Two v2 empty-cell writers: advisory lock + a fresh expected-state check.
    race(v2([cell], [], [empty]), v2([cell], [], [empty]))
    assert sql(f"select count(*) from occupancy where member_id='{mid}';").stdout.strip() == "1"
    # A legacy edit changes the tables under a stale own-delete confirmation.
    replacement = dict(cell, tables=5)
    legacy_replace = (f"select apply_schedule_edit('{kind}','{mid}',{literal([replacement])},"
                      f"{literal([cell])},'[]');")
    race(legacy_replace, v2([], [cell], [occupied]))
    assert sql(f"select tables from occupancy where member_id='{mid}';").stdout.strip() == "5"
    target_key = f"slots:{day}:{kind}"
    before_delete = int(sql(f"select revision from schedule_private.sync_versions where key='{target_key}';").stdout.strip())
    # Empty-cell race against legacy insertion: uniqueness rolls back v2 intent.
    sql(f"begin; {auth} select apply_schedule_edit('{kind}','{mid}','[]',{literal([cell])},'[]'); commit;")
    after_delete = int(sql(f"select revision from schedule_private.sync_versions where key='{target_key}';").stdout.strip())
    assert after_delete == before_delete + 1, "last-cell deletion failed to retain/increment the target tombstone"
    legacy_insert = f"select apply_schedule_edit('{kind}','{mid}',{literal([cell])},'[]','[]');"
    race(legacy_insert, v2([replacement], [], [empty]))
    assert sql(f"select tables from occupancy where member_id='{mid}';").stdout.strip() == "3"
    assert sql(f"select count(*) from schedule_private.edit_receipts where actor_id='{mid}';").stdout.strip() == "1"
    print("PASS: concurrent v2/v2, stale legacy replacement, legacy empty-cell race; failed receipts roll back")
finally:
    sql(f"begin; delete from occupancy where member_id='{mid}'; delete from members where id='{mid}'; delete from auth.users where id='{uid}'; commit;")
