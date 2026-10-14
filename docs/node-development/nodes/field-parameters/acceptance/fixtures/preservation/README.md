Independent stage-0 fixtures. UTF-8, LF, semicolon, decimal dot, NULL, double quote.
RowID/A/B/C has duplicate labels and independent identities; Extra is unrequested.
Only A.label, B.name/kind/usage and C.excluded change; all retained values and relative column order are literal expectations.
Wide has 130 integer definitions, two literal rows, duplicate labels, NULL distinct from zero, and only the last label changes.
Empty has five scalar definitions and a header-only input; expected cardinality is exactly zero and all typed definitions remain.
JSON input_rows and expected rows/schema/configuration are authored expectations; no production imports or observed output were used.
The manifest pins exact CSV and JSON bytes. The frozen cleanup task/expected/oracle/manifest remain unchanged.
These are offline contracts, not native values, conversion, geometry/store, persistence/cold, identity binding or live PASS.
