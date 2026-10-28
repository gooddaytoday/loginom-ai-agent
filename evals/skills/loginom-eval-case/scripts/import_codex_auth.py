#!/usr/bin/env python3
"""Переносит действующую сессию Codex CLI в профиль агента и обновляет токен Codex. Значения токенов не печатает."""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from settings import load

CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"


def main():
    settings = load()
    codex_path = Path.home() / ".codex" / "auth.json"
    profile_auth = Path(settings["PROFILE"]) / "data" / "auth.json"
    if not codex_path.is_file():
        raise SystemExit("нет ~/.codex/auth.json")
    if not profile_auth.parent.is_dir():
        raise SystemExit("профиль CLI ещё не создан: сначала выполните providers list в этом профиле")
    codex = json.loads(codex_path.read_text(encoding="utf-8"))
    payload = refresh(codex["tokens"]["refresh_token"])
    access = payload["access_token"]
    new_refresh = payload.get("refresh_token") or codex["tokens"]["refresh_token"]
    id_token = payload.get("id_token") or codex["tokens"].get("id_token")
    account_id = claims_account(id_token or access) or codex["tokens"].get("account_id")
    if not account_id:
        raise SystemExit("в токене нет идентификатора учётной записи")
    current = json.loads(profile_auth.read_text(encoding="utf-8")) if profile_auth.is_file() else {}
    current["openai"] = {
        "type": "oauth",
        "refresh": new_refresh,
        "access": access,
        "expires": int(time.time() * 1000) + int(payload.get("expires_in") or 3600) * 1000,
        "accountId": account_id,
    }
    profile_auth.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")
    os.chmod(profile_auth, 0o600)
    codex["tokens"]["access_token"] = access
    codex["tokens"]["refresh_token"] = new_refresh
    if id_token:
        codex["tokens"]["id_token"] = id_token
    codex["tokens"]["account_id"] = account_id
    codex["last_refresh"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    codex_path.write_text(json.dumps(codex, indent=2) + "\n", encoding="utf-8")
    os.chmod(codex_path, 0o600)
    print("imported openai oauth; refresh token rotated:", "refresh_token" in payload)
    return 0


def refresh(token):
    body = urllib.parse.urlencode({"grant_type": "refresh_token", "refresh_token": token, "client_id": CLIENT_ID}).encode()
    request = urllib.request.Request(
        "https://auth.openai.com/oauth/token",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        code = "unparsed"
        try:
            parsed = json.loads(error.read().decode("utf-8", "replace")).get("error")
            code = parsed.get("code") if isinstance(parsed, dict) else parsed
        except json.JSONDecodeError:
            pass
        raise SystemExit(f"refresh failed HTTP {error.code} {code}")


def claims_account(token):
    part = token.split(".")[1]
    part += "=" * (-len(part) % 4)
    data = json.loads(base64.urlsafe_b64decode(part))
    auth = data.get("https://api.openai.com/auth") or {}
    return data.get("chatgpt_account_id") or auth.get("chatgpt_account_id")


if __name__ == "__main__":
    sys.exit(main())
