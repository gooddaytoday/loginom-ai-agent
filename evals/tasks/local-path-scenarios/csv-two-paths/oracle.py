from pathlib import Path
import csv
from collections import defaultdict
root=Path(__file__).resolve().parent
totals=defaultdict(int)
for source in sorted((root/'data').rglob('*.csv')):
 with source.open(newline='') as stream:
  for row in csv.DictReader(stream): totals[row['Category']]+=int(row['amount'])
assert sorted(totals.items())==[('Alpha',17),('Beta',20),('Gamma',5)]
with (root/'oracle.csv').open('w',newline='') as stream:
 out=csv.writer(stream,lineterminator='\n');out.writerow(['Category','amount']);out.writerows(sorted(totals.items()))
