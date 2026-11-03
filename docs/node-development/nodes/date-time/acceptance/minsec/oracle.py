"""Independent civil-time expectations; never supplied to the model."""
import argparse
import csv
from datetime import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def expected():
    names = ["RowID", "DateA", "DateB", "A_Hour", "A_Second",
             "B_Hour", "B_Minute", "B_Second"]
    rows = []
    with (ROOT / "data/minsec.csv").open(encoding="utf-8", newline="") as source:
        for raw in csv.DictReader(source, delimiter=";"):
            row = {"RowID": int(raw["RowID"])}
            for field in ["A", "B"]:
                value = raw["Date" + field]
                stamp = None if value in ["", "NULL"] else datetime.fromisoformat(value)
                if stamp is not None and stamp.tzinfo is not None:
                    raise ValueError("Civil datetime required")
                row["Date" + field] = stamp.isoformat(timespec="milliseconds") if stamp else None
                for part in ["Hour", "Minute", "Second"]:
                    if field == "A" and part == "Minute":
                        continue
                    row[field + "_" + part] = getattr(stamp, part.lower()) if stamp else None
            rows.append(row)
    return {"package_path": "{{PACKAGE_PATH}}",
            "nodes": [{"type": "imports.text"}, {"type": "transform.date_time"}],
            "outputs": [{"output_node_type": "transform.date_time", "output_port": 0,
                         "ordered": False, "column_order": "exact",
                         "columns": [{"name": name, "type": "datetime" if name in ["DateA", "DateB"] else "integer",
                                      "label_any": True} for name in names], "rows": rows}]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = json.dumps(expected(), ensure_ascii=False, indent=2) + "\n"
    if args.write:
        (ROOT / "expected.json").write_text(result, encoding="utf-8")
    elif args.check:
        if (ROOT / "expected.json").read_text(encoding="utf-8") != result:
            raise SystemExit("Stale minute/second expectations")
        print("OK: independent minute/second expectations")
    else:
        print(result, end="")
