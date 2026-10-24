#!/usr/bin/env python3
"""Independent follow-up oracle: reads original demo CSVs, never expected/model output."""
import csv
import io
import json
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "demo-2026-10-22" / "s1-revenue" / "data"


def read(name):
    return list(csv.DictReader(io.StringIO((DATA / name).read_bytes().decode("utf-8"), newline="")))


COLUMNS = [('Region', 'string'), ('Category', 'string'), ('Revenue', 'real')]
LABELS = {}
totals = defaultdict(Decimal)
for sale in read("sales.csv"):
    totals[sale["Region"], sale["Category"]] += Decimal(sale["Quantity"]) * Decimal(sale["Price"])
rows = [{"Region": region, "Category": category, "Revenue": float(total)}
        for (region, category), total in sorted(totals.items(), key=lambda pair: (-pair[1], *pair[0]))]


# Apply this question to the complete result of the original scenario.
rows = rows[:3]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/demo-2026-10-22/s1-revenue.lgp",
    "nodes": [{"type": kind} for kind in ("imports.text", "transform.group_data", "exports.text")],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": sys.argv[2] if len(sys.argv) > 2 else "/demo-2026-10-22/revenue-top3.csv",
        "ordered": True,
        "column_order": "exact",
        "columns": [{"name": name, "label_any": True, "type": kind}
                    for name, kind in COLUMNS],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
