"""Stage-0 proposal: independent null-safe left joins, Python stdlib only."""
import argparse
import csv
import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parents[1] / "fixtures" / "extended"


def expected(count):
    def table(name):
        with (FIXTURES / name).open(encoding="utf-8", newline="") as stream:
            return [{key: None if value == "?" else int(value) if key in ("RowID", "Key") else value
                     for key, value in row.items()} for row in csv.DictReader(stream)]

    main = table("main.csv")
    names = list("ABCD"[:count])
    lookups = [table("ref-" + name.lower() + ".csv") for name in names]
    rows = []
    for row in main:
        matches = [[r for r in lookup if r["Key"] == row["Key"]] or [None] for lookup in lookups]
        for combination in itertools.product(*matches):
            rows.append(dict(row, **{name: item[name] if item else None
                                     for name, item in zip(names, combination)}))
    # D changes schema, not cardinality; C multiplies A's duplicate key.
    assert len(rows) == 7
    assert sum(r["RowID"] == 1 for r in rows) == 4
    assert next(r for r in rows if r["RowID"] == 2)["Note"] == ""
    assert next(r for r in rows if r["RowID"] == 3)["Note"] is None
    fields = [("RowID", "integer"), ("Key", "integer"), ("Note", "string")]
    fields += [(name, "string") for name in names]
    return dict(package_path="{{PACKAGE_PATH}}", null_marker="?",
                nodes=[dict(type="imports.text"), dict(type="transform.enrich_data")],
                outputs=[dict(output_node_type="transform.enrich_data", output_port=0,
                              ordered=False, column_order="exact",
                              columns=[dict(name=name, type=kind, label_any=True) for name, kind in fields],
                              rows=rows)])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for count, name in [(3, "expected.json"), (4, "expected-four.json")]:
        value = expected(count)
        path = ROOT / name
        if args.write:
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        else:
            assert json.loads(path.read_text(encoding="utf-8")) == value, name
    print("PASS: three/four independent lookups, multiplicity, NULL/empty, schema")
