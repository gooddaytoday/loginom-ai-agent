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
write('sales.tsv',['Дата','Регион','Сумма'],([(datetime(2026,1,1)+timedelta(days=i%60)).strftime('%d.%m.%Y'), ['Север','Юг','Центр'][i%3],f'{(i*17+25)/100:.2f}'.replace('.',',')] for i in range(180)),encoding='cp1251',delimiter='	')
