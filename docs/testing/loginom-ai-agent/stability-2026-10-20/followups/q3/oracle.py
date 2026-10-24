#!/usr/bin/env python3
"""Independent follow-up oracle: reads original demo CSVs, never expected/model output."""
import csv
import io
import json
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "demo-2026-10-22" / "s3-reconcile" / "data"


def read(name):
    return list(csv.DictReader(io.StringIO((DATA / name).read_bytes().decode("utf-8"), newline="")))


COLUMNS = [('OrderID', 'string'), ('Customer', 'string'), ('OrderAmount', 'real'), ('PaidAmount', 'real'), ('Debt', 'real')]
LABELS = {}
payments = read("payments.csv")
assert len({payment["OrderID"] for payment in payments}) == len(payments)
paid = {payment["OrderID"]: Decimal(payment["PaidAmount"]) for payment in payments}
rows = []
for order in read("orders.csv"):
    amount = Decimal(order["OrderAmount"])
    payment = paid.get(order["OrderID"], Decimal(0))
    if amount > payment:
        rows.append({"OrderID": order["OrderID"], "Customer": order["Customer"],
                     "OrderAmount": float(amount), "PaidAmount": float(payment), "Debt": float(amount - payment)})


# Apply this question to the complete result of the original scenario.
rows = [row for row in rows if row["Debt"] >= 2500]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/demo-2026-10-22/s3-reconcile.lgp",
    "nodes": [],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": sys.argv[2] if len(sys.argv) > 2 else "/demo-2026-10-22/debts-large.csv",
        "ordered": True,
        "column_order": "exact",
        "columns": [{"name": name, "label_any": True, "type": kind}
                    for name, kind in COLUMNS],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
