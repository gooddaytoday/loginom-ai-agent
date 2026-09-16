# Sorting edges v1

Small operator fixture for duplicate row multiplicity, Null sorting keys, negative
and fractional numbers, Latin letter case, and an empty schema-preserving input.
`edges.csv` has eight records including an identical duplicate. `empty.csv` has
only the same header. Both use UTF-8, comma, dot decimals and `\N` for Null.

Null ordering is observed on the pinned Loginom 7.4.2 profile before an expected
order is declared. There is no SQL NULLS FIRST/LAST option in the handler.
