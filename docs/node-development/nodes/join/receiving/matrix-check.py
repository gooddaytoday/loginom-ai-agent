"""Grouped-join cross-check and mutation audit; no runtime/oracle import.
NULL equality is the pinned fixture rule, not new native semantic acceptance.
"""
import csv
import hashlib
import io
import json
from collections import Counter, defaultdict
from itertools import product
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent / 'acceptance'
def bag(rows):
    return Counter(json.dumps([(type(v).__name__, v) for v in r], ensure_ascii=False) for r in rows)
def parse(raw):
    p = list(csv.reader(io.StringIO(raw.decode('utf-8')), delimiter=';')); names = p[0]
    assert len(set(names)) == len(names) and all(len(r) == len(names) for r in p[1:])
    return names, [[None if v == 'NULL' else int(v) if names[i] in ('Part','PartR') else v for i,v in enumerate(r)] for r in p[1:]]
def grouped(l, r, mode, sensitive, keys):
    ln,ls=parse(l); rn,rs=parse(r)
    def index(rows, names, fields):
        out=defaultdict(list)
        for row in rows:
            values=[row[names.index(f)] for f in fields]
            out[tuple((type(v).__name__,v.lower() if not sensitive and isinstance(v,str) else v) for v in values)].append(row)
        return out
    lg=index(ls,ln,['LKey','Part']); rg=index(rs,rn,['RKey','PartR'])
    chosen=[i for i,n in enumerate(rn) if keys or n not in ('RKey','PartR')]; rows=[]
    for key,left in lg.items():
        if key in rg:rows.extend(a+[b[i] for i in chosen] for a,b in product(left,rg[key]))
        elif mode=='left':rows.extend(a+[None]*len(chosen) for a in left)
    return dict(columns=[dict(name=n,label=n,type='integer' if n in ('Part','PartR') else 'string',data_kind='Дискретный') for n in ln+[rn[i] for i in chosen]],rows=rows)
def compare(a,b):
    assert a['columns']==b['columns'],'positional schema/type/kind'
    assert bag(a['rows'])==bag(b['rows']),'typed multiset/multiplicity'
def rejected(a,b):
    try:compare(a,b)
    except AssertionError:return
    raise AssertionError('adversarial mutation accepted')
pins=json.loads((ROOT/'fixture-pins.json').read_text()); raw={}
for e in json.loads((ROOT/'fixture-manifest.json').read_text()):
    v=(ROOT/'data'/e['file']).read_bytes()
    assert len(v)==e['bytes'] and hashlib.sha256(v).hexdigest()==pins[e['file']]==e['sha256']
    raw[e['file']]=v
expect=json.loads((ROOT/'matrix-expected.json').read_text()); checks=[]
for scenario,lf,rf in [('main','left.csv','right.csv'),('case','case-left.csv','case-right.csv'),('empty','left.csv','empty.csv')]:
    for mode,sensitive,keys in product(['inner','left'],[True,False],[True,False]):
        name=f'{scenario}-{mode}-{sensitive}-{keys}'; got=grouped(raw[lf],raw[rf],mode,sensitive,keys)
        compare(got,expect[name]);checks.append(dict(id=name,rows=len(got['rows']),columns=len(got['columns'])))
inner=grouped(raw['left.csv'],raw['right.csv'],'inner',True,True); left=grouped(raw['left.csv'],raw['right.csv'],'left',True,True)
assert len(inner['rows'])==6 and len(left['rows'])==7 and len(left['columns'])==6
negative=[]
for name,expected in [('inner',inner),('left',left)]:
    for row in range(len(expected['rows'])):
        for col in range(len(expected['columns'])):
            wrong=json.loads(json.dumps(expected));v=wrong['rows'][row][col]
            wrong['rows'][row][col]='__MUTATED__' if v is None or isinstance(v,str) else v+1
            rejected(wrong,expected);negative.append(f'{name}-cell-{row}-{col}')
# Find the actual unmatched B row rather than assume output ordering.
unmatched=next(i for i,r in enumerate(left['rows']) if r[0]=='B')
for name,mutation in [
 ('collapse-many-to-many',lambda x:x['rows'].pop(0)),
 ('truncate-output',lambda x:x['rows'].pop()),
 ('null-to-zero',lambda x:x['rows'][unmatched].__setitem__(3,0)),
 ('null-to-empty',lambda x:x['rows'][unmatched].__setitem__(3,'')),
 ('null-to-literal-null',lambda x:x['rows'][unmatched].__setitem__(3,'null')),
 ('schema-type',lambda x:x['columns'][1].__setitem__('type','string')),
 ('schema-kind',lambda x:x['columns'][1].__setitem__('data_kind','Непрерывный')),
 ('schema-order',lambda x:x['columns'].reverse()),
 ('swapped-ports',lambda x:x['rows'].__setitem__(slice(None),[r[3:]+r[:3] for r in x['rows']])),
]:
    wrong=json.loads(json.dumps(left));mutation(wrong);rejected(wrong,left);negative.append(name)
reordered=json.loads(json.dumps(left));reordered['rows'].reverse();compare(reordered,left)
print(json.dumps(dict(status='OFFLINE_EXPECTATION_AUDIT',fixtures=len(raw),matrix_cases=checks,inner_cells=36,left_cells=42,combined_cells=78,negative_probes=len(negative),row_permutation_accepted=True,runtime_pass=False,native_null_rule_revalidated=False),ensure_ascii=False,indent=2))
