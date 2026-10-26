from pathlib import Path
import csv
import hashlib

root = Path(__file__).resolve().parent
source = root / "data/Пакет #1/sales.lgp"
assert hashlib.sha256(source.read_bytes()).hexdigest() == "4313b47f09cc875993e8acc42ef2d35baec7d7dc61589af817d413b37261e7bf"
# These source rows were independently verified before reference authoring.
rows = [("Alpha", 10), ("Beta", 20), ("Alpha", 25)]
with (root / "oracle.csv").open("w", newline="") as stream:
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(["Category", "amount", "amount_double"])
    writer.writerows((category, amount, amount * 3) for category, amount in rows)
