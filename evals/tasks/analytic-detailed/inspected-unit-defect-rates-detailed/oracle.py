from pathlib import Path
import csv

root = Path(__file__).resolve().parent
severity = {}
with (root / "data/defects.csv").open(encoding="utf-8", newline="") as source:
    for row in csv.DictReader(source, delimiter=";"):
        severity[row["unit_id"]] = max(severity.get(row["unit_id"], 0), int(row["severity"]))
groups = {}
with (root / "data/inspections.csv").open(encoding="utf-8", newline="") as source:
    for row in csv.DictReader(source, delimiter=";"):
        counts = groups.setdefault((row["supplier_id"], row["production_line"]), [0, 0, 0])
        counts[0] += 1
        counts[1] += severity.get(row["unit_id"], 0) > 0
        counts[2] += severity.get(row["unit_id"], 0) == 3
with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as target:
    writer = csv.writer(target, delimiter=";", quotechar='"', lineterminator="\n")
    writer.writerow(["supplier_id", "production_line", "inspected_units", "defective_units", "critical_units", "defective_share", "critical_share"])
    for (supplier_id, production_line), (inspected, defective, critical) in sorted(groups.items()):
        writer.writerow([supplier_id, production_line, inspected, defective, critical, f"{defective / inspected:.15g}", f"{critical / inspected:.15g}"])
