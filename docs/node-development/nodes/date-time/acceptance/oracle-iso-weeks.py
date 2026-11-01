"""ISO-week proposal, independent of Loginom: Python standard library only.

Run with --write to reproduce expected.json, expected-iso-weeks-empty.json and
fixtures/iso-manifest.json. --check detects stale artifacts. Only the four approved
operations are added to the existing calendar year; week end is outside v0.3.9.
"""
import argparse
import csv
from datetime import datetime, time, timedelta
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OPERATIONS = ["Year", "ISOYear", "ISOWeek", "WeekStart", "Weekday"]


def values(raw):
    if raw == "NULL":
        return {key: None for key in OPERATIONS}
    stamp = datetime.fromisoformat(raw)
    if stamp.tzinfo is not None:
        raise ValueError("Fixture requires civil datetime without timezone")
    iso = stamp.isocalendar()
    monday = stamp.date() - timedelta(days=iso.weekday - 1)
    return dict(zip(OPERATIONS, [stamp.year, iso.year, iso.week,
        datetime.combine(monday, time()).isoformat(timespec="milliseconds"),
        iso.weekday]))


def expected(empty=False):
    columns = [{"name": "RowID", "type": "integer", "label_any": True},
               {"name": "DateA", "type": "datetime", "label_any": True},
               {"name": "DateB", "type": "datetime", "label_any": True}]
    for field in ["A", "B"]:
        for operation in OPERATIONS:
            if field == "A" and operation == "Weekday":
                continue  # Final user edit removes only this generated output.
            columns.append({"name": field + "_" + operation,
                            "type": "datetime" if operation == "WeekStart" else "integer",
                            "label_any": True})
    rows = []
    fixture = ROOT / "fixtures" / ("iso-weeks-empty.csv" if empty else "iso-weeks.csv")
    with fixture.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source, delimiter=";")
        if reader.fieldnames != ["RowID", "DateA", "DateB"]:
            raise ValueError("Unexpected fixture columns")
        for raw in reader:
            row = {"RowID": int(raw["RowID"])}
            for field in ["DateA", "DateB"]:
                row[field] = None if raw[field] == "NULL" else datetime.fromisoformat(raw[field]).isoformat(timespec="milliseconds")
            for field in ["A", "B"]:
                for operation, value in values(raw["Date" + field]).items():
                    if field != "A" or operation != "Weekday":
                        row[field + "_" + operation] = value
            rows.append(row)
    if len(rows) > 100 or len({r["RowID"] for r in rows}) != len(rows):
        raise ValueError("Rows exceed cold-check bounds or RowID is duplicated")
    return {"package_path": "{{PACKAGE_PATH}}",
            "nodes": [{"type": "imports.text"}, {"type": "transform.date_time"}],
            "outputs": [{"output_node_type": "transform.date_time", "output_port": 0,
                         "ordered": False, "column_order": "exact", "columns": columns, "rows": rows}]}


def artifacts():
    fixtures = []
    for filename in ["iso-weeks.csv", "iso-weeks-empty.csv"]:
        data = (ROOT / "fixtures" / filename).read_bytes()
        fixtures.append({"file": filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                         "rows": len(data.decode("utf-8").splitlines()) - 1})
    manifest = {"encoding": "UTF-8", "bom": False, "delimiter": ";", "line_ending": "LF",
                "null_marker": "NULL", "date_format": "yyyy/mm/dd", "date_separator": "-",
                "datetime_timezone": "none; civil values, preserve time", "input_columns": [
                    {"name": "RowID", "type": "integer"}, {"name": "DateA", "type": "datetime"},
                    {"name": "DateB", "type": "datetime"}], "fixtures": fixtures}
    return {ROOT / "acceptance/expected.json": expected(),
            ROOT / "acceptance/expected-iso-weeks-empty.json": expected(empty=True),
            ROOT / "fixtures/iso-manifest.json": manifest}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs = artifacts()
    for path, result in outputs.items():
        text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
        if args.write:
            path.write_text(text, encoding="utf-8")
        elif args.check and path.read_text(encoding="utf-8") != text:
            raise SystemExit("Stale oracle artifact: " + path.name)
    if args.check:
        print("OK: independent ISO expectations and fixture manifest")
    elif not args.write:
        print(json.dumps(expected(), ensure_ascii=False, indent=2))
