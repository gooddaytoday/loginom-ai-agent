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
write('wide.csv',[f'C{j:03d}' for j in range(1,401)],([i if j==1 else i*3+j for j in range(1,401)] for i in range(1,501)))
