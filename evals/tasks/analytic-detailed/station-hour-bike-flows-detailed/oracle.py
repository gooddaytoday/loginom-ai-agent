import csv
from collections import defaultdict
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parent
flows = defaultdict(lambda: [0, 0])
with (root / "data/trips.csv").open(encoding="utf-8", newline="") as source:
    for row in csv.DictReader(source, delimiter=";"):
        for index, role in enumerate(("start", "end")):
            timestamp = datetime.fromisoformat(row[f"{role}_timestamp"])
            hour = timestamp.replace(minute=0, second=0, microsecond=0)
            flows[row[f"{role}_station"], hour][index] += 1

with (root / "data/station_hours.csv").open(encoding="utf-8", newline="") as source:
    calendar = sorted(
        (row["station_id"], datetime.fromisoformat(row["calendar_timestamp"]))
        for row in csv.DictReader(source, delimiter=";")
    )

with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as target:
    writer = csv.writer(target, delimiter=";", lineterminator="\n")
    writer.writerow([
        "station_id", "year", "month", "day", "hour",
        "departures", "arrivals", "net_inflow",
    ])
    for station, hour in calendar:
        departures, arrivals = flows.get((station, hour), (0, 0))
        writer.writerow([
            station, hour.year, hour.month, hour.day, hour.hour,
            departures, arrivals, arrivals - departures,
        ])
