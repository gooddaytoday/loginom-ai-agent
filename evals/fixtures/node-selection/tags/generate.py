import csv
import sys

with open(sys.argv[1], "w", newline="", encoding="utf-8") as target:
    writer = csv.writer(target, lineterminator="\n")
    writer.writerow(["OrderID", "Tags"])
    writer.writerows([[1, "red;blue;red"], [2, "blue;;green;"], [3, "; red ;"], [4, ""]])
    writer.writerow([9, ";".join(["red"] * 150 + ["blue"])])
