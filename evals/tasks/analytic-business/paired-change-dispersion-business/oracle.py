import csv
import math
import statistics
from pathlib import Path


def summarize(rows):
    groups = {}
    for row in rows:
        groups.setdefault(row["setting_group"], []).append(int(row["after"]) - int(row["before"]))
    result = []
    for group, changes in sorted(groups.items()):
        sd = statistics.stdev(changes)
        result.append((group, len(changes), statistics.mean(changes), sd, sd / math.sqrt(len(changes))))
    return result


if __name__ == "__main__":
    case = Path(__file__).resolve().parent
    with (case / "data/machines.csv").open(encoding="utf-8", newline="") as source:
        result = summarize(csv.DictReader(source, delimiter=";"))
    with (case / "oracle.csv").open("w", encoding="utf-8", newline="") as target:
        writer = csv.writer(target, delimiter=";", quotechar='"', lineterminator="\n")
        writer.writerow(["setting_group", "pairs", "mean_change", "sample_sd_change", "se_change"])
        writer.writerows((group, pairs, f"{mean:.12f}", f"{sd:.12f}", f"{se:.12f}") for group, pairs, mean, sd, se in result)
