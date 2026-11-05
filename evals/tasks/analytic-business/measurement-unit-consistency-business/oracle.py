import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).parent
factors = {"mm": Decimal("0.001"), "cm": Decimal("0.01"), "m": Decimal(1)}
totals = {}
with (root / "data/samples.csv").open(encoding="utf-8", newline="") as stream:
    for row in csv.DictReader(stream, delimiter=";"):
        values = totals.setdefault(row["material"], [0, 0, Decimal(0), Decimal(0)])
        if row["unit"] not in factors:
            values[1] += 1
            continue
        values[0] += 1
        values[2] += Decimal(row["length"]) * factors[row["unit"]]
        values[3] += Decimal(row["mass_kg"])
with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.writer(stream, delimiter=";", lineterminator="\n")
    writer.writerow(["material", "valid_samples", "unknown_unit_samples", "length_m", "mass_kg", "kg_per_m"])
    for material in sorted(totals):
        valid, unknown, length, mass = totals[material]
        writer.writerow([material, valid, unknown, length, mass, mass / length])
