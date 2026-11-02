import csv
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
ledger = defaultdict(lambda: {"in": Decimal("0"), "out": Decimal("0")})
with (root / "data/cash_events.csv").open(encoding="utf-8", newline="") as source:
    for row in csv.DictReader(source):
        day = datetime.strptime(row["local_timestamp"], "%Y-%m-%d %H:%M:%S").date()
        ledger[day][row["direction"]] += Decimal(row["amount"])

with (root / "data/bank_daily.csv").open(encoding="utf-8", newline="") as source:
    bank = {date.fromisoformat(row["date"]): Decimal(row["net_amount"]) for row in csv.DictReader(source)}
with (root / "data/report_calendar.csv").open(encoding="utf-8", newline="") as source:
    calendar = sorted(date.fromisoformat(row["date"]) for row in csv.DictReader(source))

with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as target:
    writer = csv.writer(target, delimiter=";", lineterminator="\n")
    writer.writerow(["date", "inflow", "outflow", "ledger_net", "bank_net", "deviation"])
    for day in calendar:
        inflow = ledger[day]["in"]
        outflow = ledger[day]["out"]
        net = inflow - outflow
        writer.writerow([day.isoformat(), *(f"{value:.2f}" for value in (inflow, outflow, net, bank[day], bank[day] - net))])
