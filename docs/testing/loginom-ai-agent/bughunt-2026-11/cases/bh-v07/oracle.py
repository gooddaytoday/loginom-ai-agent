"""Compute the reference contract from fixture bytes and task inputs."""
import json
from pathlib import Path

from openpyxl import load_workbook


HERE = Path(__file__).resolve().parent

target = "imports.excel"
name = "WorkbookPath"
value_type = "string"
kind = "variables"
expected = {
    "nodes": [dict(type=node) for node in ["variables.user", target]],
}

with (HERE / "data" / "applications.xlsx").open("rb") as stream:
    book = load_workbook(stream, read_only=True)
    try:
        records = iter(book["Заявки"].values)
        header = next(records)
        rows = [dict(zip(header, record, strict=True)) for record in records]
    finally:
        book.close()
columns = [("Ticket", "integer"), ("Amount", "integer")]
expected["binding_inventory"] = [dict(
    node=dict(type=target), parameter="/excel/source_path", mode="variable",
    variable=dict(kind=kind, input=0, name=name, type=value_type, is_null=False),
    source=dict(type="variables.user", output=4),
)]

expected["outputs"] = [dict(
    output_node_type=target, output_port=0, export_destination="bh-v07-result.csv",
    ordered=True, column_order="exact",
    columns=[dict(name=column, type=type_, label_any=True) for column, type_ in columns],
    rows=rows,
)]

print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
