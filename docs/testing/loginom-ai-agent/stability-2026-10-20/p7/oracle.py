#!/usr/bin/env python3
"""Independent business calculation from own CSV only; standard library."""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(name):
    with (ROOT / "data" / name).open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


materials = read("materials.csv")
assert len({row["MaterialCode"] for row in materials}) == len(materials)
names = {row["MaterialCode"]: row["Material"] for row in materials}
rows = [{**row, "Material": names[row["MaterialCode"]]} for row in read("finds.csv")]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/p7.lgp",
    "nodes": [{"type": "imports.text"}, {"type": "exports.text"}],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": "/stability-2026-10-20/finds-materials.csv",
        "ordered": False,
        "column_order": "any",
        "columns": [{"name": name, "type": kind, "label_any": True}
                    for name, kind in [('FindID', 'string'), ('Trench', 'string'), ('MaterialCode', 'string'), ('Material', 'string')]],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
