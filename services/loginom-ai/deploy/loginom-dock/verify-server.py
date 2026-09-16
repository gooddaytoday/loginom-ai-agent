#!/usr/bin/env python3
"""Check the deployed public API and MCP without printing credentials."""

import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    client = json.loads(Path("/opt/loginom-dock/config/client.json").read_text())
    origin = client["endpoint"].removesuffix("/mcp")
    key = client["api_key"]

    def request(path, body=None, credential=key, expected=200):
        headers = {"Accept": "application/json, text/event-stream"}
        if credential:
            headers["Authorization"] = "Bearer " + credential
        if body is not None:
            headers["Content-Type"] = "application/json"
        req = Request(
            origin + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers=headers,
        )
        try:
            with urlopen(req, timeout=60) as response:
                status, raw = response.status, response.read().decode()
        except HTTPError as error:
            status, raw = error.code, ""
        assert status == expected, f"{path}: expected {expected}, got {status}"
        if not raw:
            return None
        if raw.startswith("event:"):
            raw = next(line[6:] for line in raw.splitlines() if line.startswith("data: "))
        return json.loads(raw)

    identity = request("/health")
    assert identity["healthy"] is True
    assert (identity["account_id"], identity["user_id"], identity["role"]) == (
        "loginom-dock", "loginom-dock", "user"
    ), "Unexpected shared client identity or privileges"
    request("/ready", credential=None)
    request("/api/v1/admin/accounts", expected=403)
    request("/api/v1/fs/ls?uri=viking://resources", credential=None, expected=401)
    request("/api/v1/fs/ls?uri=viking://resources", credential="invalid-dock-check", expected=401)
    initialize = {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26", "capabilities": {},
            "clientInfo": {"name": "loginom-dock-deployment-check", "version": "1"},
        },
    }
    request("/mcp", initialize, credential=None, expected=401)
    initialized = request("/mcp", initialize)
    assert initialized["result"]["serverInfo"]["name"] == "loginom-dock"
    catalog = request("/mcp", {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    names = {tool["name"] for tool in catalog["result"]["tools"]}
    assert {"find", "search", "read", "list", "tree", "grep", "glob"} <= names
    print(json.dumps({
        "https": "ok", "readiness": "ok", "client_role": identity["role"],
        "authentication": "ok", "mcp_tools": len(names), "version": identity["version"],
    }))


if __name__ == "__main__":
    main()
