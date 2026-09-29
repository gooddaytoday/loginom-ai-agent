#!/usr/bin/env python3
"""Собрать каркас «ИИ Отчета» из JSON структуры: статистика и плейсхолдеры.

Плейсхолдеры PLACEHOLDER_* заменяются русским текстом отчёта.
Итоговая форма совпадает с эталоном tools.loginom.ru.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SERVICE_VERSION = "1.0"


def _ts() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")


def render(structure: dict[str, Any]) -> str:
    package = structure.get("package") or {}
    stats = structure.get("stats") or {}
    modules = structure.get("modules") or []
    file_name = package.get("file_name") or f"{package.get('name', 'package')}.lgp"
    external = package.get("external_references") or []

    lines: list[str] = [
        f"Версия сервиса «ИИ Отчет»: `{SERVICE_VERSION}`",
        "",
        f"# Отчет о пакете «{file_name}» ({_ts()})",
        "",
        f"## Общая информация о пакете «{file_name}»",
        "",
        f"* **Версия платформы**: `{package.get('application_version') or 'неизвестно'}`",
        "",
        "### Описание пакета",
        "",
        "> PLACEHOLDER_PACKAGE_DESCRIPTION",
        "",
        "### Ссылки на внешние пакеты",
        "",
    ]
    if external:
        for ref in external:
            lines.append(f"* `{ref}`")
    else:
        lines.append("* Нет внешних зависимостей")
    lines += [
        "",
        "### Статистика пакета",
        "",
        f"* **Количество модулей**: `{stats.get('modules', 0)}`",
        f"* **Общее количество заметок**: `{stats.get('notes', 0)}`",
        f"* **Общее количество узлов**: `{stats.get('nodes', 0)}`",
        f"* **Общее количество подмоделей**: `{stats.get('submodels', 0)}`",
        f"* **Общее количество узлов программирования**: `{stats.get('programming_nodes', 0)}`",
        f"* **Общее количество узлов-ссылок**: `{stats.get('reference_nodes', 0)}`",
        f"* **Общее количество производных узлов**: `{stats.get('derived_nodes', 0)}`",
        "",
        "### Список модулей",
        "",
    ]
    for mod in modules:
        lines.append(
            f"* Модуль {mod.get('index', '?')}. «{mod.get('display_name') or mod.get('name')}»"
        )
    if not modules:
        lines.append("* (модули не найдены)")

    for mod in modules:
        mstats = mod.get("stats") or {}
        title = mod.get("display_name") or mod.get("name") or mod.get("id")
        idx = mod.get("index", "?")
        lines += [
            "",
            f"## Модуль {idx}. «{title}»",
            "",
            "### Описание модуля",
            "",
            f"> PLACEHOLDER_MODULE_{idx}_DESCRIPTION",
            "",
            "### Статистика модуля",
            "",
            f"* **Глубина вложенности сценария**: `{mstats.get('nesting_depth', 0)}`",
            f"* **Количество заметок**: `{mstats.get('notes', 0)}`",
            f"* **Количество узлов**: `{mstats.get('nodes', 0)}`",
            f"* **Количество подмоделей**: `{mstats.get('submodels', 0)}`",
            f"* **Количество узлов программирования**: `{mstats.get('programming_nodes', 0)}`",
            f"* **Количество узлов-ссылок**: `{mstats.get('reference_nodes', 0)}`",
            f"* **Количество производных узлов**: `{mstats.get('derived_nodes', 0)}`",
        ]

    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "structure_json",
        type=Path,
        help="structure.json from extract_scenario_structure.py",
    )
    parser.add_argument("-o", "--output", type=Path, required=True, help="Output markdown path")
    args = parser.parse_args(argv)
    structure = json.loads(args.structure_json.read_text(encoding="utf-8"))
    text = render(structure)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text, encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
