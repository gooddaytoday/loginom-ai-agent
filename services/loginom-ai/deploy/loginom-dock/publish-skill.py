#!/usr/bin/env python3
"""Retired: product skills are delivered by the application, not Dock Skills API."""

import sys


def main():
    print(
        "LOGINOM_SKILL_PUBLICATION_DISABLED: loginom-automation поставляется из "
        "packages/product/skills/loginom-automation вместе с Desktop и CLI. "
        "Новая публикация из этого репозитория отключена. Существующая серверная "
        "запись сохраняется для старых клиентов и baseline evals; её удаление "
        "требует отдельной команды после выпуска и проверки совместимости.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
