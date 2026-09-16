"""Exact independent cell check for the additional Id→EntityId regression case."""
import importlib.util,json
from pathlib import Path
P=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('native_scalar_oracle',P/'exact-wiring/public-audit.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
def audit(body):
 expected=json.loads((P/'acceptance-kit/expected.json').read_text())['mapped']
 assert body['status']=='SUCCEEDED' and body['result_version']=='user-v1' and body['cleanup_complete'] is True
 p=body['output']['ports'][0];schema=[expected['schema'][i] for i in [1,2,3,4]]+[['EntityId','Id','integer']]
 assert [[c['name'],c['label'],c['type']] for c in p['schema']]==schema
 assert p['row_count']==15 and p['exact_table']['complete'] is True
 assert len(p['exact_table']['rows'])==15
 for actual,original in zip(p['exact_table']['rows'],expected['rows']):
  wanted=[original[i] for i in [1,2,3,4,0]];assert len(actual)==5
  for cell,value,definition in zip(actual,wanted,schema):oracle.cell(cell,value,definition[2])
 assert p['sample']==p['exact_table']['rows'][:10]
 assert p['read_coverage']==dict(cells_read=75,rows_read=15,columns_read=5,table_complete=True)
 c=body['configuration']['readback'];assert [f['name'] for f in c['information']]==['EntityId','Zone']
 assert [f['name'] for f in c['transposed']]==['S','I','R','B','D'] and c['ignore_empty'] is False
 assert any(f['name']=='EntityId' and f['source_name']=='Id' for f in c['input_mapping']['fields'])
 return {'case':'renamed-effective-input','cells':75,'passed':True,'hermes_acceptance':False}
if __name__=='__main__':
 import sys
 print(json.dumps(audit(json.loads(Path(sys.argv[1]).read_text()))))
