"""Independent proposed contingency tables; stdlib, no Loginom or actual output.

The continuous split at 7 is authored, not an optimizer prediction. LAB-1202
observed unbounded outer limits as Variant NULL and the edited split as
Variant/real. Boundary membership is defined by <=7/>7, including X=7.
IncludeUpperBound=False is a native 7.4.2 observation, not a claimed setting;
the owner approved retaining its observed value for the stock table matcher.
Unseen->NULL and additive 0.5 smoothing are quarantined hypotheses, not native
facts or runnable acceptance cases.
Observations of 7.4.2, not claimed as a contract: the zero-share replacement
epsilon=1/(2N) (seen only at N=4) and the renumbering of external classes by
increasing WoE. Both are verified on the stand first in their cycles. Old oracle supplies only known table schemas
and the already defined discrete training model for the unseen proposal.
"""
import argparse
import csv
from decimal import Decimal, localcontext
import json
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[2]
BASE = runpy.run_path(str(ROOT / "acceptance" / "oracle.py"))


def expected(case):
    result = BASE["expected"]()
    if case in ("frozen-zero", "external"):
        # Observation of 7.4.2 at N=4, not claimed: zero share -> 1/(2N).
        # Not a general claim about Loginom's correction at arbitrary sizes. The frozen
        # model retains the independent training model's numbering B=0/A=1.
        rows = BASE["source"]("zero-frequency")
        if case == "external":
            with (ROOT / "fixtures" / "external-classes.csv").open(newline="", encoding="utf-8") as source:
                definitions = list(csv.DictReader(source))
            assert {r["ColumnName"] for r in definitions} == {"Segment"}
            assert {r["UniqueValue"] for r in definitions} == {r["Segment"] for r in rows}
            numbers = {r["UniqueValue"]: int(r["ClassNumber"]) for r in definitions}
            assert len(numbers) == len(definitions) and set(numbers.values()) == {0, 1}
            for item in result["outputs"][1]["rows"]:
                item["ClassNumber"] = numbers[item["UniqueValue"]]
            result["outputs"][1]["rows"].sort(key=lambda r: r["ClassNumber"])
            result["nodes"].insert(0, {"type": "imports.text"})
        events = sum(r["Target"] == "yes" for r in rows)
        non_events = len(rows) - events
        with localcontext() as context:
            context.prec = 50
            epsilon = Decimal(1) / (2 * len(rows))
            assert len(rows) == 4 and events == non_events == 2
            for item in result["outputs"][1]["rows"]:
                group = [r for r in rows if r["Segment"] == item["UniqueValue"]]
                e = sum(r["Target"] == "yes" for r in group)
                n = len(group) - e
                pe = Decimal(e) / events if e else epsilon
                pn = Decimal(n) / non_events if n else epsilon
                woe = (pn / pe).ln()
                item.update(EventsCount=e, NonEventsCount=n,
                            EventRate=e / len(group), NonEventRate=n / len(group),
                            WoE=float(woe), IV=float((pn - pe) * woe),
                            Weight=len(group) / len(rows))
        if case == "external":
            # Input numbers define membership, not a promised output identity.
            # Observation, not claimed: in this distinct-WoE case the native
            # output was renumbered in increasing WoE order. Equal-WoE ordering
            # is outside the proposal.
            result["outputs"][1]["rows"].sort(key=lambda r: r["WoE"])
            for number, item in enumerate(result["outputs"][1]["rows"]):
                item["ClassNumber"] = number
        classes = {item["UniqueValue"]: item for item in result["outputs"][1]["rows"]}
        result["outputs"][0]["rows"] = [r | {
            "Segment_ClassNum": classes[r["Segment"]]["ClassNumber"],
            "Segment_ClassMark": classes[r["Segment"]]["ClassMark"],
            "Segment_ClassSignificant": classes[r["Segment"]]["IV"]} for r in rows]
        result["outputs"][2]["rows"] = [dict(ColumnName="Segment", ColumnDisplayName="Segment",
            EventsCount=events, NonEventsCount=non_events, EventRate=events / len(rows),
            NonEventRate=non_events / len(rows), TotalEventsCount=len(rows),
            IV=sum(c["IV"] for c in classes.values()), Significance="Высокая")]
        return result
    if case == "external-contrast":
        return external_contrast(result)
    if case == "unseen":
        known = {r["Segment"]: r for r in result["outputs"][0]["rows"]}
        with (ROOT / "fixtures" / "unseen.csv").open(newline="", encoding="utf-8") as source:
            result["outputs"][0]["rows"] = [dict(RowID=int(r["RowID"]),
                Segment=None if r["Segment"] == "?" else r["Segment"], Target=None, Note=r["Note"],
                **{key: known.get(r["Segment"], {}).get(key) for key in
                   ("Segment_ClassNum", "Segment_ClassMark", "Segment_ClassSignificant")})
                for r in csv.DictReader(source)]
        return result
    continuous = case == "continuous"
    field = "X" if continuous else "Segment"
    with (ROOT / "fixtures" / ("continuous.csv" if continuous else "zero-frequency.csv")).open(newline="", encoding="utf-8") as source:
        rows = [{k: int(v) if k == "RowID" or k == "X" else v for k, v in r.items()}
                for r in csv.DictReader(source)]
    groups = [[r for r in rows if r[field] <= 7], [r for r in rows if r[field] > 7]] if continuous else [[r for r in rows if r[field] == name] for name in ("A", "B")]
    events = sum(r["Target"] == "yes" for r in rows)
    non_events = len(rows) - events
    alpha = Decimal(0) if continuous else Decimal("0.5")
    with localcontext() as context:
        context.prec = 50
        classes = []
        for index, group in enumerate(groups):
            e = sum(r["Target"] == "yes" for r in group)
            n = len(group) - e
            pe = (Decimal(e) + alpha) / (events + alpha * len(groups))
            pn = (Decimal(n) + alpha) / (non_events + alpha * len(groups))
            woe = (pn / pe).ln()
            iv = (pn - pe) * woe
            classes.append(dict(Group=0, ColumnName=field, ColumnDisplayName=field,
                ClassNumber=index, UniqueValue=None if continuous else ("A", "B")[index],
                ClassMark=("Low", "High")[index] if continuous else ("[A]", "[B]")[index],
                EventsCount=e, NonEventsCount=n, EventRate=e / len(group), NonEventRate=n / len(group),
                LowerBound={"cell_type": "real", "value": 7} if continuous and index == 1 else None,
                UpperBound={"cell_type": "real", "value": 7} if continuous and index == 0 else None,
                WoE=float(woe), IV=float(iv), Weight=len(group) / len(rows),
                IncludeUpperBound=False if continuous else None, PreQuantingApplied=False if continuous else None))
        total_iv = sum(c["IV"] for c in classes)
    transformed = []
    for index, group in enumerate(groups):
        for row in group:
            transformed.append(row | {field + "_ClassNum": index, field + "_ClassMark": classes[index]["ClassMark"],
                                      field + "_ClassSignificant": classes[index]["IV"]})
    transformed.sort(key=lambda row: row["RowID"])
    result["outputs"][0]["rows"] = transformed
    result["outputs"][0]["columns"] = BASE["columns"](
        [("RowID", "integer"), (field, "integer" if continuous else "string"),
         (field + "_ClassNum", "integer"), (field + "_ClassMark", "string"),
         (field + "_ClassSignificant", "real"), ("Target", "string")] + ([] if continuous else [("Note", "string")]))
    result["outputs"][1]["rows"] = classes
    result["outputs"][2]["rows"] = [dict(ColumnName=field, ColumnDisplayName=field,
        EventsCount=events, NonEventsCount=non_events, EventRate=events / len(rows),
        NonEventRate=non_events / len(rows), TotalEventsCount=len(rows), IV=total_iv, Significance="Высокая")]
    if continuous:
        result['observations'] = {'IncludeUpperBound': 'Native field, observation of 7.4.2, not claimed; boundary membership is checked by X=7 in class 0.'}
        for output in result["outputs"][:2]:
            for column in output["columns"]:
                if column["name"] in ("X_ClassMark", "ClassMark"):
                    column["category_labels_any"] = True
    assert total_iv > 0.3
    return result


def external_contrast(result):
    """Supplied partition {B} | {A,C} that automatic training cannot produce.

    Не приёмочный: Loginom 7.4.2 отклоняет внешнее разбиение, ожидается
    `COARSE_EXTERNAL_UNSUPPORTED` (решение v040-kk-c3-external).

    Every class has events and non-events (no zero-share rule), WoE values are
    distinct and the supplied numbers already follow increasing WoE, so the
    expected depends on neither observation above. Port 1 layout for a
    multi-category class (one row per UniqueValue with class statistics) and
    the class marks are not observed: stand verification, first step of cycle 3.
    Significance="Высокая" at total IV 0.572 is also a stand reconciliation item:
    it was observed only at IV 1.66 and 3.64.
    """
    rows = BASE["source"]("external-contrast")
    with (ROOT / "fixtures" / "external-contrast-classes.csv").open(newline="", encoding="utf-8") as source:
        definitions = list(csv.DictReader(source))
    assert {r["ColumnName"] for r in definitions} == {"Segment"}
    numbers = {r["UniqueValue"]: int(r["ClassNumber"]) for r in definitions}
    assert len(numbers) == len(definitions) and set(numbers) == {r["Segment"] for r in rows}
    members = {k: sorted(v for v in numbers if numbers[v] == k) for k in sorted(set(numbers.values()))}
    assert members == {0: ["B"], 1: ["A", "C"]}
    events = sum(r["Target"] == "yes" for r in rows)
    non_events = len(rows) - events
    with localcontext() as context:
        context.prec = 50

        def stats(categories):
            group = [r for r in rows if r["Segment"] in categories]
            e = sum(r["Target"] == "yes" for r in group)
            n = len(group) - e
            assert e > 0 and n > 0
            pe, pn = Decimal(e) / events, Decimal(n) / non_events
            woe = (pn / pe).ln()
            return dict(group=group, e=e, n=n, woe=woe, iv=(pn - pe) * woe)

        def total(partition):
            return sum(stats(part)["iv"] for part in partition)

        classes = {k: stats(v) for k, v in members.items()}
        assert classes[0]["woe"] < classes[1]["woe"]
        supplied = total(members.values())
        # The supplied {A,C} is not contiguous in event-rate order, so no merge
        # of neighbours equals it; the IV-optimal neighbour merge is much larger.
        rate = {c: Decimal(stats([c])["e"]) / len(stats([c])["group"]) for c in "ABC"}
        ordered = sorted("ABC", key=lambda c: rate[c])
        assert ordered == ["C", "B", "A"]
        adjacent = [[ordered[:1], ordered[1:]], [ordered[:2], ordered[2:]]]
        assert all(sorted(map(sorted, p)) != sorted(members.values()) for p in adjacent)
        assert max(total(p) for p in adjacent) - supplied > Decimal("1")
        marks = {0: "[B]", 1: "[A,C]"}
        result["outputs"][1]["rows"] = [dict(Group=0, ColumnName="Segment", ColumnDisplayName="Segment",
            ClassNumber=k, UniqueValue=value, ClassMark=marks[k], EventsCount=c["e"], NonEventsCount=c["n"],
            EventRate=c["e"] / len(c["group"]), NonEventRate=c["n"] / len(c["group"]),
            LowerBound=None, UpperBound=None, WoE=float(c["woe"]), IV=float(c["iv"]),
            Weight=len(c["group"]) / len(rows), IncludeUpperBound=None, PreQuantingApplied=None)
            for k, c in classes.items() for value in members[k]]
        result["outputs"][0]["rows"] = [r | {"Segment_ClassNum": numbers[r["Segment"]],
            "Segment_ClassMark": marks[numbers[r["Segment"]]],
            "Segment_ClassSignificant": float(classes[numbers[r["Segment"]]]["iv"])} for r in rows]
        assert supplied > Decimal("0.5")
        result["outputs"][2]["rows"] = [dict(ColumnName="Segment", ColumnDisplayName="Segment",
            EventsCount=events, NonEventsCount=non_events, EventRate=events / len(rows),
            NonEventRate=non_events / len(rows), TotalEventsCount=len(rows),
            IV=float(supplied), Significance="Высокая")]
    result["nodes"].insert(0, {"type": "imports.text"})
    for output in result["outputs"][:2]:
        for column in output["columns"]:
            if column["name"] in ("Segment_ClassMark", "ClassMark"):
                column["category_labels_any"] = True
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for case in ("continuous", "unseen", "zero-frequency", "frozen-zero", "external", "external-contrast"):
        result = expected(case)
        path = Path(__file__).parent / ("expected.json" if case == "continuous" else "expected-" + case + ".json")
        if args.write:
            path.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        if args.check:
            assert json.loads(path.read_text(encoding="utf-8")) == result, path.name
    assert abs(expected("continuous")["outputs"][2]["rows"][0]["IV"] - float(Decimal(11) / 20 * Decimal(12).ln())) < 1e-14
    assert next(r for r in expected('continuous')['outputs'][0]['rows'] if r['X'] == 7)['X_ClassNum'] == 0
    assert all(r["Segment_ClassNum"] is None for r in expected("unseen")["outputs"][0]["rows"][1:])
    assert expected("frozen-zero")["outputs"][1]["rows"][0]["ClassNumber"] == 0
    assert expected("frozen-zero")["outputs"][1]["rows"][0]["UniqueValue"] == "B"
    print("Continuous and frozen N=4 proposals reproduced; unseen/additive alpha=0.5 remain quarantined.")
