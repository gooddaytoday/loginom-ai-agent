"""Independent rank/weighted-CDF proposals; stdlib, no Loginom/actual inputs.

Only divisible N=8/count=4 and the authored positive-sum count=2 fixture are
specified. Boundary naming/types are discovery bindings, not numerical inputs.
"""
import argparse
import csv
from decimal import Decimal
import json
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[2]
BASE = runpy.run_path(str(ROOT / "acceptance" / "oracle.py"))


def expected(case):
    with (ROOT / "fixtures" / "ties-modes.csv").open(newline="", encoding="utf-8") as source:
        rows = [dict(RowID=int(r["RowID"]), X=int(r["X"]), Tag=r["Tag"])
                for r in csv.DictReader(source)]
    values = sorted(r["X"] for r in rows)
    assert len(values) == 8
    if case == "current":
        # Current: take the last rank in each equal-size group; all copies
        # of that value stay in the preceding class, never split by RowID.
        assert len(values) % 4 == 0
        cuts = [values[0]] + [values[len(values) * i // 4 - 1] for i in range(1, 5)]
    elif case == "sum":
        assert min(values) >= 0 and sum(values) > 0
        target = Decimal(sum(values)) / 2
        cumulative = Decimal(0)
        for value in values:
            cumulative += value
            if cumulative >= target:
                cut = value
                break
        cuts = [values[0], cut, values[-1]]
    else:
        raise ValueError(case)
    assert all(a < b for a, b in zip(cuts, cuts[1:]))
    intervals = [(a, b, i == 0, True) for i, (a, b) in enumerate(zip(cuts, cuts[1:]))]
    result = BASE["expected"]("integer")
    result["null_marker"] = "?"
    result["nodes"] += [{"type": "exports.text"}, {"type": "exports.text"}]
    result["outputs"][0]["columns"][-1]["name"] = "Tag"
    transformed = []
    for row in rows:
        number = BASE["assign"](row["X"], intervals)
        assert number is not None
        lo, hi, il, ih = intervals[number]
        transformed.append(row | dict(X_BinsID="X", X_Number=number,
            X_Label=BASE["label"](intervals[number]), X_LowBound=lo, X_UppBound=hi,
            X_LowBoundIncl=il, X_UppBoundIncl=ih, X_LowLimOpen=False,
            X_UppLimOpen=False, X_OutOfBins=0))
    result["outputs"][0]["rows"] = transformed
    result["outputs"][1]["rows"] = [dict(BinsID="X", BoundsDataType=4, Number=i,
        LowBound=lo, UppBound=hi, Label=BASE["label"](intervals[i]),
        LowBoundQuota=float(il), UppBoundQuota=float(ih), BinQuota=None,
        LowDev=lo, UppDev=hi, LowLimitOpen=False, UppLimitOpen=False)
        for i, (lo, hi, il, ih) in enumerate(intervals)]
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for case in ("current", "sum"):
        result = expected(case)
        path = Path(__file__).parent / ("expected-" + case + ".json")
        if args.write:
            path.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        if args.check:
            assert json.loads(path.read_text(encoding="utf-8")) == result, path.name
    assert [r["X_Number"] for r in expected("current")["outputs"][0]["rows"]] == [0, 0, 0, 1, 2, 2, 3, 3]
    assert [r["X_Number"] for r in expected("sum")["outputs"][0]["rows"]] == [0, 0, 0, 0, 0, 0, 1, 1]
    print("Rank/current and positive weighted-sum proposals reproduced.")
