"""Independent fixture arithmetic for the observed Loginom 7.4.2 cases."""

import csv
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path


root = Path(__file__).parent
expected = json.loads((root / "expected.json").read_text())
diagnostics = json.loads((root / "diagnostics.json").read_text())


def rows(name):
    with (root / "data" / name).open(newline="") as file:
        return [
            {
                "Region": row["Region"],
                "Category": row["Category"] if row["Category"] != "?" else "<...>",
                "Amount": Decimal(row["Amount"]) if row["Amount"] != "?" else None,
                "Quantity": Decimal(row["Quantity"]),
            }
            for row in csv.DictReader(file)
        ]


def sum_or_null(values):
    present = [value for value in values if value is not None]
    return float(sum(present)) if present else None


def matrix(source, categories):
    grouped = defaultdict(list)
    for row in source:
        category = row["Category"]
        if category not in categories:
            category = "<Прочее>"
        grouped[row["Region"], category].append(row)
    return {
        region: {
            category: [
                sum_or_null(row["Amount"] for row in grouped[region, category]),
                sum_or_null(row["Quantity"] for row in grouped[region, category]),
            ]
            for category in categories
        }
        for region in sorted({row["Region"] for row in source})
    }


dense = rows("dense.csv")
assert expected["columns"] == [
    {"name": "Region", "type": "string"},
    *[
        {"name": f"C_{index}_{fact}_Sum", "label": f"{category}|{fact}|Сумма", "type": "real"}
        for index, category in enumerate(["A", "B"], 1)
        for fact in ["Amount", "Quantity"]
    ],
]
assert expected["rows"] == [
    {
        "Region": region,
        **{
            f"C_{index}_{fact}_Sum": matrix(dense, ["A", "B"])[region][category][fact_index]
            for index, category in enumerate(["A", "B"], 1)
            for fact_index, fact in enumerate(["Amount", "Quantity"])
        },
    }
    for region in ["North", "South"]
]

for case in ["base_sliding", "changed_sliding", "changed_fixed"]:
    item = diagnostics[case]
    assert matrix(rows(item["file"]), item["categories"]) == item["rows"], case

source = rows(diagnostics["base_amount_statistics"]["file"])
grouped = defaultdict(list)
for row in source:
    grouped[row["Region"] + "/" + row["Category"]].append(row["Amount"])
statistics = {}
for key, values in grouped.items():
    present = [value for value in values if value is not None]
    statistics[key] = [
        sum_or_null(values),
        float(min(present)) if present else None,
        float(max(present)) if present else None,
        float(sum(present) / len(present)) if present else None,
    ]
assert statistics == diagnostics["base_amount_statistics"]["values"]
print("fixture oracle PASS")
