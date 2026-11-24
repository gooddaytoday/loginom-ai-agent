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
(a.out/'sales.db').unlink(missing_ok=True)
with sqlite3.connect(a.out/'sales.db') as db:
    db.execute('CREATE TABLE sales (Region TEXT, Amount REAL, Active INTEGER)')
    db.executemany('INSERT INTO sales VALUES (?,?,?)', [(['North','South'][i%2],(i*17+5)/100,int(i%3!=0)) for i in range(150)])
