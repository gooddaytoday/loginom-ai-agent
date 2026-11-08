"""Independent filter-bank proposals, PyWavelets 1.9.0; no Loginom/actual input.

Reconstruct only the deepest approximation, zeroing every detail coefficient.
CDF uses four lifting steps with approximation on odd original sample indices
(zero based). This phase is explicit: the unpadded PyWavelets default is a
different proposal. Native agreement is recorded separately in discovery.
"""
import argparse
import csv
import json
from importlib.metadata import version
from pathlib import Path

import numpy
import pywt

ROOT = Path(__file__).resolve().parents[2]
CASES = {
    "db2-symmetric": ("db2", "symmetric", 1),
    "db2-depth2": ("db2", "symmetric", 2),
    "db2-zero": ("db2", "zero", 1),
    "coif1-symmetric": ("coif1", "symmetric", 1),
    "cdf97-symmetric": ("bior4.4", "symmetric", 1),
    "cdf97-reflect": ("bior4.4", "reflect", 1),
}


def cdf97(values, boundary):
    # Four lifting coefficients, independent of Loginom:
    # https://getreuer.info/posts/waveletcdf97/index.html
    alpha, beta = -1.586134342059924, -0.052980118572961
    gamma, delta = 0.882911075530934, 0.443506852043971
    # A depth-one analysis/synthesis stencil has radius <= 8. The odd halo
    # puts the approximation on original indices 1,3,...; its outer circular
    # accesses cannot reach the retained original interval.
    halo = 19
    extended = numpy.pad(values, halo, boundary)
    low, high = extended[::2].copy(), extended[1::2].copy()
    high += alpha * (low + numpy.roll(low, -1))
    low += beta * (numpy.roll(high, 1) + high)
    high += gamma * (low + numpy.roll(low, -1))
    low += delta * (numpy.roll(high, 1) + high)
    # Forward/inverse normalizations cancel for the retained approximation.
    high = numpy.zeros_like(high)
    low -= delta * (numpy.roll(high, 1) + high)
    high -= gamma * (low + numpy.roll(low, -1))
    low -= beta * (numpy.roll(high, 1) + high)
    high -= alpha * (low + numpy.roll(low, -1))
    reconstructed = numpy.empty_like(extended)
    reconstructed[::2], reconstructed[1::2] = low, high
    # Cross-check against a second independent filter-bank formulation with
    # the same explicit phase and complete extension, never an actual table.
    approximation, _ = pywt.dwt(extended, "bior4.4", mode="symmetric")
    bank = pywt.idwt(approximation, None, "bior4.4", mode="symmetric")
    numpy.testing.assert_allclose(reconstructed[halo:-halo], bank[halo:-halo],
                               atol=1e-8, rtol=1e-10)
    return reconstructed[halo:-halo]


def expected(case):
    assert version("PyWavelets") == "1.9.0", "Use the pinned independent oracle distribution"
    with (ROOT / "fixtures" / "wavelet.csv").open(newline="", encoding="utf-8") as source:
        rows = [{"RowID": int(r["RowID"]), "X": int(r["X"]), "Tag": r["Tag"]}
                for r in csv.DictReader(source)]
    wavelet, boundary, depth = CASES[case]
    values = numpy.array([r["X"] for r in rows], dtype=numpy.float64)
    coefficients = pywt.wavedec(values, wavelet, mode=boundary, level=depth)
    # Full reconstruction is an independent numerical sanity check; it does
    # not establish Loginom's phase, padding length, or filter normalization.
    numpy.testing.assert_allclose(pywt.waverec(coefficients, wavelet, mode=boundary)[:len(rows)],
                               values, atol=1e-9, rtol=1e-10)
    lowpass = [coefficients[0]] + [numpy.zeros_like(c) for c in coefficients[1:]]
    smoothed = cdf97(values, boundary) if wavelet == "bior4.4" else pywt.waverec(lowpass, wavelet, mode=boundary)[:len(rows)]
    assert numpy.isfinite(smoothed).all()
    assert numpy.max(numpy.abs(smoothed - values)) > 0.1, "Nondegenerate fixture required"
    for row, value in zip(rows, smoothed, strict=True):
        row["X_S"] = float(value)
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
    results = {}
    for case in CASES:
        result = expected(case)
        results[case] = numpy.array([r["X_S"] for r in result["outputs"][0]["rows"]])
        path = Path(__file__).parent / ("expected-" + case + ".json")
        if args.write:
            path.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        if args.check:
            assert json.loads(path.read_text(encoding="utf-8")) == result, path.name
    for left, right in (("db2-symmetric", "coif1-symmetric"),
                        ("db2-symmetric", "cdf97-symmetric"),
                        ("db2-symmetric", "db2-depth2"),
                        ("db2-symmetric", "db2-zero"),
                        ("cdf97-symmetric", "cdf97-reflect")):
        assert numpy.max(numpy.abs(results[left] - results[right])) > 0.01, (left, right)
    print("Six independent nondegenerate filter proposals reproduced; consult discovery before acceptance.")
