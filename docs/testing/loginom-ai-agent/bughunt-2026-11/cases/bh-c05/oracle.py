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


source = read(ROOT.parent / "bh-c01/data/sales.csv")
groups = defaultdict(list)
for row in source:
    if ROOT.name == "bh-c02" and row["Region"] != "Центр":
        continue
    groups[row["Region"], row["Category"]].append(Decimal(row["Revenue"]))
rows = []
for (region, category), values in sorted(groups.items()):
    result = {"Region": region, "Category": category}
    if ROOT.name == "bh-c04":
        result.update(RevenueMean=float(mean(values)), RevenueMedian=float(median(values)))
    else:
        result["Revenue"] = float(sum(values))
    rows.append(result)
columns = [("Region", "string"), ("Category", "string")]
columns += [(name, "real") for name in (["RevenueMean", "RevenueMedian"] if ROOT.name == "bh-c04" else ["Revenue"])]
nodes = ["imports.text", "transform.group_data", "exports.text"]
if ROOT.name != "bh-c05": nodes.append("transform.calculator")
if ROOT.name == "bh-c02": nodes.append("transform.filter_data")
if ROOT.name == "bh-c03":
    nodes += ["transform.sorting", "exports.excel"]
    rows.sort(key=lambda row: -row["Revenue"])
ordered = ROOT.name == "bh-c03"

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
expected['absent_node_types'] = ['transform.calculator']
print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
