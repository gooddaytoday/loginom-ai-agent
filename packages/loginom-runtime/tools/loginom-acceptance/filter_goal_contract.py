"""Frozen filter cleanup goal with an independent value oracle."""
import hashlib
import json
from pathlib import Path
from decimal import Decimal
from datetime import datetime
from filter_upload_probe import FIXTURE_SHA,FIXTURE
from row_filter_oracle import load_rows,partition
from row_filter_configuration_evidence import normalize_groups

def condition(name,type,operator,**values):return dict(field=dict(kind='input_field',name=name),type=type,operator=operator,**values)
INITIAL_GROUPS=[[condition('Amount','real','not_null'),condition('Text','string','not_null'),condition('Text','string','<>',value='',case_sensitive=True)]]
FINAL_GROUPS=[[condition('Amount','real','>=',value=1.23456),condition('When','datetime','<=',value='2024-01-02T12:30:01'),condition('Flag','boolean','is_true')],
              [condition('Text','string','contains',value='Tail',case_sensitive=False)]]
COLUMNS=[dict(name=n,label=n,type=t,data_kind='Непрерывный' if n=='Amount' else 'Дискретный') for n,t in
 [('Id','integer'),('Amount','real'),('Flag','boolean'),('When','datetime'),('Text','string')]]


def goal_output(source_bytes,final):
    if hashlib.sha256(source_bytes).hexdigest()!=FIXTURE_SHA:raise ValueError('filter_fixture_sha')
    rows=load_rows(Path(__file__).parent/FIXTURE)
    ports=partition(rows,FINAL_GROUPS if final else INITIAL_GROUPS)
    def value(v):
        if isinstance(v,datetime):return v.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        if isinstance(v,Decimal):return str(v)
        return v
    return COLUMNS,[[[value(row[c['name']]) for c in COLUMNS] for row in port] for port in ports]


def logical_groups(groups):
    # AND order within a group and OR group order do not change this goal.
    return sorted(sorted(json.dumps(c,sort_keys=True,ensure_ascii=False) for c in g) for g in normalize_groups(groups))


def verify_goal(seed,initial,changed,source_bytes):
    failures=[]
    def need(v,msg):
        if not v:failures.append(msg)
    try:
        goal_output(source_bytes,False)
        need(seed['target']['kind']=='new' and seed['target']['type']=='imports.text' and seed['mode']=='delimited' and seed['target']['label']=='Данные','seed_target')
        settings=seed['parameters']['settings'];fmt=settings['format']
        need(all(settings['source'].get(k)==v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()),'seed_source')
        need(all(fmt.get(k)==v for k,v in dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker='NULL').items()),'seed_format')
        columns=settings['columns']
        need(len(columns)==len(COLUMNS) and all(
            column.get('source_name',expected['name'])==expected['name']
            and {k:v for k,v in column.items() if k!='source_name'}==dict(expected,used=True)
            for column,expected in zip(columns,COLUMNS)),'seed_columns')
        def identity(m,autosync):
            fields=m.get('fields',[])
            return m.get('autosync') is autosync and len(fields)==5 and all(
                f.get('source')==dict(kind='configured_field',name=c['name']) and set(f)<= {'source','name','label','excluded'}
                and f.get('name',c['name'])==c['name'] and f.get('label',c['label'])==c['label'] and f.get('excluded',False) is False for f,c in zip(fields,COLUMNS))
        need(seed['inputs']==[] and (seed['mappings']==[] or len(seed['mappings'])==1 and seed['mappings'][0].get('direction')=='output'
            and seed['mappings'][0].get('port')==0 and identity(seed['mappings'][0],seed['mappings'][0].get('autosync'))),'seed_mapping')
        def read(r,ports):return r['finish']=='execute' and r['read'].get('ports')==ports and r['read'].get('sample_rows')==10 and r['read'].get('require_exact_numbers') is True
        need(read(seed,[0]),'seed_read')
        for r,groups,final in [(initial,INITIAL_GROUPS,False),(changed,FINAL_GROUPS,True)]:
            need(r['target']['type']=='transform.filter_data' and r['mode']=='conditions','filter_type')
            need(r['target']['kind']==('existing' if final else 'new') and (final or r['target']['label']=='Отбор'),'filter_target')
            need(logical_groups(r['parameters']['groups'])==logical_groups(groups),'filter_conditions')
            need(read(r,[0,1]),'filter_read')
            if final:need(r['mappings']==[],'preserve_output_mappings')
            else:
                output=[m for m in r['mappings'] if m.get('direction')=='output'];incoming=[m for m in r['mappings'] if m.get('direction')=='input']
                need(len(incoming)<=1 and all(m.get('port')==0 and identity(m,True) for m in incoming),'input_mapping')
                need(len(output)==2 and sorted(m['port'] for m in output)==[0,1] and all(identity(m,False) for m in output)
                     and len(incoming)+len(output)==len(r['mappings']),'both_output_mappings')
    except (KeyError,TypeError,ValueError,IndexError):failures.append('malformed_goal')
    return dict(passed=not failures,failures=failures)
