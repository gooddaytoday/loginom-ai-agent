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
    manifest = ROOT / "fixtures/empty-variant/files.json"
    for entry in json.loads(manifest.read_text())["files"]:
        data = (manifest.parent / entry["name"]).read_bytes()
        assert len(data) == entry["bytes"] and hashlib.sha256(data).hexdigest() == entry["sha256"]


    manifest = ROOT / "fixtures/64bit/files.json"
    if manifest.exists():
        for entry in json.loads(manifest.read_text())["files"]:
            data = (manifest.parent / entry["name"]).read_bytes()
            assert len(data) == entry["bytes"]
            assert hashlib.sha256(data).hexdigest() == entry["sha256"]



def empty_variant_expectations():
    scalar = table(ROOT, "lgd-values.csv")
    empty = table(ROOT, "properties-values.csv", "properties-schema.json")
    for spec in [scalar, empty]:
        for column in spec["columns"]:
            if column["type"] != "real":
                column.pop("tolerance", None)
    columns = [{"name": "Names", "label": "Имена", "type": "string", "data_kind": "discrete"},
               {"name": "DisplayNames", "label": "Метки", "type": "string", "data_kind": "discrete"},
               {"name": "Values", "label": "Значения", "type": "variant", "data_kind": "Неопределенное"},
               {"name": "DataTypes", "label": "Типы данных", "type": "integer", "data_kind": "discrete"}]
    codes = {"boolean": 1, "datetime": 2, "real": 3, "integer": 4, "string": 5}
    rows = [{"Names": c["name"], "DisplayNames": c["label"],
             "Values": None if value is None else {"cell_type": c["type"], "value": value},
             "DataTypes": codes[c["type"]]} for row in scalar["rows"] for c, value in zip(scalar["columns"], row)]
    outputs = [{"output_node_type": "imports.lgd", "output_node_label": label, "output_port": 0,
                "ordered": True, "column_order": "exact", "columns": fields, "rows": values}
               for label, fields, values in [("Пустой", empty["columns"], []), ("Variant", columns, rows)]]
    imports = [{"label": o["output_node_label"], "filename": name, "compression": "LZ4", "written_checksum": "Сжатых данных", "checksum": True, "columns": o["columns"]}
               for name, o in zip(["empty.lgd", "variant.lgd"], outputs)]
    return {"package_path": "{{PACKAGE_PATH}}", "nodes": [{"type": "imports.lgd", "label": label} for label in ["Пустой", "Variant"]],
            "outputs": outputs, "lgd": {"kind": "empty_variant", "imports": imports}}

def compression_expectations():
    spec = table(ROOT, "properties-values.csv", "properties-schema.json")
    for column in spec["columns"]:
        if column["type"] != "real":
            column.pop("tolerance", None)
    rows = [dict(zip([c["name"] for c in spec["columns"]], row)) for row in spec["rows"]]
    cases = [("Без сжатия", "Без сжатия", "Нет", "compression-none.lgd"),
             ("LZO", "LZO", "Нет", "compression-lzo.lgd"),
             ("LZ4", "LZ4", "Сжатых данных", "compression-lz4.lgd")]
    return {"package_path": "{{PACKAGE_PATH}}",
            "nodes": [{"type": "imports.lgd", "label": label} for label, _, _, _ in cases],
            "lgd": {"kind": "compression", "imports": [
                {"label": label, "compression": compression, "bitness": "64-битная система",
                 "written_checksum": checksum, "checksum": True, "filename": filename, "columns": spec["columns"]}
                for label, compression, checksum, filename in cases]},
            "outputs": [{"output_node_type": "imports.lgd", "output_node_label": label,
                         "output_port": 0, "ordered": True, "column_order": "exact",
                         "columns": spec["columns"], "rows": rows} for label, _, _, _ in cases]}


def checksum_expectations():
    spec = table(ROOT, "properties-values.csv", "properties-schema.json")
    for column in spec["columns"]:
        if column["type"] != "real":
            column.pop("tolerance", None)
    rows = [dict(zip([c["name"] for c in spec["columns"]], row)) for row in spec["rows"]]
    cases = [("Нет суммы", "Нет", True, "checksum-none.lgd"),
             ("Сжатая сумма", "Сжатых данных", True, "checksum-compressed.lgd"),
             ("Обе суммы", "Сжатых и несжатых данных", False, "checksum-both.lgd")]
    return {"package_path": "{{PACKAGE_PATH}}",
            "nodes": [{"type": "imports.lgd", "label": label} for label, _, _, _ in cases],
            "lgd": {"kind": "checksum", "checksum_switch_filename": "checksum-both.lgd", "imports": [
                {"label": label, "compression": "LZ4", "bitness": "64-битная система", "written_checksum": written,
                 "checksum": verify, "filename": filename, "columns": spec["columns"]}
                for label, written, verify, filename in cases]},
            "outputs": [{"output_node_type": "imports.lgd", "output_node_label": label,
                         "output_port": 0, "ordered": True, "column_order": "exact", "columns": spec["columns"], "rows": rows}
                        for label, _, _, _ in cases]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--readback", type=Path)
    parser.add_argument("--case", choices=["standalone", "properties", "export"], default="standalone")
    args = parser.parse_args()
    fixtures()
    imported, exported = expectations()
    for path, value in [(ROOT / "acceptance/expected.json", imported), (EXPORT / "acceptance/expected.json", exported),
                        (ROOT / "acceptance/empty-variant/expected.json", empty_variant_expectations()),
                        (ROOT / "acceptance/compression/expected.json", compression_expectations()),
                        (ROOT / "acceptance/checksum/expected.json", checksum_expectations())]:
        if args.write:
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        if args.check:
            assert json.loads(path.read_text()) == value, "Expected drift"
    if args.readback:
        wanted = exported["table"] if args.case == "export" else next(
            case for case in imported["cases"] if case["id"] == args.case)
        compare(wanted, json.loads(args.readback.read_text()))
    print("PASS: fixture/spec comparison only; LGD decoding, delivery and cold execution NOT_CHECKED")
