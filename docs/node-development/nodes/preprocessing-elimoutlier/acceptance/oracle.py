#!/usr/bin/env python3
"""Independent arithmetic proposal for Elimoutlier stage 1; stdlib only.

Reads authored CSV fixtures, never Loginom, a runtime module or actual output.
All fence comparisons use exact rational arithmetic, including SD squared.
"""
import argparse
import csv
import json
from fractions import Fraction
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def quantile(values, probability):
    """Linear interpolation at (n-1)*p (inclusive / Hyndman-Fan type 7)."""
    rank = (len(values) - 1) * probability
    index = rank.numerator // rank.denominator
    remainder = rank - index
    return values[index] + remainder * (values[min(index + 1, len(values) - 1)] - values[index])


def expected(case, package_path):
    fixture, method, low, high = {
        "sd": ("values", "sd", Fraction(1), Fraction(3)),
        "iqr": ("iqr", "iqr", Fraction("1.5"), Fraction(3)),
        "null": ("null", "sd", Fraction(1), Fraction(3)),
        "update": ("update", "sd", Fraction(1), Fraction(3)),
        "sd-boundary": ("sd-boundary", "sd", Fraction("1.3"), Fraction(3)),
        "iqr-boundary": ("iqr-boundary", "iqr", Fraction("1.5"), Fraction(3)),
        "fences": ("fences", "iqr", Fraction("1.5"), Fraction(3)),
        "constant": ("constant", "sd", Fraction(1), Fraction(3)),
    }[case]
    with (ROOT / "fixtures" / (fixture + ".csv")).open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        assert reader.fieldnames == ["RowID", "X", "Note"]
        rows = [{"RowID": int(row["RowID"]),
                 "X": None if row["X"] == "?" else float(row["X"]),
                 "Note": row["Note"]} for row in reader]
    assert len({row["RowID"] for row in rows}) == len(rows)
    values = sorted(Fraction(str(row["X"])) for row in rows if row["X"] is not None)
    assert len(values) > 1
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
    q1, q3 = quantile(values, Fraction(1, 4)), quantile(values, Fraction(3, 4))

    def outside(value, factor):
        if value is None:
            return False
        value = Fraction(str(value))
        if method == "sd":
            return (value - mean) ** 2 > factor ** 2 * variance
        return value < q1 - factor * (q3 - q1) or value > q3 + factor * (q3 - q1)

    extremes = [row for row in rows if outside(row["X"], high)]
    outliers = [row for row in rows if outside(row["X"], low) and not outside(row["X"], high)]
    columns = [
        {"name": "RowID", "type": "integer", "label_any": True},
        {"name": "X", "type": "real", "label_any": True, "tolerance": {"abs": 0, "rel": 0}},
        {"name": "Note", "type": "string", "label_any": True},
    ]
    return {
        "package_path": package_path,
        "nodes": [{"type": "imports.text"}, {"type": "preprocessing.elim_outlier"}],
        "outputs": [{"output_node_type": "preprocessing.elim_outlier", "output_port": port,
                     "ordered": True, "column_order": "exact", "columns": columns, "rows": result}
                    for port, result in enumerate([rows, outliers, extremes])],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["sd", "iqr", "null", "update", "sd-boundary",
                                          "iqr-boundary", "fences", "constant"], default="sd")
    parser.add_argument("--package-path", default="{{PACKAGE_PATH}}")
    args = parser.parse_args()
    print(json.dumps(expected(args.case, args.package_path), ensure_ascii=False, indent=2))
