"""Independent proposal: source-order slicing, Python stdlib only.

Run without arguments to reproduce expected.json. This is not a Loginom reader.
Only task.md and copies of input fixtures may be supplied to the product model.
"""
import argparse
import csv
from datetime import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLUMNS = [
    {"name": "RowID", "type": "integer", "label_any": True},
    {"name": "Class", "type": "string", "label_any": True},
    {"name": "Value", "type": "integer", "label_any": True},
]


def rows(case):
    with (ROOT / f"fixtures/{case}.csv").open(encoding="utf-8", newline="") as source:
        return [{name: None if value == "?" else
                 int(value) if name == "RowID" or name == "Value" and case not in ("null", "empty") else
                 float(value) if name == "Value" else
                 value == "True" if name == "Flag" else
                 datetime.fromisoformat(value).isoformat(timespec="milliseconds") if name == "Stamp" else value
                 for name, value in r.items()} for r in csv.DictReader(source)]


def expected(case="rows"):
    data = rows(case)
    columns = COLUMNS if case not in ("null", "empty") else [
        COLUMNS[0], COLUMNS[1], {"name": "Value", "type": "real", "label_any": True,
                                "tolerance": {"abs": 0, "rel": 0}},
        {"name": "Flag", "type": "boolean", "label_any": True},
        {"name": "Stamp", "type": "datetime", "label_any": True},
    ]
    first, last = (3, 2) if case == "null" else (0, 0) if case == "empty" else (5, 5)
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "preprocessing.sampling"},
                  {"type": "preprocessing.sampling"}, {"type": "exports.text"},
                  {"type": "exports.text"}],
        "outputs": [
            {"output_node_type": "preprocessing.sampling", "output_node_label": label,
             "output_port": 0, "ordered": True, "column_order": "exact",
             "columns": columns, "rows": sample}
            for label, sample in [("Первые пять", data[:first]),
                                  ("Последние пять", data[-last:] if last else [])]
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", choices=["rows", "null", "empty", "update"], default="rows")
    print(json.dumps(expected(parser.parse_args().case), ensure_ascii=False, indent=2))
