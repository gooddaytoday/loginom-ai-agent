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
QUARTILE_CANDIDATES = ("type1", "type2", "type4", "type7", "tukey", "upper_rank")


def quantile(values, probability, convention):
    """Independent hypotheses; native quartile convention is still unresolved."""
    n = len(values)
    if convention == "tukey":
        half = values[:(n + 1) // 2] if probability == Fraction(1, 4) else values[n // 2:]
        return quantile(half, Fraction(1, 2), "type7")
    rank = n * probability
    index = rank.numerator // rank.denominator
    remainder = rank - index
    if convention == "upper_rank":
        return values[min(index, n - 1)]
    if convention in ("type1", "type2"):
        if not remainder:
            return ((values[max(0, index - 1)] + values[min(index, n - 1)]) / 2
                    if convention == "type2" else values[max(0, index - 1)])
        return values[min(index, n - 1)]
    if convention == "type7":
        rank = (n - 1) * probability
        index = rank.numerator // rank.denominator
        remainder = rank - index
    else:
        assert convention == "type4"
        index -= 1
    lower, upper = max(0, index), min(max(0, index + 1), n - 1)
    return values[lower] + remainder * (values[upper] - values[lower])


def expected(case, package_path, quartile_convention=None):
    cases = {
        "sd": ("values", "sd", Fraction(1), Fraction(3)),
        "iqr": ("iqr", "iqr", Fraction("1.5"), Fraction(3)),
        "null": ("null", "sd", Fraction(1), Fraction(3)),
        "update": ("update", "sd", Fraction(1), Fraction(3)),
        "sd-boundary": ("sd-boundary", "sd", Fraction("1.3"), Fraction(3)),
        "iqr-boundary": ("iqr-boundary", "iqr", Fraction("1.5"), Fraction(3)),
        "fences": ("fences", "iqr", Fraction("1.5"), Fraction(3)),
        "constant": ("constant", "sd", Fraction(1), Fraction(3)),
    }
    diagnostic = case in ("conventions", "conventions-refresh", "quartile-conventions")
    if diagnostic:
        fixture = case
        rules = [("SD", "sd", Fraction("1.3"), Fraction(3)),
                 ("IQR", "iqr", Fraction("1.5"), Fraction(3)),
                 ("Fence", "iqr", Fraction("1.5"), Fraction(3)),
                 ("Nullable", "sd", Fraction(1), Fraction(3))]
        if case == "quartile-conventions":
            rules = [(field, "iqr", Fraction("1.5"), Fraction(3)) for field, _, _, _ in rules]
    else:
        fixture, method, low, high = cases[case]
        rules = [("X", method, low, high)]
    if quartile_convention is None and any(method == "iqr" for _, method, _, _ in rules):
        alternatives = [expected(case, package_path, choice) for choice in QUARTILE_CANDIDATES]
        if any(result != alternatives[0] for result in alternatives[1:]):
            raise ValueError("Native quartile convention is unconfirmed; choose --quartile-convention for a diagnostic hypothesis")
        return alternatives[0]
    fields = [field for field, _, _, _ in rules]
    with (ROOT / "fixtures" / (fixture + ".csv")).open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        assert reader.fieldnames == ["RowID", *fields, "Note"]
        rows = [{"RowID": int(row["RowID"]),
                 **{field: None if row[field] == "?" else float(row[field]) for field in fields},
                 "Note": None if row["Note"] == "?" else row["Note"]} for row in reader]
    assert len({row["RowID"] for row in rows}) == len(rows)
    extreme_ids, outlier_ids = set(), set()
    for field, method, low, high in rules:
        values = sorted(Fraction(str(row[field])) for row in rows if row[field] is not None)
        assert len(values) > 1
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        q1 = quantile(values, Fraction(1, 4), quartile_convention or "type1")
        q3 = quantile(values, Fraction(3, 4), quartile_convention or "type1")

        def outside(value, factor):
            if value is None:
                return False
            value = Fraction(str(value))
            if method == "sd":
                return (value - mean) ** 2 > factor ** 2 * variance
            return value < q1 - factor * (q3 - q1) or value > q3 + factor * (q3 - q1)

        extreme_ids.update(row["RowID"] for row in rows if outside(row[field], high))
        outlier_ids.update(row["RowID"] for row in rows if outside(row[field], low))
    extremes = [row for row in rows if row["RowID"] in extreme_ids]
    outliers = [row for row in rows if row["RowID"] in outlier_ids - extreme_ids]
    columns = [
        {"name": "RowID", "type": "integer", "label_any": True},
        *[{"name": field, "type": "real", "label_any": True, "tolerance": {"abs": 0, "rel": 0}}
          for field in fields],
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
                                          "iqr-boundary", "fences", "constant",
                                          "conventions", "conventions-refresh", "quartile-conventions"], default="sd")
    parser.add_argument("--quartile-convention", choices=QUARTILE_CANDIDATES,
                        help="Diagnostic hypothesis only; default requires agreement of all remaining candidates")
    parser.add_argument("--package-path", default="{{PACKAGE_PATH}}")
    args = parser.parse_args()
    print(json.dumps(expected(args.case, args.package_path, args.quartile_convention), ensure_ascii=False, indent=2))
