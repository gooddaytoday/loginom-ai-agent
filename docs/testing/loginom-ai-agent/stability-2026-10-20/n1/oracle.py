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


requested = defaultdict(lambda: Decimal(0))
for row in read("requests.csv"):
    requested[row["SKU"]] += Decimal(row["Units"])
stock = read("stock.csv")
assert len({row["SKU"] for row in stock}) == len(stock)
available = {row["SKU"]: Decimal(row["Available"]) for row in stock}
assert requested.keys() <= available.keys()
rows = [{"SKU": sku, "Requested": int(units), "Available": int(available[sku]),
         "Shortage": int(units - available[sku])}
        for sku, units in requested.items() if units > available[sku]]
rows.sort(key=lambda row: (-row["Shortage"], row["SKU"]))

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/n1.lgp",
    "nodes": [],
    "outputs": [{
        "output_node_type": "export_input",
        "ordered": True,
        "column_order": "exact",
        "columns": [{"name": name, "label_any": True, "type": kind} for name, kind in [('SKU', 'string'), ('Requested', 'integer'), ('Available', 'integer'), ('Shortage', 'integer')]],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
