#!/usr/bin/env python3
"""Deterministic artificial fixture generator; gen.py --out DIR."""
import argparse, csv, io, json, sqlite3
from pathlib import Path
from datetime import datetime, timedelta
p=argparse.ArgumentParser()
p.add_argument('--out', required=True, type=Path)
a=p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
def write(name, fields, rows, encoding='utf-8-sig', delimiter=';', header=True, preamble=''):
    with (a.out/name).open('w',encoding=encoding,newline='') as f:
        f.write(preamble)
        w=csv.writer(f,delimiter=delimiter,lineterminator='\n')
        if header: w.writerow(fields)
        w.writerows(rows)
fields=['Region','Category','Amount','Comment']+[f'Extra{i:02d}' for i in range(1,30)]
write('sales.csv',fields,([['North','South','West'][i%3],['Office','Tech'][i%2],f'{(i*37%100000)/100:.2f}', 'заказ; "срочный"' if i%11==0 else 'обычный']+[f'v{i%17}-{j}' for j in range(1,30)] for i in range(3400)))
