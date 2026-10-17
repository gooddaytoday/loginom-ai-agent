#!/usr/bin/env python3
"""Independent GET result expectations; no network or Loginom imports."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TYPE = "programming.javascript"


def column(name, kind="string", label=None):
    return {"name": name, "label": label or name, "type": kind}


def generate():
    raw = (ROOT / "data/requests.csv").read_bytes()
    with (ROOT / "data/requests.csv").open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != ["RequestId", "Key"]:
            raise ValueError("Unexpected input schema")
        requests = list(reader)
    if len(requests) != 2 or len({r["RequestId"] for r in requests}) != 2:
        raise ValueError("Expected two distinct requests")
    expected = {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "integration.rest_request"}, {"type": TYPE}],
        "output_node_type": TYPE,
        "columns": [column("RequestId"), column("Key"), column("HttpStatusCode", "integer")],
        "rows": [{"RequestId": request["RequestId"], "Key": request["Key"], "HttpStatusCode": 200}
                 for request in requests],
    }
    manifest = {"path": "data/requests.csv", "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                "encoding": "UTF-8", "bom": False, "newline": "LF", "delimiter": ",", "header": True,
                "rows": len(requests), "columns": [column(name) for name in reader.fieldnames],
                "null_marker": "?", "nulls_present": False, "empty_string": '""', "decimal": "."}
    return {"expected.json": expected, "fixtures/manifest.json": manifest}


def serialize(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--write", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for name, value in generate().items():
        path = ROOT / name
        content = serialize(value)
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        elif path.read_text(encoding="utf-8") != content:
            raise SystemExit("STALE: " + name)
    print("Fixture expectations verified (not a live/cold PASS).")


if __name__ == "__main__":
    main()
