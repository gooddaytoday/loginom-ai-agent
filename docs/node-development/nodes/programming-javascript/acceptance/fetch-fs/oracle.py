"""Stage-zero proposal: independent literal/byte/Decimal oracle, no Loginom imports."""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent.parent / "fixtures" / "fetch-fs"
GET_URL = "https://httpbin.org/anything?RequestId=lab842-get&Key=Alpha&Qty=3&Price=12.5"


def output(columns, rows):
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "programming.javascript"}, {"type": "exports.text"}],
        "outputs": [{
            "output_node_type": "export_input", "ordered": True,
            "columns": [{"name": name, "type": kind, "label_any": True}
                        for name, kind in columns],
            "rows": rows,
        }],
    }


def expected(case):
    if case in ("get", "get-updated"):
        args = parse_qs(urlsplit(GET_URL).query, strict_parsing=True)
        price = Decimal(args["Price"][0]) if case == "get" else Decimal("4.25")
        return output([("RequestId", "string"), ("Key", "string"), ("Amount", "real")], [{
            "RequestId": args["RequestId"][0], "Key": args["Key"][0],
            "Amount": float(Decimal(args["Qty"][0]) * price),
        }])
    if case == "errors":
        outcomes = {
            "ok": (200, "ok"), "missing": (404, "http_error"),
            "server": (500, "http_error"), "malformed": (200, "invalid_json"),
            "slow": (None, "aborted"),
        }
        requests = json.loads((FIXTURES / "requests.json").read_text())
        assert [r["case"] for r in requests] == list(outcomes)
        assert [r["url"] for r in requests] == [
            "https://httpbin.org/anything?RequestId=lab842-errors",
            "https://httpbin.org/status/404", "https://httpbin.org/status/500",
            "https://httpbin.org/html", "https://httpbin.org/delay/3",
        ]
        assert requests[-1]["abort_after_ms"] == 100
        return output([("Case", "string"), ("Status", "integer"), ("Outcome", "string")], [
            {"Case": r["case"], "Status": outcomes[r["case"]][0],
             "Outcome": outcomes[r["case"]][1]} for r in requests
        ])
    if case == "read":
        text = (FIXTURES / "utf8.txt").read_bytes()
        binary = (FIXTURES / "bytes.bin").read_bytes()
        return output([("FileName", "string"), ("ByteCount", "integer"),
                       ("Text", "string"), ("Hex", "string")], [
            {"FileName": "utf8.txt", "ByteCount": len(text), "Text": text.decode("utf8"), "Hex": None},
            {"FileName": "bytes.bin", "ByteCount": len(binary), "Text": None, "Hex": binary.hex()},
        ])
    assert case == "write"
    return output([("FileName", "string"), ("ByteCount", "integer"), ("Hex", "string")], [
        {"FileName": name, "ByteCount": len(data), "Hex": data.hex()}
        for name, data in written_files().items()
    ])


def written_files():
    return {"report.txt": "Привет, Ёж\n42".encode("utf8"),
            "report.bin": bytes([0, 1, 127, 128, 255])}


def verify_written_files(directory):
    assert sorted(p.name for p in directory.iterdir()) == sorted(written_files()), "Unexpected/missing downloaded file"
    for name, data in written_files().items():
        assert (directory / name).is_file() and not (directory / name).is_symlink(), name
        assert (directory / name).read_bytes() == data, name + ": byte mismatch"


def manifest():
    return {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            for name in ("requests.json", "utf8.txt", "bytes.bin")
            for data in [(FIXTURES / name).read_bytes()]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["get", "get-updated", "errors", "read", "write"], default="get")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--downloaded-files", type=Path)
    args = parser.parse_args()
    if args.check:
        for case in ("get", "get-updated", "errors", "read", "write"):
            assert json.loads((HERE / ("expected-" + case + ".json")).read_text()) == expected(case), case
        assert json.loads((FIXTURES / "manifest.json").read_text()) == manifest()
        print("Expected tables and fixture hashes match")
    else:
        print(json.dumps(expected(args.case), ensure_ascii=False, indent=2))
    if args.downloaded_files:
        verify_written_files(args.downloaded_files)
        print("Downloaded report bytes match")
