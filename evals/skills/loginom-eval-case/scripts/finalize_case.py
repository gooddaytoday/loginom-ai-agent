#!/usr/bin/env python3
"""Кладёт принятый пакет в кейс и пишет provenance.json, только если все проверки попытки пройдены."""
import datetime
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from settings import load


def main(case_dir, attempt_dir, scenario_url):
    case, attempt = Path(case_dir), Path(attempt_dir)
    settings = load("MODEL")
    summary = read_json(attempt / "summary.json")
    storage = read_json(attempt / "storage.json")
    check = read_json(attempt / "check.json")
    rerun = read_json(attempt / "check-rerun.json")
    gates = {
        "model_confirmed": bool(summary and summary.get("modelConfirmed")),
        "inputs_match": bool(storage and storage.get("input_matches_dataset")),
        "cli_check": bool(check and check.get("pass")),
        "rerun_check": bool(rerun and rerun.get("pass")),
    }
    failed = [gate for gate, passed in gates.items() if not passed]
    if failed:
        raise SystemExit(f"эталон не принят, не пройдено: {', '.join(failed)}")
    if Path(Path(f"{attempt}.case").read_text(encoding="utf-8").strip()).resolve() != case.resolve():
        raise SystemExit("попытка относится к другому кейсу")
    previous = read_json(case / "provenance.json")
    number = int((attempt / "name").read_text(encoding="utf-8").strip().rsplit("-", 1)[-1])
    reference = case / "reference.lgp"
    reference.write_bytes((attempt / "package.lgp").read_bytes())
    started = datetime.datetime.fromisoformat((attempt / "started-at").read_text(encoding="utf-8").strip())
    finished = datetime.datetime.fromisoformat((attempt / "finished-at").read_text(encoding="utf-8").strip())
    hint_path = attempt / "hint.txt"
    version = subprocess.run([settings["CLI"], "--version"], capture_output=True, text=True).stdout.strip()
    provenance = {
        "task_id": case.name,
        "dataset_sha256": {path.name: digest(path) for path in sorted((case / "data").glob("*"))} if (case / "data").is_dir() else {},
        "oracle_sha256": {path.name: digest(path) for path in sorted(case.glob("oracle.*")) if path.suffix != ".py"},
        "reference_sha256": digest(reference),
        "cli": {"binary": settings["CLI"], "version": version, "profile": Path(settings["PROFILE"]).name},
        "model": {"id": settings["MODEL"], "variant": settings.get("VARIANT") or None, "confirmed_in_session_db": True},
        "loginom": {
            "url": settings["LOGINOM_URL"],
            "build": settings.get("LOGINOM_BUILD"),
            "container": settings["LOGINOM_CONTAINER"],
            "package": storage["package"],
            "package_origin": storage["origin"],
            "inputs": storage["inputs"],
        },
        "attempt": {
            "number": number,
            # номера попыток идут подряд, а ранние попытки перестройки могут отсутствовать в WORK_ROOT
            "total": max(number, sum(path.is_dir() for path in attempt.parent.glob("attempt-*"))),
            "assisted": hint_path.is_file(),
            "hint": hint_path.read_text(encoding="utf-8").strip() if hint_path.is_file() else None,
            "session_id": summary.get("sessionId"),
            "skill_revision": summary.get("skillRevision"),
            "exit_code": int((attempt / "exit-code").read_text(encoding="utf-8")),
            "started_at": started.isoformat(),
            "duration_s": int((finished - started).total_seconds()),
            "tokens": summary.get("tokens"),
            "tool_calls": summary.get("counters", {}).get("toolCalls"),
            "tool_errors": summary.get("counters", {}).get("toolErrors"),
            "memory_tool_calls": summary.get("counters", {}).get("memoryToolCalls"),
            "errors": summary.get("errors"),
        },
        "checks": gates,
        "scenario_url": scenario_url,
    }
    if previous and previous.get("source_task"):
        provenance["source_task"] = previous["source_task"]
    if previous and previous.get("reference_sha256") != provenance["reference_sha256"]:
        provenance["supersedes"] = {
            "reference_sha256": previous.get("reference_sha256"),
            "attempt": (previous.get("attempt") or {}).get("number"),
        }
    elif previous and previous.get("supersedes"):
        provenance["supersedes"] = previous["supersedes"]
    (case / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(case / "provenance.json")
    return 0


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    if len(sys.argv) != 5 or sys.argv[3] != "--scenario-url":
        raise SystemExit("usage: finalize_case.py <case_dir> <attempt_dir> --scenario-url URL")
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[4]))
