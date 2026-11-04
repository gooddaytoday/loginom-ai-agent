"""Independent CSV/spec oracle. Does not decode LGD or execute Loginom.

--check validates committed expectations. --readback checks a complete canonical
table JSON supplied by a separately qualified reader; it does not qualify that
reader or establish successful file delivery/cold execution.
"""
import argparse
import csv
from datetime import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT.parent / "exports-lgd"


def table(folder, csv_name, schema_name="schema.json"):
    columns = json.loads((folder / "fixtures" / schema_name).read_text())
    with (folder / "fixtures" / csv_name).open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        assert reader.fieldnames == [c["name"] for c in columns]
        rows = []
        for raw in reader:
            assert set(raw) == set(reader.fieldnames)
            row = []
            for column in columns:
                value = raw[column["name"]]
                if value == "\\N":
                    value = None
                elif column["type"] == "integer":
                    value = int(value)
                elif column["type"] == "real":
                    value = float(Decimal(value))
                elif column["type"] == "boolean":
                    assert value in ("true", "false")
                    value = value == "true"
                elif column["type"] == "datetime":
                    assert datetime.fromisoformat(value).tzinfo is None
                row.append(value)
            rows.append(row)
    for column in columns:
        if column["type"] == "real":
            column["tolerance"] = {"abs": 0, "rel": 0}
        if column["type"] == "datetime":
            column["tolerance"] = {"abs_ms": 1}
    return {"output_port": 0, "ordered": True, "column_order": "exact",
            "columns": columns, "row_count": len(rows), "rows": rows}


def expectations():
    original = table(ROOT, "lgd-values.csv")
    properties = table(ROOT, "properties-values.csv", "properties-schema.json")
    exported = table(EXPORT, "typed.csv")
    imported = {"proposal": True, "package_path": "{{PACKAGE_PATH}}",
                "nodes": [{"type": "imports.lgd", "label_any": True}],
                "cases": [{"id": "standalone", "fixture": "source.lgd", **original},
                          {"id": "properties", "fixture": "properties-stage0.lgd", **properties},
                          {"id": "corrupt", "fixture": "corrupt-block.lgd",
                           "expect": "refused", "output_port": None, "ordered": True,
                           "require_reason": "checksum", "allow_empty_success": False}]}
    output = {"proposal": True, "package_path": "{{PACKAGE_PATH}}",
              "nodes": [{"type": "exports.lgd", "label_any": True},
                        {"type": "imports.lgd", "label_any": True}],
              "file": {"format": "lgd", "filename": "roundtrip.lgd",
                       "output_port": None, "compression": "lz4", "checksum": "compressed"},
              "table": exported, "roundtrip": {"output_node_type": "imports.lgd", **exported}}
    return imported, output


def compare(expected, observed):
    assert observed["complete"] is True, "Partial read"
    assert observed["output_port"] == expected["output_port"], "Wrong port"
    assert observed["row_count"] == expected["row_count"], "Row count"
    keys = ("name", "label", "type", "data_kind")
    assert [[c[k] for k in keys] for c in observed["columns"]] == [
        [c[k] for k in keys] for c in expected["columns"]], "Field properties/order"
    assert len(observed["rows"]) == expected["row_count"], "Missing rows"
    for actual, wanted in zip(observed["rows"], expected["rows"]):
        assert len(actual) == len(wanted), "Row width"
        for got, value, column in zip(actual, wanted, expected["columns"]):
            if value is None:
                assert got is None, "NULL"
                continue
            assert got is not None, "Unexpected NULL"
            if column["type"] == "real":
                assert type(got) in (int, float) and got == value, "Real value"
            elif column["type"] == "datetime":
                a, b = datetime.fromisoformat(got), datetime.fromisoformat(value)
                assert a.tzinfo is b.tzinfo is None, "Timezone"
                assert abs((a-b).total_seconds()) <= .001, "Datetime"
            else:
                assert type(got) is type(value) and got == value, "Scalar value/type"


def fixtures():
    spec = json.loads((ROOT / "fixtures/files.json").read_text())
    for entry in spec["files"]:
        data = (ROOT / "fixtures" / entry["name"]).read_bytes()
        assert len(data) == entry["bytes"]
        assert hashlib.sha256(data).hexdigest() == entry["sha256"]
    a = (ROOT / "fixtures/source.lgd").read_bytes()
    b = (ROOT / "fixtures/corrupt-block.lgd").read_bytes()
    assert len(a) == len(b)
    assert [i for i, pair in enumerate(zip(a,b)) if pair[0] != pair[1]] == [320]
    assert a[320] ^ b[320] == 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--readback", type=Path)
    parser.add_argument("--case", choices=["standalone", "properties", "export"], default="standalone")
    args = parser.parse_args()
    fixtures()
    imported, exported = expectations()
    for folder, value in [(ROOT, imported), (EXPORT, exported)]:
        path = folder / "acceptance/expected.json"
        if args.write:
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        if args.check:
            assert json.loads(path.read_text()) == value, "Expected drift"
    if args.readback:
        wanted = exported["table"] if args.case == "export" else next(
            case for case in imported["cases"] if case["id"] == args.case)
        compare(wanted, json.loads(args.readback.read_text()))
    print("PASS: fixture/spec comparison only; LGD decoding, delivery and cold execution NOT_CHECKED")
