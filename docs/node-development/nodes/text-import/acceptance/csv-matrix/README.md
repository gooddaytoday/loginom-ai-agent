LAB-18: standalone CSV counterparts of the LAB-15 text matrix.

Generate with `../matrix-fixtures.py --extension csv --out <this-directory>`.
The generator writes original CSV bytes using the same independent Python
CSV/date/Decimal oracle. Each manifest entry maps explicitly to `lab15_case_id`;
byte equality with TXT fixtures does not supply live CSV acceptance.

Run `../run-matrix-cli.py --matrix csv-matrix` for each positive case, and
`../run-negative-cli.py --matrix csv-matrix` for negative cases, with a new
managed attempt, assigned role config and clean candidate. The existing full
warm/cold settings, type, NULL, value, order and source-byte checks remain.
`run-ambiguous-headers-cold.py` selects the matrix recorded in its attempt.
No runtime parser or installed operational configuration is changed.

The manifest pins all settings and complete expectations before model runs.
Live evidence must separately establish CSV admission, provider acceptance,
single delivery, import execution, persistence and independent cold readback.
Negative outcomes require native observation and cleanup before acceptance;
CHECK_NEGATIVE is not PASS. Unknown effects retain the original attempt.
Desktop and overall component readiness remain outside this assignment.
