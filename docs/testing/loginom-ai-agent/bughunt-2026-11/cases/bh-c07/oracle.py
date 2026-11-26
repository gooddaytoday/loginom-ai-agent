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

source = read(ROOT / "seed.csv")
rows = [{name: int(value) for name, value in row.items()} for row in source]
columns = [("RowID", "integer"), ("Value", "integer")]
nodes = ["programming.javascript", "exports.text"]
ordered = True

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/bughunt/" + ROOT.name + ".lgp",
    "nodes": [{"type": kind} for kind in nodes],
    "outputs": [] if not columns else [{
        "output_node_type": "export_input", "ordered": ordered,
        "export_destination": "/bughunt/" + ROOT.name + ".csv",
        "columns": [{"name": name, "label": name, "type": kind} for name, kind in columns],
        "rows": rows,
    }],
}
print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
