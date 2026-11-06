"""Independent customer-month sets over eligible synthetic sale lines and observation calendar."""
import csv
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
months = defaultdict(set)
with (root / "data/purchase_lines.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        if not row["customer_id"] or int(row["qty"]) <= 0 or Decimal(row["amount"]) <= 0 or row["invoice_id"].startswith("C"):
            continue
        month = datetime.strptime(row["purchase_timestamp"], "%Y-%m-%d %H:%M:%S").strftime("%Y-%m")
        months[row["customer_id"]].add(month)
cohorts = defaultdict(set)
for customer, activity in months.items():
    cohorts[min(activity)].add(customer)
with (root / "data/cohort_calendar.csv").open(newline="", encoding="utf-8") as source:
    calendar = [row for row in csv.DictReader(source, delimiter=";") if int(row["observed"]) == 1 and 0 <= int(row["age_month"]) <= 2]
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", quotechar='"', lineterminator="\n")
    writer.writerow(["cohort_month", "age_month", "cohort_size", "active_customers", "retention"])
    for row in sorted(calendar, key=lambda row: (row["cohort_month"], int(row["age_month"]))):
        members = cohorts[row["cohort_month"]]
        active = len({customer for customer in members if row["activity_month"] in months[customer]})
        writer.writerow([row["cohort_month"], int(row["age_month"]), len(members), active, str(Decimal(active) / len(members))])
