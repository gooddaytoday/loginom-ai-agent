#!/usr/bin/env python3
"""Proposed expectations from CSV bytes only; no Loginom or model calls."""
import argparse
import csv
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures/file-variable"
COLUMNS = [
    {"name": "Id", "type": "integer", "label_any": True},
    {"name": "Item", "type": "string", "label_any": True},
    {"name": "Amount", "type": "integer", "label_any": True},
]
DATES = ("2026-11-05", "2026-11-06")


def read_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != [column["name"] for column in COLUMNS]:
            raise ValueError("Unexpected names/order")
        result = []
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError("Unexpected row width")
            result.append({"Id": int(row["Id"]), "Item": row["Item"], "Amount": int(row["Amount"])})
        return result


def expected():
    stages = []
    for date in DATES:
        source = FIXTURES / ("sales-" + date + ".csv")
        rows = read_rows(source)
        stream = io.StringIO(newline="")
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow([column["name"] for column in COLUMNS])
        writer.writerows([row[column["name"]] for column in COLUMNS] for row in rows)
        stages.append({
            "date": date,
            "source": source.name,
            "source_bytes": source.stat().st_size,
            "input_path": "{{INPUTS_DIR}}/" + source.name,
            "export_path": "{{EXPORTS_DIR}}/report-" + date + ".csv",
            "rows": rows,
            "canonical_export_bytes": len(stream.getvalue().encode("utf-8")),
        })
    output = {"output_node_type": "imports.text", "output_port": 0, "ordered": True,
              "column_order": "exact", "columns": COLUMNS, "rows": stages[-1]["rows"]}
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "imports.text"}, {"type": "exports.text"}],
        "null_marker": "NULL",
        "outputs": [output],
        "file_variable_proposal": {
            "status": "awaiting_owner_approval",
            "scope": "combined task-file-variable.md; export-only uses first-stage rows for both dates",
            "stages": stages,
            "same_import_and_export_nodes": True,
            "binding": {"kind": "variable", "input_names": ["InputFile", "ReportFile"]},
            "cold": {"stage": 2, "settings_reapplied": False, "binding_names_preserved": True},
            "negative_values": [None, "", " ", 42, False, "relative.csv", "{{INPUTS_DIR}}/../escape.csv",
                                "{{EXPORTS_DIR}}-sibling/report.csv", "https://example.invalid/a.csv",
                                "{{EXPORTS_DIR}}/report-%Unknown%.csv"],
            "negative_outcome": "refusal before graph/wizard/file mutation; no fallback to retained filename",
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare checked-in expected.json")
    parser.add_argument("--actual", type=Path, help="Downloaded CSV; checks all typed rows and field order")
    parser.add_argument("--date", choices=DATES, default=DATES[-1])
    args = parser.parse_args()
    result = expected()
    if args.check:
        if json.loads(Path(__file__).with_name("expected.json").read_text(encoding="utf-8")) != result:
            raise SystemExit("expected.json differs from independent CSV calculation")
        print("expected.json matches independent CSV calculation")
    if args.actual:
        stage = next(stage for stage in result["file_variable_proposal"]["stages"] if stage["date"] == args.date)
        if read_rows(args.actual) != stage["rows"]:
            raise SystemExit("CSV rows differ")
        print("CSV matches every typed row and column order")
    if not args.check and not args.actual:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
