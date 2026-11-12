"""Create synthetic fixtures/keys for a disposable LOCAL Supabase, without PowerShell.
Never prints credentials. Use a fresh database; existing fixtures are not overwritten.
"""
import argparse
import hashlib
import os
from pathlib import Path
import secrets
import subprocess
from urllib.parse import urlparse, unquote

parser = argparse.ArgumentParser()
parser.add_argument("--database-url", required=True)
parser.add_argument("--api-url", default="http://127.0.0.1:54321/functions/v1/external-api/v1/schedule")
parser.add_argument("--env-file", required=True)
args = parser.parse_args()
db, api = urlparse(args.database_url), urlparse(args.api_url)
if db.scheme not in ("postgres", "postgresql") or db.hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit("Disposable loopback database only")
if api.scheme != "http" or api.hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit("Disposable loopback HTTP only")
target = Path(args.env_file)
if target.exists():
    raise SystemExit("Environment file already exists; choose a fresh path")
normal, limited = ["rp_" + secrets.token_hex(32) for _ in range(2)]
fixture = (Path(__file__).resolve().parents[3] / "tests/fixtures/external_api_seed.sql").read_text()
for marker, key in [("a", normal), ("b", limited)]:
    fixture = fixture.replace(f"repeat('{marker}',64)", "'" + hashlib.sha256(key.encode()).hexdigest() + "'")
env = dict(os.environ, PGPASSWORD=unquote(db.password or ""), PGHOSTADDR="127.0.0.1")
subprocess.run(["psql", "-X", "-h", db.hostname, "-p", str(db.port or 5432),
                "-U", unquote(db.username or "postgres"), "-d", unquote(db.path.lstrip("/")),
                "-v", "ON_ERROR_STOP=1", "-q"], input="begin;\n" + fixture + "\ncommit;",
               text=True, env=env, check=True)
with target.open("x", encoding="utf-8") as output:
    output.write(f"EXTERNAL_API_TEST_URL={args.api_url}\nEXTERNAL_API_TEST_KEY={normal}\n"
                 f"EXTERNAL_API_TEST_LIMITED_KEY={limited}\n")
target.chmod(0o600)
print("Synthetic fixtures ready; keys saved to the selected local environment file.")
