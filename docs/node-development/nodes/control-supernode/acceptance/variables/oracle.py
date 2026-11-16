"""Independent integer arithmetic for the single original body, without a Loop."""
import argparse
import json
from pathlib import Path


def expected():
    page, limit = 99, 2
    return {"package_path": "{{PACKAGE_PATH}}", "nodes": [{"type": "control.supernode"}],
            "supernode_variables": [{"name": "Page", "type": "integer", "value": page},
                                    {"name": "Limit", "type": "integer", "value": limit}],
            "outputs": [{"output_node_type": "control.supernode", "output_port": 0,
                         "ordered": True, "column_order": "exact",
                         "columns": [{"name": name, "type": "integer", "label_any": True}
                                     for name in ["Skip", "Page", "Limit"]],
                         "rows": [{"Skip": page * limit, "Page": page, "Limit": limit}]}]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        assert json.loads(Path(__file__).with_name("expected.json").read_text()) == expected()
        print("expected.json: OK")
    else:
        print(json.dumps(expected(), ensure_ascii=False, indent=2))
