"""Independent proposal: source-order slicing, Python stdlib only.

Run without arguments to reproduce expected.json. This is not a Loginom reader.
Only task.md and copies of input fixtures may be supplied to the product model.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLUMNS = [
    {"name": "RowID", "type": "integer", "label_any": True},
    {"name": "Class", "type": "string", "label_any": True},
    {"name": "Value", "type": "integer", "label_any": True},
]


def rows():
    with (ROOT / "fixtures/rows.csv").open(encoding="utf-8", newline="") as source:
        return [dict(RowID=int(r["RowID"]), Class=r["Class"], Value=int(r["Value"]))
                for r in csv.DictReader(source)]


def expected():
    data = rows()
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "preprocessing.sampling"},
                  {"type": "preprocessing.sampling"}, {"type": "exports.text"},
                  {"type": "exports.text"}],
        "outputs": [
            {"output_node_type": "preprocessing.sampling", "output_node_label": label,
             "output_port": 0, "ordered": True, "column_order": "exact",
             "columns": COLUMNS, "rows": sample}
            for label, sample in [("Первые пять", data[:5]), ("Последние пять", data[-5:])]
        ],
    }


if __name__ == "__main__":
    print(json.dumps(expected(), ensure_ascii=False, indent=2))
