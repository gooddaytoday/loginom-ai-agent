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


totals = defaultdict(lambda: [0, Decimal(0)])
for row in read("incidents.csv"):
    minutes = Decimal(row["Minutes"])
    if row["Severity"] == "critical" and minutes >= 30:
        totals[row["Team"]][0] += 1
        totals[row["Team"]][1] += minutes
rows = [{"Team": team, "Incidents": values[0], "Downtime": int(values[1])}
        for team, values in sorted(totals.items(), key=lambda item: (-item[1][1], item[0]))]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/n5.lgp",
    "nodes": [],
    "outputs": [{
        "output_node_type": "export_input",
        "ordered": True,
        "column_order": "exact",
        "columns": [{"name": name, "label_any": True, "type": kind} for name, kind in [('Team', 'string'), ('Incidents', 'integer'), ('Downtime', 'integer')]],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
