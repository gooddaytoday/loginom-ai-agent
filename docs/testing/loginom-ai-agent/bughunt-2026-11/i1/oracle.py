#!/usr/bin/env python3
"""Recalculate the typed exports from the prepared inputs, without Loginom."""

import argparse
import csv
import json
import re
import sqlite3
from collections import defaultdict
from contextlib import closing
from pathlib import Path
from statistics import mean

from openpyxl import load_workbook


def read_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def database(data):
    path = data / "orders.db"
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        customers = dict(db.execute("SELECT customer_id, region FROM customers"))
        orders = db.execute("SELECT customer_id, status, amount_cents FROM orders").fetchall()
    paid = defaultdict(list)
    for customer_id, status, amount in orders:
        if status == "paid":
            paid[customers[customer_id]].append(amount)
    return [(region, len(amounts), sum(amounts)) for region, amounts in sorted(paid.items())]


def spreadsheet(data):
    names = {row["WarehouseId"]: row["WarehouseName"] for row in read_rows(data / "warehouses.csv")}
    workbook = load_workbook(data / "shipments.xlsx", read_only=True, data_only=True)
    try:
        [(sheet, address)] = workbook.defined_names["ApprovedShipments"].destinations
        assert sheet == "Отгрузки" and len(workbook.sheetnames) == 3
        header, *shipments = workbook[sheet][address]
        assert [cell.value for cell in header] == ["ShipmentId", "WarehouseId", "Units"]
        values = (tuple(cell.value for cell in shipment) for shipment in shipments)
        return sorted((shipment, names[warehouse], units) for shipment, warehouse, units in values
                      if warehouse in names)
    finally:
        workbook.close()


def rest(data):
    simulation = data / "response.json"
    rows = []
    for page in read_rows(data / "pages.csv"):
        limit, skip = int(page["limit"]), int(page["skip"])
        response = read_json(simulation if simulation.is_file() else
                             data.parent / "reference" / f"{limit}-{skip}.json")
        assert response["limit"] == limit and response["skip"] == skip
        assert len(response["products"]) == limit
        rows.extend((skip, product["id"], product["title"], product["dimensions"]["width"])
                    for product in response["products"])
    return sorted(rows)


def events(data):
    rows = []
    for row in read_rows(data / "events.csv"):
        event = int(row["EventId"])
        try:
            item = json.loads(row["Payload"])["item"]
        except json.JSONDecodeError:
            rows.append((event, None, None, "invalid_json"))
        else:
            rows.append((event, item["sku"], item.get("quantity"), "ok"))
    return sorted(rows)


def rolling(data, window):
    series = defaultdict(list)
    for row in read_rows(data / "readings.csv"):
        series[row["Series"]].append((int(row["Step"]), row["Ticket"], float(row["Value"])))
    rows = []
    for name, readings in sorted(series.items()):
        readings.sort()
        for index, (step, ticket, _) in enumerate(readings):
            match = re.match(r"[A-Z]+", ticket)
            sample = readings[max(0, index + 1 - window):index + 1]
            average = mean(value for _, _, value in sample) if len(sample) == window else None
            rows.append((name, step, match[0] if match else None, average))
    return rows


def threshold(data):
    return sorted((int(row["CheckId"]), float(row["Value"]) > 12.5)
                  for row in read_rows(data / "checks.csv"))


def contract(case):
    data = case / "data"
    name = case.name
    export = f"{name}-result.csv"
    links = []
    labels = {}
    if name == "bh-i101":
        rows = database(data)
        schema = "Region:string PaidOrders:integer RevenueCents:integer"
        nodes = [("db", "imports.database")]
    elif name == "bh-i102":
        rows = spreadsheet(data)
        schema = "ShipmentId:integer WarehouseName:string Units:integer"
        nodes = [("book", "imports.excel"), ("directory", "imports.text"), ("join", "transform.join_data")]
        links = [("book", "join"), ("directory", "join")]
    elif name == "bh-i103":
        rows = rest(data)
        schema = "Skip:integer ProductId:integer Title:string Width:real"
        nodes = [("requests", "imports.text"), ("rest", "integration.rest_request")]
        links = [("requests", "rest")]
    elif name == "bh-i104":
        rows = events(data)
        schema = "EventId:integer Sku:string Quantity:integer ParseStatus:string"
        nodes = [("events", "imports.text"), ("parse", "programming.javascript")]
        links = [("events", "parse")]
    elif name in {"bh-i105-start", "bh-i105"}:
        first_turn = name == "bh-i105-start"
        rows = rolling(data if first_turn else case.parent / "bh-i105-start" / "data", 3 if first_turn else 5)
        schema = "Series:string Step:integer Prefix:string RollingMean:real"
        nodes = [("readings", "imports.text"), ("rolling", "programming.python")]
        links = [("readings", "rolling")]
        labels["rolling"] = "Среднее по серии"
        if first_turn:
            export = "bh-i105-initial-result.csv"
    elif name == "bh-i106":
        rows = threshold(data)
        schema = "CheckId:integer AboveThreshold:boolean"
        nodes = [("checks", "imports.text"), ("threshold", "variables.calculator"),
                 ("script", "programming.python")]
        links = [("checks", "script"), ("threshold", "script")]
    else:
        raise ValueError(f"Unknown case: {name}")

    fields = [tuple(field.split(":")) for field in schema.split()]
    columns = [dict(name=column, type=kind, label_any=True) for column, kind in fields]
    for column in columns:
        if column["type"] == "real":
            column["tolerance"] = {"abs": 1e-8, "rel": 1e-10}
    return {
        "nodes": [{"type": kind, "label_any": True} for _, kind in nodes],
        "graph": {
            "nodes": [dict(id=local_id, type=kind, **({"label": labels[local_id]} if local_id in labels else {}))
                      for local_id, kind in nodes],
            "links": [{"source": source, "target": target} for source, target in links],
        },
        "outputs": [{
            "output_node_type": "export_input",
            "export_destination": export,
            "ordered": True,
            "column_order": "exact",
            "columns": columns,
            "rows": [dict(zip((column for column, _ in fields), row, strict=True)) for row in rows],
        }],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = contract(args.case_dir)
    if args.check:
        if expected != read_json(args.case_dir / "expected.json"):
            parser.exit(1, f"{args.case_dir.name}: expected.json differs from oracle\n")
    else:
        print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
