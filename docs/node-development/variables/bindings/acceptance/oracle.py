"""Offline proposal expectations; no Loginom, model output or runtime imports."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent / "fixtures"


def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != ["RowID", "Amount"]:
            raise ValueError("Expected RowID,Amount headers")
        result = []
        for row in reader:
            if set(row) != {"RowID", "Amount"} or any(v is None for v in row.values()):
                raise ValueError("Incomplete or extra CSV cells")
            result.append({key: None if value == "?" else int(value)
                           for key, value in row.items()})
        return result


def expectation(node, phase):
    target = "transform.filter_data" if node == "filter" else "imports.text"
    source = rows(FIXTURES / ("filter.csv" if node == "filter" else
                              "import-a.csv" if phase == "initial" else "import-b.csv"))
    limit = 5 if phase == "initial" else 8
    matching = [r for r in source if r["Amount"] is not None and r["Amount"] > limit]
    tables = [matching, [r for r in source if r not in matching]] if node == "filter" else [source]
    variable = {"name": "Limit", "type": "integer", "value": limit} if node == "filter" else {
        "name": "CsvPath", "type": "string",
        "value": "{{SOURCE_A}}" if phase == "initial" else "{{SOURCE_B}}"}
    return {
        "package_path": "{{PACKAGE_PATH}}", "null_marker": "?",
        "nodes": [{"type": target}, {"type": "variables.user"}],
        "outputs": [{
            "output_node_type": target, "output_port": port, "ordered": False,
            "columns": [{"name": name, "type": "integer", "label_any": True}
                        for name in ["RowID", "Amount"]],
            "rows": table,
        } for port, table in enumerate(tables)],
        "variable_inventory": {
            "outputs": [{"node": {"type": "variables.user"}, "port": 4,
                         "variables": [variable, {"name": "Sentinel", "type": "string", "value": "keep"}]}],
            "links": [{"source": {"type": "variables.user"}, "output": 4,
                       "target": {"type": target}, "input": 0,
                       "kind": "control" if node == "filter" else "variables"}],
        },
    }


def encoded(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--node", choices=["filter", "import"], default="filter")
    parser.add_argument("--phase", choices=["initial", "final"], default="final")
    parser.add_argument("--port", type=int, choices=[0, 1], default=0)
    parser.add_argument("--csv", type=Path)
    args = parser.parse_args()
    # Fixed hand-computed anchors catch swapped phases, comparison and NULL errors.
    assert [r["RowID"] for r in expectation("filter", "initial")["outputs"][0]["rows"]] == [3, 4, 8]
    assert [r["RowID"] for r in expectation("filter", "final")["outputs"][0]["rows"]] == [4]
    assert expectation("import", "initial")["outputs"][0]["rows"] == [
        {"RowID": 1, "Amount": 10}, {"RowID": 2, "Amount": 0}, {"RowID": 3, "Amount": None}]
    assert expectation("import", "final")["outputs"][0]["rows"] == [
        {"RowID": 1, "Amount": 20}, {"RowID": 2, "Amount": -4}, {"RowID": 3, "Amount": 7}]
    files = {}
    for node in ["filter", "import"]:
        for phase in ["initial", "final"]:
            name = "expected-initial.json" if phase == "initial" else "expected.json"
            files[ROOT / node / name] = expectation(node, phase)
    files[FIXTURES / "manifest.json"] = {
        "source": "authored deterministic proposal fixtures; no account data",
        "csv": {"encoding": "UTF-8", "delimiter": ",", "header": True,
                "null_marker": "?", "columns": ["RowID", "Amount"],
                "types": ["integer", "integer"]},
        "files": [{"name": path.name, "bytes": path.stat().st_size,
                   "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                  for path in sorted(FIXTURES.iterdir()) if path.name != "manifest.json"],
    }
    for path, value in files.items():
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(encoded(value), encoding="utf-8")
        if args.check and path.read_text(encoding="utf-8") != encoded(value):
            raise SystemExit(f"Expectation differs: {path.name}")
    expected = expectation(args.node, args.phase)["outputs"]
    if args.port >= len(expected):
        parser.error("Import has only port 0")
    if args.csv and sorted(rows(args.csv), key=lambda r: r["RowID"]) != sorted(
            expected[args.port]["rows"], key=lambda r: r["RowID"]):
        raise SystemExit("CSV differs from independent expected values")
    if not (args.write or args.check or args.csv):
        print(encoded(expectation(args.node, args.phase)), end="")


if __name__ == "__main__":
    main()
