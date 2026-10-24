#!/usr/bin/env python3
"""Independent calculation from source CSV only; standard library, exact Decimal arithmetic."""
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


payouts = defaultdict(lambda: Decimal(0))
for row in read("morning.csv") + read("evening.csv"):
    if row["Status"] == "delivered":
        payouts[row["Courier"]] += Decimal(row["Distance"]) * Decimal(row["Rate"])
rows = [{"Courier": courier, "Payout": float(amount)} for courier, amount in
        sorted(payouts.items(), key=lambda item: (-item[1], item[0]))]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/n2.lgp",
    "nodes": [],
    "outputs": [{
        "output_node_type": "export_input",
        "ordered": True,
        "column_order": "exact",
        "columns": [{"name": name, "label_any": True, "type": kind} for name, kind in [('Courier', 'string'), ('Payout', 'real')]],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
