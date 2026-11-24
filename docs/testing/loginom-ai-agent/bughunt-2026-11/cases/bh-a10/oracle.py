#!/usr/bin/env python3
"""Independent input-byte oracle; never consumes model results or expected.json."""
import argparse, csv, io, json, sqlite3, hashlib
from pathlib import Path
from decimal import Decimal
from collections import defaultdict
from datetime import datetime
p=argparse.ArgumentParser()
p.add_argument('--data', type=Path, default=Path(__file__).resolve().parent/'data')
a=p.parse_args()
def read(name, encoding='utf-8-sig', delimiter=';', skip=0, fieldnames=None):
    stream=io.StringIO((a.data/name).read_bytes().decode(encoding), newline='')
    for _ in range(skip): next(stream)
    return list(csv.DictReader(stream, delimiter=delimiter, fieldnames=fieldnames))
def grouped(records, keys, value, result='Total'):
    sums=defaultdict(Decimal)
    for row in records:
        if row[value] not in ('N/A', '', None):
            sums[tuple(row[k] for k in keys)]+=Decimal(str(row[value]).replace(',', '.'))
    return [dict(zip(keys,k), **{result:float(v)}) for k,v in sorted(sums.items())]
from openpyxl import load_workbook
lookup=dict(load_workbook(a.data/'products.xlsx',read_only=True,data_only=True)['Products'].iter_rows(min_row=2,values_only=True))
records=[{'Category':lookup[int(r['ProductID'])],'Amount':r['Amount']} for r in read('sales.csv') if int(r['ProductID']) in lookup]
rows=grouped(records,['Category'],'Amount')
columns=[('Category', 'string'), ('Total', 'real')]
expected={'nodes':[{'type':t,'label_any':True} for t in ['imports.text', 'imports.excel']], 'outputs':[{'output_node_type':'export_input','export_destination':'bh-a10-result.csv','ordered':True,'column_order':'exact','columns':[{'name':n,'label':n,'type':t, **({'tolerance':{'abs':1e-8,'rel':1e-10}} if t=='real' else {})} for n,t in columns], 'rows':rows}]}
print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
