"""One parameterless HTTP GET: frozen service status, no Loginom/network imports."""
import argparse
import json
from pathlib import Path


def expected():
    return {
        "package_path": "{{PACKAGE_PATH}}",
        "nodes": [{"type": "integration.rest_request"}, {"type": "exports.text"}],
        "outputs": [{
            "output_node_type": "export_input",
            "export_destination": "plain-get.csv",
            "ordered": True,
            "columns": [{"name": name, "type": "integer", "label_any": True}
                        for name in ["ErrorCode", "HttpStatusCode"]],
            "rows": [{"ErrorCode": 0, "HttpStatusCode": 200}],
        }],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = json.dumps(expected(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        assert Path(__file__).with_name("expected.json").read_text() == content
    else:
        print(content, end="")
