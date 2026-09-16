#!/usr/bin/env python3
"""Index every acceptance attempt, verifying audit input hashes before PASS."""
import argparse
import hashlib
import json
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def entry(run):
    request_path = run / "request.json"
    if not request_path.is_file():
        return {"run_id": run.name, "outcome": "unavailable", "reason": "request_missing"}
    request = json.loads(request_path.read_text())
    result = {"run_id": run.name, "goal_id": request.get("goal_id"),
              "runtime_revision": request.get("runtime_source_pin", {}).get("client_revision"),
              "manifest_sha256": request.get("manifest_sha256"), "outcome": "pending_audit", "artifacts": []}
    artifacts = ("request.json", "scenario.txt", "attempt.json", "evidence.json", "audit.json")
    for name in artifacts:
        path = run / name
        available = path.is_file() and not path.is_symlink()
        result["artifacts"].append({"path": name, "available": available, "sha256": digest(path) if available else None})
    attempt = run / "attempt.json"
    if not attempt.is_file():
        result["outcome"] = "incomplete_attempt"
        return result
    state = json.loads(attempt.read_text())
    result["model_started"] = state.get("model_started")
    if state.get("status") != "EXPORTED_PENDING_AUDIT":
        result["outcome"] = "failed_attempt"
        return result
    audit_path = run / "audit.json"
    if not audit_path.is_file():
        return result
    report = json.loads(audit_path.read_text())
    required = {"request.json", "scenario.txt", "evidence.json"}
    assertions = report.get("assertions", [])
    intact = set(report.get("inputs", {})) == required and all(
        (run / name).is_file() and not (run / name).is_symlink()
        and digest(run / name) == report["inputs"][name] for name in required)
    intact = intact and report.get("auditor_sha256") == request.get("harness_inputs", {}).get("audit.py")
    intact = intact and request.get("run_id") == state.get("run_id") == run.name
    result["outcome"] = ("pass" if report.get("all_assertions_passed") is True and assertions
                         and all(a.get("passed") is True for a in assertions) else "fail") if intact else "invalid_evidence"
    return result


def index(root):
    entries = []
    for run in sorted(root.iterdir()):
        if not run.is_dir() or run.is_symlink():
            continue
        try:
            entries.append(entry(run))
        except (OSError, ValueError, TypeError, KeyError):
            entries.append({"run_id": run.name, "outcome": "unavailable", "reason": "malformed_or_unreadable"})
    return {"schema_version": 1, "kind": "local_acceptance_evidence_index", "runs": entries,
            "storage": str(root.resolve()), "attempts": len(entries),
            "passed": sum(e["outcome"] == "pass" for e in entries),
            "limitation": "Local evidence location must be accessible to reverify. This is not publication/admission or proof of prior private runs."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = index(args.root)
    with args.output.open("x") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"attempts": report["attempts"], "passed": report["passed"], "sha256": digest(args.output)}))


if __name__ == "__main__":
    main()
