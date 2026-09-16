"""Independent empty/mapped diagnostics; mapped variant precision stays open."""
import copy
import json
from pathlib import Path

def audit_empty(r, operation="node16-empty-collapse"):
    assert r['operation_id']==operation and r['status']=='SUCCEEDED'
    o=r['output'];p=o['output']['ports'][0];c=o['configuration']['readback']
    assert c['node']==o['node'] and o['execution']['status']=='completed'
    assert p['fresh'] is True and p['execution_id']==o['execution']['execution_id']
    assert p['table']['port_guid']==p['port_guid'] and p['port']==0
    assert p['row_count']==0 and p['sample']==[] and p['sample_rows']==0 and p['sample_complete'] is True
    assert [(f['name'],f['label'],f['type']) for f in p['schema']]==[('Names','Имена','string'),('DisplayNames','Метки','string'),('Values','Значения','variant'),('DataTypes','Типы данных','integer')]
    assert c['information']==[] and c['ignore_empty'] is False
    expected_input={'Id':'integer','Zone':'string','I':'integer','R':'real','S':'string','B':'boolean','D':'datetime'}
    fields=c['input_mapping']['fields']
    assert len(fields)==7 and {f['name']:f['type'] for f in fields}==expected_input
    assert all(f['source_name']==f['name'] for f in fields)
    assert [f['name'] for f in c['transposed']]==['S','I','R','B','D']
    assert [(f['name'],f['type'],f['excluded']) for f in c['output_mapping']['fields']]==[('Names','string',False),('DisplayNames','string',False),('Values','variant',False),('DataTypes','integer',False)]
    assert o['package_saved'] is False and c['package_persistence_verified'] is False

def audit_mapped(r):
    assert r['operation_id']=='node16-reordered-mapping' and r['status']=='SUCCEEDED'
    o=r['output'];c=o['configuration']['readback'];p=o['output']['ports'][0]
    assert c['node']==o['node'] and o['execution']['status']=='completed'
    assert p['fresh'] is True and p['execution_id']==o['execution']['execution_id']
    assert p['table']['port_guid']==p['port_guid'] and p['port']==0
    assert c['input_mapping']['autosync'] is False and c['output_mapping']['autosync'] is False
    assert [f['name'] for f in c['input_mapping']['fields']]==['D','B','S','R','I','Zone','Id']
    assert [f['source_name'] for f in c['input_mapping']['fields']]==['D','B','S','R','I','Zone','Id']
    assert [(f['name'],f['order']) for f in c['information']]==[('Zone',0),('Id',1)]
    assert [(f['name'],f['order']) for f in c['transposed']]==list(zip(['D','B','S','I','R'],range(5)))
    expected=[('Metric','Показатель','string','Names',False),('Scalar','Значение','variant','Values',False),('Key','Ключ','integer','Id',False),('Zone','Zone','string','Zone',False),('DisplayNames','Метки','string','DisplayNames',False),('DataTypes','DataTypes','integer','DataTypes',True)]
    assert [(f['name'],f['label'],f['type'],f['source_name'],f['excluded']) for f in c['output_mapping']['fields']]==expected
    assert [(f['name'],f['label'],f['type']) for f in p['schema']]==[f[:3] for f in expected[:-1]]
    assert p['row_count']==9 and p['sample_rows']==9 and len(p['sample'])==9 and p['sample_complete'] is True
    assert [row[0]['value'] for row in p['sample']]==['D','B','S','I','R','B','S','I','R']
    assert [row[3]['value'] for row in p['sample']]==['Москва']*5+['Юг']*4
    assert all(len(row)==5 and row[1]['type']=='variant' and row[1]['precision']=='unverified' and 'value' not in row[1] for row in p['sample'])
    assert 'variant_display_precision' in p['precision']['limitations']
    assert c['ignore_empty'] is True and c['package_persistence_verified'] is False

def negatives(r,kind,operation="node16-empty-collapse"):
    audit=(lambda value:audit_empty(value,operation)) if kind=='empty' else audit_mapped
    edits=[lambda r:r.update(operation_id='old'),lambda r:r['output']['output']['ports'][0].update(execution_id='old'),lambda r:r['output']['configuration']['readback'].update(node={}),lambda r:r['output']['output']['ports'][0]['schema'][0].update(label='wrong'),lambda r:r['output']['output']['ports'][0]['schema'][2].update(type='string'),lambda r:r['output']['output']['ports'][0].update(row_count=999),lambda r:r['output']['configuration']['readback']['transposed'].reverse()]
    if kind=='empty':edits += [lambda r:r['output']['configuration']['readback']['input_mapping']['fields'].pop(),lambda r:r['output']['configuration']['readback']['input_mapping']['fields'][0].update(source_name='wrong')]
    if kind=='mapped':edits += [lambda r:r['output']['configuration']['readback']['input_mapping']['fields'].reverse(),lambda r:r['output']['configuration']['readback']['output_mapping']['fields'][0].update(label='wrong'),lambda r:r['output']['output']['ports'][0]['sample'][0][1].update(value=1,precision='exact')]
    for change in edits:
        altered=copy.deepcopy(r);change(altered)
        try:audit(altered)
        except (AssertionError,KeyError):continue
        raise AssertionError('negative mutation accepted')
    return len(edits)

if __name__=='__main__':
    import sys
    kind=sys.argv[1];r=json.loads(Path(sys.argv[2]).read_text());operation=sys.argv[3] if len(sys.argv)>3 else 'node16-empty-collapse'
    if kind=='empty':audit_empty(r,operation)
    else:audit_mapped(r)
    print(json.dumps({'case':kind,'diagnostic':'PASS','negative_mutations_rejected':negatives(r,kind,operation),'full_exact_variant_acceptance':'BLOCKED'},indent=2))
