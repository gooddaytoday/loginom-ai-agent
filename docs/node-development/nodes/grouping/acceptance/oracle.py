"""Generate expectations from versioned CSV bytes; never consume runtime output."""
import csv
import hashlib
import io
import json
import math
from collections import Counter
from pathlib import Path
from legacy_goal_contract import expected_grouping, goal_output

ROOT = Path(__file__).resolve().parent

def compare_output(expected, observed, *, expected_execution_id,
                   observed_execution_id, read_complete, read_fresh):
    """Compare caller-proven fresh output; never infer freshness from values.

    The caller supplies execution/read evidence from its existing receipts.
    This local oracle helper does not execute Loginom or validate all-null native
    semantics; matrix status remains not_checked until an independent live run.
    """
    if (not expected_execution_id or observed_execution_id != expected_execution_id
            or read_complete is not True or read_fresh is not True):
        raise ValueError("grouping_oracle_fresh_complete_read_required")
    if observed.get("columns") != expected["columns"]:
        raise ValueError("grouping_oracle_complete_schema")
    names = [c["name"] for c in expected["columns"]]
    def scalar(value):
        # Exact numeric values survive JSON's loss of the int/float spelling.
        # Tag booleans first: Python otherwise equates True with 1.
        if value is None:
            return ("null",)
        if isinstance(value, bool):
            return ("boolean", value)
        if isinstance(value, str):
            return ("string", value)
        if isinstance(value, int):
            return ("number", value, 1)
        if isinstance(value, float) and math.isfinite(value):
            return ("number", *value.as_integer_ratio())
        raise ValueError("grouping_oracle_scalar_type")
    def bag(rows):
        if not isinstance(rows, list) or any(not isinstance(r, dict)
                or set(r) != set(names) for r in rows):
            raise ValueError("grouping_oracle_row_schema")
        return Counter(tuple(scalar(r[n]) for n in names) for r in rows)
    if bag(observed.get("rows")) != bag(expected["rows"]):
        raise ValueError("grouping_oracle_group_multiset")
    return True

def output(schema, rows, label="Итоги"):
    return {"output_node_type": "transform.group_data", "output_node_label": label,
            "columns": [{k: c[k] for k in ("name", "label", "type")} for c in schema],
            "rows": [dict(zip([c["name"] for c in schema], row)) for row in rows]}

def columns(items):
    return [dict(name=n, label=n, type=t,
                 data_kind="Дискретный" if t == "string" else "Непрерывный") for n, t in items]

def measures(fields):
    return [dict(field=f, function=fn, name=f+"_"+fn, label=f+"_"+fn) for f, fn in fields]

def generate():
    source = (ROOT / "data/grouping.csv").read_bytes()
    schema, rows = goal_output(source)
    initial = {"outputs": [output(schema, rows)]}
    reconfiguration = output(*goal_output(source, final=True))
    expected = {"outputs": [reconfiguration]}
    matrix = {}
    generated = {}
    specs = [
        ("five-aggregates.csv", [("Region", "string"), ("Amount", "real"), ("RowID", "integer")],
         ["Region"], [("Amount", f) for f in ["sum", "count", "avg", "min", "max"]]),
        ("multiple-keys.csv", [("Region", "string"), ("Product", "string"), ("Amount", "real"), ("Quantity", "integer")],
         ["Region", "Product"], [("Amount", f) for f in ["sum", "count", "avg", "min", "max"]]+[("Quantity", "sum")]),
        ("null-empty.csv", [("Region", "string"), ("Amount", "real"), ("Text", "string")],
         ["Region"], [("Amount", f) for f in ["sum", "count", "avg", "min", "max"]]+[("Text", "count")]),
        ("header-only.csv", [("Region", "string"), ("Amount", "real"), ("Text", "string")],
         ["Region"], [("Amount", f) for f in ["sum", "count", "avg", "min", "max"]]+[("Text", "count")]),
    ]
    manifest = []
    types = {name: cols for name, cols, _, _ in specs}
    types["grouping.csv"] = [("Group", "string"), ("Segment", "string"), ("Amount", "real"), ("Other", "integer"), ("Text", "string")]
    for path in sorted((ROOT / "data").glob("*.csv")):
        raw = path.read_bytes()
        records = list(csv.DictReader(io.StringIO(raw.decode("utf-8")), delimiter=";"))
        manifest.append({"path": "data/"+path.name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                         "encoding": "UTF-8", "delimiter": ";", "text_qualifier": '\"', "null_marker": "\\N",
                         "decimal_separator": ".", "rows_to_skip": 0, "first_line_as_title": True,
                         "columns": columns(types[path.name]), "rows": len(records)})
    for name, cols, keys, fields in specs:
        case = "fixtures/"+Path(name).stem
        calculated = output(*expected_grouping((ROOT/"data"/name).read_bytes(), columns(cols), keys, measures(fields)))
        generated[case+"/expected.json"] = {"outputs": [calculated]}
        matrix[name] = {"status": "not_checked", "semantic_basis": "independent CSV calculation; native confirmation pending",
                       "input": "data/"+name, "task": case+"/task.md", "expected_path": case+"/expected.json",
                       "keys": keys, "measures": measures(fields),
                       "expected": calculated}
    matrix["editing"] = {"status": "not_checked", "input": "data/grouping.csv", "task": "task.md",
                         "initial_expected_path": "initial.json", "expected_path": "expected.json",
                         "checks": ["same_node_reconfiguration", "remove_aggregate", "add_aggregate", "ordered_keys_and_measures",
                                    "exclude_output_key", "save_reopen_execute", "preserve_unrequested_options"]}
    return {"expected.json": expected, "initial.json": initial,
            "reconfiguration.json": {"outputs": [reconfiguration]},
            "fixtures/manifest.json": manifest, "fixtures/matrix.json": matrix, **generated}

if __name__ == "__main__":
    for name, content in generate().items():
        path = ROOT/name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(content, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
