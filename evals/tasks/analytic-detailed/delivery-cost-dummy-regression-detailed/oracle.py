"""Independent exact P44 OLS; fixed four-column design, no Loginom exports."""
import csv
from fractions import Fraction
from itertools import permutations
from math import prod
from pathlib import Path


def determinant(matrix):
    # This case has exactly four terms; 24 rational products avoid float roundoff.
    return sum((
        (-1) ** sum(order[a] > order[b] for a in range(4) for b in range(a + 1, 4))
        * prod(matrix[row][column] for row, column in enumerate(order))
        for order in permutations(range(4))
    ), Fraction(0))


root = Path(__file__).resolve().parent
with (root / "data/shipments.csv").open(encoding="utf-8", newline="") as source:
    shipments = list(csv.DictReader(source, delimiter=";"))
design = [
    [Fraction(1), Fraction(row["units"]), Fraction(row["distance"]), Fraction(row["service_type"] == "express")]
    for row in shipments
]
response = [Fraction(row["cost"]) for row in shipments]
gram = [[sum((row[a] * row[b] for row in design), Fraction(0)) for b in range(4)] for a in range(4)]
rhs = [sum((row[column] * value for row, value in zip(design, response)), Fraction(0)) for column in range(4)]
denominator = determinant(gram)
assert denominator != 0, "P44 requires a full-rank four-term design"
coefficients = [
    determinant([[rhs[row] if column == term else gram[row][column] for column in range(4)] for row in range(4)]) / denominator
    for term in range(4)
]
with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as target:
    writer = csv.writer(target, delimiter=";", lineterminator="\n")
    writer.writerow(["term", "coefficient"])
    writer.writerows(zip(["intercept", "units", "distance", "express"], (f"{float(value):.12f}" for value in coefficients)))
