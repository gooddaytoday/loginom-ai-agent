"""Читает несекретные настройки skill и сопоставляет пути хранилища так же, как eval-harness."""
import os
from pathlib import Path

SETTINGS_PATH = Path(os.environ.get("LOGINOM_EVAL_CASE_ENV", Path.home() / ".config/loginom-eval-case/env"))
BASE = (
    "AGENT_REPO",
    "CLI",
    "PROFILE",
    "LOGINOM_URL",
    "LOGINOM_USERNAME",
    "LOGINOM_CONTAINER",
    "LOGINOM_STORAGE",
    "ATTEMPT_TIMEOUT_S",
    "WORK_ROOT",
)


def load(*extra):
    if not SETTINGS_PATH.is_file():
        raise SystemExit(f"нет файла настроек {SETTINGS_PATH}")
    values = {}
    for line in SETTINGS_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip()
    missing = [key for key in (*BASE, *extra) if not values.get(key)]
    if missing:
        raise SystemExit(f"в настройках нет: {', '.join(missing)}")
    return values


def storage_name(username, full):
    # harness ищет пакет и результаты только в корне хранилища пользователя
    prefix = f"/{username}/"
    return full[len(prefix):] if full.startswith(prefix) else full.lstrip("/")
