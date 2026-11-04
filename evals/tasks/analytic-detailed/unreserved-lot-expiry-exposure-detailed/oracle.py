import csv
from datetime import date
from decimal import Decimal
from pathlib import Path

root = Path(__file__).parent
snapshot = date(2026, 3, 15)
horizon = date(2026, 3, 20)
reserved = {}
with (root / "data/reservations.csv").open() as stream:
    for row in csv.DictReader(stream, delimiter=";"):
        if row["status"] == "active":
            reserved[row["lot_id"]] = reserved.get(row["lot_id"], 0) + int(row["qty"])
groups = {}
with (root / "data/lots.csv").open() as stream:
    for row in csv.DictReader(stream, delimiter=";"):
        expiry = date.fromisoformat(row["expiry_date"])
        category = "expired" if expiry < snapshot else "within_horizon" if expiry <= horizon else "later"
        on_hand = int(row["on_hand_qty"])
        held = reserved.get(row["lot_id"], 0)
        free = on_hand - held
        totals = groups.setdefault((row["sku"], category), [0, 0, 0, 0, Decimal(0)])
        for index, value in enumerate([1, on_hand, held, free, free * Decimal(row["unit_cost"])]):
            totals[index] += value
order = {"expired": 0, "within_horizon": 1, "later": 2}
with (root / "oracle.csv").open("w", newline="") as stream:
    writer = csv.writer(stream, delimiter=";", lineterminator="\n")
    writer.writerow(["sku", "expiry_class", "lots", "on_hand_qty", "reserved_qty", "free_qty", "free_value"])
    for key in sorted(groups, key=lambda key: (key[0], order[key[1]])):
        writer.writerow([*key, *groups[key]])
