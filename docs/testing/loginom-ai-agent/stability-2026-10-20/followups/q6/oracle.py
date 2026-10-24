#!/usr/bin/env python3
"""Independent follow-up oracle: reads original demo CSVs, never expected/model output."""
import csv
import io
import json
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "demo-2026-10-22" / "s4-branches" / "data"


def read(name):
    return list(csv.DictReader(io.StringIO((DATA / name).read_bytes().decode("utf-8"), newline="")))


COLUMNS = [('Branch', 'string'), ('Category', 'string'), ('Revenue', 'real')]
LABELS = {}
totals = defaultdict(Decimal)
for name in ("north.csv", "south.csv", "central.csv"):
    for sale in read(name):
        totals[sale["Branch"], sale["Category"]] += Decimal(sale["Revenue"])
rows = [{"Branch": branch, "Category": category, "Revenue": float(total)}
        for (branch, category), total in sorted(totals.items(), key=lambda pair: (-pair[1], *pair[0]))]


# Apply this question to the complete result of the original scenario.
LABELS = {"Branch": "Филиал", "Category": "Категория", "Revenue": "Выручка"}

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/demo-2026-10-22/s4-branches.lgp",
    "nodes": [],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": sys.argv[2] if len(sys.argv) > 2 else "/demo-2026-10-22/branches-ru.csv",
        "ordered": True,
        "column_order": "exact",
        "columns": [{"name": name, "label": LABELS.get(name, name), "type": kind}
                    for name, kind in COLUMNS],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
