#!/usr/bin/env python3
"""Inventory old private runs without copying transcripts or promoting old PASS."""
import argparse
import hashlib
import json
from pathlib import Path
import re


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit_entry(path, root):
    report = json.loads(path.read_text())
    rows = []
    for name, expected in report.get("inputs", {}).items():
        relative = Path(name)
        target = root / relative
        safe = not relative.is_absolute() and ".." not in relative.parts and target.resolve().is_relative_to(root.resolve())
        available = safe and target.is_file() and not target.is_symlink()
        actual = sha(target) if available else None
        rows.append({"path": name if safe else "[unsafe-input-path]", "available": bool(available),
                     "expected_sha256": expected if re.fullmatch(r"[a-f0-9]{64}", str(expected)) else None,
                     "actual_sha256": actual, "matches": available and actual == expected})
    assertions = report.get("assertions", [])
    return {"path": path.name, "sha256": sha(path), "kind": report.get("kind"),
            "historical_all_assertions_passed": report.get("all_assertions_passed"),
            "historical_assertions": {"passed": sum(c.get("passed") is True for c in assertions), "total": len(assertions)},
            "recorded_inputs": rows,
            "recorded_input_integrity": "verified" if rows and all(row["matches"] for row in rows) else "unverified",
            "revalidated_with_current_auditor": False}


def run_entry(root):
    result = {"run_id": root.name, "availability": "unavailable", "audits": []}
    request_path = root / "request.json"
    if not request_path.is_file() or request_path.is_symlink():
        return result
    request = json.loads(request_path.read_text())
    result.update(availability="request_available", request_sha256=sha(request_path),
                  runtime_revision=request.get("runtime_source_pin", {}).get("client_revision"),
                  manifest_sha256=request.get("manifest_sha256"), fault_variant=request.get("fault_injection"),
                  bundle_id=(request.get("server_built_bundle") or {}).get("id"))
    path = root / "result.json"
    if path.is_file() and not path.is_symlink():
        old = json.loads(path.read_text())
        result.update(availability="result_available", result_sha256=sha(path),
                      process_returncode=old.get("returncode"), timed_out=old.get("timed_out"), model_match=old.get("model_match"))
    # No SQLite, model prose, system prompt, log, screenshot or profile is copied.
    for path in sorted(root.glob("independent*audit.json")):
        if path.is_symlink():
            continue
        try:
            result["audits"].append(audit_entry(path, root))
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            result["audits"].append({"path": path.name, "recorded_input_integrity": "unavailable"})
    return result


def inventory(root):
    rows = []
    for path in sorted(root.iterdir()):
        if not path.is_dir() or path.is_symlink():
            continue
        try:
            rows.append(run_entry(path))
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            rows.append({"run_id": path.name, "availability": "unreadable", "audits": []})
    audits = [a for row in rows for a in row["audits"]]
    return {"schema_version": 1, "kind": "legacy_evidence_availability_index", "storage": str(root.resolve()),
            "runs": rows, "run_directories": len(rows), "audit_reports": len(audits),
            "audits_with_verified_recorded_inputs": sum(a["recorded_input_integrity"] == "verified" for a in audits),
            "limitations": ["Historical claims and their recorded inputs only; no new live acceptance or production admission.",
                            "An old auditor may have read unlisted SQLite or bundle files; their integrity is not implied.",
                            "Unavailable or altered evidence remains unverified; model prose never reconstructs missing proof.",
                            "Different runtime pins and variants are not combined into a current release PASS."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = inventory(args.root)
    with args.output.open("x") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"run_directories": report["run_directories"], "audit_reports": report["audit_reports"],
                      "audits_with_verified_recorded_inputs": report["audits_with_verified_recorded_inputs"],
                      "sha256": sha(args.output)}))


if __name__ == "__main__":
    main()
