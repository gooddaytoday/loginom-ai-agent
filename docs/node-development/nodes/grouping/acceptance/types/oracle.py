"""Proposal only (LAB-1558): independent CSV arithmetic for typed grouping aggregates.

No Loginom/runtime import, no live output. Run normally to print expected.json,
or --check to compare it with the committed file and the fixture hashes.
Only the business task and its CSV reach the model.
"""
import csv
import hashlib
import json
import math
import statistics
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent.parent / "fixtures/types"
HASHES = {
    "types.csv": "77ce4ed63dea0d1155967f2d0791fd2b1a1e7724e993ce0ed986a9bd73e2e34a",
    "variant.csv": "7870bd8bddd3d79bf5e4bce5740aa0dbc7e226c7e1806d9392cd3b637aa41aa8",
    "mode-tie.csv": "141250ff3581315a87e6a5b08a9491c01cb6bc4d2413c6bd44b1ce1c23ab053b",
    "empty.csv": "59185dfe8e71760275cbc54a2afbd81f6e236d43ec79df1c59a705a0412e9990",
}
NULL = "\\N"


def read(name, kinds):
    data = (FIXTURES / name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == HASHES[name], name + " differs from the proposal"
    rows = list(csv.DictReader(data.decode("utf-8").splitlines(), delimiter=";"))
    parse = {"integer": int, "real": float, "string": str,
             "boolean": lambda v: {"true": True, "false": False}[v],
             "datetime": lambda v: v + "T00:00:00.000"}
    return [{k: None if row[k] == NULL else parse[kinds[k]](row[k]) for k in kinds} for row in rows]


def groups(rows, key):
    result = {}
    for row in rows:
        result.setdefault(row[key], []).append(row)
    return result


def aggregate(values, function, kind):
    valid = [v for v in values if v is not None]
    if function == "count":
        return len(values)
    if function == "null_count":
        return len(values) - len(valid)
    if function == "unique_count":
        return len(set(valid))
    if function == "first":
        return values[0]
    if function == "last":
        return values[-1]
    if function == "mode":
        if not valid:
            # Integer/String all-NULL gave the typed default (LAB-998); Real/Boolean
            # follow the same proposal and are native-probe questions 4-5.
            return {"integer": 0, "real": 0.0, "string": "", "boolean": False}[kind]
        counts = Counter(valid)
        top = max(counts.values())
        # Help aggregation-functions.md: on a tie the smallest value wins
        # (False for Boolean, smallest number, lexicographically smallest string).
        return min(v for v, c in counts.items() if c == top)
    if not valid:
        return None
    if function == "min":
        return min(valid)
    if function == "max":
        return max(valid)
    if function == "sum":
        return float(sum(valid))
    if function == "median":
        return float(statistics.median(valid))
    if function == "stddev":
        n = len(valid)
        if n == 1:
            return 0.0
        mean = sum(valid) / n
        # Native binary64 order observed in CrossTable/LAB-998: raw second moment, n/(n-1).
        return math.sqrt((sum(v * v for v in valid) / n - mean * mean) * n / (n - 1))
    raise ValueError(function)


def result_type(function, kind):
    if function in ("count", "null_count", "unique_count"):
        return "integer"
    if function in ("sum", "median", "stddev"):
        return "real"
    return kind


def stage(node_type, key, key_kind, measures, rows, ordered=False):
    columns = [{"name": key, "type": key_kind, "label_any": True}]
    columns += [{"name": name, "type": result_type(fn, kind), "label_any": True,
                 # StdDev evaluation order is native; the stock real tolerance covers it.
                 **({"tolerance": {"abs": 1e-12, "rel": 1e-12}} if fn == "stddev" else {})}
                for name, _, fn, kind in measures]
    out = []
    for value, records in groups(rows, key).items():
        row = {key: value}
        for name, field, fn, kind in measures:
            row[name] = aggregate([r[field] for r in records], fn, kind)
        out.append(row)
    return {"output_node_type": node_type, "output_port": 0, "ordered": ordered,
            "column_order": "exact", "columns": columns, "rows": out}


def expected():
    typed = read("types.csv", {"RowID": "integer", "Region": "string", "Price": "real",
                               "Day": "datetime", "Flag": "boolean"})
    cases = {
        "real": [("PriceMedian", "Price", "median", "real"), ("PriceMode", "Price", "mode", "real"),
                 ("PriceStd", "Price", "stddev", "real")],
        "date": [("FirstDay", "Day", "min", "datetime"), ("LastDay", "Day", "max", "datetime"),
                 ("FinalDay", "Day", "last", "datetime"), ("MissingDays", "Day", "null_count", "datetime")],
        "boolean": [("FlagMin", "Flag", "min", "boolean"), ("FlagMax", "Flag", "max", "boolean"),
                    ("FlagMode", "Flag", "mode", "boolean"), ("FlagValues", "Flag", "unique_count", "boolean"),
                    ("FlagMissing", "Flag", "null_count", "boolean")],
    }
    result = {}
    for name, measures in cases.items():
        result[name] = {"task": "task-" + name + ".md", "source": "../../fixtures/types/types.csv",
                        "stages": [stage("transform.group_data", "Region", "string", measures, typed)]}

    # Variant source: scalar import -> Collapse(RowID information; IntValue, RealValue,
    # TextValue transposed in this order; empty values kept), as in sorting/acceptance/modes.
    collapsed = []
    for row in read("variant.csv", {"RowID": "integer", "IntValue": "integer", "RealValue": "real", "TextValue": "string"}):
        for field, kind in (("IntValue", "integer"), ("RealValue", "real"), ("TextValue", "string")):
            value = row[field]
            collapsed.append({"RowID": row["RowID"], "Names": field,
                              "Values": None if value is None else {"cell_type": kind, "value": value}})
    result["variant"] = {
        "task": "task-variant.md", "source": "../../fixtures/types/variant.csv",
        "source_preparation": "scalar import -> Collapse(RowID information; IntValue/RealValue/TextValue transposed; empty kept); Grouping by RowID",
        "stages": [stage("transform.group_data", "RowID", "integer",
                         [("Cells", "Values", "count", "variant"), ("EmptyCells", "Values", "null_count", "variant"),
                          ("FirstValue", "Values", "first", "variant"), ("LastValue", "Values", "last", "variant")],
                         collapsed)]}

    tie = read("mode-tie.csv", {"RowID": "integer", "Region": "string", "Amount": "integer", "Text": "string"})
    result["mode_tie"] = {"task": "task-mode-tie.md", "source": "../../fixtures/types/mode-tie.csv",
                          "stages": [stage("transform.group_data", "Region", "string",
                                           [("AmountMode", "Amount", "mode", "integer"),
                                            ("TextMode", "Text", "mode", "string")], tie)]}

    empty = read("empty.csv", {"Region": "string", "Amount": "integer", "Price": "real", "Day": "datetime", "Flag": "boolean"})
    assert empty == []
    columns = [{"name": "Region", "type": "string", "label_any": True},
               {"name": "Rows", "type": "integer", "label_any": True},
               {"name": "Total", "type": "real", "label_any": True},
               {"name": "FirstDay", "type": "datetime", "label_any": True},
               {"name": "AnyFlag", "type": "boolean", "label_any": True}]
    result["empty"] = {"task": "task-empty.md", "source": "../../fixtures/types/empty.csv",
                       "stages": [{"output_node_type": "transform.group_data", "output_port": 0, "ordered": False,
                                   "column_order": "exact", "columns": columns, "rows": []}]}

    # Self-checks of the declared rules, independent of the fixtures.
    assert aggregate([1.5, 0.5, 1.5, 0.5], "mode", "real") == 0.5
    assert aggregate([True, False, False, True], "mode", "boolean") is False
    assert aggregate(["zeta", "eta", None], "mode", "string") == "eta"
    assert aggregate([9, None, 2], "mode", "integer") == 2
    assert aggregate([None, None], "mode", "boolean") is False
    assert aggregate([None, True], "first", "boolean") is None
    return {"status": "proposal_requires_owner_approval_not_stock_expected",
            "package_path": "{{PACKAGE_PATH}}", "cases": result}


if __name__ == "__main__":
    data = expected()
    if "--check" in sys.argv:
        committed = json.loads((ROOT / "expected.json").read_text(encoding="utf-8"))
        assert data == committed, "expected.json differs from the independent calculation"
        print("grouping types proposal: independent expected matches (%d cases)" % len(data["cases"]))
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))
