"""Independent interval arithmetic proposal. Python stdlib; no actual/UI inputs.

Date boundaries/labels are explicit business requirements. Automatic and SD
formulae below are proposals whose Real executions still need confirmation.
"""
import argparse
import csv
from datetime import datetime, timedelta
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[2]


def expected(case):
    date = case == "datetime-manual"
    field, kind = ("When", "datetime") if date else ("X", "real")
    with (ROOT / "fixtures" / ("modes.csv" if date else "numeric-modes.csv")).open(newline="", encoding="utf-8") as source:
        rows = [{k: None if v == "?" else int(v) if k == "RowID" or date and k == "X"
                 else datetime.fromisoformat(v) if k == "When" else float(v) if k == "X" else v
                 for k, v in r.items()} for r in csv.DictReader(source)]
    values = [r[field] for r in rows if r[field] is not None]
    if date:
        lower = datetime(2026, 1, 1)
        intervals = [(lower, lower + timedelta(days=1), True, True, "Early"),
                     (lower + timedelta(days=1), lower + timedelta(days=3), False, True, "Late")]
    elif case == "auto":
        step = (max(values) - min(values)) / (2 - 1)
        lower = min(values) - step / 2
        intervals = [(lower, lower + step, True, True, "Low"),
                     (lower + step, lower + 2 * step, False, True, "High")]
    elif case == "sd":
        mean, sd = statistics.mean(values), statistics.pstdev(values)
        intervals = [(mean - 2 * sd, mean - sd, True, False, "Low"),
                     (mean - sd, mean + sd, True, True, "Middle"),
                     (mean + sd, mean + 2 * sd, False, True, "High")]
    else:
        raise ValueError(case)
    open_ends = case == "sd"
    converted = lambda v: v.isoformat(timespec="milliseconds") if isinstance(v, datetime) else v
    transformed = []
    for row in rows:
        value = row[field]
        matches = [] if value is None else [i for i, (lo, hi, il, ih, _) in enumerate(intervals)
                 if (open_ends and i == 0 or value > lo or il and value == lo)
                 and (open_ends and i == len(intervals) - 1 or value < hi or ih and value == hi)]
        assert len(matches) <= 1
        index = matches[0] if matches else None
        interval = intervals[index] if index is not None else None
        derived = dict(BinsID=field, Number=index, Label=interval[4] if interval else None,
                       LowBound=converted(interval[0]) if interval else None,
                       UppBound=converted(interval[1]) if interval else None,
                       LowBoundIncl=interval[2] if interval else None, UppBoundIncl=interval[3] if interval else None,
                       LowLimOpen=open_ends, UppLimOpen=open_ends,
                       OutOfBins=None if value is None else 0 if index is not None else -1 if value < intervals[0][0] else 1)
        transformed.append({k: converted(v) for k, v in row.items()} | {field + "_" + k: v for k, v in derived.items()})
    ranges = [dict(BinsID=field, BoundsDataType=2 if date else 3, Number=i,
                   LowBound=converted(lo), UppBound=converted(hi), Label=label,
                   LowBoundQuota=float(il), UppBoundQuota=float(ih), BinQuota=None,
                   LowDev=converted(lo), UppDev=converted(hi), LowLimitOpen=open_ends, UppLimitOpen=open_ends)
              for i, (lo, hi, il, ih, label) in enumerate(intervals)]
    derived_types = [("BinsID", "string"), ("Number", "integer"), ("Label", "string"),
                     ("LowBound", kind), ("UppBound", kind), ("LowBoundIncl", "boolean"),
                     ("UppBoundIncl", "boolean"), ("LowLimOpen", "boolean"),
                     ("UppLimOpen", "boolean"), ("OutOfBins", "integer")]
    inputs = [("RowID", "integer"), ("X", "integer"), ("When", "datetime"), ("Target", "string"), ("Segment", "string")] if date else [("RowID", "integer"), ("X", "real"), ("Note", "string")]
    columns = []
    for name, column_type in inputs:
        columns.append((name, column_type))
        if name == field:
            columns.extend((field + "_" + name, column_type) for name, column_type in derived_types)
    range_types = [("BinsID", "string"), ("BoundsDataType", "integer"), ("Number", "integer"),
                   ("LowBound", kind), ("UppBound", kind), ("Label", "string"),
                   ("LowBoundQuota", "real"), ("UppBoundQuota", "real"), ("BinQuota", "real"),
                   ("LowDev", kind), ("UppDev", kind), ("LowLimitOpen", "boolean"), ("UppLimitOpen", "boolean")]
    return {"package_path": "{{PACKAGE_PATH}}", "null_marker": "?",
            "nodes": [{"type": t} for t in ("imports.text", "preprocessing.binning", "exports.text", "exports.text")],
            "outputs": [{"output_node_type": "preprocessing.binning", "output_port": port,
                         "ordered": True, "column_order": "exact",
                         "columns": [{"name": n, "type": t, "label_any": True,
                                      **({"tolerance": {"abs": 1e-12, "rel": 1e-12}} if t == "real" else {})}
                                     for n, t in schema], "rows": data}
                        for port, (schema, data) in enumerate(((columns, transformed), (range_types, ranges)))]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for case in ("datetime-manual", "auto", "sd"):
        result = expected(case)
        path = Path(__file__).parent / ("expected.json" if case == "datetime-manual" else "expected-" + case + ".json")
        if args.write:
            path.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        if args.check:
            assert json.loads(path.read_text(encoding="utf-8")) == result, path.name
    assert [r["When_Number"] for r in expected("datetime-manual")["outputs"][0]["rows"]] == [0, 0, 0, 1, 1, 1, 1, None]
    assert math.isclose(sum(r["X"] or 0 for r in expected("auto")["outputs"][0]["rows"]), 42)
    print("DateTime/manual, automatic and population-SD proposals reproduced.")
