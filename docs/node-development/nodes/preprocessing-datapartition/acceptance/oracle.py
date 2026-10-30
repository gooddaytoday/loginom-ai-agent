"""Proposed deterministic partition by Python slices; no Loginom dependencies."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLUMNS = [
    {"name": "RowID", "type": "integer", "label_any": True},
    {"name": "Class", "type": "string", "label_any": True},
    {"name": "Value", "type": "integer", "label_any": True},
]


def expected():
    with (ROOT / "fixtures/rows.csv").open(encoding="utf-8", newline="") as source:
        data = [dict(RowID=int(r["RowID"]), Class=r["Class"], Value=int(r["Value"]))
                for r in csv.DictReader(source)]
    test = data[:5]
    train = data[5:15]
    # Flag name is deliberately free: the user requests its meaning, not spelling.
    flag = {"name": "Test", "type": "boolean", "name_any": True, "label_any": True}
    all_rows = [dict(r, Test=i < 5) for i, r in enumerate(data[:15])]
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "preprocessing.data_partition"},
                  {"type": "exports.text"}, {"type": "exports.text"},
                  {"type": "exports.text"}],
        "outputs": [
            {"output_node_type": "preprocessing.data_partition", "output_port": port,
             "ordered": True, "column_order": "exact", "columns": columns, "rows": rows}
            for port, columns, rows in [(0, COLUMNS + [flag], all_rows),
                                       (1, COLUMNS, train), (2, COLUMNS, test)]
        ],
    }


if __name__ == "__main__":
    print(json.dumps(expected(), ensure_ascii=False, indent=2))
