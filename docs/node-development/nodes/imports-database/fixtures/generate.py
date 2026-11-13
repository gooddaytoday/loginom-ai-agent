"""Build people.db from people.sql with Python sqlite3 (not Loginom).

Usage: python3 -I generate.py OUT.db   — refuses to overwrite OUT.db.
The .db bytes depend on the SQLite library version, so the committed
manifest pins table content, not file bytes; record bytes/SHA-256 of the
uploaded file in the run report.
"""
import hashlib, pathlib, sqlite3, sys

out = pathlib.Path(sys.argv[1])
if out.exists():
    sys.exit(f'{out} exists')
sql = (pathlib.Path(__file__).with_name('people.sql')).read_text(encoding='utf-8')
con = sqlite3.connect(out)
con.executescript(sql)
con.commit()
con.execute('VACUUM')
con.close()
data = out.read_bytes()
print(f'{out.name} {len(data)} bytes sha256={hashlib.sha256(data).hexdigest()} sqlite={sqlite3.sqlite_version}')
