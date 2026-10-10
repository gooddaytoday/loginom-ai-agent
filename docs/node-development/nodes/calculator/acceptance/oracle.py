"""CSV-only oracle derived from calculator_goal_contract.py; no runtime imports.

Names, types, labels and expression order follow plan sections 0 and 3.
The expected file stays outside the model directory and context.
"""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE_SHA = "f628434c20873f7dd9a8ee142c17af7c0b99f447114fcf60e983f6ed6b357eb3"
COLUMNS = [
    ("Id", "Id", "integer"), ("Qty", "Количество", "integer"),
    ("Revenue", "Сумма", "real"), ("Adjusted", "Сумма", "real"),
    ("UnitPrice", "UnitPrice", "real"), ("Note", "Комментарий", "string"),
    ("Moment", "Дата", "datetime"), ("Comment", "Comment", "string"),
]


def expected():
    source = ROOT / "data/sales.csv"
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError("SOURCE_IDENTITY_MISMATCH")
    with source.open(encoding="utf-8", newline="") as stream:
        records = list(csv.DictReader(stream, delimiter=";"))
    if len(records) != 6 or len({r["Id"] for r in records}) != 6:
        raise ValueError("SOURCE_GRAIN_MISMATCH")
    rows = []
    for r in records:
        quantity, price = int(r["Quantity"]), float(r["UnitPrice"])
        revenue = quantity * price
        comment = None if r["Comment"] == "\\N" else r["Comment"]
        rows.append(dict(zip([c[0] for c in COLUMNS], [
            int(r["Id"]), quantity, revenue, revenue + 0.0001, price * 2,
            "missing" if comment is None else comment + "!",
            "2024-02-29T00:00:00.000", comment,
        ])))
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "transform.calculator"}],
        "output_node_type": "transform.calculator",
        "columns": [dict(name=n, label=l, type=t) for n, l, t in COLUMNS],
        "rows": rows,
    }


if __name__ == "__main__":
    (ROOT / "expected.json").write_text(
        json.dumps(expected(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
