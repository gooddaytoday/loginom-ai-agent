#!/usr/bin/env python3
"""Independent aggregation of the input CSV; no runtime or expected-file input."""
import csv
import json
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
with (ROOT / "data/sales.csv").open(encoding="utf-8", newline="") as stream:
    sales = list(csv.DictReader(stream))
# GroupLimit=1 keeps the first native category A for this ordered input.
category = sales[0]["Category"]
groups = defaultdict(list)
for sale in sales:
    if sale["Category"] == category:
        groups[sale["Region"]].append(Decimal(sale["Amount"]))
expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/p25.lgp",
    "nodes": [{"type": kind} for kind in ["imports.text", "transform.cross_table", "exports.text"]],
    "outputs": [{
        "output_node_type": "export_input",
        "ordered": True,
        "column_order": "any",
        "columns": [
            {"name": "Region", "label": "Region", "type": "string"},
            {"name": "A_Amount_Sum", "label": "A.Amount.Сумма", "type": "real"},
            {"name": "A_Amount_Count", "label": "A.Amount.Количество", "type": "integer"},
        ],
        "rows": [{"Region": region, "A_Amount_Sum": float(sum(values)), "A_Amount_Count": len(values)}
                 for region, values in sorted(groups.items())],
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
