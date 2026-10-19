#!/usr/bin/env python3
"""HTTP status endpoint expectations, independent of Loginom and the network."""
import argparse
import csv
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent


def generate():
    with (ROOT / "data/requests.csv").open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != ["RequestId", "Url"]:
            raise ValueError("Unexpected input schema")
        requests = list(reader)
    if len(requests) != 2 or {r["RequestId"] for r in requests} != {"ok", "missing"}:
        raise ValueError("Expected two distinct requests")
    rows = []
    for request in requests:
        url = urlsplit(request["Url"])
        if url.scheme != "https" or url.netloc != "httpbin.org" or url.query or url.fragment:
            raise ValueError("Only public status endpoints are allowed")
        if url.path not in {"/status/200", "/status/404"}:
            raise ValueError("Unexpected status endpoint")
        status = int(url.path.rsplit("/", 1)[1])
        rows.append({"RequestId": request["RequestId"], "HttpStatusCode": status, "HasError": status >= 400})
    if {r["HttpStatusCode"] for r in rows} != {200, 404}:
        raise ValueError("Both success and error are required")
    return {"package_path": "{{PACKAGE_PATH}}",
            "nodes": [{"type": "imports.text"}, {"type": "integration.rest_request"}],
            "output_node_type": "export_input",
            "columns": [{"name": name, "type": kind, "label_any": True}
                        for name, kind in [("RequestId", "string"), ("HttpStatusCode", "integer"), ("HasError", "boolean")]],
            "rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = json.dumps(generate(), ensure_ascii=False, indent=2) + "\n"
    target = ROOT / "expected.json"
    if args.write:
        target.write_text(content, encoding="utf-8")
    elif target.read_text(encoding="utf-8") != content:
        raise SystemExit("STALE: expected.json")
    print("Expectations verified; not a live/cold PASS.")


if __name__ == "__main__":
    main()
