"""Independent activation sets from raw synthetic users/events; civil timestamps."""
import csv
from datetime import datetime
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
snapshot = datetime.fromisoformat("2026-03-01T00:00:00")
users = {}
with (root / "data/users.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        signup = datetime.fromisoformat(row["signup_timestamp"])
        following = datetime(signup.year + (signup.month == 12), signup.month % 12 + 1, 1)
        if following <= snapshot:
            users[row["user_id"]] = (signup, following, set())
with (root / "data/events.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        if row["user_id"] not in users:
            continue
        signup, following, actions = users[row["user_id"]]
        if signup <= datetime.fromisoformat(row["event_timestamp"]) < following:
            actions.add(row["event_type"])
months = {}
required = {"create_project", "invite_member", "export"}
for signup, following, actions in users.values():
    values = months.setdefault(signup.strftime("%Y-%m"), [0, 0, 0, 0, 0])
    values[0] += 1
    values[1] += int("create_project" in actions)
    values[2] += int("invite_member" in actions)
    values[3] += int("export" in actions)
    values[4] += int(required <= actions)
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", lineterminator="\n")
    writer.writerow(["signup_month", "users", "created_project", "invited_member", "exported", "activated", "activation_share"])
    for month in sorted(months):
        values = months[month]
        writer.writerow([month, *values, f"{Decimal(values[4]) / Decimal(values[0]):.3f}"])
