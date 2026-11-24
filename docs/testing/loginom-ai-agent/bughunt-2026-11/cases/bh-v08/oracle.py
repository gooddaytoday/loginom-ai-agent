"""Check the workbook against input CSV, or emit the run-check contract."""
import argparse
import csv
import json
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument("--workbook", type=Path)
args = parser.parse_args()
source = Path(__file__).resolve().parent / "data" / "registry.csv"
with source.open(encoding="utf-8", newline="") as stream:
    reader = csv.DictReader(stream)
    columns = reader.fieldnames
    rows = [{key: int(cell) for key, cell in row.items()} for row in reader]

if args.workbook is not None:
    from openpyxl import load_workbook

    book = load_workbook(args.workbook, read_only=True, data_only=True)
    try:
        assert book.sheetnames == ["Реестр"]
        cells = iter(book["Реестр"].rows)
        assert [cell.value for cell in next(cells)] == columns
        records = list(cells)
        assert [[cell.value for cell in record] for record in records] == [
            [row[column] for column in columns] for row in rows
        ]
        assert all(cell.data_type == "n" for record in records for cell in record)
    finally:
        book.close()
else:
    expected = dict(
        nodes=[dict(type=node) for node in ["imports.text", "variables.calculator", "exports.excel"]],
        outputs=[dict(
            output_node_type="export_input", export_destination="bh-v08-result.csv",
            ordered=True, column_order="exact",
            columns=[dict(name=column, type="integer", label_any=True) for column in columns],
            rows=rows,
        )],
    )
    print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
