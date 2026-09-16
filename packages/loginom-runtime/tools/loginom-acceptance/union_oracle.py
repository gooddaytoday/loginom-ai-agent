"""Small independent append-all oracle. Never imports the JavaScript handler."""
import csv
from collections import Counter
from pathlib import Path

FIXTURES=Path(__file__).parent/'fixtures'/'union'

def source(name):
    with (FIXTURES/name).open(newline='',encoding='utf-8') as stream:
        rows=list(csv.reader(stream,delimiter=';'))
    header=rows.pop(0)
    return header,[[None if value=='NULL' else int(value) if index==1 else value for index,value in enumerate(row)] for row in rows]

def expected(count=3):
    if count not in (2,3):raise ValueError('Expected two or three fixture inputs')
    sources=[source(name+'.csv') for name in ('main','second','third')[:count]]
    names=['Code','Amount','Note']+(['Extra'] if count==3 else [])
    destinations=[['Code','Amount','Note'],['Note','Amount','Code'],['Code','Amount','Note','Extra']]
    rows=[]
    for port,(_,values) in enumerate(sources):
        for values_row in values:
            row=[None]*len(names)
            for value,destination in zip(values_row,destinations[port]):row[names.index(destination)]=value
            rows.append(row)
    return {'columns':names,'types':['string','integer','string']+(['string'] if count==3 else []),'rows':rows}

def verify_output(port,count):
    wanted=expected(count)
    if port.get('sample_complete') is not True or port.get('sample_rows')!=port.get('row_count'):raise ValueError('Incomplete output')
    if [f['name'] for f in port['schema']]!=wanted['columns'] or [f['type'] for f in port['schema']]!=wanted['types']:raise ValueError('Output schema differs')
    rows=[]
    for raw in port['sample']:
        row=[]
        for cell in raw:
            if cell['is_null']:
                if cell.get('value') is not None:raise ValueError('False null')
                row.append(None)
            elif cell['type']=='integer':
                if cell.get('precision')!='exact_integer':raise ValueError('Unverified number')
                row.append(int(cell['value']))
            else:row.append(cell['value'])
        rows.append(row)
    if port['row_count']!=len(wanted['rows']) or rows!=wanted['rows']:raise ValueError('Output values or order differ')
    if Counter(map(tuple,rows))!=Counter(map(tuple,wanted['rows'])):raise ValueError('Multiplicity differs')
    return {'passed':True,'rows':len(rows),'duplicate_A_count':sum(row[0]=='A' for row in rows),'full_values_verified':True}
