LAB-700 fixtures: `excel-import-sheet` chooses «Продажи 2026», the second of three
worksheets with distinct schemas; `excel-import-wide` covers twelve fields,
integer/string/real/datetime, NULL, Unicode, leading-zero strings and CSV quoting.
The far-right Balance field contains integer-valued numbers but requires real,
so acceptance must configure a field beyond the initially visible grid area.

Generate with XlsxWriter 3.2.9 (`generate-wave2.py`). Run each case's `oracle.py`
with OpenPyXL 3.1.5 to independently regenerate expected.json before live tests.
The oracle reads values, worksheet identity, dimensions and dates from XLSX;
the requested names/types/order come from the user specification. No oracle or
expected file is supplied to the model. Only task.md and data/*.xlsx are attached.
The original first-sheet scenario is registered as `excel-import-single`.
Run-check uses stock exact CSV and cold-port checks, Save and package cleanup.
Labels are free because tasks prescribe technical names, not display labels.

The supported width is explicitly 1–12 columns; wider books remain profileable
with incomplete import settings. Boolean/Variant, named ranges and automatic
type detection remain outside this change.
