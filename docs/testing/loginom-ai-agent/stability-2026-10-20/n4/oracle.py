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


tariffs = read("rates.csv")
assert len({row["Plan"] for row in tariffs}) == len(tariffs)
rates = {row["Plan"]: (row["Category"], Decimal(row["Rate"])) for row in tariffs}
totals = defaultdict(lambda: defaultdict(lambda: Decimal(0)))
for row in read("readings.csv"):
    category, rate = rates[row["Plan"]]
    totals[row["Site"]][category] += Decimal(row["Units"]) * rate
rows = [{"Site": site, **{category: float(values[category]) for category in ("Electricity", "Gas", "Water")}}
        for site, values in sorted(totals.items())]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/n4.lgp",
    "nodes": [{"type": kind} for kind in ['imports.text', 'transform.join_data', 'transform.cross_table', 'exports.text']],
    "outputs": [{
        "output_node_type": "export_input",
        "ordered": False,
        "column_order": "exact",
        "columns": [{"name": name, "label": name, "type": kind} for name, kind in [('Site', 'string'), ('Electricity', 'real'), ('Gas', 'real'), ('Water', 'real')]],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
