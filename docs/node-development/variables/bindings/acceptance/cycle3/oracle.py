"""Offline proposal expectations for bindings cycle 3; no Loginom, runtime or model output.

Grouping: sum of Amount by Region, NULL skipped, all-NULL group -> NULL.
Sorting: Word ASC then RowID ASC, case-insensitive, with explicit weights of the
narrow fixture alphabet (no system locale, no Unicode collation library).
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NODES = ROOT.parents[3] / "nodes"
SOURCES = {
    "grouping": (NODES / "grouping/fixtures/modes.csv",
                 "transform.group_data", ["RowID", "Region", "Amount", "Text"]),
    "sorting": (NODES / "sorting/fixtures/modes.csv",
                "transform.sorting", ["RowID", "Word", "Amount"]),
}
# The kit reuses the node fixtures; a silent fixture change must fail --check.
SHA256 = {
    "grouping": "b1ef0720f0821b5898789de96a22dc71f2b5639dce979b61b322d3249cdd9c03",
    "sorting": "a02017a08a0b326eb52c9a413e543ce01de75d405224f2a097ade83999d57958",
}


def rows(node):
    path, _, header = SOURCES[node]
    if hashlib.sha256(path.read_bytes()).hexdigest() != SHA256[node]:
        raise SystemExit(f"Fixture changed: {path.name} ({node})")
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        if reader.fieldnames != header:
            raise ValueError("Unexpected header")
        result = []
        for raw in reader:
            row = {k: None if v == "\\N" else v for k, v in raw.items()}
            for key in ["RowID", "Amount"]:
                row[key] = None if row[key] is None else int(row[key])
            result.append(row)
        return result


def grouping(flag):
    order, sums = [], {}
    for row in rows("grouping"):
        region = row["Region"]
        if region not in sums:
            order.append(region)
            sums[region] = None
        if row["Amount"] is not None:
            sums[region] = (sums[region] or 0) + row["Amount"]
    keys = sorted(order) if flag else order
    return [{"Region": k, "Metric": sums[k]} for k in keys]


def sorting(flag):
    def key(row):
        word = row["Word"]
        if word is None:
            return (0, "", row["RowID"])
        if word == "":
            return (1, "", row["RowID"])
        if flag:
            # Declared Russian locale order for this fixture: а < б < я < Latin a.
            return (2, {"а": "0", "б": "1", "я": "2", "a": "3"}[word.lower()], row["RowID"])
        # Binary comparison: case folding only for ASCII Latin.
        return (2, word.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                                                "abcdefghijklmnopqrstuvwxyz")), row["RowID"])
    return [{"RowID": r["RowID"], "Word": r["Word"], "Amount": r["Amount"]}
            for r in sorted(rows("sorting"), key=key)]


def expectation(node, phase):
    flag = phase == "final"
    _, target, _ = SOURCES[node]
    if node == "grouping":
        columns = [("Region", "string"), ("Metric", "real")]
        table, ordered = grouping(flag), flag
    else:
        columns = [("RowID", "integer"), ("Word", "string"), ("Amount", "integer")]
        table, ordered = sorting(flag), True
    return {
        "package_path": "{{PACKAGE_PATH}}", "null_marker": "?",
        "nodes": [{"type": target}, {"type": "variables.user"}],
        "outputs": [{
            "output_node_type": target, "output_port": 0, "ordered": ordered,
            "columns": [{"name": n, "type": t, "label_any": True} for n, t in columns],
            "rows": table,
        }],
        "variable_inventory": {
            "outputs": [{"node": {"type": "variables.user"}, "port": 4, "variables": [
                {"name": "Flag", "type": "boolean", "value": flag},
                {"name": "Sentinel", "type": "string", "value": "keep"}]}],
            "links": [{"source": {"type": "variables.user"}, "output": 4,
                       "target": {"type": target}, "input": 0, "kind": "control"}],
        },
    }


def encoded(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def csv_rows(path, node):
    _, _, header = SOURCES[node]
    names = ["Region", "Metric"] if node == "grouping" else header
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != names:
            raise SystemExit(f"Expected headers {','.join(names)}")
        out = []
        for raw in reader:
            row = {k: None if v == "?" else v for k, v in raw.items()}
            for k in ["RowID", "Amount"]:
                if k in row and row[k] is not None:
                    row[k] = int(row[k])
            if "Metric" in row and row["Metric"] is not None:
                row["Metric"] = float(row["Metric"])
            out.append(row)
        return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--node", choices=["grouping", "sorting"], default="grouping")
    parser.add_argument("--phase", choices=["initial", "final"], default="final")
    parser.add_argument("--csv", type=Path)
    args = parser.parse_args()
    # Hand-computed anchors; sorting anchors equal the native tables in
    # nodes/sorting/modes-discovery.md (locale false/false and true/false).
    assert grouping(False) == [{"Region": "B", "Metric": 12}, {"Region": "A", "Metric": 18},
                               {"Region": "C", "Metric": 7}, {"Region": "D", "Metric": None},
                               {"Region": "E", "Metric": 4}]
    assert [r["Region"] for r in grouping(True)] == ["A", "B", "C", "D", "E"]
    assert [r["RowID"] for r in sorting(False)] == [9, 10, 7, 8, 6, 2, 4, 3, 5, 1]
    assert [r["RowID"] for r in sorting(True)] == [9, 10, 3, 6, 2, 5, 1, 4, 7, 8]
    files = {ROOT / node / ("expected-initial.json" if phase == "initial" else "expected.json"):
             expectation(node, phase) for node in SOURCES for phase in ["initial", "final"]}
    for path, value in files.items():
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(encoded(value), encoding="utf-8")
        if args.check and path.read_text(encoding="utf-8") != encoded(value):
            raise SystemExit(f"Expectation differs: {path.relative_to(ROOT)}")
    expected = expectation(args.node, args.phase)["outputs"][0]
    if args.csv:
        got = csv_rows(args.csv, args.node)
        want = expected["rows"]
        if not expected["ordered"]:
            got, want = (sorted(x, key=json.dumps) for x in (got, want))
        if got != want:
            raise SystemExit("CSV differs from independent expected values")
    if not (args.write or args.check or args.csv):
        print(encoded(expectation(args.node, args.phase)), end="")


if __name__ == "__main__":
    main()
