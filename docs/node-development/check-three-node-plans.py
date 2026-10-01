#!/usr/bin/env python3
"""Offline coverage and independent small-fixture arithmetic; never executes Loginom.

--write freezes proposed cases/expected JSON. Default checks them and manual anchors.
None of these documents is an executable native acceptance receipt or node PASS.
"""
import argparse
import csv
import hashlib
import importlib.util
import itertools
import json
import math
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = "9b17e7dd947c016395e8e32e439ca775b1cbe780"
sys.dont_write_bytecode = True
A, B, C = "preprocessing-datapartition", "preprocessing-elimoutlier", "research-corranalysis"
METHODS = ["keep", "delete", "mean", "median", "most_likely", "constant", "clip"]
TYPES = ["boolean", "datetime", "real", "integer", "string"]
NUMERIC_DATE = ["datetime", "real", "integer"]


def folder(slug):
    return ROOT / "nodes" / slug / "acceptance"


def read(slug, name):
    with (folder(slug) / "data" / name).open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle, delimiter=";" if slug == B else ",")
        rows = list(reader)
        assert reader.fieldnames and len(set(reader.fieldnames)) == len(reader.fieldnames), name
        assert all(None not in row and None not in row.values() for row in rows), name
        return reader.fieldnames, rows


def manifest(slug):
    records = []
    for path in sorted((folder(slug) / "data").glob("*.csv")):
        fields, rows = read(slug, path.name)
        records.append({"file": "data/" + path.name, "rows": len(rows), "fields": fields,
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    return records


def header(slug):
    return {"format": "documentation-planning-v1-proposed", "node": slug,
            "base_sha": BASE, "status": "OFFLINE_ONLY_NOT_NODE_PASS", "inputs": manifest(slug)}


def groups(rows, fields):
    counts = Counter(tuple(None if r[f] == "?" else r[f] for f in fields) for r in rows)
    return [{"key": list(key), "count": count} for key, count in counts.items()]


def median(values):
    values = sorted(values)
    n = len(values)
    return (values[(n-1)//2] + values[n//2]) / 2 if n else None


def quantile_linear(values, p):
    values = sorted(values)
    if not values:
        return None
    h = (len(values)-1) * p
    lo = h.numerator // h.denominator
    hi = min(lo+1, len(values)-1)
    return values[lo] + (values[hi]-values[lo])*(h-lo)


def frac(value):
    return str(value) if value is not None else None


def summary(values):
    n = len(values)
    mean = sum(values)/n if n else None
    ss = sum((v-mean)**2 for v in values) if n else None
    halves = [None, None]
    if n >= 2:
        ordered = sorted(values)
        halves = [median(ordered[:n//2]), median(ordered[(n+1)//2:])]
    return {"n": n, "sum_exact": frac(sum(values)), "mean_exact": frac(mean),
            "median_exact": frac(median(values)), "centered_ss_exact": frac(ss),
            "sigma_population": math.sqrt(float(ss/n)) if n else None,
            "sigma_sample": math.sqrt(float(ss/(n-1))) if n > 1 else None,
            "quartile_hypotheses_not_native": {
                "median_of_halves_exclude_middle": [frac(v) for v in halves],
                "linear_p_n_minus_1": [frac(quantile_linear(values, p))
                                       for p in [Fraction(1,4), Fraction(3,4)]]}}


def values(slug, name, field="Value"):
    return [Fraction(r[field]) for r in read(slug, name)[1] if r[field] != "?"]


def edge(case_id, fixtures, check):
    return {"id": case_id, "fixtures": ["data/"+v for v in fixtures], "check": check,
            "execution": "NOT_RUN"}


def derive_a():
    cases = header(A)
    core = []
    modes = ["random", "uniform", "stratified", "sequential", "biased"]
    strategies = [("training", "algorithm"), ("test", "algorithm"),
                  ("test", "start"), ("test", "end")]
    specific = {"random": {}, "uniform": {"uniform": {"group_size": 3}},
                "stratified": {"stratified": {"fields": ["Group", "Subgroup"]}},
                "sequential": {"sequential": {"take": 2, "skip": 1}},
                "biased": {"biased": {"field": "Category", "adjustments": [
                    {"key": "A", "factor": 2}, {"key": "B", "factor": 1},
                    {"key": None, "factor": 1}]}}}
    for mode, train_unit, test_unit, strategy in itertools.product(modes, ["rows","percent"], ["rows","percent"], strategies):
        priority, position = strategy
        params = {"training": {"unit": train_unit, "value": 6 if train_unit == "rows" else 50},
                  "test": {"unit": test_unit, "value": 3 if test_unit == "rows" else 25},
                  "priority": priority, "test_position": position,
                  "seed": {"policy": "fixed", "value": 17}, **specific[mode]}
        fixture = "strata.csv" if mode == "stratified" else "bias.csv" if mode == "biased" else "base.csv"
        core.append({"id": f"{mode}-{train_unit}-{test_unit}-{priority}-{position}", "mode": mode,
                     "fixture": "data/"+fixture, "parameters": params,
                     "oracle": "counts/provenance/three-port agreement; unresolved allocation frozen before execution"})
    cases.update({"core": core, "core_count": 80, "edges": [
        edge("edge-sizes", ["base.csv","empty.csv","tiny.csv"], "0/0,0/100%,100%/0,9/9 priorities; fractional percent candidates"),
        edge("uniform-remainder", ["base.csv","uneven.csv"], "group_size1/3/5; source and remainder quotas"),
        edge("strata-null", ["strata.csv"], "one/two fields; typed NULL versus literal NULL; uneven strata"),
        edge("blocks", ["base.csv"], "take2/skip1, take12/skip0, exhausted and incomplete block"),
        edge("bias-frequency", ["bias.csv"], "factor0/1/2/0.5 and explicit count0/1/8; percent population and duplicate occurrences"),
        edge("seed", ["base.csv","tiny.csv"], "fixed replay, always_random, independent cold replay; no assertion different seed changes tiny result"),
        edge("typed-membership-collision", ["typed.csv"], "all payload types/NULL and existing test_set; exact integer strings"),
        edge("original-operation-mutation", ["base.csv","changed.csv","schema-added.csv","schema-metadata.csv"], "same IDs/S; values, 3→6 width, same-width label/kind change, independent cold"),
        edge("validation-recovery", ["base.csv"], "invalid field/size/seed/typed adjustment; no side effect; recover same graph")
    ]})
    base = read(A,"base.csv")[1]
    expected = header(A)
    expected.update({"fixed_counts": {"six_three": {"training":6,"test":3,"combined":9},
                    "percent_50_25_n12": {"training":6,"test":3,"combined":9},
                    "nine_nine_training_priority": {"training":9,"test":3},
                    "nine_nine_test_priority": {"training":3,"test":9}},
                    "test_position_n12_test3": {"start": [r["RowID"] for r in base[:3]],
                                                 "end": [r["RowID"] for r in base[-3:]]},
                    "source_strata": {"Group": groups(read(A,"strata.csv")[1],["Group"]),
                                      "Group_Subgroup": groups(read(A,"strata.csv")[1],["Group","Subgroup"])},
                    "bias_replication_hypothesis": {"source": groups(read(A,"bias.csv")[1],["Category"]),
                                                     "factor_two_A": {"A":8,"B":2,"typed_null":2}},
                    "sequential_block_hypothesis": {"take2_skip1_ids_n12": ["1","2","4","5","7","8","10","11"]},
                    "row_policy": "exact payload per occurrence; selection IDs of random methods are not invented",
                    "rounding_hypotheses_n7_25percent": {"floor":1,"nearest":2,"ceil":2}})
    return cases, expected


def modal_candidates(vals):
    n = len(vals)
    raw_bins = 1+3.32*math.log10(n)
    output = []
    for rule, count in [("floor",math.floor(raw_bins)),("nearest",math.floor(raw_bins+0.5)),("ceil",math.ceil(raw_bins))]:
        lo, hi = min(vals), max(vals)
        width = (hi-lo)/count
        bins = [0]*count
        for val in vals:
            index = min(count-1, int((val-lo)/width)) if width else 0
            bins[index] += 1
        winners = [i for i, size in enumerate(bins) if size == max(bins)]
        output.append({"rounding":rule,"bins":count,"histogram":bins,"winners":winners,
                       "width_exact":frac(width), "midpoint_candidates_exact": [frac(lo+(i+Fraction(1,2))*width) for i in winners]})
    return {"status":"HYPOTHESIS_NOT_NATIVE", "assumptions":"equal-width, left-closed/right-open except last; original non-NULL population", "raw_sturges_bins":raw_bins, "candidates":output}


def derive_b():
    cases = header(B)
    # The four entries are unordered/discrete, unordered/continuous,
    # ordered/discrete, ordered/continuous; read from Help SVG type icons.
    allowed = {"keep":[TYPES,NUMERIC_DATE,TYPES,NUMERIC_DATE],
               "delete":[TYPES,NUMERIC_DATE,[],[]],
               "mean":[["datetime"],NUMERIC_DATE,["datetime"],NUMERIC_DATE],
               "median":[NUMERIC_DATE]*4, "most_likely":[TYPES,NUMERIC_DATE,TYPES,NUMERIC_DATE],
               "constant":[TYPES,NUMERIC_DATE,TYPES,[]], "clip":[TYPES,NUMERIC_DATE,TYPES,NUMERIC_DATE]}
    axes = {"criterion":["stddev","iqr"],"method":METHODS,"type":TYPES,
            "data_kind":["discrete","continuous"],"ordered":[False,True]}
    pair_axes = {"criterion":["stddev","iqr"], "outlier_method":METHODS, "extreme_method":METHODS,
                 "type":TYPES, "data_kind":["discrete","continuous"],"ordered":[False,True]}
    cases.update({"method_matrix": {"expansion":"cartesian product of axes, one case for each tuple", "axes":axes,"count":280},
                  "both_class_matrix": {"expansion":"cartesian product of axes, both actions independently configured", "axes":pair_axes,"count":1960},
                  "documentation_allowed_types_by_column":allowed,
                  "column_order":["unordered/discrete","unordered/continuous","ordered/discrete","ordered/continuous"],
                  "documentation_conflict":"ordered boolean/string delete: prose says ordered has no effect; table empty. Explicit unresolved outcome until implementation resolves.",
                  "criterion_note":"method availability is not proof of category detection mathematics; unsupported combinations need explicit rejection",
                  "numeric_baselines": {"stddev": {"fixture":"data/sigma-symmetric.csv","outlier_multiplier":0.25,"extreme_multiplier":1.5},
                                        "iqr":{"fixture":"data/iqr-symmetric.csv","outlier_multiplier":1.5,"extreme_multiplier":3}},
                  "typed_matrix_fixture":"data/types.csv", "edges":[
        edge("sigma-denominator", ["denominator.csv"], "n versus n−1; k1.6 classification"),
        edge("strict-boundary", ["boundary-sd.csv","boundary.csv"], "equal/below/above fences, strict/inclusive"),
        edge("quartiles-center", ["quartiles.csv","quartiles-even.csv"], "median halves versus interpolation; median-centered versus Tukey fences"),
        edge("replacement-population", ["population.csv"], "all-column versus cleaned mean/median; separate actions17/29"),
        edge("modal-interval", ["most-likely-bin.csv","most-likely-tie.csv","most-likely-equal-bins.csv"], "Sturges rounding, bins/endpoints/ties; independent interval midpoint, not numeric mode"),
        edge("multi-fields-disabled", ["multi.csv"], "different actions on X/Y, overlap memberships, disabled Y, delete union and original payload"),
        edge("degenerate-null", ["nulls.csv","all-null.csv","empty.csv","singleton.csv","constant.csv"], "NULL population, empty schema, zero variance and n<2 outcomes"),
        edge("types-order", ["types.csv"], "all allowed and forbidden method/type/kind/order tuples; exact typed replacements"),
        edge("dynamic-recovery-save", ["multi.csv"], "same graph/S, value/width/same-width metadata mutation, explicit failure recovery, independent cold")
    ]})
    expected = header(B)
    statistics = {p.name: summary(values(B,p.name)) for p in (folder(B)/"data").glob("*.csv") if "Value" in read(B,p.name)[0]}
    expected.update({"independent_statistics":dict(sorted(statistics.items())),
                     "sd_symmetric_classification_hypothesis": {"ordinary_anomaly_ids":["25","26"],"extreme_ids":["27","28"],
                         "assumptions":"original population, absolute mean distance, k0.25/k1.5; exclusive classes for this candidate only",
                         "processed_keep_count":28,"processed_delete_both_count":24,"mean_median_replacement":0,"constant_example":17},
                     "iqr_symmetric_classification_hypothesis": {"ordinary_anomaly_ids":["29","30"],"extreme_ids":["31","32"],
                         "assumptions":"median0,Q1−2,Q3+2; median-centered strict k1.5/k3; exclusive classes for this candidate only"},
                     "denominator_control": {"value":"1","k":"8/5","mean":"1/4", "population_threshold_squared":"12/25","sample_threshold_squared":"16/25",
                         "distance_squared":"9/16","population_detects":True,"sample_detects":False},
                     "modal_interval_hypotheses": {name:modal_candidates(values(B,name)) for name in ["most-likely-bin.csv","most-likely-tie.csv","most-likely-equal-bins.csv"]},
                     "warning":"statistics/candidates are independent arithmetic, not native schema/output or a handler PASS; freeze native rule before final oracle"})
    return cases, expected


def derive_c():
    cases = header(C)
    names = ["pearson","spearman","kendall_tau_b","cross_correlation"]
    masks = []
    for mask in range(1,16):
        flags = {name: bool(mask & (1 << bit)) for bit,name in enumerate(names)}
        masks.append({"id":f"mask-{mask:02}","coefficients":flags,"fixture":"data/analytic.csv",
                      "left_fields":["x","tie_x"],"right_fields":["positive","square","tie_y","x"],
                      "pair_count":8,"output_column_count":4+sum(flags.values())+int(flags["cross_correlation"]),
                      "native_names_types_order":"to be frozen during implementation, not guessed"})
    cases.update({"nonempty_masks":masks,"zero_mask":{"coefficients":dict.fromkeys(names,False),"api_outcome":"validation error before side effect; native zero separate"}, "edges":[
        edge("all-pairs", ["analytic.csv"], "6×6 full analytical matrix, intersections, self/reverse pairs, selection order and duplicate labels"),
        edge("scale-monotonic-ties", ["analytic.csv","scaled.csv"], "P/S/K anchors, nonlinear monotonic and tied mean ranks, tau-b not tau-a"),
        edge("categories-types", ["categories.csv","types.csv"], "ASCII dense ordinal for Pearson-text; Unicode/case and type/kind outcomes per coefficient"),
        edge("null-policies", ["nulls.csv"], "pairwise versus global listwise; CCF time-position treatment separately"),
        edge("degenerate", ["degenerate.csv","empty.csv","one.csv","two.csv"], "undefined, all-null, n0/n1/n2; exact schema and refusal/null policy"),
        edge("ccf", ["lag.csv","ccf-ties.csv","scaled.csv"], "signed max magnitude; swap sign convention, range, energy/centering/overlap normalization and tied extremum"),
        edge("schema-save-recovery", ["analytic.csv"], "15 transitions, same source operation after values/width/label/kind changes, error repair and cold")
    ]})
    spec = importlib.util.spec_from_file_location("corr_reference",folder(C)/"math_reference.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cases, module.derive(), module


def frozen(path, value, write):
    if write:
        path.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+"\n")
    else:
        assert json.loads(path.read_text()) == value, f"Stale or altered document: {path}"


def check(write=False):
    a, a_expected = derive_a()
    b, b_expected = derive_b()
    c, c_expected, corr = derive_c()
    assert len(a["core"]) == len({v["id"] for v in a["core"]}) == 80
    assert len(c["nonempty_masks"]) == 15
    assert sum(v["coefficients"]["cross_correlation"] for v in c["nonempty_masks"]) == 8
    for matrix in [b["method_matrix"],b["both_class_matrix"]]:
        assert len(list(itertools.product(*matrix["axes"].values()))) == matrix["count"]
    # Manual, independently derived anchors rather than only generation equality.
    stats = b_expected["independent_statistics"]
    assert stats["sigma-symmetric.csv"]["n"] == 28
    assert stats["sigma-symmetric.csv"]["centered_ss_exact"] == "20200"
    assert stats["iqr-symmetric.csv"]["quartile_hypotheses_not_native"]["median_of_halves_exclude_middle"] == ["-2","2"]
    assert stats["denominator.csv"]["sigma_sample"] == 0.5
    assert Fraction(12,25) < Fraction(9,16) < Fraction(16,25)
    assert stats["quartiles.csv"]["quartile_hypotheses_not_native"]["median_of_halves_exclude_middle"] == ["1/2","39/2"]
    assert stats["quartiles.csv"]["quartile_hypotheses_not_native"]["linear_p_n_minus_1"] == ["1","9"]
    assert summary([])["sigma_population"] is None
    assert summary([Fraction(7)])["sigma_sample"] is None
    assert [len(v['winners']) for v in b_expected['modal_interval_hypotheses']['most-likely-equal-bins.csv']['candidates']] == [2,2,3]
    for slug,cases,expected in [(A,a,a_expected),(B,b,b_expected),(C,c,c_expected)]:
        frozen(folder(slug)/"cases.json",cases,write)
        frozen(folder(slug)/"expected.json",expected,write)
        for record in cases["edges"]:
            for fixture in record["fixtures"]:
                assert (folder(slug)/fixture).is_file(),fixture
        for name in ["README.md","task.md"]:
            assert (folder(slug)/name).is_file(),name
    corr.check()
    total_csv = sum(len(manifest(slug)) for slug in [A,B,C])
    print(f"OFFLINE_CHECK_OK: {total_csv} CSV; 80 partition cases; 280/1960 outlier tuples; 15 correlation masks. No Loginom PASS.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write",action="store_true")
    check(parser.parse_args().write)
