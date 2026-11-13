"""Proposed stage-1 values, computed independently of Loginom and runtime."""
import argparse
import csv
from decimal import Decimal
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def expected(case):
    source = {"initial": "input.csv", "final": "replacement.csv", "empty": "empty.csv"}[case]
    rows = []
    with (ROOT.parent / "fixtures" / source).open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            amount = None if row["Amount"] == "?" else Decimal(row["Amount"])
            rows.append({
                "RowID": int(row["RowID"]),
                "Amount": None if amount is None else float(amount),
                "Note": None if row["Note"] == "?" else row["Note"],
                "Flag": None if row["Flag"] == "?" else {"true": True, "false": False}[row["Flag"]],
                "Moment": None if row["Moment"] == "?" else row["Moment"],
                "Doubled": None if amount is None else float(amount * 2),
            })
    columns = [
        {"name": name, "type": kind, "label_any": True,
         **({"tolerance": {"abs": 0, "rel": 0}} if kind == "real" else {})}
        for name, kind in [("RowID", "integer"), ("Amount", "real"), ("Note", "string"),
                           ("Flag", "boolean"), ("Moment", "datetime"), ("Doubled", "real")]
    ]
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "control.supernode"}],
        "outputs": [{"output_node_type": "control.supernode", "output_port": 0,
                     "ordered": True, "column_order": "exact", "columns": columns, "rows": rows}],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", choices=["initial", "final", "empty"], default="final")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = expected(args.case)
    if args.check:
        name = {"initial": "expected-initial.json", "final": "expected.json", "empty": "expected-empty.json"}[args.case]
        assert json.loads((ROOT / name).read_text(encoding="utf-8")) == result, name
        print(f"{name}: OK, {len(result['outputs'][0]['rows'])} rows")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2) + "")
