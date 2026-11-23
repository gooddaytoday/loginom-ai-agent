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
assert hashlib.sha256((a.data/'source.lgd').read_bytes()).hexdigest()=='f748f8652775e1173a34c91fe83c5ffe2d51f3b4985e2d612dbab5d086d18725'
records=csv.DictReader(io.StringIO((Path(__file__).parent/'oracle-source.csv').read_text(encoding='utf-8')))
rows=[{'Id':int(r['Id']),'Amount2':None if r['Amount']==r'\N' else float(Decimal(r['Amount'])*2)} for r in records]
columns=[('Id', 'integer'), ('Amount2', 'real')]
expected={'nodes':[{'type':t,'label_any':True} for t in ['imports.lgd', 'exports.lgd']], 'outputs':[{'output_node_type':'export_input','export_destination':'bh-a13-result.csv','ordered':True,'column_order':'exact','columns':[{'name':n,'label':n,'type':t} for n,t in columns], 'rows':rows}]}
print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
