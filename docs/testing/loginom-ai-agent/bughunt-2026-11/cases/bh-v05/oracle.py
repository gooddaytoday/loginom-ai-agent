"""Compute the reference contract from fixture bytes and task inputs."""
import csv
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent


def read_rows(filename):
    with (HERE / "data" / filename).open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))

target = "transform.sorting"
name = "UseLocale"
value_type = "boolean"
value = True
kind = "control"
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

records = [dict(Ticket=int(row["Ticket"]), Word=row["Word"]) for row in read_rows("directory.csv")]
rows = sorted(records, key=lambda row: (row["Word"], row["Ticket"]))
columns = [("Ticket", "integer"), ("Word", "string")]
expected["binding_inventory"] = [dict(
    node=dict(type=target), parameter="/compare_with_locale", mode="variable",
    variable=dict(kind=kind, input=0, name=name, type=value_type, is_null=False),
    source=dict(type="variables.user", output=4),
)]

expected["outputs"] = [dict(
    output_node_type=target, output_port=0, export_destination="bh-v05-result.csv",
    ordered=True, column_order="exact",
    columns=[dict(name=column, type=type_, label_any=True) for column, type_ in columns],
    rows=rows,
)]

print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
