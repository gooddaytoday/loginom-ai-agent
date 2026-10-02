#!/usr/bin/env python3
"""Готовит профиль CLI одного слота: авторизация модели, список моделей, подключение к Loginom.

Запускается на хосте от loginom-worker (см. setup-slot.sh). Пароли и ключи не печатает.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

BASE = Path("/opt/loginom-worker")
CLI_HOME = BASE / ".local/share/loginom-ai-agent-cli/0.1.17-prod"
HARNESS = BASE / "cli-v017-20260926"
BWRAP = "/usr/local/libexec/loginom-swarm/bwrap"
LOGINOM_URL = "http://logi-test-plan.bg.local/app/?node-pipeline=1"
MODEL = "openai/gpt-6-sol"


def display_of(slot):
    return str(11 + ord(slot) - ord("a"))


def run(slot, args, browser=False, stdin=None, timeout=180):
    slot_root = BASE / "slots" / slot
    profile = slot_root / "profile"
    argv = [
        BWRAP, "--die-with-parent", "--new-session", "--unshare-all", "--share-net", "--cap-drop", "ALL",
        "--ro-bind", "/usr", "/usr",
        "--symlink", "usr/bin", "/bin", "--symlink", "usr/sbin", "/sbin",
        "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64",
        "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--tmpfs", "/run",
        "--dir", "/etc", "--dir", "/dev/shm", "--tmpfs", "/dev/shm",
        "--ro-bind", "/etc/ssl", "/etc/ssl",
        "--ro-bind", "/etc/ca-certificates", "/etc/ca-certificates",
        "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
        "--ro-bind", "/etc/hosts", "/etc/hosts",
        "--ro-bind", "/etc/nsswitch.conf", "/etc/nsswitch.conf",
        "--ro-bind", "/etc/passwd", "/etc/passwd",
        "--ro-bind", "/etc/group", "/etc/group",
        "--ro-bind", "/etc/fonts", "/etc/fonts",
        "--ro-bind", "/etc/alternatives/awk", "/etc/alternatives/awk",
        "--ro-bind", str(CLI_HOME), str(CLI_HOME),
        "--ro-bind", str(HARNESS), str(HARNESS),
        "--bind", str(slot_root), str(slot_root),
        "--chdir", str(profile), "--",
    ]
    if browser:
        argv += ["/usr/bin/xvfb-run", "-n", display_of(slot), "-s", "-screen 0 1920x1200x24 -nolisten tcp",
                 "/usr/bin/python3", str(HARNESS / "headed-entry.py")]
    argv += [str(CLI_HOME / "bin/loginom-ai-agent-cli"), *args]
    observer = json.loads((HARNESS / "acceptance-headed/observer.json").read_text())
    env = dict(observer["env"])
    env["HOME"] = str(slot_root)
    env["TMPDIR"] = "/tmp"
    env["LOGINOM_AI_AGENT_CLI_PROFILE"] = str(profile)
    return subprocess.run(argv, env=env, input=stdin, capture_output=True, text=True, timeout=timeout)


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--slot", required=True)
    args = parser.parse_args()
    slot = args.slot
    if len(slot) != 1 or not "a" <= slot <= "z":
        fail("slot должен быть одной буквой a-z")

    accounts = json.loads((BASE / "slots/accounts.json").read_text())
    account = accounts["slots"].get(slot)
    if not account:
        fail(f"в accounts.json нет записи для слота {slot}")

    slot_root = BASE / "slots" / slot
    profile = slot_root / "profile"
    for name in ("attempts", "candidates", "profile"):
        (slot_root / name).mkdir(parents=True, exist_ok=True, mode=0o700)
    (slot_root / "display").write_text(f":{display_of(slot)}\n")
    (slot_root / "display").chmod(0o600)

    for stale in (profile / ".writer", profile / "loginom/connection/pending.json"):
        subprocess.run(["rm", "-rf", str(stale)], check=False)

    # Первый запуск CLI создаёт структуру профиля.
    if not (profile / "data/auth.json").exists():
        status = run(slot, ["loginom", "status", "--format", "json"], timeout=120)
        if status.returncode:
            fail(f"status завершился кодом {status.returncode}")
        dest = profile / "data/auth.json"
        dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        dest.write_bytes((HARNESS / "profile-clean/data/auth.json").read_bytes())
        dest.chmod(0o600)

    listed = run(slot, ["models", "openai"], timeout=60)
    if listed.returncode or MODEL not in listed.stdout:
        refresh = run(slot, ["models", "openai", "--refresh"], timeout=180)
        if refresh.returncode:
            fail(f"обновление моделей завершилось кодом {refresh.returncode}")
        listed = run(slot, ["models", "openai"], timeout=60)
    if listed.returncode or MODEL not in listed.stdout:
        fail(f"модель {MODEL} недоступна в профиле слота {slot}")

    # Сохранённое подключение применяется при старте раньше setup, поэтому убираем его.
    for stale in ("loginom/connection/connection.json", "loginom/connection/pending.json",
                  "loginom/connection/generations", "loginom/runtime", "state/locks", "cache/tmp"):
        subprocess.run(["rm", "-rf", str(profile / stale)], check=False)

    payload = json.dumps({"url": LOGINOM_URL, "username": account["username"],
                          "apiKey": accounts["api_key"], "password": account["password"]})
    setup = run(slot, ["loginom", "setup", "--stdin-json", "--format", "json"], browser=True, stdin=payload, timeout=240)
    if setup.returncode:
        fail(f"setup завершился кодом {setup.returncode}")
    check = run(slot, ["loginom", "check", "--format", "json"], browser=True, timeout=240)
    if check.returncode:
        fail(f"check завершился кодом {check.returncode}")
    print(f"слот {slot}: профиль готов, пользователь {account['username']}, дисплей :{display_of(slot)}")


if __name__ == "__main__":
    main()
