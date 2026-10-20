COLUMNS = ['city', 'observations', 'mean_temperature', 'mean_wind_speed', 'mean_cloudiness', 'adverse_weather_pct']

def solve(rows):
    groups=defaultdict(list)
    for row in rows:
        groups[row['city']].append(row)
    result=[]
    for city,items in groups.items():
        n=len(items)
        result.append([city,n,*[sum(float(row[key]) for row in items)/n for key in ['temperature','wind_speed','cloudiness']],100*sum(row['weather_main'] in {'Rain','Snow','Mist'} for row in items)/n])
    return sorted(result,key=lambda row:(-row[-1],-row[3],row[0]))


import csv
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

def format_cell(value):
    if isinstance(value, str):
        return value
    if isinstance(value, int):
        return str(value)
    text = format(Decimal(str(value)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP), 'f')
    return '0' if Decimal(text) == 0 else text.rstrip('0').rstrip('.')

def main():
    root = Path(__file__).parent
    with (root / 'data/dataset.csv').open(newline='', encoding='utf-8-sig') as file:
        rows = solve(list(csv.DictReader(file)))
    with (root / 'oracle.csv').open('w', newline='', encoding='utf-8') as file:
        writer = csv.writer(file, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[format_cell(value) for value in row] for row in rows])

if __name__ == '__main__':
    main()
