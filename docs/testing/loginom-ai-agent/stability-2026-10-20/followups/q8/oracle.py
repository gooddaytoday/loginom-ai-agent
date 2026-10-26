#!/usr/bin/env python3
"""Independent follow-up oracle: reads original demo CSVs, never expected/model output."""
import csv
import io
import json
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "demo-2026-10-22" / "s5-pivot" / "data"


def read(name):
    return list(csv.DictReader(io.StringIO((DATA / name).read_bytes().decode("utf-8"), newline="")))


COLUMNS = [('Region', 'string'), ('Office', 'real'), ('Warehouse', 'real'), ('Tech', 'real')]
LABELS = {}
totals = defaultdict(Decimal)
for sale in read("sales.csv"):
    totals[sale["Region"], sale["Category"]] += Decimal(sale["Amount"])
rows = [{"Region": region, **{name: float(totals[region, category])
        for category, name in [("Офис", "Office"), ("Склад", "Warehouse"), ("Техника", "Tech")]}}
        for region in sorted({key[0] for key in totals})]


# Apply this question to the complete result of the original scenario.
# The follow-up changes only the export destination.

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/demo-2026-10-22/s5-pivot.lgp",
    "nodes": [],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": sys.argv[2] if len(sys.argv) > 2 else "/demo-2026-10-22/pivot-for-meeting.csv",
        "ordered": False,
        "column_order": "exact",
        "columns": [{"name": name, "label_any": True, "type": kind}
                    for name, kind in COLUMNS],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
