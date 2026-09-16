#!/usr/bin/env python3
"""Stage an immutable executor catalog or activate one verified production release."""

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = "viking://resources/loginom-dock/catalogs/executor-preview"
SOURCE_MANIFEST = "viking://resources/loginom-dock/sources/e2e-tests/.source-manifest.json"
FILES = ("actions.json", "selectors.json", "source-index.json")
EXECUTOR_PROFILE = json.loads((Path(__file__).resolve().parents[4] / "packages/loginom-runtime/executor/capability-abi.json").read_text())
CHECKS = ("node_add", "link_create_standard", "link_create_input_add", "package_save_as",
          "reopen", "negative", "ambiguous", "cleanup", "agent_partial_link_recovery",
          "agent_ui_recovery", "transport_receipt_recovery", "node_configure_text_import")
SHA256 = re.compile(r"[a-f0-9]{64}\Z")


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def revision_tuple(value):
    require(isinstance(value, str) and re.fullmatch(r"\d+\.\d+\.\d+", value),
            "Executor revision must be numeric semver")
    parts = tuple(map(int, value.split(".")))
    require(all(part <= 9007199254740991 for part in parts), "Executor revision components are too large")
    return parts


def validate_acceptance(value, manifest, manifest_sha256):
    require(isinstance(value, dict), "Replay acceptance must be an object")
    require(set(value) == {"schema_version", "status", "manifest_sha256", "runtime", "target", "agent",
                           "checks", "evidence_uri", "evidence_sha256", "recorded_at"}, "Replay acceptance fields are invalid")
    require(value["schema_version"] == 1 and value["status"] == "PASSED", "Replay acceptance has not passed")
    require(value["manifest_sha256"] == manifest_sha256, "Replay acceptance manifest digest mismatch")
    profile = manifest["compatibility"]
    require(isinstance(profile.get("loginom_build"), str) and bool(profile["loginom_build"].strip()),
            "Production admission requires an exact Loginom build in the tested manifest")
    require(value["target"] == profile, "Replay acceptance target mismatch")
    runtime = value["runtime"]
    require(isinstance(runtime, dict) and set(runtime) == {"clientRevision", "playwright", "chromiumRevision", "executorRevision", "capabilityAbi"},
            "Replay acceptance runtime fields are invalid")
    require(isinstance(runtime["clientRevision"], str) and SHA256.fullmatch(runtime["clientRevision"]), "Replay runtime digest is invalid")
    require(all(isinstance(runtime[key], str) and runtime[key].strip() for key in ("playwright", "chromiumRevision")), "Replay browser revisions are missing")
    require(runtime["executorRevision"] == EXECUTOR_PROFILE["executor_revision"]
            and runtime["capabilityAbi"] == EXECUTOR_PROFILE["abi"], "Replay executor identity mismatch")
    require(value["agent"] == {"name": "hermes", "provider": "openai-codex", "model": "gpt-5.6-sol", "reasoning_effort": "low"},
            "Acceptance requires Hermes with ChatGPT subscription, GPT-5.6 Sol and low reasoning")
    require(isinstance(value["checks"], dict) and set(value["checks"]) == set(CHECKS)
            and all(value["checks"][key] is True for key in CHECKS), "Replay acceptance checks are incomplete")
    require(isinstance(value["evidence_uri"], str) and value["evidence_uri"].strip(), "Replay evidence URI is missing")
    require(isinstance(value["evidence_sha256"], str) and SHA256.fullmatch(value["evidence_sha256"]), "Replay evidence digest is invalid")
    require(isinstance(value["recorded_at"], str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value["recorded_at"]),
            "Replay acceptance timestamp is invalid")
    return value


def validate_build(texts, activate=False, acceptance=None):
    documents = {name: json.loads(text) for name, text in texts.items()}
    manifest, current, index = (documents[name] for name in ("manifest.json", "current.json", "source-index.json"))
    require(manifest.get("status") == "candidate" and current.get("status") == "candidate",
            "Only immutable candidate builds may be staged or admitted")
    require(manifest.get("schema_version") == 1 and current.get("schema_version") == 1,
            "Catalog schema version is unsupported")
    require(manifest.get("capability_abi") == EXECUTOR_PROFILE["abi"]
            and revision_tuple(manifest.get("min_executor_revision")) <= revision_tuple(EXECUTOR_PROFILE["executor_revision"]),
            "Catalog executor identity is unsupported")
    require(isinstance(manifest.get("e2e_commit"), str) and re.fullmatch(r"[a-f0-9]{40}", manifest["e2e_commit"]),
            "E2E commit is invalid")
    version = manifest["catalog_version"]
    require(isinstance(version, str) and re.fullmatch(r"[0-9A-Za-z.+-]+", version), "Catalog version is invalid")
    release_root = f"{ROOT}/releases/{version}"
    require(current.get("manifest_uri") == f"{release_root}/manifest.json"
            and current.get("catalog_version") == version
            and current.get("manifest_sha256") == digest(texts["manifest.json"]), "current.json does not identify this manifest")
    require(set(manifest["files"]) == set(FILES), "Manifest file set is invalid")
    for name in FILES:
        require(manifest["files"][name] == digest(texts[name]), f"Digest mismatch for {name}")
        require(documents[name].get("catalog_version") == version and documents[name].get("e2e_commit") == manifest["e2e_commit"],
                f"Catalog identity mismatch for {name}")
    profile = manifest.get("compatibility")
    require(isinstance(profile, dict) and set(profile) == {"profile_id", "loginom_build", "platform", "browser"}, "Compatibility profile fields are invalid")
    require(isinstance(profile["profile_id"], str) and profile["profile_id"].strip()
            and profile["platform"] in ("macos", "linux", "windows") and profile["browser"] == "chromium", "Compatibility profile is invalid")
    require(profile["loginom_build"] is None or (isinstance(profile["loginom_build"], str) and profile["loginom_build"].strip()), "Loginom build is invalid")
    actions = documents["actions.json"]["actions"]
    require(bool(actions) and len({item["action_key"] for item in actions}) == len(actions), "Action keys are empty or duplicated")
    require(revision_tuple(manifest["min_executor_revision"]) == max(revision_tuple(item.get("min_executor_revision")) for item in actions),
            "Manifest minimum executor revision differs from its actions")
    if activate:
        require({item["action_key"] for item in actions} == {entry["action_key"] for entry in EXECUTOR_PROFILE["capabilities"].values()},
                "Production admission requires all three MVP actions")
    for action in actions:
        contract = EXECUTOR_PROFILE["capabilities"].get(action.get("capability"))
        require(contract is not None and action.get("action_key") == contract["action_key"]
                and action.get("effect", {}).get("kind") == contract["effect_kind"]
                and action.get("effect", {}).get("resource") == contract["effect_resource"],
                "Action does not match a local capability contract")
    selectors = {item["symbol"]: item for item in documents["selectors.json"]["selectors"]}
    require(bool(selectors) and len(selectors) == len(documents["selectors.json"]["selectors"]), "Selector keys are empty or duplicated")
    require(all(isinstance(path, str) and path.strip() and isinstance(sha, str) and SHA256.fullmatch(sha)
                for path, sha in index["source_files"].items()), "Source file digests are invalid")
    require(set(index["dependencies"]) == {item["action_key"] for item in actions}, "Action dependency keys are incomplete")
    for selector in selectors.values():
        evidence = selector["provenance"]
        require(evidence["commit"] == manifest["e2e_commit"] and index["source_files"].get(evidence["path"]) == evidence["sha256"],
                "Selector provenance differs from source index")
    for action in actions:
        key = action["action_key"]
        require(action.get("status") in ({"candidate"} if activate else {"candidate", "stale"}),
                f"Action {key} has not reached a replayable candidate state")
        dep = index["dependencies"][key]
        require(set(dep["selectors"]) == set(action["selector_symbols"]), f"Dependency {key} selector set differs from action")
        require(all(path in index["source_files"] for path in dep["files"]), f"Dependency {key} names an unknown source")
        for symbol in action["selector_symbols"]:
            require(symbol in selectors, f"Action {key} names an unknown selector")
        evidence_items = action["evidence"] + [selectors[symbol]["provenance"] for symbol in action["selector_symbols"]]
        for evidence in evidence_items:
            require(evidence["commit"] == manifest["e2e_commit"] and index["source_files"].get(evidence["path"]) == evidence["sha256"],
                    f"Action {key} evidence differs from source index")
            require(evidence["path"] in dep["files"], f"Dependency {key} omits an evidence source")
    if activate:
        validate_acceptance(acceptance, manifest, current["manifest_sha256"])
    return documents


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", required=True, type=Path)
    parser.add_argument("--admin", type=Path)
    parser.add_argument("--endpoint", default="http://127.0.0.1:1933")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--attestation", type=Path, help="passed replay attestation for the exact immutable candidate")
    parser.add_argument("--validate-only", action="store_true", help="validate local inputs without credentials or network")
    lifecycle = parser.add_mutually_exclusive_group(required=True)
    lifecycle.add_argument("--stage", action="store_true", help="write immutable candidate files without changing current.json")
    lifecycle.add_argument("--activate", action="store_true", help="admit a previously staged candidate using its exact replay attestation")
    args = parser.parse_args()
    os.umask(0o077)
    texts = {name: (args.build / name).read_text() for name in (*FILES, "manifest.json", "current.json")}
    acceptance_text = args.attestation.read_text() if args.attestation else None
    acceptance = json.loads(acceptance_text) if acceptance_text else None
    documents = validate_build(texts, activate=args.activate, acceptance=acceptance)
    if args.validate_only:
        print(json.dumps({"validated": True, "lifecycle": "activate" if args.activate else "stage"}))
        return
    require(args.admin is not None and args.report is not None, "--admin and --report are required for publication")
    key = json.loads(args.admin.read_text())["user_key"]
    manifest = documents["manifest.json"]
    current = documents["current.json"]
    index = documents["source-index.json"]
    version = manifest["catalog_version"]
    release_root = f"{ROOT}/releases/{version}"

    def request(path, data=None, method=None):
        req = Request(args.endpoint.rstrip("/") + path, data=data, method=method,
                      headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
        with urlopen(req, timeout=360) as response:
            return json.load(response)["result"]

    def read(uri):
        return request("/api/v1/content/read?" + urlencode({"uri": uri}))

    live_source = json.loads(read(SOURCE_MANIFEST))
    live_files = {item["path"]: item["sha256"] for item in live_source.get("files", [])}
    if live_source.get("commit") != manifest["e2e_commit"]:
        raise SystemExit("Imported E2E commit differs from the catalog")
    changed = [path for path, expected in index["source_files"].items() if live_files.get(path) != expected]
    if changed:
        affected = sorted(key for key, dependency in index["dependencies"].items()
                          if any(path in changed for path in dependency["files"]))
        raise SystemExit("E2E dependencies changed; rebuild candidate actions: " + ", ".join(affected))

    operations = []
    for name in (*FILES, "manifest.json"):
        uri = f"{release_root}/{name}"
        try:
            installed = read(uri)
        except HTTPError as error:
            if error.code != 404:
                raise
            if args.activate:
                raise SystemExit("Activation requires the exact previously staged candidate; release file is missing")
            operations.append({"uri": uri, "content": texts[name], "mode": "create"})
        else:
            if installed != texts[name]:
                raise SystemExit(f"Immutable catalog release collision at {uri}")
    if operations:
        request("/api/v1/content/batch-write", json.dumps({
            "root_uri": "viking://resources/loginom-dock",
            "operations": operations,
            "wait": True,
            "timeout": 300,
        }).encode(), "POST")
    # Read back all immutable bytes before admitting any new current pointer.
    for name in (*FILES, "manifest.json"):
        if read(f"{release_root}/{name}") != texts[name]:
            raise SystemExit(f"Published catalog verification failed for {name}")
    if args.activate:
        acceptance_sha256 = digest(acceptance_text)
        acceptance_uri = f"{release_root}/acceptance/{acceptance_sha256}.json"
        try:
            installed_acceptance = read(acceptance_uri)
        except HTTPError as error:
            if error.code != 404:
                raise
            request("/api/v1/content/write", json.dumps({"uri": acceptance_uri, "content": acceptance_text,
                    "mode": "create", "wait": True, "timeout": 300}).encode(), "POST")
        else:
            if installed_acceptance != acceptance_text:
                raise SystemExit("Immutable replay acceptance collision")
        if read(acceptance_uri) != acceptance_text:
            raise SystemExit("Published replay acceptance verification failed")
        current = {**current, "status": "production", "acceptance_uri": acceptance_uri,
                   "acceptance_sha256": acceptance_sha256}
        current_text = json.dumps(current, indent=2) + "\n"
        request("/api/v1/content/write", json.dumps({
            "uri": f"{ROOT}/current.json",
            "content": current_text,
            "mode": "replace",
            "wait": True,
            "timeout": 300,
        }).encode(), "POST")
    if args.activate and read(f"{ROOT}/current.json") != current_text:
        raise SystemExit("Published current.json verification failed")
    report = {
        "catalog_uri": release_root,
        "catalog_version": version,
        "manifest_sha256": current["manifest_sha256"],
        "action_catalog_sha256": manifest["files"]["actions.json"],
        "selector_catalog_sha256": manifest["files"]["selectors.json"],
        "e2e_commit": manifest["e2e_commit"],
        "staged": args.stage,
        "activated": args.activate,
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:
        raise SystemExit(f"Action catalog publication failed (HTTP {error.code})") from None
    except (ValueError, KeyError, TypeError) as error:
        raise SystemExit(f"Action catalog validation failed: {error}") from None
