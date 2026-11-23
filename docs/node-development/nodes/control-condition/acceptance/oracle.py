"""Proposed stage-1 values for Condition, computed without Loginom or runtime.

One user branch "Detailed" (Mode = 1) plus the built-in Else branch.
The input table is passed to the output of every branch; only the first
true branch (or Else) is active, so only its port carries the table.
Port indices 0 (Detailed) and 1 (Else) are an assumption until native probe.
"""
import argparse
import csv
from decimal import Decimal
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODE = {"initial": 1, "final": 0}
BRANCHES = [("Detailed", lambda mode: mode == 1)]  # ordered user branches
PORT = {"Detailed": 0, "Else": 1}
COLUMNS = [("OrderID", "integer"), ("Region", "string"), ("Amount", "real"),
           ("Paid", "boolean"), ("Note", "string")]


def active_branch(mode):
    for name, condition in BRANCHES:
        if condition(mode):
            return name
    return "Else"


def rows():
    result = []
    with (ROOT.parent / "fixtures" / "orders.csv").open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            null = {k: row[k] == "?" for k in row}
            result.append({
                "OrderID": int(row["OrderID"]),
                "Region": None if null["Region"] else row["Region"],
                "Amount": None if null["Amount"] else float(Decimal(row["Amount"])),
                "Paid": None if null["Paid"] else {"true": True, "false": False}[row["Paid"]],
                "Note": None if null["Note"] else row["Note"],
            })
    return result


def expected(case):
    columns = [{"name": name, "type": kind, "label_any": True,
                **({"tolerance": {"abs": 0, "rel": 0}} if kind == "real" else {})}
               for name, kind in COLUMNS]
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "variables.user"}, {"type": "control.condition"}],
        "outputs": [{"output_node_type": "control.condition",
                     "output_port": PORT[active_branch(MODE[case])],
                     "ordered": True, "column_order": "exact", "columns": columns, "rows": rows()}],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", choices=sorted(MODE), default="final")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for case in (sorted(MODE) if args.check else [args.case]):
        result = expected(case)
        if args.check:
            name = {"initial": "expected-initial.json", "final": "expected.json"}[case]
            assert json.loads((ROOT / name).read_text(encoding="utf-8")) == result, name
            out = result["outputs"][0]
            print(f"{name}: OK, Mode={MODE[case]} -> {active_branch(MODE[case])}, "
                  f"port {out['output_port']}, {len(out['rows'])} rows")
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
