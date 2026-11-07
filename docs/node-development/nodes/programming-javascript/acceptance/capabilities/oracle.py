"""Proposed first-fit acceptance: Python CSV/integer model, no Loginom or JS."""
import argparse
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent.parent / "fixtures" / "capabilities"


def expected(orders="orders.csv", bins="bins.csv"):
    with (FIXTURES / bins).open(newline="", encoding="utf8") as stream:
        available = {row["BinID"]: int(row["Capacity"] or 0) for row in csv.DictReader(stream)}
    with (FIXTURES / orders).open(newline="", encoding="utf8") as stream:
        requests = sorted(csv.DictReader(stream), key=lambda row: int(row["OrderID"]))
    rows = []
    for request in requests:
        size = int(request["Size"]) if request["Size"] else None
        selected = next((name for name in sorted(available)
                         if size is not None and size > 0 and available[name] >= size), None)
        if selected is not None:
            available[selected] -= size
        rows.append({"OrderID": int(request["OrderID"]), "BinID": selected,
                     "Allocated": size if selected is not None else 0,
                     "Status": "invalid_size" if size is None or size <= 0 else
                               "no_capacity" if selected is None else "assigned"})
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "imports.text"},
                  {"type": "programming.javascript"}, {"type": "exports.text"}],
        "outputs": [{"output_node_type": "export_input", "ordered": True,
                     "columns": [{"name": name, "type": kind, "label_any": True}
                                 for name, kind in [("OrderID", "integer"), ("BinID", "string"),
                                                    ("Allocated", "integer"), ("Status", "string")]],
                     "rows": rows}],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    cases = {"expected.json": expected(),
             "expected-updated.json": expected(bins="bins-updated.csv"),
             "expected-empty-bins.json": expected(bins="bins-empty.csv"),
             "expected-empty-orders.json": expected(orders="orders-empty.csv")}
    assert expected(orders="orders-reordered.csv") == cases["expected.json"]
    assert [row["BinID"] for row in cases["expected.json"]["outputs"][0]["rows"]] == [
        "A", "B", None, "A", None, None, None, "B", None, "A"]
    for name, value in cases.items():
        if args.check:
            assert json.loads((HERE / name).read_text(encoding="utf8")) == value, name
        else:
            (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print("PASS: four expected tables; reordered input columns preserve the result")
