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


zones = {" n ": "North", "N": "North", "S": "South", " s ": "South", "C": "Central", " c ": "Central"}
quotes = []
for row in read("tariffs.csv"):
    base, rate = Decimal(row["Base"]), Decimal(row["PerKg"])
    assert Decimal(row["MaxKg"]) >= 2
    quotes.append((base + Decimal(2) * rate, row))
rows = [{"Carrier": row["Carrier"], "Zone": zones[row["ZoneCode"]],
         "MaxKg": float(Decimal(row["MaxKg"])), "Base": float(Decimal(row["Base"])),
         "PerKg": float(Decimal(row["PerKg"])), "Quote": float(quote)}
        for quote, row in sorted(quotes, key=lambda item: (item[0], item[1]["Carrier"]))]

expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/n3.lgp",
    "nodes": [{"type": kind} for kind in ['imports.text', 'transform.replace_columns', 'transform.calculator', 'exports.text']],
    "outputs": [{
        "output_node_type": "export_input",
        "ordered": True,
        "column_order": "exact",
        "columns": [{"name": name, "label_any": True, "type": kind} for name, kind in [('Carrier', 'string'), ('Zone', 'string'), ('MaxKg', 'real'), ('Base', 'real'), ('PerKg', 'real'), ('Quote', 'real')]],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
