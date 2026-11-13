"""Proposed stage-1 values for Loop, computed without Loginom or runtime.

Loop mode: group processing, fixed group size 1, over fixtures/pages.csv,
sequential (no parallel threads), iteration identifiers off.
The looped node is a Submodel with one table input and one table output.

Cases:
  offline - body is a Calculator: LastIndex = Skip + Limit - 1 (no network);
  rest    - body is REST GET https://httpbin.org/response-headers with query
            limit=<Limit>, skip=<Skip>; output is REST port 0 per iteration.
Rows of all iterations are appended in iteration order (proposal until probe).
"""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = "https://httpbin.org/response-headers"
FILES = {"offline": "expected-offline.json", "rest": "expected.json"}


def pages():
    with (ROOT.parent / "fixtures" / "pages.csv").open(encoding="utf-8", newline="") as stream:
        return [{k: int(v) for k, v in row.items()} for row in csv.DictReader(stream)]


def httpbin_response_headers(args):
    """Body of httpbin /response-headers: sorted pretty JSON of the response
    headers, where Content-Length is iterated until it describes the body."""
    body = ""
    while True:
        headers = {"Content-Length": str(len(body.encode("utf-8"))), "Content-Type": "application/json", **args}
        new = json.dumps(headers, indent=2, sort_keys=True, separators=(",", ": ")) + "\n"
        if new == body:
            return body
        body = new


def column(name, kind):
    return {"name": name, "type": kind, "label_any": True}


def expected(case):
    groups = [[page] for page in pages()]  # fixed group size 1, input order
    if case == "offline":
        columns = [column("PageNo", "integer"), column("Limit", "integer"), column("Skip", "integer"),
                   column("LastIndex", "integer")]
        rows = [{**row, "LastIndex": row["Skip"] + row["Limit"] - 1} for group in groups for row in group]
    else:
        columns = [column("RequestID", "integer"), column("Response", "string")]
        rows = [{"RequestID": index,
                 "Response": httpbin_response_headers({"limit": str(row["Limit"]), "skip": str(row["Skip"])})}
                for group in groups for index, row in enumerate(group)]
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "control.supernode"}, {"type": "control.loop"}],
        "outputs": [{"output_node_type": "control.loop", "output_port": 0, "ordered": True,
                     "column_order": "exact", "columns": columns, "rows": rows}],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", choices=sorted(FILES), default="rest")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for case in (sorted(FILES) if args.check else [args.case]):
        result = expected(case)
        if args.check:
            name = FILES[case]
            assert json.loads((ROOT / name).read_text(encoding="utf-8")) == result, name
            print(f"{name}: OK, {len(result['outputs'][0]['rows'])} rows")
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
