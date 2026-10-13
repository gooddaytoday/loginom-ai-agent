import csv
import sys
from collections import Counter

with open(sys.argv[1], newline="", encoding="utf-8") as source:
    counts = Counter(tag.strip()
                     for row in csv.DictReader(source)
                     for tag in (row["Tags"] or "").split(";")
                     if tag.strip())
writer = csv.writer(sys.stdout, lineterminator="\n")
writer.writerow(["Tag", "Occurrences"])
writer.writerows(sorted(counts.items()))
