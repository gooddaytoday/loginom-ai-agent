#!/usr/bin/env python3
"""Verify pinned E2E blobs and read-only UI source assertions; no E2E execution."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

WORK = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify_e2e(root, manifest):
    rows = []
    commit = manifest["source_commit"]
    for item in manifest["files"]:
        name = item["path"]
        path = root / name
        if Path(name).is_absolute() or ".." in Path(name).parts or path.is_symlink():
            raise ValueError("Unsafe E2E path")
        pinned = subprocess.check_output(["git", "show", f"{commit}:{name}"], cwd=root, stderr=subprocess.PIPE)
        actual = path.read_bytes()
        rows.append({"path": name, "pinned_sha256": sha(pinned), "working_sha256": sha(actual),
                     "passed": sha(pinned) == item["sha256"] and actual == pinned})
    return {"source_commit": commit, "files": rows, "passed": bool(rows) and all(r["passed"] for r in rows)}


def verify_ui(root, manifest):
    rows = []
    for item in manifest["files"]:
        data = (root / item["path"]).read_bytes()
        lines = data.decode().splitlines()
        assertions = [{"line": a["line"], "symbol": a["symbol"],
                       "passed": 0 < a["line"] <= len(lines) and a["symbol"] in lines[a["line"] - 1]}
                      for a in item["assertions"]]
        rows.append({"path": item["path"], "sha256": sha(data), "assertions": assertions,
                     "passed": sha(data) == item["sha256"] and all(a["passed"] for a in assertions)})
    return {"profile": manifest["profile"], "files": rows, "passed": all(r["passed"] for r in rows)}


def fetch_ui(config_path, root, manifest):
    url = urllib.parse.urlsplit(json.loads(config_path.read_text())["loginom_url"])
    if url.scheme not in {"http", "https"} or url.username or url.password:
        raise ValueError("Expected ordinary Loginom URL without embedded credentials")
    base = urllib.parse.urlunsplit((url.scheme, url.netloc, url.path.rstrip("/") + "/", "", ""))
    root.mkdir(parents=True, exist_ok=False, mode=0o700)
    for item in manifest["files"]:
        with urllib.request.urlopen(urllib.parse.urljoin(base, item["path"]), timeout=30) as response:
            data = response.read(10_000_001)
        if len(data) > 10_000_000 or sha(data) != item["sha256"]:
            raise ValueError("UI source differs from pinned bytes")
        path = root / item["path"]
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with path.open("xb") as output:
            output.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--e2e-root", type=Path, required=True)
    parser.add_argument("--ui-root", type=Path, required=True)
    parser.add_argument("--fetch-ui-from-config", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    e2e_manifest = json.loads((WORK / "sources/e2e.json").read_text())
    ui_manifest = json.loads((WORK / "sources/ui-probes.json").read_text())
    if args.fetch_ui_from_config:
        fetch_ui(args.fetch_ui_from_config, args.ui_root, ui_manifest)
    report = {"schema_version": 1, "kind": "static_source_verification", "e2e_executed": False,
              "e2e": verify_e2e(args.e2e_root, e2e_manifest), "ui": verify_ui(args.ui_root, ui_manifest)}
    with args.output.open("x") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    passed = report["e2e"]["passed"] and report["ui"]["passed"]
    print(json.dumps({"passed": passed, "e2e_files": len(report["e2e"]["files"]),
                      "ui_files": len(report["ui"]["files"]), "report_sha256": sha(args.output.read_bytes())}))
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
