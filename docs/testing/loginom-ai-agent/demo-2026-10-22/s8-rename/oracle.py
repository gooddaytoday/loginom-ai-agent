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


NODE_TYPES = ['imports.text', 'transform.calculator', 'transform.group_data', 'transform.sorting', 'transform.reform_columns', 'exports.text']
OUTPUT_TYPE = 'transform.reform_columns'
ORDERED = True
COLUMNS = [('Регион', 'string'), ('Категория', 'string'), ('Выручка', 'real')]

totals = defaultdict(Decimal)
for sale in read("sales.csv"):
    totals[sale["Region"], sale["Category"]] += Decimal(sale["Quantity"]) * Decimal(sale["Price"])
rows = [{"Регион": region, "Категория": category, "Выручка": float(total)}
        for (region, category), total in sorted(totals.items(), key=lambda pair: (-pair[1], *pair[0]))]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/demo-2026-10-22/s8-rename.lgp",
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
