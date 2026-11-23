#!/usr/bin/env python3
"""Independent Apriori proposal; Python stdlib only, no Loginom/runtime input."""
import csv
import itertools
import json
import hashlib
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def transactions(path):
    result = {}
    with path.open(encoding="utf-8", newline="") as stream:
        source = csv.DictReader(stream)
        assert source.fieldnames == ["Transaction", "Item"]
        for row in source:
            assert row["Transaction"] not in ("", "?"), "missing transaction ID"
            assert row["Item"] not in ("", "?"), "missing item"
            result.setdefault(row["Transaction"], set()).add(row["Item"])
    assert result, "empty input"
    return result


def apriori(baskets, support, confidence, length):
    """Level-wise join/prune; count each item once per basket, exact fractions."""
    counts = {}
    candidates = {frozenset([item]) for basket in baskets.values() for item in basket}
    size = 1
    while candidates and size <= length:
        level = {}
        for candidate in candidates:
            count = sum(candidate <= basket for basket in baskets.values())
            if Fraction(count, len(baskets)) >= support:
                level[candidate] = count
        counts.update(level)
        size += 1
        candidates = {left | right for left in level for right in level
                      if len(left | right) == size
                      and all(frozenset(subset) in level
                              for subset in itertools.combinations(left | right, size - 1))}
    sets = [{"items": sorted(items), "count": count,
             "support_pct": float(Fraction(100 * count, len(baskets)))}
            for items, count in counts.items()]
    rules = []
    for items, count in counts.items():
        if len(items) < 2:
            continue
        for consequent in sorted(items):
            antecedent = items - {consequent}
            certainty = Fraction(count, counts[antecedent])
            if certainty >= confidence:
                rules.append({"antecedent": sorted(antecedent), "consequent": [consequent],
                              "support_pct": float(Fraction(100 * count, len(baskets))),
                              "confidence_pct": float(100 * certainty),
                              "lift": float(certainty / Fraction(counts[frozenset([consequent])], len(baskets)))})
    return {"transaction_count": len(baskets),
            "itemsets": sorted(sets, key=lambda row: (len(row["items"]), row["items"])),
            "rules": sorted(rules, key=lambda row: (row["antecedent"], row["consequent"]))}


def reference():
    baskets = transactions(ROOT / "fixtures" / "transactions.csv")
    result = apriori(baskets, Fraction(1, 2), Fraction(3, 5), 2)
    assert result["transaction_count"] == 4
    assert [(row["items"], row["count"]) for row in result["itemsets"]] == [
        (["A"], 3), (["B"], 3), (["C"], 2), (["A", "B"], 2)]
    assert len(result["rules"]) == 2
    assert all(row["support_pct"] == 50 and abs(row["confidence_pct"] - 200 / 3) < 1e-12
               and abs(row["lift"] - 8 / 9) < 1e-12 for row in result["rules"])
    assert not apriori(baskets, Fraction(501, 1000), Fraction(3, 5), 2)["rules"]
    assert not apriori(baskets, Fraction(1, 2), Fraction(67, 100), 2)["rules"]
    assert not apriori(baskets, Fraction(1, 2), Fraction(3, 5), 1)["rules"]
    return result


def expected(name):
    baskets = transactions(ROOT / "fixtures" / name)
    result = apriori(baskets, Fraction(1, 2), Fraction(3, 5), 2)
    # Discovery binding of native IDs for these two fixtures, not Apriori
    # probabilities. Do not infer this enumeration for arbitrary source data.
    native_order = [("A",), ("B",), ("A", "B"), ("C",), ("A", "C"), ("B", "C")]
    sets = sorted(result["itemsets"], key=lambda row: native_order.index(tuple(row["items"])))
    rules = sorted(result["rules"], key=lambda row: (
        native_order.index(tuple(sorted(row["antecedent"] + row["consequent"]))), row["antecedent"]))
    column = lambda name, kind: dict(name=name, type=kind, label_any=True,
                                     **(dict(tolerance=dict(abs=1e-10, rel=1e-10)) if kind == "real" else {}))
    rule_columns = [column("RuleID", "integer"), column("Support", "real"),
                    column("Confidence", "real"), column("Lift", "real")]
    item_columns = [column("Item_0_A", "string"), column("Item_0_C", "string")]
    rule_rows = [dict(RuleID=index, Support=row["support_pct"] / 100,
                      Confidence=row["confidence_pct"] / 100, Lift=row["lift"],
                      Item_0_A=row["antecedent"][0], Item_0_C=row["consequent"][0])
                 for index, row in enumerate(rules, 1)]
    output = lambda port, columns, rows: dict(output_node_type="datamining.assn_rules", output_port=port,
                                              ordered=False, column_order="exact", columns=columns, rows=rows)
    return dict(package_path="{{PACKAGE_PATH}}",
                nodes=[dict(type="imports.text"), dict(type="datamining.assn_rules"),
                       dict(type="exports.text")], outputs=[
        output(0, [column("ItemsetID", "integer"), column("Width", "integer"), column("Support", "real"),
                   column("Item_0", "string"), column("Item_1", "string")],
               [dict(ItemsetID=index, Width=len(row["items"]), Support=row["support_pct"] / 100,
                     Item_0=row["items"][0], Item_1=row["items"][1] if len(row["items"]) > 1 else None)
                for index, row in enumerate(sets, 1)]),
        output(1, rule_columns + item_columns, rule_rows)])


def artifacts():
    reference()  # analytic identities and inclusive threshold checks
    length = transactions(ROOT / "fixtures/length.csv")
    assert len(apriori(length, Fraction(1, 2), Fraction(3, 5), 2)["itemsets"]) == 6
    assert len(apriori(length, Fraction(1, 2), Fraction(3, 5), 3)["itemsets"]) == 7
    assert apriori(transactions(ROOT / "fixtures/duplicates.csv"), Fraction(1, 2), Fraction(3, 5), 2) == reference()
    manifest = dict(encoding="UTF-8", delimiter=",", header=True, null_marker="?",
                    columns=[dict(name=name, type="string", data_kind="Дискретный")
                             for name in ["Transaction", "Item"]],
                    dependencies="Python 3 stdlib: csv, itertools, fractions, json, hashlib",
                    files={path.name: dict(bytes=path.stat().st_size,
                                           sha256=hashlib.sha256(path.read_bytes()).hexdigest())
                           for path in sorted((ROOT / "fixtures").glob("*.csv"))})
    return {ROOT / "fixtures/manifest.json": manifest,
            ROOT / "fixtures/apriori-reference.json": {
                "transactions": reference(),
                "length": apriori(length, Fraction(1, 2), Fraction(3, 5), 2)},
            ROOT / "acceptance/expected.json": expected("transactions.csv"),
            ROOT / "acceptance/length/expected.json": expected("length.csv")}


if __name__ == "__main__":
    assert sys.argv[1:] in ([], ["--write"], ["--check"]), "Use --write or --check"
    for path, value in artifacts().items():
        if sys.argv[1:] == ["--write"]:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        elif sys.argv[1:] == ["--check"]:
            assert json.loads(path.read_text(encoding="utf-8")) == value, path
        else:
            print(json.dumps(value, ensure_ascii=False, indent=2))
    if sys.argv[1:] == ["--check"]:
        for name, directory in [("transactions.csv", ROOT / "acceptance/data"),
                                ("length.csv", ROOT / "acceptance/length/data")]:
            assert (directory / name).read_bytes() == (ROOT / "fixtures" / name).read_bytes()
        print("PASS: independent Apriori, analytic boundaries, expected tables and fixture bytes")
