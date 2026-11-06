import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).parent
with (root / "data/jobs.csv").open(encoding="utf-8", newline="") as stream:
    rows = list(csv.DictReader(stream, delimiter=";"))
observed = [Decimal(row["processing_hours"]) for row in rows if row["processing_hours"] != ""]
global_mean = sum(observed, Decimal(0)) / len(observed)
with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.writer(stream, delimiter=";", lineterminator="\n")
    writer.writerow(["department", "jobs", "observed_jobs", "imputed_jobs", "observed_mean", "completed_mean"])
    for department in sorted({row["department"] for row in rows}):
        jobs = [row for row in rows if row["department"] == department]
        values = [Decimal(row["processing_hours"]) for row in jobs if row["processing_hours"] != ""]
        completed = [Decimal(row["processing_hours"]) if row["processing_hours"] != "" else global_mean for row in jobs]
        writer.writerow([department, len(jobs), len(values), len(jobs) - len(values),
                         sum(values, Decimal(0)) / len(values) if values else "",
                         sum(completed, Decimal(0)) / len(jobs)])
