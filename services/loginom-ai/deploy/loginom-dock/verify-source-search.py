#!/usr/bin/env python3
"""Live acceptance of scoped search and exact source reads, including offline use."""

import argparse
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    client = json.loads(args.client.read_text())
    base = client["endpoint"].removesuffix("/mcp")

    def request(path, body=None):
        headers = {"Authorization": "Bearer " + client["api_key"]}
        if body is not None:
            headers["Content-Type"] = "application/json"
        req = Request(
            base + path, headers=headers, data=json.dumps(body).encode() if body else None
        )
        with urlopen(req, timeout=180) as response:
            return json.load(response)["result"]

    sources = "viking://resources/loginom-dock/sources/"
    queries = [
        (
            "e2e-tests",
            "Как создать связь между выходным и входным портами узлов сценария Loginom",
            "/bg/helpers/workflow/links.ts",
        ),
        (
            "loginom-help",
            "Как вычислить новые поля таблицы по выражению",
            "/data/processors/transformation/calc/",
        ),
    ]
    report = {"search": [], "read": []}
    for name, query, expected in queries:
        result = request(
            "/api/v1/search/find", {"query": query, "target_uri": sources + name, "limit": 10}
        )
        uris = [item["uri"] for item in result["resources"]]
        assert uris and all(
            uri == sources + name or uri.startswith(sources + name + "/") for uri in uris
        ), name
        assert any(expected in uri for uri in uris[:3]), (query, uris)
        report["search"].append({"query": query, "uris": uris})

    # Identifier lookup is an exact operation. Broad semantic keywords can rank
    # examples above the central selector catalog, so verify the native grep path.
    exact = request(
        "/api/v1/search/grep",
        {
            "uri": sources + "e2e-tests/bg/selectors.ts",
            "pattern": "nodeLabel",
            "node_limit": 10,
        },
    )
    assert exact["matches"], "Exact selector lookup returned no matches"
    report["exact_lookup"] = {
        "uri": sources + "e2e-tests/bg/selectors.ts",
        "pattern": "nodeLabel",
        "count": exact["count"],
    }

    files = [
        ("ai-skills/.source/.agents/skills/loginom-automation/SKILL.md", "data-tid"),
        ("e2e-tests/bg/selectors.ts", "nodeLabel"),
        ("e2e-tests/bg/helpers/workflow/ports.ts", "portTypeParsing"),
        ("loginom-help/data/processors/transformation/calc/README.md", "Калькулятор"),
    ]
    for path, marker in files:
        content = request("/api/v1/content/read?uri=" + quote(sources + path, safe=""))
        assert marker in content, path
        report["read"].append({"path": path, "characters": len(content)})
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.output.chmod(0o600)
    print(
        json.dumps(
            {
                "scoped_searches": len(queries),
                "exact_lookups": 1,
                "full_source_reads": len(files),
                "status": "passed",
            }
        )
    )


if __name__ == "__main__":
    main()
