"""Calculate exact rows from the admitted offline JSON, independently of Dock."""
import csv
import json
import sys

kind = CASE.name.removeprefix("bh-1381-")
csv.field_size_limit(1 << 20)
with (CASE / "data" / f"{kind}.csv").open(encoding="utf-8", newline="") as source:
    header, document = csv.reader(source)
assert header == ["Document"] and len(document) == 1
payload = json.loads(document[0])

if kind == "flat":
    assert len(payload) == 257
    names = ["id"]
    values = [[record["id"]] for record in payload]
elif kind == "products":
    assert len(payload["products"]) == payload["total"] == payload["limit"] and payload["skip"] == 0
    names = ["id"]
    values = [[record["id"]] for record in payload["products"]]
else:
    carts = payload["carts"]
    assert len(carts) == payload["total"] == payload["limit"] and payload["skip"] == 0
    assert len({cart["id"] for cart in carts}) == payload["total"]
    names = ["Root_carts_id", "Root_carts_products_id", "Root_carts_products_quantity"]
    values = [[cart["id"], product["id"], product["quantity"]] for cart in carts for product in cart["products"]]
    if kind == "minimal":
        assert values == [[1, 162, 4], [1, 113, 3]]

node_types = ["imports.text", "trees.from_json", "trees.to_table", "exports.text"]
ids = ["source", "tree", "table", "csv"]
expected = {
    "nodes": [{"type": node_type} for node_type in node_types],
    "graph": {
        "exact": True,
        "nodes": [
            {"id": "variables", "type": "variables.user"},
            *[{"id": node_id, "type": node_type} for node_id, node_type in zip(ids, node_types)],
        ],
        "links": [
            {"source": upstream, "output": 0, "target": downstream, "input": 0}
            for upstream, downstream in zip(ids, ids[1:])
        ],
    },
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": "result.csv",
        "ordered": True,
        "column_order": "exact",
        "columns": [{"name": name, "type": "integer", "label_any": True} for name in names],
        "rows": [dict(zip(names, row)) for row in values],
    }],
}
path = CASE / "expected.json"
text = json.dumps(expected, ensure_ascii=False, indent=2) + "\n"
if "--check" in sys.argv:
    assert path.read_text(encoding="utf-8") == text, "oracle drift"
else:
    path.write_text(text, encoding="utf-8")
