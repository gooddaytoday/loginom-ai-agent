#!/usr/bin/env python3
"""Independent business calculation from own CSV only; standard library."""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(name):
    with (ROOT / "data" / name).open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


counts = defaultdict(int)
for row in read("birds.csv"):
    if row["Weather"] == "calm":
        counts[row["Species"]] += int(row["Count"])
rows = [{"Species": species, "Count": total} for species, total in sorted(counts.items())]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/p8.lgp",
    "nodes": [{"type": "imports.text"}, {"type": "exports.text"}],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": "/stability-2026-10-20/calm-birds.csv",
        "ordered": False,
        "column_order": "any",
        "columns": [{"name": name, "type": kind, "label_any": True}
                    for name, kind in [('Species', 'string'), ('Count', 'real')]],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
