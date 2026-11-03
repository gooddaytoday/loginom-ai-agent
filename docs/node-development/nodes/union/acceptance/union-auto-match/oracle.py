#!/usr/bin/env python3
"""Independent append oracle: CSV records, named projection, duplicate preservation."""
import argparse
import csv
import json
from pathlib import Path


def expected(package):
    rows = []
    for name in ("main", "second", "third"):
        with (Path(__file__).parent / "data" / (name + ".csv")).open(newline="", encoding="utf-8") as source:
            for row in csv.DictReader(source):
                rows.append({"Code": row["Code"], "Amount": float(row["Amount"]), "Extra": row.get("Extra")})
    return {"package_path": package, "nodes": [{"type": "transform.union_data"}], "outputs": [{
        "output_node_type": "transform.union_data", "output_port": 0,
        "ordered": True, "column_order": "exact", "columns": [
            {"name": name, "type": kind, "label_any": True}
            for name, kind in (("Code", "string"), ("Amount", "real"), ("Extra", "string"))], "rows": rows}]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", default="{{PACKAGE_PATH}}")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    text = json.dumps(expected(args.package), ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
