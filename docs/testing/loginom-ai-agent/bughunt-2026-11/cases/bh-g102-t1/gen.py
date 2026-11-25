#!/usr/bin/env python3
"""Generate the synthetic clients.xlsx fixture with openpyxl 3.1.5."""

import argparse
from pathlib import Path

from openpyxl import Workbook


HEADERS = ("client_id", "Клиент", "Город")
CLIENTS = (
    (101, "Ладога Сервис", "Петрозаводск"),
    (102, "Маяк Снабжение", "Ижевск"),
    (103, "Альтаир Логистика", "Казань"),
    (104, "Озеро Торг", "Тверь"),
    (105, "Парус Опт", "Архангельск"),
    (106, "Атлас Сервис", "Рязань"),
    (107, "Подкова Снаб", None),
    (108, "Новый Берег", "Пермь"),
    (109, "Вектор Склад", "Омск"),
    (110, "Меридиан Опт", "Воронеж"),
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    workbook = Workbook()
    archive = workbook.active
    archive.title = "Архив"
    archive.append(HEADERS)
    archive.append((101, "Тестовая запись", "Москва"))
    clients = workbook.create_sheet("Клиенты")
    clients.append(HEADERS)
    for row in CLIENTS:
        clients.append(row)

    args.out.mkdir(parents=True, exist_ok=True)
    workbook.save(args.out / "clients.xlsx")


if __name__ == "__main__":
    main()
