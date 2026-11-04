#!/usr/bin/env python3
"""Independent P20 oracle: read source data and write the complete monthly CSV."""
import csv
from collections import defaultdict
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parent
worked = defaultdict(int)
with (root / "data/work_logs.csv").open(encoding="utf-8", newline="") as stream:
    for row in csv.DictReader(stream, delimiter=";"):
        day = datetime.strptime(row["timestamp"], "%Y-%m-%dT%H:%M:%S").date().isoformat()
        worked[row["employee_id"], day] += int(row["worked_minutes"])

monthly = {}
with (root / "data/employee_calendar.csv").open(encoding="utf-8", newline="") as stream:
    for row in csv.DictReader(stream, delimiter=";"):
        planned = int(row["planned_minutes"])
        actual = worked[row["employee_id"], row["date"]]
        total = monthly.setdefault((row["employee_id"], row["date"][:7]), [0] * 6)
        total[0] += int(planned > 0)
        total[1] += int(planned > 0 and actual > 0)
        total[2] += int(planned > 0 and actual == 0)
        total[3] += planned
        total[4] += actual
        total[5] += max(0, actual - planned)

with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.writer(stream, delimiter=";", lineterminator="\n")
    writer.writerow(["employee_id", "month", "planned_days", "attended_days", "absent_days", "planned_minutes", "worked_minutes", "overtime_minutes"])
    writer.writerows((employee, month, *total) for (employee, month), total in sorted(monthly.items()))
