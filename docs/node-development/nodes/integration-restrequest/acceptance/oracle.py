#!/usr/bin/env python3
"""Independent stage-0 expectations; no network or Loginom imports. W2 proposal."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TYPE = "integration.rest_request"


def column(name, kind="string", label=None):
    return {"name": name, "label": label or name, "type": kind}


def generate():
    raw = (ROOT / "data/requests.csv").read_bytes()
    with (ROOT / "data/requests.csv").open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != ["RequestId", "Key", "When", "Body"]:
            raise ValueError("Unexpected input schema")
        requests = list(reader)
    if len(requests) != 2 or len({r["RequestId"] for r in requests}) != 2:
        raise ValueError("Expected two distinct requests")
    if any(not r["RequestId"].isascii() or "/" in r["RequestId"] for r in requests):
        raise ValueError("Path fixture must be safe ASCII")
    native = [column("RequestID", "integer", "Идентификатор запроса"),
              column("Response", label="Ответ сервера")]
    status = [native[0], column("ErrorCode", "integer", "Код завершения"),
              column("ErrorDesc", label="Описание ошибки"),
              column("HttpStatusCode", "integer", "Код состояния HTTP")]
    outputs = []
    for method in ["GET", "DELETE", "POST", "PUT", "PATCH"]:
        query = method in {"GET", "DELETE", "POST"}
        fields = {"Method": "/method", "EchoHeader": "/headers/X-Lab86", "EchoBody": "/data"}
        fields.update({"EchoRequestId": "/args/RequestId", "EchoKey": "/args/Key",
                       "EchoWhen": "/args/When"} if query else {"EchoUrl": "/url"})
        rows = []
        for i, request in enumerate(requests):
            row = {"RequestID": i, "Method": method, "EchoHeader": "wave2",
                   "EchoBody": request["Body"] if method in {"POST", "PUT", "PATCH"} else ""}
            row.update({"EchoRequestId": request["RequestId"], "EchoKey": request["Key"],
                        "EchoWhen": request["When"]} if query else
                       {"EchoUrl": "https://httpbin.org/anything/" + request["RequestId"]})
            rows.append(row)
        common = {"output_node_type": TYPE, "output_node_label": "REST " + method}
        outputs.append({**common, "output_port": 0, "ordered": False,
                        "json_projection": {"source_columns": native, "source_column": "Response", "fields": fields},
                        "columns": [native[0]] + [column(name) for name in fields], "rows": rows})
        outputs.append({**common, "output_port": 1, "ordered": False, "columns": status,
                        "rows": [{"RequestID": i, "ErrorCode": 0, "ErrorDesc": "OK", "HttpStatusCode": 200}
                                 for i in range(len(requests))]})
    expected = {"contract_status": "stage0_proposal_requires_W2_json_projection",
                "package_path": "{{PACKAGE_PATH}}", "nodes": [{"type": "imports.text"}, {"type": TYPE}],
                "outputs": outputs}
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
    print("Fixture expectations verified (W2 proposal; not a live/cold PASS).")


if __name__ == "__main__":
    main()
