"""Stage-three expectations from versioned CSVs, before the model runs.

Native naming and the collision fixture's category order were calibrated by
live discovery 03, independently of the handler and subsequent CLI attempt.
Numbers and NULLs below are calculated from input records, never output dumps.
"""
import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUFFIX = {"sum": "Sum", "count": "Count"}
LABEL = {"sum": "Сумма", "count": "Количество"}


def load(name):
    with (ROOT / "data" / name).open(newline="", encoding="utf8") as stream:
        return [{**r, "Region": None if r["Region"] == "?" else r["Region"],
                 "Category": None if r["Category"] == "?" else r["Category"],
                 "Amount": None if r["Amount"] == "?" else float(r["Amount"])} for r in csv.DictReader(stream)]


def report(records, categories, functions=("sum", "count"), separator="|", names=None, label=None):
    columns = [{"name": "Region", "label": "Region", "type": "string"}]
    addresses = []
    for i, category in enumerate(categories, 1):
        caption = "<...>" if category is None else category
        for fn in functions:
            if names is None:
                name = f"C_{i}" + (f"_Amount_{SUFFIX[fn]}" if len(functions) > 1 else "")
            else:
                root, collision = names[category]
                name = (root + "_" if root else "") + "Amount_" + SUFFIX[fn] + collision
            text = separator.join(([caption] if caption != "" else []) + ["Amount", LABEL[fn]]) if len(functions) > 1 else caption
            columns.append({"name": name, "label": text, "type": "integer" if fn == "count" else "real"})
            addresses.append((name, category, fn))
    groups = defaultdict(list)
    for r in records:
        groups[r["Region"]].append(r)
    rows = []
    for region, group in groups.items():
        row = {"Region": region}
        for name, category, fn in addresses:
            matching = [r for r in group if r["Category"] == category]
            nonnull = [r["Amount"] for r in matching if r["Amount"] is not None]
            row[name] = len(matching) if fn == "count" and matching else sum(nonnull) if fn == "sum" and nonnull else None
        rows.append(row)
    return {"output_node_type": "transform.cross_table", "output_node_label": label, "columns": columns, "rows": rows}


def generate():
    expected = json.loads((ROOT / "expected.json").read_text())
    assert len(expected["outputs"]) == 15, "run stage two first"
    rows = load("typed.csv")
    boundary = report(rows, ["A", "B"], label="Граница исключения")
    reserve = report(rows, ["A", "B", "3", "4"], label="Резерв категорий")
    limited = report(rows, ["A"], label="Ограничение категорий")
    controlled = report(rows, ["A", "B"], separator=".", names={c: (c, "") for c in ["A", "B"]}, label="Управляемая схема")
    edited = report(rows, ["A", "B"], label="Редактирование выхода")
    order = ["C_2_Amount_Sum", "C_1_Amount_Sum", "C_1_Amount_Count", "Region", "C_2_Amount_Count"]
    edited["columns"] = [next(c for c in edited["columns"] if c["name"] == n) for n in order]
    next(c for c in edited["columns"] if c["name"] == "C_1_Amount_Sum").update(name="RevenueA", label="Доход A")
    for row in edited["rows"]:
        row["RevenueA"] = row.pop("C_1_Amount_Sum")
    downstream = {**report(rows, ["A", "B"]), "output_node_type": "transform.reform_columns", "output_node_label": "Представление без количества B"}
    downstream["columns"] = downstream["columns"][:-1]
    for row in downstream["rows"]:
        del row["C_2_Amount_Count"]
    names = {None: ("NullGroup", ""), "": ("", ""), " ": ("_", ""), "Привет": ("Privet", "_1"),
             "A_1": ("A_1", ""), "A-1": ("A_1", "_1"), "null": ("null", ""), "Privet": ("Privet", "")}
    collision = report(load("names.csv"), list(names), separator=".", names=names, label="Имена категорий")
    automatic = report(rows, ["A", "B"], functions=("sum",), label="Автосинхронизация выхода")
    transitions = report(rows, ["A", "B"], functions=("count",), label="Переходы режимов")
    expected["outputs"] += [boundary, reserve, limited, controlled, edited, downstream, collision, automatic, transitions]
    expected["nodes"].append({"type": "transform.reform_columns"})
    for fixture in expected["static_sources"]:
        if fixture["name"] == "typed.csv":
            fixture["output_orders"] = [list(reversed(fixture["columns"]))]
    data = (ROOT / "data/names.csv").read_bytes()
    expected["static_sources"].append({"name": "names.csv", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
        "columns": [{"name": n, "label": n, "type": "real" if n in ["Amount", "Quantity"] else "string"} for n in ["RowID", "Region", "Category", "Amount", "Quantity"]]})
    assert len(expected["outputs"]) == 24
    (ROOT / "expected.json").write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    generate()
