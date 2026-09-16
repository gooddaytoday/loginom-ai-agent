"""Frozen case oracle; no handler code, browser or model. PASS is case-only."""
import importlib.util,json,sys,hashlib
from pathlib import Path
P=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('native_oracle',P.parent/'exact-wiring/public-audit.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
def audit(body,key):
 e=json.loads((P/'expected.json').read_text())[key]
 assert body['status']=='SUCCEEDED' and body['result_version']=='user-v1' and body['cleanup_complete'] is True
 out=body['output'];assert out['status']=='complete' and out['workflow_returned'] is True and len(out['ports'])==1
 p=out['ports'][0];schema=e['schema'];rows=e['rows'];assert p['fresh'] is True and p['port']==0
 assert [[c['name'],c['label'],c['type']] for c in p['schema']]==schema
 assert [c['index'] for c in p['schema']]==list(range(len(schema)))
 actual=p['exact_table']['rows'];assert len(actual)==p['row_count']==len(rows) and p['exact_table']['complete'] is True
 for a,w in zip(actual,rows):
  assert len(a)==len(w)==len(schema)
  for c,v,s in zip(a,w,schema):oracle.cell(c,v,s[2])
 assert p['sample']==actual[:10] and p['sample_rows']==min(10,len(rows)) and p['sample_complete']==(len(rows)<=10)
 assert p['read_coverage']==dict(cells_read=len(rows)*len(schema),rows_read=len(rows),columns_read=len(schema) if rows else 0,table_complete=True)
 assert p['read_consistency']==dict(kind='observed_local',changed=False,exclusive_operation=True,stability_basis='owned_static_completed_fixture',atomic_snapshot=False,unobserved_aba_excluded=False)
 assert p['cell_precision']==dict(cells='exact_native',temporal='native_serial_only')
 b=p['binding'];assert b['execution']==body['execution'] and b['execution']['status']=='completed'
 assert all(b[k]==body['node'][k] for k in ['document_id','workflow_id','node_id'])
 assert b['port_guid']==p['port_guid'] and b['execution']['execution_id']==p['execution_id']==out['execution_id']
 assert b['read_id'] and b['package_id'] and b['execution']['execution_id'].startswith(b['document_id']+':')
 c=body['configuration']['readback'];assert c['kind']=='collapse' and c['mode']=='unpivot'
 assert [f['name'] for f in c['information']]==e['information'] and [f['name'] for f in c['transposed']]==e['transposed'] and c['ignore_empty']==e['ignore_empty']
 assert [f['name'] for f in c['output_mapping']['fields'] if not f['excluded']]==[s[0] for s in schema]
 assert [f['name'] for f in c['output_mapping']['fields'] if f['excluded']]==e['output_excluded']
 return dict(case=key,cells=len(rows)*len(schema),status='CASE_PASS',autonomous_acceptance=False)
if __name__=='__main__':print(json.dumps(audit(json.loads(Path(sys.argv[2]).read_text()),sys.argv[1])))
