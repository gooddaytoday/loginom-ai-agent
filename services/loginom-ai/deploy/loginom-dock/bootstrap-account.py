#!/usr/bin/env python3
"""Provision the shared Dock identity through the native administrative API.

Run on the Dock server. Keys are written to protected files, never printed.
Existing accounts/keys are not rotated by this bootstrap.
"""

import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


CONFIG_DIR = Path("/opt/loginom-dock/config")
ACCOUNT = "loginom-dock"
USER = "loginom-dock"


def save_credential(path, value):
    temporary = path.with_suffix(path.suffix + ".new")
    with temporary.open("w", encoding="utf-8") as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream, indent=2)
        stream.write("\n")
    temporary.replace(path)


def main():
    os.umask(0o077)
    config = json.loads((CONFIG_DIR / "ov.conf").read_text())
    root_key = config["server"]["root_api_key"]

    def api(path, body=None):
        request = Request(
            "http://127.0.0.1:1933/api/v1/admin" + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={
                "Authorization": "Bearer " + root_key,
                "Content-Type": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=60) as response:
                return json.load(response)["result"]
        except HTTPError as error:
            raise RuntimeError(f"Administrative API {path}: HTTP {error.code}") from None

    accounts = api("/accounts?name=" + ACCOUNT)
    if not accounts:
        result = api(
            "/accounts",
            {
                "account_id": ACCOUNT,
                "admin_user_id": "dock-admin",
                "user_config": {
                    "memory_policy": {
                        "self": {"enabled": False},
                        "peer": {"enabled": False},
                        "working_memory": {"enabled": False},
                    }
                },
            },
        )
        save_credential(CONFIG_DIR / "admin.json", result)

    users = api(f"/accounts/{ACCOUNT}/users?name={USER}")
    if users:
        if not (CONFIG_DIR / "client.json").is_file():
            raise RuntimeError("Dock user already exists but client.json is absent; no key was rotated")
        print("Dock account and client credential already exist; unchanged")
        return

    result = api(
        f"/accounts/{ACCOUNT}/users",
        {
            "user_id": USER,
            "role": "user",
            "user_config": {
                "memory_policy": {
                    "memory_types": ["experiences", "events"],
                    "working_memory": {"enabled": False},
                }
            },
        },
    )
    save_credential(
        CONFIG_DIR / "client.json",
        {
            "endpoint": config["server"]["public_base_url"].rstrip("/") + "/mcp",
            "account": ACCOUNT,
            "user": USER,
            "api_key": result["user_key"],
        },
    )
    print("Dock account created; client has user role; credentials saved with mode 0600")


if __name__ == "__main__":
    main()
