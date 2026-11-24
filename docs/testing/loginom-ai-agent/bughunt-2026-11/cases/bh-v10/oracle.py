"""Compute the reference contract from fixture bytes and task inputs."""
import csv
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent


def read_rows(filename):
    with (HERE / "data" / filename).open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))

target = "integration.rest_request"
name = "ReportStage"
value_type = "string"
value = "trial-1983"
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

rows = [dict(HeaderValue=value) for _ in read_rows("requests.csv")]
columns = [("HeaderValue", "string")]

expected["outputs"] = [dict(
    output_node_type="export_input", export_destination="bh-v10-result.csv",
    ordered=True, column_order="exact",
    columns=[dict(name=column, type=type_, label_any=True) for column, type_ in columns],
    rows=rows,
)]

print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
