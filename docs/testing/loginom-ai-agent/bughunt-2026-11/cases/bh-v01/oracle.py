"""Compute the reference contract from fixture bytes and task inputs."""
import csv
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent


def read_ints(filename):
    with (HERE / "data" / filename).open(encoding="utf-8", newline="") as stream:
        return [{key: int(cell) for key, cell in row.items()} for row in csv.DictReader(stream)]

target = "transform.calculator"
name = "Surcharge"
value_type = "integer"
value = 7
kind = "variables"
data_source = "imports.text"
expected = {
    "nodes": [dict(type=node) for node in [data_source, "variables.user", target]],
    "variable_inventory": {
        "outputs": [dict(
            node=dict(type="variables.user"), port=4,
            variables=[dict(name=name, type=value_type, value=value, label_any=True)],
        )],
        "links": [dict(
            source=dict(type="variables.user"), output=4,
            target=dict(type=target), input=0, kind=kind,
        )],
    },
}

rows = [
    dict(row, Payable=row["Amount"] + value)
    for row in read_ints("charges.csv")
]
columns = [("Ticket", "integer"), ("Amount", "integer"), ("Payable", "integer")]

expected["outputs"] = [dict(
    output_node_type=target, output_port=0, export_destination="bh-v01-result.csv",
    ordered=True, column_order="exact",
    columns=[dict(name=column, type=type_, label_any=True) for column, type_ in columns],
    rows=rows,
)]

print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
