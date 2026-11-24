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
import xml.etree.ElementTree as ET
assert len(ET.parse(a.data/'orders.xml').getroot())==2
expected={'nodes':[], 'outputs':[], 'refusal':{'text':'XML'}}
print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))
