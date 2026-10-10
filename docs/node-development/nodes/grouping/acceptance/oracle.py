"""Generate expectations from versioned CSV bytes; never consume runtime output."""
import csv
import hashlib
import io
import json
from pathlib import Path
from legacy_goal_contract import expected_grouping, goal_output

ROOT = Path(__file__).resolve().parent

def output(schema, rows, label="Итоги"):
    return {"output_node_type": "transform.group_data", "output_node_label": label,
            "columns": [{k: c[k] for k in ("name", "label", "type")} for c in schema],
            "rows": [dict(zip([c["name"] for c in schema], row)) for row in rows]}

def columns(items):
    return [dict(name=n, label=n, type=t) for n, t in items]

def measures(fields):
    return [dict(field=f, function=fn, name=f+"_"+fn, label=f+"_"+fn) for f, fn in fields]

def generate():
    source = (ROOT / "data/grouping.csv").read_bytes()
    schema, rows = goal_output(source, final=True)
    expected = {"package_path": "{{PACKAGE_PATH}}", "nodes": [{"type": "imports.text"},
                {"type": "transform.group_data"}], "outputs": [output(schema, rows)]}
    initial = output(*goal_output(source))
    matrix = {}
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
                         "columns": columns(types[path.name]), "rows": len(records)})
    for name, cols, keys, fields in specs:
        matrix[name] = {"status": "not_checked", "semantic_basis": "legacy oracle; live confirmation required before autonomous run",
                       "keys": keys, "measures": measures(fields),
                       "expected": output(*expected_grouping((ROOT/"data"/name).read_bytes(), columns(cols), keys, measures(fields)))}
    return {"expected.json": expected, "initial.json": {"outputs": [initial]},
            "fixtures/manifest.json": manifest, "fixtures/matrix.json": matrix}

if __name__ == "__main__":
    for name, content in generate().items():
        (ROOT/name).write_text(json.dumps(content, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
