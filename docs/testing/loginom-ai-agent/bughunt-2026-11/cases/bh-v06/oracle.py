"""Compute the reference contract from fixture bytes and task inputs."""
import csv
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent


def read_ints(filename):
    with (HERE / "data" / filename).open(encoding="utf-8", newline="") as stream:
        return [{key: int(cell) for key, cell in row.items()} for row in csv.DictReader(stream)]

target = "imports.text"
name = "RegistryPath"
value_type = "string"
kind = "variables"
expected = {
    "nodes": [dict(type=node) for node in ["variables.user", target]],
}

rows = read_ints("registry.csv")
columns = [("Ticket", "integer"), ("Amount", "integer")]
expected["binding_inventory"] = [dict(
    node=dict(type=target), parameter="/settings/source/source_path", mode="variable",
    variable=dict(kind=kind, input=0, name=name, type=value_type, is_null=False),
    source=dict(type="variables.user", output=4),
)]

expected["outputs"] = [dict(
    output_node_type=target, output_port=0, export_destination="bh-v06-result.csv",
    ordered=True, column_order="exact",
    columns=[dict(name=column, type=type_, label_any=True) for column, type_ in columns],
    rows=rows,
)]

print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
