"""Independent relational oracle; stage-0 proposal, no Loginom dependency."""
import csv
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent / "fixtures"


def table(name, types):
    with (FIXTURES / name).open(encoding="utf-8", newline="") as stream:
        return [
            {key: None if value == "?" else types.get(key, str)(value)
             for key, value in row.items()}
            for row in csv.DictReader(stream)
        ]


def expected(case="final"):
    if case == "composite":
        main = table("composite-main.csv", {"RowID": int, "Code": int})
        lookup = table("composite-ref.csv", {"Code": int})
        rows = []
        for row in main:
            matches = [r for r in lookup if (r["Code"], r["Zone"]) == (row["Code"], row["Zone"])] or [None]
            rows.extend(dict(row, RefName=r["Name"] if r else None) for r in matches)
        return {"package_path": "{{PACKAGE_PATH}}", "nodes": [
            {"type": "imports.text"}, {"type": "transform.enrich_data"}],
            "outputs": [{"output_node_type": "transform.enrich_data", "output_port": 0,
                         "ordered": False, "column_order": "exact", "columns": [
                             {"name": "RowID", "type": "integer", "label_any": True},
                             {"name": "Code", "type": "integer", "label_any": True},
                             {"name": "Zone", "type": "string", "label_any": True},
                             {"name": "RefName", "type": "string", "label": "LookupName"}],
                         "rows": rows}]}
    main = table("main.csv", {"RowID": int, "Key": int, "Amount": float})
    first = table("ref-b-duplicates.csv" if case == "final" else "ref-b.csv", {"Key": int, "Rate": float})
    second = table("ref-c.csv", {"Key": int}) if case != "single" else []
    # Null-safe equality and Cartesian multiplicity, proposed for stage-1 acceptance.
    rows = []
    for row in main:
        bs = [b for b in first if b["Key"] == row["Key"]] or [None]
        cs = [c for c in second if c["Key"] == row["Key"]] or [None]
        for b in bs:
            for c in cs:
                rows.append(dict(row, RefName=b["Name"] if b else None,
                                 RefRate=b["Rate"] if b else None,
                                 **({"RefName_1": c["Name"] if c else None} if case != "single" else {})))
    columns = [
        {"name": name, "type": kind,
         **({"label": {"RefName": "LookupName", "RefRate": "LookupRate", "RefName_1": "LookupName"}[name]} if name.startswith("Ref") else {"label_any": True}),
         **({"tolerance": {"abs": 0, "rel": 0}} if kind == "real" else {})}
        for name, kind in [("RowID", "integer"), ("Key", "integer"),
                           ("Amount", "real"), ("Note", "string"),
                           ("RefName", "string"), ("RefRate", "real")]
                           + ([("RefName_1", "string")] if case != "single" else [])
    ]
    return {"package_path": "{{PACKAGE_PATH}}", "nodes": [
        {"type": "imports.text"}, {"type": "transform.enrich_data"}],
        "outputs": [{"output_node_type": "transform.enrich_data", "output_port": 0,
                     "ordered": False, "column_order": "exact", "columns": columns,
                     "rows": rows}]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", choices=["single", "initial", "final", "composite"], default="final")
    print(json.dumps(expected(parser.parse_args().case), ensure_ascii=False, indent=2))
