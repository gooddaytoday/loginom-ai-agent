"""Proposal only: independent CSV arithmetic; no Loginom/runtime or live output.

Run normally to generate expected.json, or --check to compare the committed file.
Only the business task and source CSV reach the model.
"""
import csv
import json
import math
from collections import Counter
from pathlib import Path
import statistics
import sys

ROOT = Path(__file__).resolve().parent


def aggregate(values, function, *, kind="integer", unique=False, order="none", wrapper=""):
    valid = [v for v in values if v is not None]
    if function == "null_count":
        return len(values) - len(valid)
    if function == "first":
        return values[0]
    if function == "last":
        return values[-1]
    if function == "only":
        return values[0] if len(set(values)) == 1 else None
    if function == "concat":
        selected = list(dict.fromkeys(valid)) if unique else valid
        if order != "none":
            selected = sorted(selected, reverse=order == "DESC")
        return "|".join(wrapper + str(v) + wrapper for v in selected)
    if function == "mode":
        if not valid:
            # Declared proposed native contract, not SQL MODE: typed default.
            return "" if kind == "string" else 0
        counts = Counter(valid)
        winners = [v for v, count in counts.items() if count == max(counts.values())]
        assert len(winners) == 1, "Fixture deliberately avoids an unspecified mode tie"
        return winners[0]
    if not valid:
        return None
    if function == "sum":
        return sum(valid)
    if function == "median":
        return statistics.median(valid)
    if function == "stddev":
        count = len(valid)
        mean = sum(valid) / count
        return math.sqrt((sum(v * v for v in valid) / count - mean * mean)
                         * count / (count - 1)) if count > 1 else 0.0
    raise ValueError(function)


def expected():
    with (ROOT.parent.parent / "fixtures/modes.csv").open(encoding="utf-8", newline="") as stream:
        source = list(csv.DictReader(stream, delimiter=";"))
    groups = {}
    for row in source:
        groups.setdefault(row["Region"], []).append({
            "Amount": None if row["Amount"] == "\\N" else int(row["Amount"]),
            "Text": None if row["Text"] == "\\N" else row["Text"],
        })
    assert len(source) == 13 and list(groups) == ["B", "A", "C", "D", "E"]
    cases = {}
    for function in ["median", "mode", "stddev", "null_count", "first", "last", "only",
                     "concat", "cache", "sort_result"]:
        fn = "sum" if function in ["cache", "sort_result"] else function
        fields = ["Amount", "Text"] if fn in ["mode", "null_count", "first", "last", "only", "concat"] else ["Amount"]
        stages = [("none", False), ("ASC", True), ("DESC", True)] if fn == "concat" else [("none", False)]
        outputs = []
        for order, unique in stages:
            columns = [{"name": "Region", "type": "string", "label_any": True}]
            for field in fields:
                kind = "integer" if field == "Amount" else "string"
                result_type = "real" if fn in ["median", "stddev", "sum"] else "integer" if fn == "null_count" else "string" if fn == "concat" else kind
                columns.append({"name": "Metric" if field == "Amount" else "TextMetric",
                                "type": result_type, "label_any": True})
            rows = []
            for region, records in groups.items():
                row = {"Region": region}
                for field in fields:
                    row["Metric" if field == "Amount" else "TextMetric"] = aggregate(
                        [r[field] for r in records], fn, kind="integer" if field == "Amount" else "string",
                        unique=unique, order=order,
                        wrapper='"' if field == "Text" and fn == "concat" else "")
                rows.append(row)
            if function == "sort_result":
                rows.sort(key=lambda row: row["Region"])
            outputs.append({"output_node_type": "transform.group_data", "output_port": 0,
                            "ordered": function == "sort_result", "columns": columns, "rows": rows})
        cases[function] = {"task": "task-" + function.replace("_", "-") + ".md",
                           "stages": outputs}
    assert aggregate([2, 2], "only") == 2
    assert aggregate([4, None], "last") is None
    assert aggregate([1, 3, 3, 5], "concat") == "1|3|3|5"
    assert aggregate([1, 3, 3, 5], "concat", unique=True, order="DESC") == "5|3|1"
    return {"status": "proposal_requires_owner_approval_not_stock_expected",
            "package_path": "{{PACKAGE_PATH}}", "source": "../../fixtures/modes.csv", "cases": cases}


if __name__ == "__main__":
    result = expected()
    if "--check" in sys.argv:
        assert result == json.loads((ROOT / "expected.json").read_text(encoding="utf-8"))
        print("grouping proposal: independent expected matches")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
