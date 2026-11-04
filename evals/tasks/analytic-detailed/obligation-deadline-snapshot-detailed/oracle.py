"""Independent per-obligation snapshot classification from synthetic raw records."""
import csv
from datetime import datetime
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
snapshot = datetime(2026, 3, 15, 12)
columns = ["obligations", "on_time", "late", "open_overdue", "open_not_due"]
groups = {}
with (root / "data/obligations.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        deadline = datetime.fromisoformat(row["deadline"])
        completed = datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None
        observed = completed is not None and completed <= snapshot
        status = "on_time" if observed and completed <= deadline else "late" if observed else "open_overdue" if deadline < snapshot else "open_not_due"
        key = (row["team"], deadline.strftime("%Y-%m"))
        counts = groups.setdefault(key, dict.fromkeys([*columns, "due"], 0))
        counts["obligations"] += 1
        counts[status] += 1
        counts["due"] += int(deadline <= snapshot)
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", quotechar='"', lineterminator="\n")
    writer.writerow(["team", "deadline_month", *columns, "violation_share"])
    for key, counts in sorted(groups.items()):
        share = Decimal(counts["late"] + counts["open_overdue"]) / counts["due"] if counts["due"] else ""
        writer.writerow([*key, *(counts[name] for name in columns), str(share)])
