#!/usr/bin/env python3
"""Independent contingency-table WoE/IV oracle; Python stdlib, no Loginom.

Schema/labels are discovery bindings. Counts, rates, ordering, class and total
IV are derived only from authored CSV, using Decimal ln at 50 digits. Apply
uses the training model and never refits holdout (whose target is all NULL).
"""
import argparse
import csv
from decimal import Decimal, localcontext
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TYPE = "preprocessing.coarse_classes"
TOLERANCE = {"abs": 1e-12, "rel": 1e-12}


def source(name):
    with (ROOT / "fixtures" / (name + ".csv")).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == ["RowID", "Segment", "Target", "Note"]
        rows = [{k: None if v == "?" else int(v) if k == "RowID" else v
                 for k, v in r.items()} for r in reader]
    assert len({r["RowID"] for r in rows}) == len(rows)
    return rows


def model():
    train = source("train")
    assert len(train) == 20
    assert {r["Target"] for r in train} == {"yes", "no"}
    assert {r["Segment"] for r in train} == {"A", "B"}
    events = sum(r["Target"] == "yes" for r in train)
    non_events = len(train) - events
    assert events == non_events == 10
    with localcontext() as ctx:
        ctx.prec = 50
        classes = []
        for category in sorted({r["Segment"] for r in train}):
            group = [r for r in train if r["Segment"] == category]
            e = sum(r["Target"] == "yes" for r in group)
            n = len(group) - e
            assert e > 0 and n > 0, "zero-frequency smoothing is outside this oracle"
            pe, pn = Decimal(e) / events, Decimal(n) / non_events
            woe = (pn / pe).ln()
            iv = (pn - pe) * woe
            classes.append({"category": category, "events": e, "non_events": n,
                            "woe": woe, "iv": iv, "weight": Decimal(len(group)) / len(train)})
        # Two unequal WoE values: native numbering follows increasing WoE here.
        classes.sort(key=lambda c: c["woe"])
        assert len(classes) == 2 and classes[0]["woe"] < classes[1]["woe"]
        total_iv = sum(c["iv"] for c in classes)
        assert abs(total_iv - Decimal("1.2") * Decimal(4).ln()) < Decimal("1e-48")
        return classes, total_iv, events, non_events


def columns(names):
    result = []
    for name, kind in names:
        c = {"name": name, "type": kind, "label_any": True}
        if kind == "real":
            c["tolerance"] = TOLERANCE
        result.append(c)
    return result


def expected(package_path="{{PACKAGE_PATH}}", case="train"):
    classes, total_iv, events, non_events = model()
    index = {c["category"]: (i, c) for i, c in enumerate(classes)}
    transformed = []
    for r in source("holdout" if case == "apply" else "train"):
        i, c = index[r["Segment"]]
        transformed.append({"RowID": r["RowID"], "Segment": r["Segment"],
                            "Segment_ClassNum": i, "Segment_ClassMark": "[" + r["Segment"] + "]",
                            "Segment_ClassSignificant": float(c["iv"]),
                            "Target": r["Target"], "Note": r["Note"]})
    parameters = []
    for i, c in enumerate(classes):
        e, n = c["events"], c["non_events"]
        parameters.append({"Group": 0, "ColumnName": "Segment", "ColumnDisplayName": "Segment",
                           "ClassNumber": i, "UniqueValue": c["category"],
                           "ClassMark": "[" + c["category"] + "]", "EventsCount": e,
                           "NonEventsCount": n, "EventRate": e / (e + n), "NonEventRate": n / (e + n),
                           "LowerBound": None, "UpperBound": None, "WoE": float(c["woe"]),
                           "IV": float(c["iv"]), "Weight": float(c["weight"]),
                           "IncludeUpperBound": None, "PreQuantingApplied": None})
    # Only the high-IV example is in scope; no universal UI category threshold
    # contract is inferred. The numeric IV itself remains independently derived.
    assert total_iv > Decimal("0.3")
    significance = [{"ColumnName": "Segment", "ColumnDisplayName": "Segment", "EventsCount": events,
                     "NonEventsCount": non_events, "EventRate": events / (events + non_events),
                     "NonEventRate": non_events / (events + non_events),
                     "TotalEventsCount": events + non_events, "IV": float(total_iv), "Significance": "Высокая"}]
    schemas = [
        [("RowID", "integer"), ("Segment", "string"), ("Segment_ClassNum", "integer"),
         ("Segment_ClassMark", "string"), ("Segment_ClassSignificant", "real"),
         ("Target", "string"), ("Note", "string")],
        [("Group", "integer"), ("ColumnName", "string"), ("ColumnDisplayName", "string"),
         ("ClassNumber", "integer"), ("UniqueValue", "string"), ("ClassMark", "string"),
         ("EventsCount", "integer"), ("NonEventsCount", "integer"), ("EventRate", "real"),
         ("NonEventRate", "real"), ("LowerBound", "variant"), ("UpperBound", "variant"),
         ("WoE", "real"), ("IV", "real"), ("Weight", "real"),
         ("IncludeUpperBound", "boolean"), ("PreQuantingApplied", "boolean")],
        [("ColumnName", "string"), ("ColumnDisplayName", "string"), ("EventsCount", "integer"),
         ("NonEventsCount", "integer"), ("EventRate", "real"), ("NonEventRate", "real"),
         ("TotalEventsCount", "integer"), ("IV", "real"), ("Significance", "string")]]
    return {"package_path": package_path, "null_marker": "?", "nodes": [{"type": "imports.text"}, {"type": TYPE},
            {"type": "exports.text"}, {"type": "exports.text"}, {"type": "exports.text"}],
            "outputs": [{"output_node_type": TYPE, "output_port": port, "ordered": True,
                         "column_order": "exact", "columns": columns(schema), "rows": rows}
                        for port, (schema, rows) in enumerate(zip(schemas, [transformed, parameters, significance]))]}


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("package_path", nargs="?", default="{{PACKAGE_PATH}}")
    p.add_argument("--case", choices=["train", "apply"], default="train")
    args = p.parse_args()
    print(json.dumps(expected(args.package_path, args.case), ensure_ascii=False, indent=2))
