#!/usr/bin/env python3
"""Prepare the case folders and their synthetic SQLite and Excel fixtures."""

import argparse
import shutil
import sqlite3
from contextlib import closing
from pathlib import Path

from openpyxl import Workbook
from openpyxl.workbook.defined_name import DefinedName


HERE = Path(__file__).resolve().parent


def create_database(path):
    with closing(sqlite3.connect(path)) as db, db:
        db.executescript("""
            CREATE TABLE customers (customer_id INTEGER PRIMARY KEY, region TEXT NOT NULL);
            CREATE TABLE orders (
                order_id INTEGER PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers,
                status TEXT NOT NULL,
                amount_cents INTEGER NOT NULL
            );
        """)
        db.executemany("INSERT INTO customers VALUES (?, ?)", [
            (1, "Central"), (2, "North"), (3, "Central"), (4, "South"), (5, "West"),
        ])
        db.executemany("INSERT INTO orders VALUES (?, ?, ?, ?)", [
            (1, 3, "paid", 725), (2, 2, "paid", 2400), (3, 1, "paid", 3100),
            (4, 4, "cancelled", 1900), (5, 2, "pending", 900), (6, 4, "paid", 515),
            (7, 3, "paid", 725), (8, 2, "paid", 0), (9, 5, "cancelled", 2700),
        ])


def create_workbook(path):
    book = Workbook()
    archive = book.active
    archive.title = "Архив"
    shipments = book.create_sheet("Отгрузки")
    plan = book.create_sheet("План")
    headers = ["ShipmentId", "WarehouseId", "Units"]
    archive.append(headers)
    archive.append([201, "W1", 909])
    plan.append(headers)
    plan.append([202, "W2", 505])
    shipments.append(["Реестр отгрузок"])
    shipments.append([])
    shipments.append([None, *headers])
    for shipment in [
        (48, "W3", 31), (42, "W1", 12), (44, "W2", 0), (45, "W9", 55),
        (41, "W2", 10), (46, "W8", 120),
    ]:
        shipments.append([None, *shipment])
    book.defined_names.add(DefinedName("ApprovedShipments", attr_text="'Отгрузки'!$B$3:$D$8"))
    book.save(path)


def prepare(out, offline_rest):
    out.mkdir(parents=True)
    for template in sorted((HERE / "cases").iterdir()):
        case = out / template.name
        use_offline = offline_rest and template.name == "bh-i103"
        shutil.copytree(HERE / "offline" / template.name if use_offline else template, case)
        shutil.copyfile(HERE / "oracle.py", case / "oracle.py")
        (case / "data").mkdir(exist_ok=True)
        if use_offline:
            shutil.copyfile(HERE / "reference" / "2-0.json", case / "data" / "response.json")

    create_database(out / "bh-i101" / "data" / "orders.db")
    create_workbook(out / "bh-i102" / "data" / "shipments.xlsx")
    if not offline_rest:
        shutil.copytree(HERE / "reference", out / "bh-i103" / "reference")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path, help="new directory for run-check --cases")
    parser.add_argument("--offline-rest", action="store_true", help="simulate bh-i103 from a file")
    args = parser.parse_args()
    prepare(args.out, args.offline_rest)
