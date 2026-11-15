"""Official KB permissions, with real local RagFS and vector storage."""

import hashlib
import importlib.util
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import ProxyHandler, Request, build_opener

import httpx
import pytest

from openviking.server.account_settings import (
    AccountAclSettings,
    AccountSettingsPatch,
    update_account_settings,
)
from openviking.server.identity import RequestContext, Role
from openviking_cli.exceptions import PermissionDeniedError
from openviking_cli.session.user_id import UserIdentifier
from openviking_cli.utils.config.open_viking_config import OpenVikingConfigSingleton


@pytest.fixture(autouse=True)
def isolated_config(temp_dir):
    OpenVikingConfigSingleton.reset_instance()
    OpenVikingConfigSingleton.initialize(
        config_dict={
            "storage": {
                "workspace": str(temp_dir / "data"),
                "agfs": {"backend": "local"},
                "vectordb": {"backend": "local"},
            },
            "embedding": {
                "dense": {
                    "provider": "openai",
                    "model": "test-embedder",
                    "api_key": "test-unused",
                    "dimension": 2048,
                }
            },
            "retrieval": {"enable_intent": False},
        }
    )
    yield
    OpenVikingConfigSingleton.reset_instance()


@pytest.mark.asyncio
async def test_official_knowledge_is_read_only_for_user(service):
    admin = RequestContext(user=service.user, role=Role.ADMIN)
    reader = RequestContext(user=UserIdentifier(admin.account_id, "B"), role=Role.USER)
    root = "viking://resources/loginom-dock"
    uri = f"{root}/trusted-marker.md"
    await update_account_settings(
        service.viking_fs,
        admin.account_id,
        AccountSettingsPatch(acl=AccountAclSettings(enabled=True)),
    )
    await service.viking_fs.mkdir(root, ctx=admin)
    assert await service.vikingdb_manager.upsert(
        {
            "id": "official-knowledge-root",
            "uri": root,
            "account_id": admin.account_id,
            "context_type": "resource",
            "level": 0,
            "vector": [0.1] * service.vikingdb_manager.vector_dim,
        },
        ctx=admin,
    )
    await service.fs.set_acl(root, [{"principal": "user:*", "level": "read"}], ctx=admin)
    await service.fs.write(uri, content="trusted-marker", ctx=admin, mode="create", wait=True)
    assert await service.viking_fs.read_file(uri, ctx=reader) == "trusted-marker"
    with pytest.raises(PermissionDeniedError):
        await service.fs.write(uri, content="untrusted", ctx=reader, mode="append", wait=True)

    with pytest.raises(PermissionDeniedError):
        await service.fs.rm(uri, ctx=reader)
    with pytest.raises(PermissionDeniedError):
        await service.fs.set_acl(uri, [{"principal": "user:B", "level": "manage"}], ctx=reader)
    before = await service.fs.get_acl(uri, ctx=admin)
    assert [
        entry
        for entry in before["effective_entries"]
        if entry["principal"] != f"user:{admin.user.user_id}"
    ] == [{"principal": "user:*", "level": "read"}]
    await service.fs.write(
        uri, content="trusted-marker republished", ctx=admin, mode="replace", wait=True
    )
    after = await service.fs.get_acl(uri, ctx=admin)
    assert after["effective_entries"] == before["effective_entries"]
    assert await service.viking_fs.read_file(uri, ctx=reader) == "trusted-marker republished"
    with pytest.raises(PermissionDeniedError):
        await service.fs.write(uri, content="untrusted", ctx=reader, mode="append", wait=True)


@pytest.fixture
def cloud_dock(tmp_path):
    __tracebackhide__ = True
    root_key = secrets.token_urlsafe(32)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    log_path = tmp_path / "server.log"
    with log_path.open("x") as log:
        log_path.chmod(0o600)
        child = subprocess.Popen(
            [sys.executable, "-m", "tests.server.agent_cloud_server"],
            cwd=Path(__file__).resolve().parents[2],
            stdin=subprocess.PIPE,
            stdout=log,
            stderr=log,
            text=True,
        )
        try:
            child.stdin.write(
                json.dumps(
                    {"workspace": str(tmp_path / "workspace"), "port": port, "root_key": root_key}
                )
                + "\n"
            )
            child.stdin.close()
            with httpx.Client(
                base_url=f"http://127.0.0.1:{port}", timeout=60, trust_env=False
            ) as client:
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    if child.poll() is not None:
                        pytest.fail(f"Dock child exited during startup; private log: {log_path}")
                    try:
                        health = client.get("/health", timeout=1)
                        admin = client.get(
                            "/api/v1/admin/accounts",
                            headers={"Authorization": f"Bearer {root_key}"},
                            timeout=1,
                        )
                        if health.status_code == admin.status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    time.sleep(0.1)
                else:
                    pytest.fail(f"Dock did not become authenticated-ready; private log: {log_path}")
                client.headers["Authorization"] = f"Bearer {root_key}"
                yield client
        finally:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
            for directory in (tmp_path / "workspace", tmp_path / "bootstrap"):
                if directory.exists():
                    shutil.rmtree(directory)


def api(client, key, method, path, expected=200, **kwargs):
    __tracebackhide__ = True
    try:
        response = client.request(
            method, path, headers={"Authorization": f"Bearer {key}"}, **kwargs
        )
    except httpx.HTTPError:
        pytest.fail(f"{method} {path}: HTTP transport failed", pytrace=False)
    if response.status_code != expected:
        code = response.json().get("error", {}).get("code")
        pytest.fail(
            f"{method} {path}: expected HTTP {expected}, got {response.status_code} ({code})",
            pytrace=False,
        )
    return response.json().get("result")


def test_cloud_user_over_real_network(cloud_dock, tmp_path, monkeypatch):
    __tracebackhide__ = True
    client = cloud_dock
    root_key = client.headers.pop("Authorization").removeprefix("Bearer ")
    admin_key = api(
        client,
        root_key,
        "POST",
        "/api/v1/admin/accounts",
        json={"account_id": "loginom-dock", "admin_user_id": "publisher"},
    )["user_key"]
    reader_key = api(
        client,
        admin_key,
        "POST",
        "/api/v1/admin/accounts/loginom-dock/users",
        json={"user_id": "B", "role": "user"},
    )["user_key"]
    api(client, reader_key, "GET", "/api/v1/admin/accounts/loginom-dock/users", expected=403)
    writer_key = api(
        client,
        admin_key,
        "POST",
        "/api/v1/admin/accounts/loginom-dock/users",
        json={"user_id": "A", "role": "user"},
    )["user_key"]
    legacy_key = api(
        client,
        admin_key,
        "POST",
        "/api/v1/admin/accounts/loginom-dock/users",
        json={"user_id": "loginom-dock", "role": "user"},
    )["user_key"]
    root = "viking://resources/loginom-dock"
    api(
        client,
        admin_key,
        "PATCH",
        "/api/v1/admin/accounts/loginom-dock/settings",
        json={"acl": {"enabled": True}},
    )
    api(client, admin_key, "POST", "/api/v1/fs/mkdir", json={"uri": root})
    # mkdir has no wait parameter; its directory context must exist before setting ACL.
    api(client, admin_key, "POST", "/api/v1/system/wait", json={})
    api(
        client,
        admin_key,
        "POST",
        "/api/v1/content/write",
        json={
            "uri": f"{root}/trusted-marker.md",
            "content": "trusted-marker",
            "mode": "create",
            "wait": True,
        },
    )
    api(
        client,
        admin_key,
        "PUT",
        "/api/v1/acl",
        json={"uri": root, "entries": [{"principal": "user:*", "level": "read"}]},
    )
    assert api(client, admin_key, "GET", "/api/v1/acl", params={"uri": root})[
        "effective_entries"
    ] == [{"principal": "user:*", "level": "read"}]
    for uri in ("viking://resources/hostile-marker.md", "viking://agent/skills/hostile-marker.md"):
        api(
            client,
            writer_key,
            "POST",
            "/api/v1/content/write",
            json={"uri": uri, "content": "hostile-marker", "mode": "create", "wait": True},
        )
    probe(client, reader_key)
    bootstrap_path = (
        Path(__file__).resolve().parents[2] / "deploy/loginom-dock/bootstrap-account.py"
    )
    spec = importlib.util.spec_from_file_location("agent_cloud_bootstrap", bootstrap_path)
    bootstrap = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bootstrap)
    config_dir = tmp_path / "bootstrap"
    config_dir.mkdir(mode=0o700)
    (config_dir / "ov.conf").write_text(
        json.dumps({"server": {"root_api_key": root_key, "public_base_url": str(client.base_url)}})
    )
    credential_file = config_dir / "client.json"
    credential_file.write_text(json.dumps({"api_key": legacy_key}))
    for path in config_dir.iterdir():
        path.chmod(0o600)
    monkeypatch.setattr(bootstrap, "CONFIG_DIR", config_dir)
    # Only rebind bootstrap's deployment URL; authentication and HTTP stay real.
    monkeypatch.setattr(
        bootstrap,
        "Request",
        lambda url, **kwargs: Request(
            str(client.base_url).rstrip("/") + url.removeprefix("http://127.0.0.1:1933"), **kwargs
        ),
    )
    monkeypatch.setattr(bootstrap, "urlopen", build_opener(ProxyHandler({})).open)
    before = credential_file.read_bytes()
    bootstrap.main()
    if not secrets.compare_digest(before, credential_file.read_bytes()):
        pytest.fail("Repeated bootstrap changed the legacy credential file", pytrace=False)
    probe(client, legacy_key)
    renewed_key = api(client, admin_key, "POST", "/api/v1/admin/accounts/loginom-dock/users/B/key")[
        "user_key"
    ]
    api(
        client,
        reader_key,
        "GET",
        "/api/v1/content/read",
        expected=401,
        params={"uri": f"{root}/trusted-marker.md"},
    )
    probe(client, renewed_key)
    api(
        client,
        admin_key,
        "POST",
        "/api/v1/content/write",
        json={
            "uri": f"{root}/trusted-marker.md",
            "content": "trusted-marker republished",
            "mode": "replace",
            "wait": True,
        },
    )
    for uri in (root, f"{root}/trusted-marker.md"):
        acl = api(client, admin_key, "GET", "/api/v1/acl", params={"uri": uri})
        assert [
            entry for entry in acl["effective_entries"] if entry["principal"] != "user:publisher"
        ] == [{"principal": "user:*", "level": "read"}]
    for key in (writer_key, renewed_key):
        api(
            client,
            key,
            "POST",
            "/api/v1/content/write",
            expected=403,
            json={
                "uri": f"{root}/trusted-marker.md",
                "content": "untrusted",
                "mode": "append",
                "wait": True,
            },
        )
        api(
            client,
            key,
            "DELETE",
            "/api/v1/fs",
            expected=403,
            params={"uri": f"{root}/trusted-marker.md"},
        )
        api(client, key, "PUT", "/api/v1/acl", expected=403, json={"uri": root, "entries": []})
        probe(client, key)
    probe(client, legacy_key)
    api(
        client,
        reader_key,
        "GET",
        "/api/v1/content/read",
        expected=401,
        params={"uri": f"{root}/trusted-marker.md"},
    )


def probe(client, key):
    __tracebackhide__ = True
    repo = Path(__file__).resolve().parents[4]
    node = Path(os.environ["LOGINOM_AI_AGENT_TEST_NODE"])
    release = json.loads((repo / "packages/product/loginom-release.json").read_text())
    assert hashlib.sha256(node.read_bytes()).hexdigest() == release["nodeSha256"], (
        "Pinned Node is required"
    )
    assert (
        subprocess.check_output([str(node), "--version"], text=True).strip()
        == f"v{release['nodeVersion']}"
    )
    try:
        result = subprocess.run(
            [str(node), str(repo / "packages/loginom-runtime/test/support/dock-scope-probe.mjs")],
            input=json.dumps(
                {"endpoint": str(client.base_url).rstrip("/") + "/mcp", "apiKey": key}
            ),
            text=True,
            capture_output=True,
            timeout=120,
            check=True,
        )
    except subprocess.CalledProcessError as error:
        pytest.fail(
            "Managed seven-read probe failed: " + error.stderr.replace(key, "<redacted>"),
            pytrace=False,
        )
    except subprocess.TimeoutExpired:
        pytest.fail("Managed seven-read probe exceeded 120 seconds", pytrace=False)
    assert json.loads(result.stdout) == {"ok": True, "tools": 7}
