#!/usr/bin/env python3
"""Забирает артефакты попытки из хранилища Loginom теми же правилами, что eval-harness.

Режимы: без флага — пакет, файлы результата и сверка входов; --park — отложить файлы
результата перед повторным выполнением; --rerun — забрать результат повторного выполнения.
"""
import datetime
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from settings import load, storage_name


def main(attempt_dir, mode):
    attempt = Path(attempt_dir)
    settings = load()
    name = (attempt / "name").read_text(encoding="utf-8").strip()
    entries = list_storage(settings)
    results = sorted(entry for entry in entries if is_result(entry, name))
    if mode == "--park":
        return park(settings, name, results)
    if mode == "--rerun":
        return rerun(settings, attempt, results)
    return collect(settings, attempt, name, entries, results)


def collect(settings, attempt, name, entries, results):
    case = Path((attempt / "case").read_text(encoding="utf-8").strip())
    started = datetime.datetime.fromisoformat((attempt / "started-at").read_text(encoding="utf-8").strip()).timestamp()
    receipts = []
    summary_path = attempt / "summary.json"
    if summary_path.is_file():
        receipts = json.loads(summary_path.read_text(encoding="utf-8")).get("saveReceipts") or []
    chosen = choose_package(settings["LOGINOM_USERNAME"], entries, receipts, name, started)
    record = {"package": None, "origin": None, "ambiguous": [], "results": [], "inputs": [], "input_matches_dataset": False}
    if chosen:
        package = attempt / "package.lgp"
        copy_out(settings, chosen["name"], package)
        local_results = []
        (attempt / "results").mkdir(exist_ok=True)
        for result in results:
            target = attempt / "results" / result
            copy_out(settings, result, target)
            local_results.append(str(target))
        inputs = check_inputs(settings, case, package)
        record.update(
            package=f"/{settings['LOGINOM_USERNAME']}/{chosen['name']}",
            origin=chosen["origin"],
            ambiguous=chosen["ambiguous"],
            results=local_results,
            inputs=inputs,
            input_matches_dataset=all(item["matches"] for item in inputs),
        )
    write_record(attempt, record)
    print(json.dumps({key: record[key] for key in ("package", "origin", "ambiguous", "results", "input_matches_dataset")}, ensure_ascii=False))
    return 0 if record["package"] and record["input_matches_dataset"] else 1


def park(settings, name, results):
    storage = settings["LOGINOM_STORAGE"].rstrip("/")
    for result in results:
        target = f"{name}-cli{result[len(name):]}"
        subprocess.run(["docker", "exec", settings["LOGINOM_CONTAINER"], "mv", f"{storage}/{result}", f"{storage}/{target}"], check=True)
        print(f"{result} -> {target}")
    return 0


def rerun(settings, attempt, results):
    record = json.loads((attempt / "storage.json").read_text(encoding="utf-8"))
    (attempt / "rerun").mkdir(exist_ok=True)
    local = []
    for result in results:
        target = attempt / "rerun" / result
        copy_out(settings, result, target)
        local.append(str(target))
    record["rerun_results"] = local
    write_record(attempt, record)
    print(json.dumps({"rerun_results": local}, ensure_ascii=False))
    return 0 if local else 1


def choose_package(username, entries, receipts, name, started):
    from_receipts = [storage_name(username, receipt) for receipt in receipts]
    existing = [candidate for candidate in from_receipts if candidate in entries]
    if existing:
        return {"origin": "receipt", "name": existing[-1], "ambiguous": []}
    if f"{name}.lgp" in entries:
        return {"origin": "instructed", "name": f"{name}.lgp", "ambiguous": []}
    fresh = sorted(
        (entry for entry, mtime in entries.items() if entry.endswith(".lgp") and mtime > started and belongs_to_attempt(entry, name)),
        key=lambda entry: -entries[entry],
    )
    if not fresh:
        return None
    return {"origin": "scan", "name": fresh[0], "ambiguous": fresh[1:]}


def belongs_to_attempt(entry, name):
    # резервный поиск harness не берёт пакеты другого запуска или пользователя
    return "/" not in entry and (entry.startswith(f"{name}.") or entry.startswith(f"{name}-"))


def is_result(entry, name):
    return entry.startswith(f"{name}.") and not entry.endswith(".lgp") and not entry.endswith(".~lgp")


def check_inputs(settings, case, package):
    task = json.loads((case / "task.json").read_text(encoding="utf-8"))
    with zipfile.ZipFile(package) as archive:
        units = sorted(name for name in archive.namelist() if re.fullmatch(r"Unit_\d+/Unit\.xml", name))
        text = "".join(archive.read(unit).decode("utf-8-sig") for unit in units)
    referenced = sorted(set(re.findall(r'FileName="([^"]+)"', text)))
    report = []
    for relative in task.get("inputs", []):
        basename = Path(relative).name
        matches = [full for full in referenced if Path(full).name.endswith(basename)]
        if len(matches) != 1:
            report.append({"input": relative, "storage": matches, "matches": False})
            continue
        local = package.parent / f"storage-input-{basename}"
        copy_out(settings, storage_name(settings["LOGINOM_USERNAME"], matches[0]), local)
        same = local.is_file() and digest(local) == digest(case / relative)
        report.append({"input": relative, "storage": matches[0], "matches": same})
    return report


def list_storage(settings):
    listed = subprocess.run(
        ["docker", "exec", settings["LOGINOM_CONTAINER"], "find", settings["LOGINOM_STORAGE"], "-maxdepth", "1", "-type", "f", "-printf", "%f\t%T@\n"],
        capture_output=True,
        text=True,
    )
    if listed.returncode != 0:
        raise SystemExit(f"не удалось прочитать хранилище: {listed.stderr.strip()}")
    entries = {}
    for line in listed.stdout.splitlines():
        entry, _, seconds = line.partition("\t")
        if entry:
            entries[entry] = float(seconds or 0)
    return entries


def copy_out(settings, entry, target):
    source = f"{settings['LOGINOM_CONTAINER']}:{settings['LOGINOM_STORAGE'].rstrip('/')}/{entry}"
    completed = subprocess.run(["docker", "cp", source, str(target)], capture_output=True, text=True)
    if completed.returncode != 0:
        raise SystemExit(f"docker cp {entry}: {completed.stderr.strip()}")


def write_record(attempt, record):
    (attempt / "storage.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[2] not in ("--park", "--rerun")):
        raise SystemExit("usage: collect_artifacts.py <attempt_dir> [--park|--rerun]")
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None))
