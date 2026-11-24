"""Compute the reference contract from fixture bytes and task inputs."""
import csv
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent


def read_ints(filename):
    with (HERE / "data" / filename).open(encoding="utf-8", newline="") as stream:
        return [{key: int(cell) for key, cell in row.items()} for row in csv.DictReader(stream)]

target = "exports.text"
name = "ReportFile"
data_source = "imports.text"
expected = {
    "nodes": [dict(type=node) for node in [data_source, "variables.user", target]],
    "text_binding": dict(variable=name),
}

rows = read_ints("register.csv")
columns = [("Ticket", "integer"), ("Amount", "integer")]

expected["outputs"] = [dict(
    output_node_type="export_input", export_destination="bh-v09-result.csv",
    ordered=True, column_order="exact",
    columns=[dict(name=column, type=type_, label_any=True) for column, type_ in columns],
    rows=rows,
)]

print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
