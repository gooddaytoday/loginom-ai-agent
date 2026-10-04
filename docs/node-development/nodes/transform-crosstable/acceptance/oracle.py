"""Independent phase-one expectations; consumes only the versioned input CSVs.

The native naming/NULL specification comes from phase-zero discovery. No runtime
or captured output is imported. Run before implementing or running the handler.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FUNCTIONS = [("Sum", "Сумма"), ("Min", "Минимум"), ("Max", "Максимум"), ("Avg", "Среднее")]


def load(name):
    with (ROOT / "data" / name).open(newline="", encoding="utf-8") as stream:
        records = list(csv.DictReader(stream))
    assert len({r["RowID"] for r in records}) == len(records)
    for r in records:
        r["Category"] = None if r["Category"] == "?" else r["Category"]
        r["Amount"] = None if r["Amount"] == "?" else float(r["Amount"])
        r["Quantity"] = float(r["Quantity"])
        assert r["Quantity"] == 1
    return records


def report(records, categories, fixed=False):
    # Special group tokens are deliberately separate from literal input strings.
    columns = [{"name": "Region", "label": "Region", "type": "string"}]
    for fact, functions in [("Amount", FUNCTIONS), ("Quantity", [("Sum", "Сумма")])]:
        for i, category in enumerate(categories, 1):
            label = "<...>" if category is None else "<Прочее>" if category == OTHER else category
            columns.extend({"name": f"C_{i}_{fact}_{f}", "label": f"{label}|{fact}|{text}", "type": "real"}
                           for f, text in functions)
    grouped = defaultdict(list)
    for r in records:
        category = r["Category"]
        if fixed and category not in categories:
            category = OTHER
        assert category in categories
        grouped[r["Region"], category].append(r)
    rows = []
    for region in sorted({r["Region"] for r in records}):
        row = {"Region": region}
        for i, category in enumerate(categories, 1):
            group = grouped[region, category]
            values = [r["Amount"] for r in group if r["Amount"] is not None]
            sums = sum(values) if values else None
            computed = {"Sum": sums, "Min": min(values) if values else None,
                        "Max": max(values) if values else None,
                        "Avg": sums / len(values) if values else None}
            row.update({f"C_{i}_Amount_{f}": computed[f] for f, _ in FUNCTIONS})
            row[f"C_{i}_Quantity_Sum"] = sum(r["Quantity"] for r in group) if group else None
        rows.append(row)
    return {"output_node_type": "transform.cross_table", "columns": columns, "rows": rows}


OTHER = "__independent_other_group__"
if __name__ == "__main__":
    base, updated = load("sales-base.csv"), load("sales-update.csv")
    initial = [None, *sorted({r["Category"] for r in base if r["Category"] is not None})]
    final = [None, *sorted({r["Category"] for r in updated if r["Category"] is not None})]
    assert initial == [None, "A", "B", "C"] and final == [None, "A", "C", "D"]
    expected = {"package_path": "{{PACKAGE_PATH}}", "nodes": [{"type": "imports.text"},
                {"type": "transform.cross_table"}],
                "outputs": [report(updated, [*initial, OTHER], fixed=True), report(updated, final)]}
    (ROOT / "expected.json").write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Initial checks are kept outside the model's business task and final cold oracle.
    (ROOT / "initial.json").write_text(json.dumps({"outputs": [report(base, [*initial, OTHER], True),
                report(base, initial)]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # The stage-two entry point appends its independently computed matrix.
    import subprocess, sys
    subprocess.run([sys.executable, str(ROOT / "stage2/generate.py")], check=True)

    subprocess.run([sys.executable, str(ROOT / 'stage3/generate.py')], check=True)
