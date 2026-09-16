# Sales sorting fixture v1

Ten complete rows fit the independently audited small-table read limit. Includes
exact fractions, one return, a zero quantity and equal product totals. Original
`fixtures/data-pipeline/sales.csv` and previous audits remain unchanged.

`expected.json` pins the CSV SHA256, every row's revenue and the complete grouped
results. Arithmetic uses Decimal in `sales_sorting_oracle.py`; sorting is revenue
DESC then ASCII product/region name ASC, with explicit case sensitivity and binary
comparison in the node configuration. Alpha and Beta tie at50.00; the second key
selects Alpha first without assuming stable input order. Total revenue182.75.

This fixture and oracle alone do not prove Loginom or autonomous acceptance.
