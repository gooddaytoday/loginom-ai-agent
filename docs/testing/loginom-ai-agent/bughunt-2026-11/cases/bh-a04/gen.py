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
write('sales.csv',['Region','Amount','Comment'],([['North','South'][i%2], 'N/A' if i%7==0 else f'{(i*29+1)/100:.2f}', 'первая строка\nвторая; "строка"' if i%3==0 else 'обычно'] for i in range(50)),preamble='Отчёт о продажах\nПериод: 2026\nВалюта: рубли\n')
