#!/usr/bin/env python3
"""Independent CSV grouping: never imports runtime or reads model assertions."""
import csv,json,pathlib
root=pathlib.Path(__file__).parent
for scenario in ['base','changed','same-count']:
    rows=list(csv.DictReader((root/'data'/f'{scenario}.csv').open()))
    categories=sorted({row['Category'] for row in rows},key=lambda category:(category!='?',category))
    expected=json.loads((root/'sliding'/f'expected-{scenario}-server.json').read_text())
    columns=[{'name':'Region','label':'Region','type':'string'}]
    values=[]
    for index,category in enumerate(categories,1):
        columns.extend({'name':f'C_{index}_{fact}_Sum','label':f'{"<...>" if category=="?" else category}|{fact}|Сумма','type':'real'} for fact in ['Amount','Quantity'])
    for region in sorted({row['Region'] for row in rows}):
        value={'Region':region}
        for index,category in enumerate(categories,1):
            group=[row for row in rows if row['Region']==region and row['Category']==category]
            for fact in ['Amount','Quantity']:
                numbers=[float(row[fact]) for row in group if row[fact]!='?']
                value[f'C_{index}_{fact}_Sum']=sum(numbers) if numbers else None
        values.append(value)
    assert expected['columns']==columns,scenario
    assert expected['rows']==values,scenario
    if scenario=='same-count':
        final=json.loads((root/'expected.json').read_text())
        assert final['columns']==columns and final['rows']==values
print('PASS: independently grouped Sliding base, width change and same-count categories')
