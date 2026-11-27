#!/usr/bin/env python3
"""Independent standard-library oracle, computed from fixture inputs before a run."""
import csv
import json
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from statistics import mean, median

ROOT = Path(__file__).resolve().parent
def read(path):
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))

products = {int(row["ProductID"]): row for row in read(ROOT / "data/products.csv")}
cells = defaultdict(Decimal)
for row in read(ROOT / "data/orders.csv"):
    product = products.get(int(row["ProductID"]))
    if product:
        cells[product["Category"], row["Month"]] += Decimal(row["Quantity"]) * Decimal(product["Price"])
months = sorted({month for category, month in cells})
rows = [{"Category": category, **{month: float(cells[category, month]) for month in months}}
        for category in sorted({category for category, month in cells})]
columns = [
    {"name": "Category", "label": "Category", "type": "string"},
    *[{"name": month, "label": month, "type": "real", "name_any": True} for month in months],
]
nodes = ["imports.text", "transform.join_data", "transform.calculator", "transform.group_data", "transform.cross_table", "exports.text"]
ordered = True

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/bughunt/" + ROOT.name + ".lgp",
    "nodes": [{"type": kind} for kind in nodes],
    "outputs": [] if not columns else [{
        "output_node_type": "export_input", "ordered": ordered,
        "export_destination": "/bughunt/" + ROOT.name + ".csv",
        "column_order": "exact",
        "columns": columns,
        "rows": rows,
    }],
}
print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
