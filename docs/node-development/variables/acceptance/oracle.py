"""Independent, offline expectations for the approved httpbin echo scenario."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent
FIXTURE = ROOT.parent / "fixtures" / "rest-variables.json"


def expectations():
    source = json.loads(FIXTURE.read_text(encoding="utf-8"))
    result = {}
    for case in source["cases"]:
        query = [(name, str(case[name])) for name in source["query_order"]]
        row = dict(query)
        row["url"] = source["endpoint"] + "?" + urlencode(query)
        result[case["name"]] = {
            "package_path": "{{PACKAGE_PATH}}",
            "nodes": [{"type": "integration.rest_request"}, {"type": "exports.text"}],
            "outputs": [{
                "output_node_type": "export_input",
                "export_destination": case["export"],
                "ordered": True,
                "columns": [{"name": name, "type": "string", "label_any": True}
                            for name in ["limit", "skip", "url"]],
                "rows": [row],
            }],
        }
    return result


def encoded(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--csv", type=Path)
    parser.add_argument("--case", choices=["initial", "updated"], default="updated")
    args = parser.parse_args()
    cases = expectations()
    files = {"expected-initial.json": cases["initial"], "expected.json": cases["updated"]}
    manifest = {
        "fixture": "rest-variables.json",
        "bytes": len(FIXTURE.read_bytes()),
        "sha256": hashlib.sha256(FIXTURE.read_bytes()).hexdigest(),
        "encoding": "UTF-8", "network": False,
        "source": "approved existing REST acceptance service, httpbin /anything",
        "csv": {"encoding": "UTF-8", "delimiter": ",", "header": True,
                "columns": ["limit", "skip", "url"], "types": ["string", "string", "string"]},
    }
    files["../fixtures/manifest.json"] = manifest
    for filename, value in files.items():
        path = ROOT / filename
        content = encoded(value)
        if args.write:
            path.write_text(content, encoding="utf-8")
        if args.check:
            if path.read_text(encoding="utf-8") != content:
                raise SystemExit(f"Expectation differs: {filename}")
    if args.csv:
        with args.csv.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, delimiter=",")
            if reader.fieldnames != ["limit", "skip", "url"]:
                raise SystemExit("CSV columns differ")
            rows = list(reader)
        if rows != cases[args.case]["outputs"][0]["rows"]:
            raise SystemExit("CSV values differ from the independently fixed echo values")
    if not (args.write or args.check or args.csv):
        print(encoded(cases[args.case]), end="")


if __name__ == "__main__":
    main()
