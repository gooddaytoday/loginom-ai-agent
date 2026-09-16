"""Frozen cleanup goal and output oracle; Loginom performs every conversion."""
import hashlib
from reform_upload_probe import FIXTURE_SHA

INITIAL_CHANGES=[
 dict(field=dict(kind='input_field',name='RawAmount'),name='Amount',label='Значение',type='real',data_kind='Непрерывный'),
 dict(field=dict(kind='input_field',name='RawFlag'),name='Enabled',label='Значение',type='boolean',data_kind='Дискретный'),
 dict(field=dict(kind='input_field',name='RawWhen'),name='Timestamp',label='Время',type='datetime',data_kind='Непрерывный'),
 dict(field=dict(kind='input_field',name='Unused'),excluded=True)]
FINAL_CHANGES=[dict(field=dict(kind='input_field',name='RawAmount'),name='NetAmount',label='Сумма',usage='Показатель'),
               dict(field=dict(kind='input_field',name='Comment'),excluded=True)]


def goal_output(source_bytes,final):
    if hashlib.sha256(source_bytes).hexdigest()!=FIXTURE_SHA:raise ValueError('reform_fixture_sha')
    columns=[dict(name=n,label=l,type=t) for n,l,t in [('Id','Id','integer'),('Amount','Значение','real'),
        ('Enabled','Значение','boolean'),('Timestamp','Время','datetime'),('Comment','Comment','string')]]
    rows=[['1','3.545',True,'2024-02-29 23:59:58.000','Привет'],['2','-42.2',False,'2000-01-01 00:00:00.000',''],
          ['3',None,None,None,'東京'],['4',None,None,None,''],['5',None,None,None,None],
          ['6','0',False,'1899-12-30 00:00:00.000','Конец']]
    if not final:return columns,rows
    columns[1]=dict(name='NetAmount',label='Сумма',type='real')
    return [columns[i] for i in (3,0,1,2)],[[row[i] for i in (3,0,1,2)] for row in rows]


def verify_goal(seed,initial,changed,source_bytes):
    failures=[]
    def need(v,msg):
        if not v:failures.append(msg)
    try:
        goal_output(source_bytes,False)
        need(seed['target']['kind']=='new' and seed['target']['type']=='imports.text' and seed['mode']=='delimited' and seed['target']['label']=='Данные','seed_target')
        settings=seed['parameters']['settings']
        need(all(settings['source'].get(k)==v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()),'seed_source')
        fmt=settings['format']
        need(all(fmt.get(k)==v for k,v in dict(delimiter=';',text_qualifier='"',decimal_separator=',',null_marker='NULL').items()),'seed_format')
        cols=settings['columns'];names=['Id','RawAmount','RawFlag','RawWhen','Comment','Unused']
        need([c['name'] for c in cols]==names and all(c['label']==n and c['used'] is True and c['type']==('integer' if i==0 else 'string')
            and c['data_kind']==('Непрерывный' if i==0 else 'Дискретный') for i,(n,c) in enumerate(zip(names,cols))),'seed_columns')
        def identity_mapping(mapping, preserve_autosync=True):
            fields=mapping.get('fields',[])
            return mapping.get('port')==0 and (mapping.get('autosync') is True if preserve_autosync else type(mapping.get('autosync')) is bool) and len(fields)==len(cols) and all(
                f.get('source')==dict(kind='configured_field',name=c['name']) and f.get('name',c['name'])==c['name']
                and f.get('label',c['label'])==c['label'] and f.get('excluded',False) is False for f,c in zip(fields,cols))
        need(seed['inputs']==[] and (seed['mappings']==[] or len(seed['mappings'])==1
            and seed['mappings'][0].get('direction')=='output' and identity_mapping(seed['mappings'][0],preserve_autosync=False)),'seed_preserved_mapping')
        def complete_read(read):return read.get('ports')==[0] and type(read.get('sample_rows')) is int and 6<=read['sample_rows']<=10 and read.get('require_exact_numbers') is True
        need(seed['finish']=='execute' and complete_read(seed['read']),'seed_read')
        for r,patch,final in [(initial,INITIAL_CHANGES,False),(changed,FINAL_CHANGES,True)]:
            need(r['target']['type']=='transform.reform_columns' and r['mode']=='scalar','reform_type')
            need(r['target']['kind']==('existing' if final else 'new') and (final or r['target']['label']=='Очистка'),'reform_target')
            need(sorted(r['parameters']['changes'],key=lambda c:c['field']['name'])==sorted(patch,key=lambda c:c['field']['name']),'reform_exact_patch')
            need(r['finish']=='execute' and complete_read(r['read']),'reform_read')
            incoming=[m for m in r['mappings'] if m.get('direction')=='input'];mappings=[m for m in r['mappings'] if m.get('direction')=='output']
            need(len(mappings)==1 and len(incoming)<=1 and all(identity_mapping(m) for m in incoming) and len(incoming)+len(mappings)==len(r['mappings']),'one_output_mapping')
            m=mappings[0];expected,_=goal_output(source_bytes,final)
            need(m['direction']=='output' and m['port']==0 and m['autosync'] is False,'output_mapping')
            need([f['source'] for f in m['fields']]==[dict(kind='configured_field',name=c['name']) for c in expected],'output_order')
            need(all(set(f)<= {'source','name','label','excluded'} and f.get('name',c['name'])==c['name']
                and f.get('label',c['label'])==c['label'] and f.get('excluded',False) is False for f,c in zip(m['fields'],expected)),'output_properties')
    except (KeyError,TypeError,ValueError,IndexError):failures.append('malformed_goal')
    return dict(passed=not failures,failures=failures)
