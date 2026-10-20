#!/usr/bin/env python3
"""Offline echo contract from original request CSV and the new endpoint path."""
import csv
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parents[4] / "node-development/nodes/integration-restrequest/acceptance/data"
with (DATA / "requests.csv").open(encoding="utf-8", newline="") as source:
    reader = csv.DictReader(source)
    assert reader.fieldnames == ["RequestId", "Key"]
    requests = list(reader)
assert len(requests) == 2 and len({row["RequestId"] for row in requests}) == 2
path = urlsplit("https://httpbin.org/anything/audience").path
rows = [{"RequestId": row["RequestId"], "Key": row["Key"], "EchoPath": path, "HttpStatusCode": 200}
        for row in requests]
expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/integration-restrequest.lgp",
    "nodes": [{"type": kind} for kind in ("imports.text", "integration.rest_request", "exports.text")],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": sys.argv[2] if len(sys.argv) > 2 else "/stability-2026-10-20/echo-address.csv",
        "ordered": False,
        "column_order": "exact",
        "columns": [{"name": name, "label_any": True, "type": kind}
                    for name, kind in (("RequestId", "string"), ("Key", "string"),
                                       ("EchoPath", "string"), ("HttpStatusCode", "integer"))],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
