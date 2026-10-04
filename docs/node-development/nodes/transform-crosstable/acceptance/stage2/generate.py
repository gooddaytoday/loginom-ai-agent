"""Versioned independent expectations, generated exclusively from input CSVs.

No runtime imports and no recorded aggregate output. Native DateTime is compared
as serial bytes of these known fixture dates, without granting calendar semantics
to arbitrary public native-reader output.
"""
import csv
import hashlib
import importlib.util
import json
import struct
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from oracle import read, aggregate, TYPES, FUNCTIONS, cartesian_categories

ROOT = Path(__file__).resolve().parent.parent
LABELS = dict(zip(FUNCTIONS, ['Сумма','Количество','Минимум','Максимум','Среднее',
 'Стандартное откл.','Сумма квадратов','Кол-во уникальных','Кол-во пропусков','Первый','Последний']))
SUFFIX = dict(zip(FUNCTIONS, ['Sum','Count','Min','Max','Avg','StdDev','SumSq','UniqueCount','NullCount','First','Last']))
COUNTS = {'count','unique_count','null_count'}
def result_type(kind, function):
    if function in COUNTS: return 'integer'
    if function in {'sum','stddev','sum_squares'}: return 'real'
    if function == 'avg': return 'datetime' if kind == 'datetime' else 'real'
    return kind
def encode(value, kind, variant=False):
    if value is None: return None
    if kind == 'datetime':
        serial = (value-datetime(1899,12,30)).total_seconds()/86400
        return {'cell_type':kind,'bytes_le':struct.pack('<d',serial).hex()}
    if variant:
        result={'cell_type':kind,'value':value}
        if kind == 'real': result['bytes_le']=struct.pack('<d',value).hex()
        return result
    return value
def report(rows, keys, facts, types=TYPES):
    columns=[{'name':k,'label':k,'type':types[k]} for k in keys]
    columns += [{'name':field+'_'+SUFFIX[fn], 'label':field+'|'+LABELS[fn], 'type':result_type(types[field],fn)} for field, fns in facts for fn in fns]
    groups=defaultdict(list)
    for row in rows: groups[tuple(row[k] for k in keys)].append(row)
    values=[]
    for identity, group in groups.items():
        row=dict(zip(keys,identity))
        for field,fns in facts:
            for fn in fns:
                row[field+'_'+SUFFIX[fn]]=encode(aggregate([r[field] for r in group],fn),result_type(types[field],fn))
        values.append(row)
    return {'output_node_type':'transform.cross_table','columns':columns,'rows':values}
def variant_report(ignore_empty=False):
    schema={'RealValue':'real','TextValue':'string','FlagValue':'boolean','WhenValue':'datetime'}
    groups=defaultdict(list)
    with (ROOT/'data/variant-source.csv').open(newline='',encoding='utf8') as f:
        for row in csv.DictReader(f):
            for field,kind in schema.items():
                raw=row[field]
                value=None if raw=='?' else float(raw) if kind=='real' else raw=='true' if kind=='boolean' else datetime.fromisoformat(raw) if kind=='datetime' else raw
                if value is not None or not ignore_empty: groups[row['Key']].append((value,kind))
    functions=[f for f in FUNCTIONS if f not in {'sum','avg','stddev','sum_squares'}]
    columns=[{'name':'Key','label':'Key','type':'string'}]+[{'name':'Values_'+SUFFIX[fn],'label':'Значения|'+LABELS[fn],'type':'integer' if fn in COUNTS else 'variant'} for fn in functions]
    rows=[]
    for key, items in groups.items():
        row={'Key':key};nonnull=[(v,t) for v,t in items if v is not None]
        for fn in functions:
            # Native Variant orders NULL below the homogeneous non-NULL values.
            # Its Min differs from the scalar aggregate's NULL-skipping rule.
            value=None if fn=='min' and any(v is None for v,_ in items) else aggregate([v for v,_ in items],fn)
            kind=next((t for v,t in items if v is not None and v==value),None)
            row['Values_'+SUFFIX[fn]]=value if fn in COUNTS else encode(value,kind,True)
        rows.append(row)
    return {'output_node_type':'transform.cross_table','columns':columns,'rows':rows}
def fixture(name, types):
    data=(ROOT/'data'/name).read_bytes()
    names=data.decode('utf8').splitlines()[0].split(',')
    return {'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
            'columns':[{'name':n,'label':n,'type':types[n]} for n in names]}
def generate():
    spec=importlib.util.spec_from_file_location('stage1', ROOT/'oracle.py');stage1=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage1)
    base,updated=stage1.load('sales-base.csv'),stage1.load('sales-update.csv')
    initial=[None,*sorted({r['Category'] for r in base if r['Category'] is not None})]
    final=[None,*sorted({r['Category'] for r in updated if r['Category'] is not None})]
    outputs=[stage1.report(updated,[*initial,stage1.OTHER],True),stage1.report(updated,final)]
    rows=read(ROOT/'data/typed.csv')
    for fact in ['Amount','Units']:
        for functions in [FUNCTIONS[:6],FUNCTIONS[6:]]:outputs.append(report(rows,['Region'],[(fact,functions)]))
    scalar=[f for f in FUNCTIONS if f not in {'sum','avg','stddev','sum_squares'}]
    for fact in ['Text','Flag']:outputs.append(report(rows,['Region'],[(fact,scalar)]))
    dates=[f for f in FUNCTIONS if f not in {'sum','sum_squares'}]
    for functions in [dates[:5],dates[5:]]:outputs.append(report(rows,['Region'],[('When',functions)]))
    outputs.append(report(rows,[],[('Amount',['sum','count','avg'])]))
    # Native categories are the Cartesian product of per-dimension values.
    # NULL sorts first; absent key/category intersections stay NULL, including Count.
    dimensions=cartesian_categories(rows,['Category','Channel'])
    keys=['Region','Month'];cols=[{'name':k,'label':k,'type':'string'} for k in keys]
    for i,cat in enumerate(dimensions,1):
        caption='|'.join('<...>' if v is None else v for v in cat)
        for fn in ['sum','count']:cols.append({'name':f'C_{i}_Amount_{SUFFIX[fn]}','label':caption+'|Amount|'+LABELS[fn],'type':result_type('real',fn)})
    groups=defaultdict(list)
    for row in rows:groups[tuple(row[k] for k in keys)].append(row)
    values=[]
    for key,group in groups.items():
        row=dict(zip(keys,key))
        for i,cat in enumerate(dimensions,1):
            vals=[r['Amount'] for r in group if (r['Category'],r['Channel'])==cat]
            for fn in ['sum','count']:row[f'C_{i}_Amount_{SUFFIX[fn]}']=aggregate(vals,fn)
        values.append(row)
    outputs.append({'output_node_type':'transform.cross_table','columns':cols,'rows':values})
    outputs.append({'output_node_type':'transform.cross_table','columns':[{'name':'Region','label':'Region','type':'string'}],'rows':[]})
    outputs.extend([variant_report(),variant_report(ignore_empty=True)])
    sources=[fixture('sales-update.csv',{'RowID':'string','Region':'string','Category':'string','Amount':'real','Quantity':'real'}),fixture('typed.csv',TYPES),fixture('empty.csv',TYPES),fixture('variant-source.csv',{'Key':'string','RealValue':'real','TextValue':'string','FlagValue':'boolean','WhenValue':'datetime'})]
    expected={'package_path':'{{PACKAGE_PATH}}','nodes':[{'type':'imports.text'},{'type':'transform.collapse_columns'},{'type':'transform.cross_table'}],'outputs':outputs,'static_sources':sources}
    assert len(outputs)==15
    (ROOT/'expected.json').write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    manifest={'kind':'source_only','package_basename':'lab12-stage2-source-v3.lgp','file':sources[-1],'collapse':{'information':['Key'],'transposed':['RealValue','TextValue','FlagValue','WhenValue'],'ignore_empty':False},'derived_reports':False}
    (ROOT/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
if __name__=='__main__':generate()
