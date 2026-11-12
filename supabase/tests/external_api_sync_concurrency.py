"""Commit-order contract. Requires committed external_api_seed.sql in a disposable
LOCAL database. Uses psql only; no Python dependencies. Never accepts cloud hosts.
PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGDATABASE=postgres
PSQL_BIN may select an installed psql. Test fixtures use the synthetic a*64 digest.
"""
import concurrent.futures
import json
import os
import subprocess
import time

if os.environ.get("PGHOST", "127.0.0.1") not in ("localhost", "127.0.0.1"):
    raise RuntimeError("Disposable loopback database only")


class Connection:
    def __init__(self, name):
        env = dict(os.environ, PGHOST="127.0.0.1", PGHOSTADDR="127.0.0.1",
                   PGAPPNAME="redparty-v2-" + name,
                   PGOPTIONS="-c statement_timeout=15000 -c lock_timeout=10000")
        self.process = subprocess.Popen(
            [env.get("PSQL_BIN", "psql"), "-X", "-A", "-t", "-q",
             "-v", "ON_ERROR_STOP=1"], env=env, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8")

    def sql(self, query):
        self.process.stdin.write(query + ";\n\\echo __V2_DONE__\n")
        self.process.stdin.flush()
        lines = []
        while True:
            line = self.process.stdout.readline()
            if not line:
                raise RuntimeError("psql stopped: " + "".join(lines))
            if line.strip() == "__V2_DONE__":
                return "".join(lines).strip()
            lines.append(line)

    def sync(self, cursor=None, days=1):
        args = f"p_cursor=>'{cursor}'" if cursor else f"p_date=>'2098-11-01',p_days=>{days}"
        return json.loads(self.sql("select public.external_api_sync(repeat('a',64)," + args + ")"))

    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=20)


reader, a, b = [Connection(n) for n in ("reader", "writer-a", "writer-b")]
try:
    kind = reader.sql("select k.id from schedule_kinds k join rooms r on r.id=k.room_id "
                      "where r.slug='winamax' and k.variant_id='nitro' and k.limit_id='50'")
    # Only fixture business admission guards are disabled; feed triggers stay live.
    reader.sql("alter table occupancy disable trigger occupancy_guard")
    reader.sql(f"update occupancy set tables=3 where kind_id='{kind}' and "
               "slot_date in ('2098-11-01','2098-11-02') and half between 0 and 3")
    base = reader.sync()
    cursor = base["cursor"]
    assert cursor and base["mode"] == "full", base
    a.sql("begin")
    a.sql(f"update occupancy set tables=4 where kind_id='{kind}' and slot_date='2098-11-01' and half=0")
    b.sql("begin")
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        blocked = pool.submit(b.sql, f"update occupancy set tables=5 where kind_id='{kind}' "
                              "and slot_date='2098-11-01' and half=1")
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if reader.sql("select coalesce(wait_event_type,'') from pg_stat_activity "
                          "where application_name='redparty-v2-writer-b'") == "Lock":
                break
            time.sleep(0.02)
        else:
            raise AssertionError("Second writer did not wait for the partition counter")
        assert not blocked.done()
        assert reader.sync(cursor)["mode"] == "unchanged", "Uncommitted changes leaked"
        a.sql("commit")
        blocked.result(timeout=5)
        first = reader.sync(cursor)
        cells = [x for x in first["items"] if x["type"] == "cell"]
        assert len(cells) == 1 and cells[0]["half"] == 0, first
        b.sql("commit")
        second = reader.sync(first["cursor"])
        cells = [x for x in second["items"] if x["type"] == "cell"]
        assert len(cells) == 1 and cells[0]["half"] == 1, second
        assert reader.sync(second["cursor"])["mode"] == "unchanged"

    # Different partitions can commit out of start order. The vector must retain
    # the older-started, later-committed writer for the following poll.
    cursor = second["cursor"]
    a.sql("begin")
    a.sql(f"update occupancy set tables=6 where kind_id='{kind}' and slot_date='2098-11-01' and half=2")
    b.sql(f"update occupancy set tables=7 where kind_id='{kind}' and slot_date='2098-11-02' and half=2")
    # Use a two-day chain so both partitions are in scope.
    base = reader.sync(days=2)
    assert base["cursor"]
    a.sql("commit")
    late = reader.sync(base["cursor"])
    cells = [x for x in late["items"] if x["type"] == "cell"]
    assert len(cells) == 1 and cells[0]["date"] == "2098-11-01" and cells[0]["half"] == 2, late
    # A rolled-back write must not appear in a subsequent delta.
    a.sql("begin")
    a.sql(f"update occupancy set tables=8 where kind_id='{kind}' and slot_date='2098-11-01' and half=3")
    a.sql("rollback")
    assert reader.sync(late["cursor"])["mode"] == "unchanged"
    print("PASS: same-partition serialization, uncommitted isolation, out-of-order commits, rollback")
finally:
    a.sql("rollback")
    b.sql("rollback")
    reader.sql("alter table occupancy enable trigger occupancy_guard")
    for connection in (reader, a, b):
        connection.close()
