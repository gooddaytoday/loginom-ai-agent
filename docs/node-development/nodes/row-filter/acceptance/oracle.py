"""Independent stage-0 proposal; Python stdlib, no Loginom/runtime imports.

Only task-variable-*.md and the selected input CSV reach the product model.
Run --write to reproduce expected*.json and fixtures/manifest.json.
The small list grammar deliberately excludes quoted/separator-bearing items.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLUMNS = [{"name": name, "type": kind, "label_any": True} for name, kind in
           [("RowID", "integer"), ("Amount", "integer"), ("Category", "string")]]
CASES = ("mixed-initial", "mixed-final", "mixed-none", "list-initial",
         "list-final", "scalar-initial", "scalar-final", "empty")


def expected(case):
    fixture = "variables-empty.csv" if case == "empty" else "variables.csv"
    with (ROOT / "fixtures" / fixture).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == [c["name"] for c in COLUMNS]
        rows = [{k: None if v == "?" else int(v) if k != "Category" else v
                 for k, v in row.items()} for row in reader]
    assert len({r["RowID"] for r in rows}) == len(rows)

    def matches(row):
        if case.startswith("list-"):
            text = "10,20" if case == "list-initial" else "15"
            return row["Amount"] is not None and row["Amount"] in [
                int(v) for v in next(csv.reader([text]))]
        if case.startswith("scalar-"):
            return row["Category"] == ("B" if case == "scalar-initial" else "a")
        limit, codes = {"mixed-initial": (10, "A,B"), "mixed-final": (15, "C"),
                        "mixed-none": (100, "C"), "empty": (10, "A,B")}[case]
        return (row["Amount"] is not None and row["Amount"] >= limit
                and row["Category"].casefold() in [v.casefold() for v in
                                                  next(csv.reader([codes]))])

    selected = [row for row in rows if matches(row)]
    rejected = [row for row in rows if not matches(row)]
    assert sorted(r["RowID"] for r in selected + rejected) == sorted(
        r["RowID"] for r in rows)
    assert not ({r["RowID"] for r in selected} & {r["RowID"] for r in rejected})
    return {"package_path": "{{PACKAGE_PATH}}", "null_marker": "?",
            "nodes": [{"type": "transform.filter_data"}],
            "outputs": [{"output_node_type": "transform.filter_data",
                         "output_port": port, "ordered": False,
                         "column_order": "any", "columns": COLUMNS, "rows": part}
                        for port, part in enumerate([selected, rejected])]}


def documents():
    result = {"expected.json": expected("mixed-final")}
    result.update({f"expected-{case}.json": expected(case)
                   for case in CASES if case != "mixed-final"})
    return result


def manifest():
    files = []
    for name in ("variables.csv", "variables-empty.csv"):
        data = (ROOT / "fixtures" / name).read_bytes()
        files.append({"path": name, "bytes": len(data),
                      "sha256": hashlib.sha256(data).hexdigest(),
                      "records": len(data.decode("utf-8").splitlines()) - 1})
    return {"encoding": "UTF-8", "delimiter": ",", "line_ending": "LF",
            "header": True, "null_marker": "?", "columns": COLUMNS, "files": files}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", choices=CASES, default="mixed-final")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    if args.write:
        for name, value in documents().items():
            (ROOT / "acceptance" / name).write_text(
                json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (ROOT / "fixtures/manifest.json").write_text(
            json.dumps(manifest(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        print(json.dumps(expected(args.case), ensure_ascii=False, indent=2))
