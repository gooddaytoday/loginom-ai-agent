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


tracks = {"eng": "Engineering", "ENG": "Engineering", "biz": "Business", "BIZ": "Business"}
totals = defaultdict(lambda: defaultdict(lambda: Decimal(0)))
for row in read("enrollments.csv"):
    if row["Status"] == "confirmed":
        totals[row["Region"]][tracks[row["Track"]]] += Decimal(row["Seats"]) * Decimal(row["Fee"])
rows = [{"Region": region, **{track: float(values[track]) for track in ("Business", "Engineering")}}
        for region, values in sorted(totals.items())]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/n6.lgp",
    "nodes": [{"type": kind} for kind in ['imports.text', 'transform.replace_columns', 'transform.filter_data', 'transform.cross_table', 'exports.text']],
    "outputs": [{
        "output_node_type": "export_input",
        "ordered": False,
        "column_order": "exact",
        "columns": [{"name": name, "label": name, "type": kind} for name, kind in [('Region', 'string'), ('Business', 'real'), ('Engineering', 'real')]],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
