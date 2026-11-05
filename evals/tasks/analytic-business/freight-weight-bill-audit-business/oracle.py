import csv
from collections import defaultdict
from decimal import Decimal
from pathlib import Path


CASE = Path(__file__).resolve().parent


def read(name):
    with (CASE / "data" / name).open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source, delimiter=";"))


def money(value):
    text = format(value, "f")
    return text + (".00" if "." not in text else "0" * max(0, 2 - len(text.split(".")[1])))


weight = defaultdict(Decimal)
for package in read("packages.csv"):
    weight[package["shipment_id"]] += Decimal(package["weight_kg"])

actual = defaultdict(Decimal)
for bill in read("carrier_bills.csv"):
    actual[bill["shipment_id"]] += Decimal(bill["amount"])

tariffs = {(row["route"], row["tariff_code"]): row for row in read("tariffs.csv")}
with (CASE / "oracle.csv").open("w", encoding="utf-8", newline="") as target:
    writer = csv.writer(target, delimiter=";", lineterminator="\n")
    writer.writerow(["shipment_id", "weight_kg", "tariff_found", "expected_cost", "actual_bill", "deviation"])
    for shipment in sorted(read("shipments.csv"), key=lambda row: row["shipment_id"]):
        shipment_id = shipment["shipment_id"]
        tariff = tariffs.get((shipment["route"], shipment["tariff_code"]))
        expected = None if tariff is None else Decimal(tariff["fixed_fee"]) + weight[shipment_id] * Decimal(tariff["price_per_kg"])
        writer.writerow([
            shipment_id,
            format(weight[shipment_id].normalize(), "f"),
            int(tariff is not None),
            "" if expected is None else money(expected),
            money(actual[shipment_id]),
            "" if expected is None else money(actual[shipment_id] - expected),
        ])
