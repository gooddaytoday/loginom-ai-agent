"""Independent oracle for programming-python stage 1. Not Loginom, not runtime.

Reads the model-input CSV (UTF-8, header, ',' delimiter, '.' decimal, NULL
marker '?', quoted "" is an empty string) and computes the expected node output
directly from the business rule. It never imports or runs the candidate Python
scripts given to the model (data/*.py).

  python-stdlib: every input row, fields Id, Amount, AmountScaled, Text, Flag,
                 Date (fixed schema declared in the wizard); AmountScaled =
                 Amount * 3, NULL Amount gives NULL AmountScaled.
  python-pandas: rows with Flag = true only, fields in DataFrame order
                 Id, Amount, Text, Flag, Date, then AmountScaled (schema from
                 code via prepare_compatible_table); Flag stays Boolean because the
                 script casts it to pandas "boolean" (Loginom 7.4.2 to_data_frame
                 fills a NULL-free Boolean column into numpy dtype 'b' = int8).

Usage: python3 -I oracle.py [--case python-stdlib|python-pandas] [--check]
"""
import argparse
import csv
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FACTOR = Decimal(3)
STDLIB = [("Id", "integer"), ("Amount", "real"), ("AmountScaled", "real"),
          ("Text", "string"), ("Flag", "boolean"), ("Date", "datetime")]
# Loginom types of the columns that prepare_compatible_table creates from
# to_data_frame(InputTable, True) + AmountScaled (discovery.md, stage 0).
PANDAS = [("Id", "integer"), ("Amount", "real"), ("Text", "string"),
          ("Flag", "boolean"), ("Date", "datetime"), ("AmountScaled", "real")]


def read(case):
    rows = []
    with (ROOT / case / "data" / "values.csv").open(encoding="utf-8", newline="") as stream:
        for raw in csv.DictReader(stream):
            null = {k: v == "?" for k, v in raw.items()}
            amount = None if null["Amount"] else Decimal(raw["Amount"])
            rows.append({
                "Id": int(raw["Id"]),
                "Amount": None if amount is None else float(amount),
                "AmountScaled": None if amount is None else float(amount * FACTOR),
                "Text": None if null["Text"] else raw["Text"],
                "Flag": {"true": True, "false": False}[raw["Flag"]],
                # Port/cold readers report local DateTime as ISO with milliseconds.
                "Date": None if null["Date"] else raw["Date"].replace(" ", "T") + ".000",
            })
    return rows


def column(name, kind):
    return {"name": name, "type": kind, "label_any": True,
            **({"tolerance": {"abs": 0, "rel": 0}} if kind == "real" else {})}


def expected(case):
    rows = read(case)
    schema = STDLIB if case == "python-stdlib" else PANDAS
    if case == "python-pandas":
        rows = [r for r in rows if r["Flag"] is True]
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "programming.python"}],
        "outputs": [{"output_node_type": "programming.python", "output_port": 0,
                     "ordered": True, "column_order": "exact",
                     "columns": [column(n, k) for n, k in schema],
                     "rows": [{n: r[n] for n, _ in schema} for r in rows]}],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", choices=["python-stdlib", "python-pandas"])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    cases = [args.case] if args.case else ["python-stdlib", "python-pandas"]
    for case in cases:
        result = expected(case)
        path = ROOT / case / "expected.json"
        if args.check:
            assert json.loads(path.read_text(encoding="utf-8")) == result, path.name
            print(f"{case}/expected.json: OK, {len(result['outputs'][0]['rows'])} rows")
        else:
            path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"{case}/expected.json written")


if __name__ == "__main__":
    main()
