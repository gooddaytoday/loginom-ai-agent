"""Compute the reference contract from fixture bytes and task inputs."""
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent

target = "programming.javascript"
name = "Count"
value_type = "integer"
value = 100
kind = "variables"
expected = {
    "nodes": [dict(type=node) for node in ["variables.user", target]],
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

rows = [dict(x=i, x2=float(i**2)) for i in range(value)]
columns = [("x", "integer"), ("x2", "real")]

expected["outputs"] = [dict(
    output_node_type=target, output_port=0, export_destination="bh-v11-result.csv",
    ordered=True, column_order="exact",
    columns=[dict(name=column, type=type_, label_any=True) for column, type_ in columns],
    rows=rows,
)]

print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
