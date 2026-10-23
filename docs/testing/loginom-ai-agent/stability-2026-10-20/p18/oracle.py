#!/usr/bin/env python3
"""Independent CSV-byte oracle; no Loginom, model output or expected-file input."""
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


NODE_TYPES = ['imports.text', 'transform.replace_columns', 'transform.filter_data', 'exports.text']
OUTPUT_TYPE = 'export_input'
ORDERED = True
COLUMNS = [('Code', 'string'), ('Name', 'string'), ('CreditLimit', 'real'), ('Status', 'string')]

rows = []
for client in read("customers.csv"):
    if client["status"] != "active":
        continue
    # Canonical code is derived from its digits, independently of the replacement table.
    code = "C-" + "".join(char for char in client["client_code"] if char.isdigit())
    rows.append({"Code": code, "Name": client["client_name"],
                 "CreditLimit": float(Decimal(client["credit_text"])), "Status": client["status"]})

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/demo-2026-10-22/s2-customers.lgp",
    "nodes": [{"type": kind} for kind in NODE_TYPES],
    "outputs": [{
        "output_node_type": OUTPUT_TYPE,
        "ordered": ORDERED,
        "columns": [{"name": name, "label_any": True, "type": kind} for name, kind in COLUMNS],
        "rows": rows,
    }],
}
encoded = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
sys.stdout.buffer.write(encoded.encode("utf-8"))
