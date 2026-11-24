"""Real transaction ordering in a disposable loopback PostgreSQL database.

Uses psql only. Defaults to the local Supabase test port; never accepts a cloud
host. All committed fixtures belong to this run and are removed in finally.
"""
import concurrent.futures
import json
import os
import subprocess
import time
import uuid

if os.environ.get("PGHOST", "127.0.0.1") not in ("localhost", "127.0.0.1"):
    raise RuntimeError("Disposable loopback database only")

run_id = str(uuid.uuid4())


class Connection:
    def __init__(self, name):
        self.name = "club-order-" + run_id + "-" + name
        env = dict(os.environ, PGHOSTADDR="127.0.0.1", PGAPPNAME=self.name,
                   PGOPTIONS="-c statement_timeout=15000 -c lock_timeout=10000")
        self.process = subprocess.Popen([
            env.get("PSQL_BIN", "psql"), "-h", "127.0.0.1", "-p", env.get("PGPORT", "54322"),
            "-U", env.get("PGUSER", "postgres"), "-d", env.get("PGDATABASE", "postgres"),
            "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"], env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8")

    def sql(self, statement):
        self.process.stdin.write(statement + ";\n\\echo __ORDER_DONE__\n")
        self.process.stdin.flush()
        lines = []
        while True:
            line = self.process.stdout.readline()
            if not line:
                raise RuntimeError("psql stopped: " + "".join(lines))
            if line.strip() == "__ORDER_DONE__":
                return "".join(lines).strip()
            lines.append(line)

    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=20)


reader, a, b = [Connection(name) for name in ("reader", "a", "b")]
auth_id, root_id, first_id, second_id = [str(uuid.uuid4()) for _ in range(4)]
auth = f"select set_config('request.jwt.claim.sub','{auth_id}',true)"


def wait_for_lock(connection):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if reader.sql("select coalesce(wait_event_type,'') from pg_stat_activity "
                      f"where application_name='{connection.name}'") == "Lock":
            return
        time.sleep(0.02)
    raise AssertionError("second transaction did not reach the lock")


def swap_snapshot():
    snapshot = json.loads(a.sql("select public.load_club_order()"))
    rows = snapshot["rows"]
    first = next(row for row in rows if row["memberId"] == first_id)
    second = next(row for row in rows if row["memberId"] == second_id)
    first["number"], second["number"] = second["number"], first["number"]
    payload = json.dumps(rows, separators=(",", ":"))
    return f"public.save_club_order('{snapshot['revision']}','{payload}'::jsonb)"


try:
    reader.sql(f"""begin;
      insert into auth.users(id,email) values('{auth_id}','{auth_id}@example.invalid');
      insert into members(id,auth_user_id,public_code,access_status)
        values('{root_id}','{auth_id}','ORDER-{root_id}','active');
      insert into member_roles(member_id,role_id) values('{root_id}','root');
      insert into members(id,public_code,access_status)
        values('{first_id}','ORDER-{first_id}','active'),('{second_id}','ORDER-{second_id}','active');
      insert into identities(member_id,provider,provider_uid,username,guild_present,discord_roles)
        select v.id,'discord',v.id::text,'Order concurrency',true,
          jsonb_build_array(jsonb_build_object('id',s.required_discord_role_id))
        from (values('{first_id}'::uuid),('{second_id}'::uuid)) v(id) cross join club_settings s where s.id;
      commit""")
    a.sql("begin; " + auth)
    b.sql("begin; " + auth)
    save = swap_snapshot()
    a.sql("select " + save)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(b.sql, f"""do $$begin
          perform {save}; raise exception 'stale order accepted';
          exception when serialization_failure then
            if sqlerrm<>'club-order-stale' then raise; end if;
          end$$""")
        wait_for_lock(b)
        a.sql("commit")
        pending.result()
    b.sql("rollback")

    # Regression: a member FK cascade must not lock the order row before
    # directory, while a manual writer already holds directory.
    a.sql("begin; " + auth)
    b.sql("begin; " + auth)
    save = swap_snapshot()
    a.sql("select 1 from schedule_private.sync_versions where key='directory' for update")
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(b.sql, f"delete from members where id='{first_id}'")
        wait_for_lock(b)
        a.sql("select " + save)
        a.sql("commit")
        pending.result()
    b.sql("commit")
    positions = json.loads(reader.sql("select schedule_private.club_order_snapshot()"))["rows"]
    assert all(row["memberId"] != first_id for row in positions)
    assert [row["number"] for row in positions] == list(range(1, len(positions) + 1))
    print("PASS: stale concurrent save rejected; member deletion and reordering serialize without deadlock")
finally:
    # Release writer locks before the cleanup, including after a failed assertion.
    a.close()
    b.close()
    reader.sql(f"begin; delete from members where id in ('{root_id}','{first_id}','{second_id}'); "
               f"delete from auth.users where id='{auth_id}'; commit")
    reader.close()
