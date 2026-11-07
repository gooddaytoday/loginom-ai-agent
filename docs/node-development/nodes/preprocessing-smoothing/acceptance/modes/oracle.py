"""Independent Haar block projection; Python stdlib, no Loginom/runtime/actuals.

The zero case is a linearity smoke test for other families, NOT a numerical
oracle distinguishing their filters or boundary conventions.
"""
import argparse
import csv
import json
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def expected(case):
    filename = {"haar": "wavelet", "depth2": "wavelet", "null": "wavelet-null",
                "zero": "wavelet-zero"}[case]
    with (ROOT / "fixtures" / (filename + ".csv")).open(newline="", encoding="utf-8") as source:
        rows = [{"RowID": int(r["RowID"]), "X": None if r["X"] == "?" else int(r["X"]),
                 "Tag": r["Tag"]} for r in csv.DictReader(source)]
    values = [None if r["X"] is None else Fraction(r["X"]) for r in rows]
    for i, value in enumerate(values):
        if value is not None:
            continue
        left = max(j for j in range(i) if values[j] is not None)
        right = min(j for j in range(i + 1, len(values)) if values[j] is not None)
        values[i] = values[left] + (values[right] - values[left]) * Fraction(i - left, right - left)
    width = 4 if case == "depth2" else 2
    assert len(values) % width == 0
    smoothed = [sum(values[i:i + width]) / width for i in range(0, len(values), width)]
    if case == "zero":
        assert set(values) == {0}
    for i, row in enumerate(rows):
        row["X_S"] = float(smoothed[i // width])
    return {"package_path": "{{PACKAGE_PATH}}", "null_marker": "?",
            "nodes": [{"type": t} for t in ("imports.text", "preprocessing.smoothing", "exports.text")],
            "outputs": [{"output_node_type": "preprocessing.smoothing", "output_port": 0,
                         "ordered": True, "column_order": "exact",
                         "columns": [{"name": name, "type": kind, "label_any": True,
                                      **({"tolerance": {"abs": 1e-8, "rel": 1e-10}} if kind == "real" else {})}
                                     for name, kind in (("RowID", "integer"), ("X", "integer"),
                                                        ("Tag", "string"), ("X_S", "real"))],
                         "rows": rows}]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for case in ("haar", "depth2", "null", "zero"):
        result = expected(case)
        path = Path(__file__).parent / ("expected.json" if case == "haar" else "expected-" + case + ".json")
        if args.write:
            path.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        if args.check:
            assert json.loads(path.read_text(encoding="utf-8")) == result, path.name
    assert [r["X_S"] for r in expected("haar")["outputs"][0]["rows"]] == [1, 1, 4, 4, 9, 9, 13, 13]
    assert [r["X_S"] for r in expected("depth2")["outputs"][0]["rows"]] == [2.5] * 4 + [11] * 4
    assert expected("null")["outputs"][0]["rows"][6]["X"] is None
    print("Haar/zero proposals reproduced; NULL interpolation remains an unaccepted proposal.")
