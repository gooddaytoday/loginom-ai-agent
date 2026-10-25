#!/usr/bin/env python3
"""Independent CSV-byte oracle; no Loginom, model output or expected-file input."""
import csv
import io
import json
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(name):
    return list(csv.DictReader(io.StringIO((ROOT / "data" / name).read_bytes().decode("utf-8"), newline="")))


NODE_TYPES = []
OUTPUT_TYPE = 'export_input'
ORDERED = True
COLUMNS = [('OrderID', 'string'), ('Customer', 'string'), ('OrderAmount', 'real'), ('PaidAmount', 'real'), ('Debt', 'real')]

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

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/demo-2026-10-22/s3-reconcile.lgp",
    "nodes": [{"type": kind} for kind in NODE_TYPES],
    "outputs": [{
        "output_node_type": OUTPUT_TYPE,
        "ordered": ORDERED,
        "columns": [{"name": name, "label": name, "type": kind} for name, kind in COLUMNS],
        "rows": rows,
    }],
}
encoded = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
sys.stdout.buffer.write(encoded.encode("utf-8"))
