import csv
from fractions import Fraction
from pathlib import Path


root = Path(__file__).resolve().parent
with (root / "data" / "objects.csv").open(newline="", encoding="utf-8") as source:
    records = list(csv.DictReader(source, delimiter=";"))
points = [(Fraction(row["x"]), Fraction(row["y"])) for row in records]
assert len(points) == 8 and len({row["id"] for row in records}) == 8


def partitions(labels):
    if len(labels) == len(points):
        if max(labels) == 2:
            yield labels
        return
    for label in range(min(max(labels) + 2, 3)):
        yield from partitions((*labels, label))


scored = []
for labels in partitions((0,)):
    groups = [[point for point, label in zip(points, labels) if label == group] for group in range(3)]
    sse = sum(
        sum(x * x + y * y for x, y in group)
        - (sum(x for x, y in group) ** 2 + sum(y for x, y in group) ** 2) / len(group)
        for group in groups
    )
    scored.append((sse, labels))
assert len(scored) == 966
minimum, labels = min(scored)
assert sum(sse == minimum for sse, candidate in scored) == 1, "global optimum is not unique"
rows = []
for label in range(3):
    group = [point for point, found in zip(points, labels) if found == label]
    x = sum(point[0] for point in group) / len(group)
    y = sum(point[1] for point in group) / len(group)
    mean_squared_distance = sum((px - x) ** 2 + (py - y) ** 2 for px, py in group) / len(group)
    rows.append((x, y, len(group), mean_squared_distance))
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
    writer = csv.writer(target, delimiter=";", lineterminator="\n")
    writer.writerow(("center_x", "center_y", "objects", "mean_squared_distance"))
    writer.writerows([format(float(value), ".12g") for value in row] for row in sorted(rows))
print(f"partitions={len(scored)}; minimizers=1; min_sse={minimum}")
