import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).parent
completed_codes = {"done", "closed", "Готово", "Завершено"}
open_codes = {"new", "in_progress", "Новая", "В работе"}
totals = {}
with (root / "data/requests.csv").open(encoding="utf-8", newline="") as stream:
    for row in csv.DictReader(stream, delimiter=";"):
        status = None if row["status"] == "?" else row["status"]
        category = (
            0 if status in completed_codes else
            1 if status in open_codes else
            2 if status is None or status == "" else
            3
        )
        counts = totals.setdefault(row["source"], [0, 0, 0, 0])
        counts[category] += 1
with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.writer(stream, delimiter=";", lineterminator="\n")
    writer.writerow(["source", "requests", "completed", "open", "missing", "unmapped", "completion_pct"])
    for source in sorted(totals):
        completed, opened, missing, unmapped = totals[source]
        recognized = completed + opened
        percentage = Decimal(100) * completed / recognized if recognized else ""
        writer.writerow([source, completed + opened + missing + unmapped, completed, opened, missing, unmapped, percentage])
