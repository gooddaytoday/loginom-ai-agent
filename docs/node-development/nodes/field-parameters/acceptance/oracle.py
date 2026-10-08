"""Independent cleanup oracle, frozen before execution; no runtime imports.

The invalid-value rules and localized boolean spellings are the scoped goal
contract retained in reform_goal_contract.py, not inferred from model output.
Historical scalar-matrix.json remains diagnostic until live reconfirmation.
"""
import argparse
import csv
from datetime import datetime
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE_SHA = "c1204e8bb03a0a686ec291de1fa5d532f19830589d4040e695f2f17e186f2a2e"


def convert(value, kind):
    if value == "NULL":
        return None
    if kind == "string":
        return value
    if value == "":
        return None
    try:
        if kind == "integer":
            return int(value)
        if kind == "real":
            return float(value.replace(",", "."))
        if kind == "boolean":
            return {"истина": True, "false": False, "0": False}[value.casefold()]
        if kind == "datetime":
            return datetime.strptime(value, "%d.%m.%Y %H:%M:%S").isoformat(timespec="milliseconds")
    except (ValueError, KeyError):
        return None
    raise ValueError("unknown scalar type")


def expected(package_path="{{PACKAGE_PATH}}", final=True):
    data = (ROOT / "data/cleanup.csv").read_bytes()
    if len(data) != 248 or hashlib.sha256(data).hexdigest() != SOURCE_SHA:
        raise ValueError("cleanup fixture bytes changed")
    source = list(csv.DictReader(io.StringIO(data.decode("utf-8")), delimiter=";"))
    fields = [("Id", "Id", "integer", "Id"),
              ("Amount", "Значение", "real", "RawAmount"),
              ("Enabled", "Значение", "boolean", "RawFlag"),
              ("Timestamp", "Время", "datetime", "RawWhen"),
              ("Comment", "Comment", "string", "Comment")]
    if final:
        fields = [fields[3], fields[0], ("NetAmount", "Сумма", "real", "RawAmount"), fields[2]]
    return {"package_path": package_path,
            "nodes": [{"type": "imports.text"}, {"type": "transform.reform_columns"}],
            "outputs": [{"output_node_type": "transform.reform_columns", "output_node_label": "Очистка",
                         "columns": [dict(name=n, label=l, type=t) for n, l, t, _ in fields],
                         "rows": [{n: convert(row[s], t) for n, _, t, s in fields} for row in source]}]}


def manifest():
    files = []
    for name in ("data/cleanup.csv", "fixtures/scalar-matrix.csv", "fixtures/scalar-matrix.json"):
        data = (ROOT / name).read_bytes()
        files.append(dict(path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
    return {"schema_version": 1, "files": files,
            "cleanup": {"encoding": "UTF-8", "delimiter": ";", "decimal_separator": ",",
                        "null_marker": "NULL", "records": 6,
                        "source_order": ["Id", "RawAmount", "RawFlag", "RawWhen", "Comment", "Unused"],
                        "source_types": ["integer", "string", "string", "string", "string", "string"]},
            "historical_scalar_matrix": {"status": "diagnostic_reference_not_current_acceptance",
                                         "live_reconfirmation_required": True},
            "provenance": "packages/loginom-runtime/tools/loginom-acceptance/{reform_goal_contract.py,fixtures/field-parameters}"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-path", default="{{PACKAGE_PATH}}")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--initial", action="store_true")
    parser.add_argument("--manifest", action="store_true")
    args = parser.parse_args()
    args.output.write_text(json.dumps(manifest() if args.manifest else expected(args.package_path, not args.initial),
                                     ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
