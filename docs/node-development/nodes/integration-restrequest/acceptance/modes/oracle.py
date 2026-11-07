"""Stage-0 proposals: stable HTTP echo values; stdlib only, no Loginom or network.

--write regenerates stock expected.json proposals; --check compares bytes.
Neither operation verifies transport, retry counts, TLS rejection or no-network.
Only task-*.md and the named fixtures may be given to the product model.
"""
import argparse
import csv
import json
from pathlib import Path
from urllib.parse import quote, urlencode

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures/modes"
CASES = ("methods-body", "headers", "content-types", "url-modes",
         "variables", "auth-tls", "timeout-retry", "simulation", "request-dump",
         "error-descriptions")


def source(name):
    with (FIXTURES / name).open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def output(filename, columns, rows):
    return {"output_node_type": "export_input", "export_destination": filename,
            "ordered": False,
            "columns": [{"name": name, "type": kind, "label_any": True}
                        for name, kind in columns], "rows": rows}


def proposal(case):
    requests = source("requests.csv")
    header_columns = [("RequestId", "string"), ("HeaderValue", "string"),
                      ("Body", "string"), ("HttpStatusCode", "integer")]
    if case == "methods-body":
        outputs = [output("methods-body.csv", [("Method", "string"),
            ("RequestId", "string"), ("Body", "string"), ("HttpStatusCode", "integer")],
            [{"Method": method, "RequestId": row["RequestId"],
              "Body": row["Body"] if method != "DELETE" else "", "HttpStatusCode": 200}
             for method in ("POST", "PUT", "PATCH", "DELETE") for row in requests])]
    elif case in ("headers", "variables"):
        outputs = [output(f"{case}.csv", header_columns,
                   [{"RequestId": row["RequestId"], "HeaderValue": "second",
                     "Body": row["Body"], "HttpStatusCode": 200} for row in requests])]
    elif case == "content-types":
        outputs = [output("media-types.csv", [("Case", "string"),
            ("ContentType", "string"), ("Body", "string"), ("HttpStatusCode", "integer")],
            [{"Case": row["Case"], "ContentType": row["RequestContentType"],
              "Body": row["Body"], "HttpStatusCode": 200}
             for row in source("content-types.csv")])]
        outputs[0]["rows"] += [{"Case": case, "ContentType": "text/plain",
                                "Body": "LAB-976", "HttpStatusCode": 200}
                               for case in ("response-plain", "response-any")]
    elif case == "url-modes":
        rows = []
        for mode in ("query", "segments", "replacement"):
            for row in requests:
                base = "https://httpbin.org/anything"
                url = base + ("?" + urlencode({key: row[key] for key in ("RequestId", "Key")},
                                             quote_via=quote) if mode == "query"
                              else "/" + "/".join(quote(row[key], safe="")
                                                  for key in ("RequestId", "Key")))
                rows.append({"UrlMode": mode, "RequestId": row["RequestId"],
                             "Url": url, "HttpStatusCode": 200})
        outputs = [output("url-modes.csv", [("UrlMode", "string"), ("RequestId", "string"),
                         ("Url", "string"), ("HttpStatusCode", "integer")], rows)]
    elif case == "auth-tls":
        outputs = [output("auth-tls.csv", [("AuthMode", "string"),
            ("Authenticated", "boolean"), ("HttpStatusCode", "integer")],
            [{"AuthMode": mode, "Authenticated": True, "HttpStatusCode": 200}
             for mode in ("Basic", "Bearer")])]
    elif case == "timeout-retry":
        outputs = [output("retry.csv", [("HttpStatusCode", "integer"), ("HasError", "boolean")],
                          [{"HttpStatusCode": 500, "HasError": True}])]
    elif case == "request-dump":
        outputs = [output("request-dump.csv", [("RequestId", "string"), ("Body", "string"),
                                             ("HttpStatusCode", "integer")],
                          [{"RequestId": row["RequestId"], "Body": row["Body"],
                            "HttpStatusCode": 200} for row in requests])]
    elif case == "error-descriptions":
        outputs = [output("service-codes.csv", [("RequestID", "integer"), ("ErrorCode", "integer"),
                                               ("HttpStatusCode", "integer")],
                          [{"RequestID": 0, "ErrorCode": 0, "HttpStatusCode": 200}])]
        # run-check consumes export_destination as a routing hint, then removes
        # it for a native-node output. Stock cold reads REST port 1 itself.
        outputs[0].update(output_node_type="integration.rest_request", output_port=1)
    else:
        stub = json.loads((FIXTURES / "response.json").read_text(encoding="utf-8"))
        outputs = [output("simulation.csv", [("message", "string"), ("amount", "integer"),
                                            ("ok", "boolean")], [stub])]
    return {"package_path": "{{PACKAGE_PATH}}",
            "nodes": [{"type": "integration.rest_request"}, {"type": "exports.text"}],
            "outputs": outputs}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--case", choices=CASES)
    args = parser.parse_args()
    assert not (args.check and args.write), "Choose --check or --write"
    for case in ((args.case,) if args.case else CASES):
        content = json.dumps(proposal(case), ensure_ascii=False, indent=2) + "\n"
        path = Path(__file__).parent / case / "expected.json"
        if args.check:
            assert path.read_text(encoding="utf-8") == content, case
        elif args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        else:
            print(content, end="")
    if not args.case or args.case == "request-dump":
        artifact = {"status": "proposal_requires_owner_decision",
                    "stock_csv_does_not_verify_files": True,
                    "native_file_format_and_names": "not_observed",
                    "requests": [{"method": "POST", "request_id": row["RequestId"],
                                  "url": "https://httpbin.org/anything",
                                  "header": {"X-Lab-Cycle": "dump"},
                                  "body_utf8": row["Body"],
                                  "body_bytes": len(row["Body"].encode("utf-8"))}
                                 for row in source("requests.csv")]}
        path = Path(__file__).parent / "request-dump/artifact-expectation-proposed.json"
        content = json.dumps(artifact, ensure_ascii=False, indent=2) + "\n"
        if args.check:
            assert path.read_text(encoding="utf-8") == content, "request-dump artifact"
        elif args.write:
            path.write_text(content, encoding="utf-8")
