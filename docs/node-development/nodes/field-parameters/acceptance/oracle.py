"""Adapt the pre-existing frozen goal to the CLI cold-reader format.

No handler/runtime imports. Input identity and every historical expected cell
are checked before generating the final expected output. Matrix observations
remain exploratory; they are not promoted to independent PASS expectations.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE_SHA = "c1204e8bb03a0a686ec291de1fa5d532f19830589d4040e695f2f17e186f2a2e"


def expected():
    raw = (ROOT / "data/cleanup.csv").read_bytes()
    assert len(raw) == 248 and hashlib.sha256(raw).hexdigest() == SOURCE_SHA
    # Frozen rows from reform_goal_contract.goal_output, with exact numeric
    # values and local millisecond datetime representation required by CLI.
    rows = [
        ["2024-02-29T23:59:58.000", 1, 3.545, True],
        ["2000-01-01T00:00:00.000", 2, -42.2, False],
        [None, 3, None, None],
        [None, 4, None, None],
        [None, 5, None, None],
        ["1899-12-30T00:00:00.000", 6, 0.0, False],
    ]
    columns = [
        dict(name="Timestamp", label="Время", type="datetime"),
        dict(name="Id", label="Id", type="integer"),
        dict(name="NetAmount", label="Сумма", type="real"),
        dict(name="Enabled", label="Значение", type="boolean"),
    ]
    return dict(package_path="{{PACKAGE_PATH}}",
                nodes=[dict(type="imports.text"), dict(type="transform.reform_columns")],
                outputs=[dict(output_node_type="transform.reform_columns", output_node_label="Очистка",
                              columns=columns, rows=[dict(zip([c["name"] for c in columns], r)) for r in rows])])


if __name__ == "__main__":
    (ROOT / "expected.json").write_text(json.dumps(expected(), ensure_ascii=False, indent=2) + "\n")
