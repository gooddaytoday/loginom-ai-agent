#!/usr/bin/env python3
"""Independent follow-up oracle: reads original demo CSVs, never expected/model output."""
import csv
import io
import json
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "demo-2026-10-22" / "s6-abc" / "data"


def read(name):
    return list(csv.DictReader(io.StringIO((DATA / name).read_bytes().decode("utf-8"), newline="")))


COLUMNS = [('ABCClass', 'string'), ('Products', 'integer'), ('Revenue', 'real')]
LABELS = {}
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


# Apply this question to the complete result of the original scenario.
rows = [row for row in rows if row["ABCClass"] in ("B", "C")]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/demo-2026-10-22/s6-abc.lgp",
    "nodes": [],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": sys.argv[2] if len(sys.argv) > 2 else "/demo-2026-10-22/abc-bc.csv",
        "ordered": False,
        "column_order": "exact",
        "columns": [{"name": name, "label_any": True, "type": kind}
                    for name, kind in COLUMNS],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
