"""Independent fixture/value audit, not a CLI/source-lineage acceptance oracle."""
import argparse
import csv
import hashlib
import json
from pathlib import Path


FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def require(value, message):
    if not value:
        raise ValueError(message)


def audit_bytes(manifest):
    for entry in manifest["files"] + manifest["specs"]:
        data = (FIXTURES / entry["name"]).read_bytes()
        require(len(data) == entry["bytes"], "Fixture size differs")
        require(hashlib.sha256(data).hexdigest() == entry["sha256"], "Fixture digest differs")
    source = (FIXTURES / "source.lgd").read_bytes()
    for name, offset in [("corrupt.lgd", 333), ("corrupt-block.lgd", 320)]:
        changed = (FIXTURES / name).read_bytes()
        require(len(source) == len(changed), "Corrupt copy size differs")
        require([i for i, pair in enumerate(zip(source, changed)) if pair[0] != pair[1]] == [offset],
                "Corrupt copy changed a different byte")
        require(source[offset] ^ changed[offset] == 1, "Corrupt mutation differs")


def expected_rows(entry, schema):
    with (FIXTURES / entry["values_spec"]).open(encoding="utf-8", newline="") as stream:
        reader = csv.reader(stream)
        require(next(reader) == [column["name"] for column in schema], "Spec header differs")
        rows = []
        for row in reader:
            require(len(row) == len(schema), "Spec row width differs")
            cells = []
            for value, column in zip(row, schema):
                if value == "\\N":
                    value = None
                elif column["type"] == "real":
                    value = float(value)
                elif column["type"] == "boolean":
                    require(value in ["true", "false"], "Spec boolean invalid")
                    value = value == "true"
                cells.append(value)
            rows.append(cells)
        return rows


def audit_readback(manifest, name, receipt, checksum_off=False):
    entries = [entry for entry in manifest["files"] if entry["name"] == name]
    require(len(entries) == 1, "Unknown fixture")
    if name == "corrupt-block.lgd":
        require(checksum_off, "Checksum ON must refuse corrupt-block; no successful value audit")
    else:
        require(not checksum_off, "Checksum-off diagnostic is only defined for corrupt-block")
    require(receipt.get("ok") is True, "Read failed")
    read = receipt["result"]
    columns = manifest["schema"]
    keys = ["name", "label", "type", "data_kind"]
    require([[column.get(key) for key in keys] for column in read["schema"]] ==
            [[column[key] for key in keys] for column in columns], "Schema differs")
    rows = expected_rows(entries[0], columns)
    if checksum_off:
        rows[-1][1] = manifest["checksum_block"]["checksum_off_formula"]
    require(read["row_count"] == read["sample_rows"] == len(rows), "Row count differs")
    require(read["sample_complete"] is True and read["filter_enabled"] is False,
            "Partial or filtered read")
    require(read["precision"]["numbers_verified"] is True, "Numeric precision not qualified")
    require(len(read["sample"]) == len(rows), "Sample size differs")
    for observed, expected in zip(read["sample"], rows):
        require(len(observed) == len(columns), "Row width differs")
        for cell, value, column in zip(observed, expected, columns):
            require(cell["type"] == column["type"], "Cell type differs")
            require(cell["is_null"] is (value is None), "Null differs")
            actual = cell["value"]
            # JSON does not distinguish a real 0.0 from 0; the typed cell does.
            same_type = (type(actual) in (int, float) if column["type"] == "real" and value is not None
                         else type(actual) is type(value))
            require(same_type and actual == value,
                    "Cell value differs")
    return {"fixture": name, "rows": len(rows), "all_cells": True, "row_order": True,
            "schema_names_labels_types_kinds": True, "checksum_off_diagnostic": checksum_off}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readback", action="append", default=[], metavar="FIXTURE:RECEIPT_JSON")
    parser.add_argument("--checksum-off", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((FIXTURES / "manifest.json").read_text())
    audit_bytes(manifest)
    checks = []
    for request in args.readback:
        name, path = request.split(":", 1)
        checks.append(audit_readback(manifest, name, json.loads(Path(path).read_text()), args.checksum_off))
    print(json.dumps({"status": "PASS", "scope": "fixture_bytes_and_supplied_typed_values",
                      "checks": checks, "not_verified": ["receipt provenance", "source lineage",
                      "fresh execution", "field purposes", "cleanup", "CLI/model acceptance"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
