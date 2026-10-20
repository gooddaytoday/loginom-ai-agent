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


NODE_TYPES = ['imports.text', 'transform.sorting', 'transform.calculator', 'transform.group_data', 'exports.text']
OUTPUT_TYPE = 'transform.group_data'
ORDERED = False
COLUMNS = [('ABCClass', 'string'), ('Products', 'integer'), ('Revenue', 'real')]

products = sorted(read("products.csv"), key=lambda item: (-Decimal(item["Revenue"]), item["ProductID"]))
total = sum((Decimal(item["Revenue"]) for item in products), Decimal(0))
assert total > 0
counts = defaultdict(int)
revenues = defaultdict(Decimal)
cumulative = Decimal(0)
for product in products:
    revenue = Decimal(product["Revenue"])
    cumulative += revenue
    # Compare exact decimals before conversion to JSON binary64 numbers.
    group = "A" if cumulative <= total * Decimal("0.80") else "B" if cumulative <= total * Decimal("0.95") else "C"
    counts[group] += 1
    revenues[group] += revenue
rows = [{"ABCClass": group, "Products": counts[group], "Revenue": float(revenues[group])}
        for group in sorted(counts)]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/demo-2026-10-22/s6-abc.lgp",
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
