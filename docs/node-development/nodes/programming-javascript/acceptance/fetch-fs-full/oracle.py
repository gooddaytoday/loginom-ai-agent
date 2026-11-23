"""Independent stage-zero proposal: Decimal tables, raw file bytes, HTTP ledger.

No Loginom/browser/network imports; actuals never participate in expected values.
Transport, cold execution and the run-check catalog are deliberately unchanged.
"""
import argparse
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent.parent / "fixtures" / "fetch-fs-full"
CASES = ("fetch-get", "fetch-update", "fetch-content", "fetch-errors",
         "fetch-submit", "fetch-methods", "fetch-redirects", "fs-read", "fs-write",
         "fs-operations", "fs-errors", "fs-path-present", "fs-path-missing", "combined")


def orders():
    return json.loads((FIXTURES / "orders.json").read_text(encoding="utf8"))["orders"]


def money():
    return [(r["id"], Decimal(r["qty"]) * Decimal(r["price"])) for r in orders()]


def report():
    return ("ID;Amount\n" + "".join(f"{key};{amount:.2f}\n" for key, amount in money())).encode("utf8")


def files(case):
    if case == "fs-read":
        return {name: (FIXTURES / "input" / name).read_bytes()
                for name in ("utf8.txt", "utf16le.txt", "cp1251.txt", "bytes.bin")}
    if case == "fs-write":
        return {"report.txt": "Привет, Ёж\n42\n€".encode("utf8"),
                "utf16le.txt": "Ёж".encode("utf-16le"),
                "utf16bom.txt": b"\xff\xfe" + "Ёж".encode("utf-16le"),
                "cp1251.txt": "Ёж".encode("cp1251"), "bytes.bin": bytes([0, 1, 127, 128, 255])}
    if case == "fs-operations":
        original = bytes([0, 1, 127, 128, 255])
        patched = bytearray(b"ABC")
        patched[1:4] = bytes([1, 127, 128])
        return {"source.bin": original, "archive/final.bin": original[:3],
                "patched.bin": bytes(patched[:2]) + bytes(3)}
    if case == "fs-errors":
        return {"keep.txt": b"KEEP"}
    if case == "combined":
        return {"summary.csv": report()}
    if case == "fs-path-present":
        return {"sidecar.txt": b"LAB1549_SIDE"}
    return {}


def table(case):
    if case in ("fetch-get", "fetch-update"):
        discount = Decimal("0.90") if case == "fetch-update" else Decimal(1)
        return [("ID", "string"), ("Amount", "real")], [
            {"ID": key, "Amount": float(amount * discount)} for key, amount in money()]
    if case in ("fs-read", "fetch-content"):
        data = files("fs-read")
        encodings = {"utf8.txt": "utf8", "utf16le.txt": "utf-16le", "cp1251.txt": "cp1251"}
        names = list(data) if case == "fs-read" else ["utf8.txt", "bytes.bin"]
        name_field = "FileName" if case == "fs-read" else "Name"
        return [(name_field, "string"), ("ByteCount", "integer"), ("Text", "string"), ("Hex", "string")], [
            {name_field: name if case == "fs-read" else ("text" if name == "utf8.txt" else "binary"),
             "ByteCount": len(data[name]),
             "Text": data[name].decode(encodings[name]) if name in encodings else None,
             "Hex": None if name in encodings else data[name].hex()} for name in names]
    if case == "fetch-errors":
        rows = json.loads((FIXTURES / "errors.json").read_text(encoding="utf8"))
        return [("Case", "string"), ("Status", "integer"), ("Outcome", "string")], [
            {"Case": r["case"], "Status": r["status"], "Outcome": r["outcome"]} for r in rows]
    if case == "fetch-submit":
        return [("ID", "string"), ("ReceiptNo", "integer")], [
            {"ID": r["id"], "ReceiptNo": i + 1} for i, r in enumerate(orders())]
    if case == "fetch-methods":
        return [("Method", "string"), ("Status", "integer")], [
            {"Method": method, "Status": 200} for method in ("PUT", "PATCH", "DELETE", "HEAD")]
    if case == "fetch-redirects":
        return [("Code", "integer"), ("Count", "integer"), ("Amount", "real")], [
            {"Code": status, "Count": len(orders()), "Amount": float(sum(v for _, v in money()))}
            for status in (301, 302, 307)]
    if case in ("fs-write", "fs-operations"):
        data = files(case)
        names = sorted(data) if case == "fs-write" else list(data)
        return [("FileName", "string"), ("ByteCount", "integer"), ("Hex", "string")], [
            {"FileName": name, "ByteCount": len(data[name]), "Hex": data[name].hex()} for name in names]
    if case == "fs-errors":
        return [("Case", "string"), ("Outcome", "string"), ("Text", "string")], [
            {"Case": "exclusive", "Outcome": "exists", "Text": "KEEP"},
            {"Case": "missing", "Outcome": "missing", "Text": None},
            {"Case": "permission", "Outcome": "denied", "Text": None}]
    if case in ("fs-path-present", "fs-path-missing"):
        present = case == "fs-path-present"
        return [("Exists", "boolean"), ("Text", "string")], [
            {"Exists": present, "Text": "LAB1549_SIDE" if present else None}]
    if case == "combined":
        return [("Rows", "integer"), ("Amount", "real"), ("FileName", "string"),
                ("ByteCount", "integer"), ("ReceiptNo", "integer")], [
            {"Rows": len(orders()), "Amount": float(sum(v for _, v in money())),
             "FileName": "summary.csv", "ByteCount": len(report()), "ReceiptNo": 1}]
    raise ValueError(case)


def expected(case):
    columns, rows = table(case)
    return {"package_path": "{{PACKAGE_PATH}}",
            "nodes": [{"type": "programming.javascript"}, {"type": "exports.text"}],
            "outputs": [{"output_node_type": "export_input", "ordered": True,
                         "columns": [{"name": name, "type": kind, "label_any": True}
                                     for name, kind in columns], "rows": rows}]}


def http(case):
    def request(method, suffix, body=b"", content_type=None):
        return {"method": method, "suffix": suffix, "body_hex": body.hex(), "content_type": content_type}
    if case in ("fetch-get", "fetch-update"):
        return [request("GET", "/orders")]
    if case == "fetch-content":
        return [request("GET", suffix) for suffix in ("/text", "/binary")]
    if case == "fetch-errors":
        return [request("GET", suffix) for suffix in ("/missing", "/failure", "/malformed", "/slow?ms=3000")]
    if case == "fetch-submit":
        bodies = json.loads((FIXTURES / "submissions.json").read_text(encoding="utf8"))
        return [request("POST", "/receipts", body.encode("utf8"), "application/json") for body in bodies]
    if case == "fetch-methods":
        return [request("PUT", "/draft", b'{"value":"draft"}', "application/json"),
                request("PATCH", "/draft", b'{"value":"final"}', "application/json"),
                request("DELETE", "/draft"), request("HEAD", "/text")]
    if case == "fetch-redirects":
        return [entry for status in (301, 302, 307)
                for entry in (request("GET", f"/redirect/{status}"), request("GET", "/orders"))]
    if case == "combined":
        return [request("GET", "/orders"), request("POST", "/reports", report(), "text/csv")]
    return []


def external(case):
    data = files(case)
    dirs = ["archive"] if case == "fs-operations" else []
    inventory = [{"path": name, "kind": "file"} for name in sorted(data)]
    inventory += [{"path": name, "kind": "directory"} for name in dirs]
    if case == "fs-errors":
        inventory += [{"path": "denied.txt", "kind": "file"}]
    path_case = case in ("fs-path-present", "fs-path-missing")
    return {"http": http(case), "files": {name: value.hex() for name, value in data.items()},
            "inventory": inventory,
            "reserved_artifacts": ["paths.lgp", "paths.~lgp", "paths.csv"] if path_case else [],
            "required_artifacts": ["paths.lgp"] if path_case else [],
            "tls_failed_handshakes": 1 if case == "fetch-errors" else 0,
            "scope": "one explicit execution; configure/read must have an empty effect delta"}


def verify_files(case, directory):
    if directory.is_symlink():
        raise ValueError("Symlink artifact root")
    directory = directory.resolve()
    entries = list(directory.rglob("*"))
    if any(p.is_symlink() for p in entries):
        raise ValueError("Symlink in downloaded artifacts")
    actual = {p.relative_to(directory).as_posix(): p.read_bytes() for p in entries if p.is_file()}
    if actual != files(case):
        raise ValueError("Downloaded file names/bytes differ")
    allowed_dirs = {str(Path(name).parent) for name in files(case)} - {"."}
    if {p.relative_to(directory).as_posix() for p in entries if p.is_dir()} != allowed_dirs:
        raise ValueError("Unexpected/missing downloaded directory")


def verify_inventory(case, rows):
    projected = [{"path": r["path"], "kind": r["kind"]} for r in rows]
    contract = external(case)
    if len({r["path"] for r in projected}) != len(projected):
        raise ValueError("Duplicate server inventory entry")
    reserved = set(contract["reserved_artifacts"])
    if any(r["kind"] != "file" for r in projected if r["path"] in reserved):
        raise ValueError("Reserved package artifact has the wrong type")
    if not set(contract["required_artifacts"]) <= {r["path"] for r in projected}:
        raise ValueError("Saved package artifact missing")
    projected = [r for r in projected if r["path"] not in reserved]
    key = lambda r: (r["path"], r["kind"])
    if sorted(projected, key=key) != sorted(contract["inventory"], key=key):
        raise ValueError("Server inventory differs (including duplicates)")


def verify_ledger(case, actual, base_url):
    base = urlsplit(base_url)
    if base.scheme not in ("http", "https") or not base.netloc or base.query or base.fragment or base.username or base.password:
        raise ValueError("Expected an explicit fixture data base URL without credentials/query")
    prefix = base.path.rstrip("/")
    if len(actual) != len(http(case)):
        raise ValueError("Request count differs; duplicate/extra/missing request")
    for i, (row, exp) in enumerate(zip(actual, http(case))):
        suffix = urlsplit(exp["suffix"])
        body = bytes.fromhex(exp["body_hex"])
        if (row.get("run_id") != prefix.rsplit("/", 1)[-1]
                or type(row["sequence"]) is not int or row["sequence"] != i + 1 or row["method"] != exp["method"]
                or row["path"] != prefix + suffix.path or row.get("query", "") != suffix.query
                or row["body_sha256"] != hashlib.sha256(body).hexdigest() or row["body_bytes"] != len(body)):
            raise ValueError(f"Request {i + 1} method/path/body/order differs")
        headers = {k.lower(): v for k, v in row["headers"].items()}
        if set(headers) - {"content-type", "accept", "x-case-id", "user-agent"}:
            raise ValueError("Non-allowlisted header in fixture ledger")
        if exp["content_type"] and headers.get("content-type", "").split(";")[0].strip() != exp["content_type"]:
            raise ValueError("Request content type differs")
        if not isinstance(row.get("received_at"), str) or not row["received_at"].endswith("Z"):
            raise ValueError("Missing UTC request time")


def verify_table(case, actual):
    exp = expected(case)["outputs"][0]
    columns = [{"name": r["name"], "type": r["type"]} for r in actual["columns"]]
    if columns != [{"name": r["name"], "type": r["type"]} for r in exp["columns"]]:
        raise ValueError("Full table schema/order differs")
    if len(actual["rows"]) != len(exp["rows"]):
        raise ValueError("Full table row count differs")
    for row, wanted in zip(actual["rows"], exp["rows"]):
        if set(row) != set(wanted):
            raise ValueError("Table row field set differs")
        for column in exp["columns"]:
            name, kind = column["name"], column["type"]
            value, target = row[name], wanted[name]
            if target is None:
                equal = value is None
            elif kind == "real":
                equal = type(value) in (float, int) and math.isfinite(value) and math.isclose(value, target, rel_tol=1e-10, abs_tol=1e-9)
            else:
                equal = type(value) is type(target) and value == target
            if not equal:
                raise ValueError("Full ordered table values/types differ")


def check():
    for case in CASES:
        for prefix, value in (("expected", expected(case)), ("external", external(case))):
            if json.loads((HERE / f"{prefix}-{case}.json").read_text(encoding="utf8")) != value:
                raise ValueError(f"Stale {prefix}-{case}.json")
    print(f"{len(CASES)} independent tables and external contracts match")


def self_check():
    # Exercise rejection paths as well as fixtures; a repeated POST can leave
    # an identical final table, so the ledger must reject it independently.
    case = "fetch-submit"
    base = "http://fixture.invalid/runs/self-check"
    rows = [{"run_id": "self-check", "sequence": i + 1, "method": e["method"], "path": "/runs/self-check" + e["suffix"],
             "body_sha256": hashlib.sha256(bytes.fromhex(e["body_hex"])).hexdigest(),
             "body_bytes": len(bytes.fromhex(e["body_hex"])), "headers": {"content-type": e["content_type"]},
             "received_at": "2026-11-13T12:00:00.000Z"} for i, e in enumerate(http(case))]
    verify_ledger(case, rows, base)
    failures = 0
    for broken in (rows + [rows[-1]], rows[:-1], [dict(rows[0], body_bytes=0)] + rows[1:]):
        try:
            verify_ledger(case, broken, base)
        except ValueError:
            failures += 1
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        for name, data in files("fs-write").items():
            (root / name).write_bytes(data)
        verify_files("fs-write", root)
        (root / "report.txt").write_bytes(b"corrupt")
        try:
            verify_files("fs-write", root)
        except ValueError:
            failures += 1
    exp = expected("fs-path-missing")["outputs"][0]
    verify_table("fs-path-missing", exp)
    try:
        verify_table("fs-path-missing", dict(exp, rows=[{"Exists": 0, "Text": ""}]))
    except ValueError:
        failures += 1
    inventory = [{"path": "paths.lgp", "kind": "file"}, {"path": "sidecar.txt", "kind": "file"}]
    verify_inventory("fs-path-present", inventory)
    for broken in (inventory[1:], inventory + [{"path": "unexpected", "kind": "file"}]):
        try:
            verify_inventory("fs-path-present", broken)
        except ValueError:
            failures += 1
    if failures != 7:
        raise ValueError("Oracle failed a negative control")
    print("Oracle rejects duplicate/missing/wrong-body HTTP, corrupt bytes, NULL/type substitution, and missing/extra inventory")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=CASES, default="fetch-get")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--write-expected", action="store_true")
    parser.add_argument("--downloaded-files", type=Path)
    parser.add_argument("--inventory", type=Path)
    parser.add_argument("--ledger", type=Path)
    parser.add_argument("--base-url")
    parser.add_argument("--actual-table", type=Path)
    parser.add_argument("--tls-handshakes", type=Path)
    args = parser.parse_args()
    if args.write_expected:
        for case in CASES:
            for prefix, value in (("expected", expected(case)), ("external", external(case))):
                (HERE / f"{prefix}-{case}.json").write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    if args.check:
        check()
    if args.self_check:
        self_check()
    if args.downloaded_files:
        verify_files(args.case, args.downloaded_files)
        print("Downloaded byte artifacts match")
    if args.inventory:
        verify_inventory(args.case, json.loads(args.inventory.read_text(encoding="utf8")))
        print("Server inventory matches")
    if args.ledger:
        if not args.base_url:
            parser.error("--ledger requires --base-url")
        verify_ledger(args.case, json.loads(args.ledger.read_text(encoding="utf8")), args.base_url)
        print("HTTP ledger matches one explicit execution")
    if args.actual_table:
        verify_table(args.case, json.loads(args.actual_table.read_text(encoding="utf8")))
        print("Complete typed table matches")
    if args.tls_handshakes:
        if not args.base_url:
            parser.error("--tls-handshakes requires --base-url")
        handshakes = json.loads(args.tls_handshakes.read_text(encoding="utf8"))
        run_id = urlsplit(args.base_url).path.rstrip("/").rsplit("/", 1)[-1]
        if (len(handshakes) != external(args.case)["tls_failed_handshakes"]
                or any(r.get("failed") is not True or r.get("run_id") != run_id or not r.get("listener_id") for r in handshakes)):
            raise ValueError("TLS handshake evidence differs")
        print("Failed TLS handshake count matches")
    if not any((args.check, args.self_check, args.write_expected, args.downloaded_files,
                args.inventory, args.ledger, args.actual_table, args.tls_handshakes)):
        print(json.dumps(expected(args.case), ensure_ascii=False, indent=2))
