"""Proposed deterministic partition by Python slices; no Loginom dependencies."""
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


def expected(case="rows"):
    with (ROOT / f"fixtures/{case}.csv").open(encoding="utf-8", newline="") as source:
        data = [{name: None if value == "?" else
                 int(value) if name == "RowID" or name == "Value" and case not in ("null", "empty") else
                 float(value) if name == "Value" else
                 value == "True" if name == "Flag" else
                 datetime.fromisoformat(value).isoformat(timespec="milliseconds") if name == "Stamp" else value
                 for name, value in r.items()} for r in csv.DictReader(source)]
    test_count, train_count = (1, 2) if case == "null" else (0, 0) if case == "empty" else (5, 10)
    columns = COLUMNS if case not in ("null", "empty") else [
        COLUMNS[0], COLUMNS[1], {"name": "Value", "type": "real", "label_any": True,
                                "tolerance": {"abs": 0, "rel": 0}},
        {"name": "Flag", "type": "boolean", "label_any": True},
        {"name": "Stamp", "type": "datetime", "label_any": True},
    ]
    test = data[:test_count]
    train = data[test_count:test_count + train_count]
    # Native combined output concatenates train then test, regardless of allocation order.
    flag = {"name": "IsTestSet", "type": "boolean", "label": "Тестовое множество"}
    all_rows = [dict(IsTestSet=False, **r) for r in train] + [dict(IsTestSet=True, **r) for r in test]
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "preprocessing.data_partition"},
                  {"type": "exports.text"}, {"type": "exports.text"},
                  {"type": "exports.text"}],
        "outputs": [
            {"output_node_type": "preprocessing.data_partition", "output_port": port,
             "ordered": True, "column_order": "exact", "columns": columns, "rows": rows}
            for port, columns, rows in [(0, [flag] + columns, all_rows),
                                       (1, columns, train), (2, columns, test)]
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", choices=["rows", "null", "empty", "update"], default="rows")
    print(json.dumps(expected(parser.parse_args().case), ensure_ascii=False, indent=2))
