"""Final-source R16 correction verifier. Reads frozen evidence, never calls browser/models."""
import hashlib,importlib.util,json
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
spec=importlib.util.spec_from_file_location('public_audit',HERE.parent/'exact-wiring/public-audit.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
def read(path):return json.loads((ROOT/path).read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def verify(m):
 for group in ['evidence','tools']:
  for p,h in m[group].items():assert sha(ROOT/p)==h,p
 h=hashlib.sha256()
 for f in m['client_source_manifest']:
  p=(ROOT/'client/lib'/f['path']).resolve();assert sha(p)==f['sha256'];h.update((f['path']+'\0').encode());h.update(p.read_bytes())
 assert h.hexdigest()==m['runtime_revision']
 total=0;results={}
 for c in m['cases']:
  b=read(c['path']);total+=audit.audit(b,c['mode']);results[c['name']]=b
  directory=(ROOT/c['path']).parent
  events=[json.loads(l) for l in (directory/'execution-events.jsonl').read_text().splitlines()]
  binding=b['output']['ports'][0]['binding']
  matches=[e['proof'] for e in events if e.get('phase')=='collapse_native_full_completed' and e['proof']['read_id']==binding['read_id']]
  assert len(matches)==1;p=matches[0]
  assert p['binding']['runtime_binding_id']==p['loaded_runtime']['binding_id']==binding['read_id']
  assert p['loaded_runtime']['document_id']==binding['document_id']
  assert p['loaded_runtime']['functions']==m['loaded_functions'] and p['loaded_runtime']['constants']==m['loaded_constants']
  assert {f['name']:f['sha256'] for f in p['frontends']}==m['frontend_sha256']
  life=p['lifecycle'];assert life['published'] and life['pending']==0 and not life['retired']
  assert life['requests']==life['releasedRequests']==life['releasedResponses']==p['coverage']['cells_read']
  lineage=p['source_profile']['source']['lineage'];assert lineage['basis']=='private_ordered_upload_history' and isinstance(lineage['execution_sequence'],int)
  assert lineage['sha256']==p['source_profile']['source']['sha256'] and lineage['external_writers_excluded'] is False
  # Verify actual user-v1 MCP delivery, its escaped text copy and whole reply budget.
  wire=[json.loads(l) for l in (directory/'public-api.jsonl').read_text().splitlines()]
  deliveries=[e['reply'] for e in wire if e.get('phase')=='response' and e.get('reply',{}).get('structuredContent')==b]
  assert deliveries
  for reply in deliveries:assert json.loads(reply['content'][0]['text'])==b and len(json.dumps(reply,ensure_ascii=False,separators=(',',':')).encode())<=1048576
 before,after=results['mixed'],results['reopened'];a,b=before['output']['ports'][0],after['output']['ports'][0]
 assert a['schema']==b['schema'] and a['exact_table']==b['exact_table']
 assert before['node']['node_id']==after['node']['node_id'] and before['node']['document_id']!=after['node']['document_id']
 for k in ['mode','information','transposed','ignore_empty','input_mapping','output_mapping']:assert before['configuration']['readback'][k]==after['configuration']['readback'][k]
 saved=read(m['save']);assert saved['status']=='SUCCEEDED' and saved['output']['save_completed'] and saved['output']['workflow_preserved']
 assert saved['output']['package_ref']['path']==m['package_path']
 events=[json.loads(l) for l in (ROOT/m['after_directory']/'execution-events.jsonl').read_text().splitlines()]
 reqs=[e['request'] for e in events if e.get('phase')=='node_apply_prepared' and e.get('operation_id') in ['node16-public-import','node16-public-exact']]
 assert len(reqs)==2 and reqs[0]['parameters']['settings']=={} and reqs[1]['parameters']=={} and all(r['mappings']==[] for r in reqs)
 old_import=read(m['before_import'])['output']['configuration']['readback'];new_import=read(m['after_import'])['output']['configuration']['readback']
 for k in ['source','format','columns','output_mapping']:assert old_import[k]==new_import[k]
 stale=read(m['stale_refusal']);assert stale['status']=='NOT_APPLIED' and stale['effect_possible'] is False and stale['cleanup_complete'] is True
 same=read(m['same_after_execution']);assert same['same_bytes_after_execution_full']=='SUCCEEDED' and same['first']=='9007199254740993'
 unknown=read(m['unknown']);assert unknown['status']=='AMBIGUOUS' and unknown['unknown_write_in_private_history'] and unknown['exact_gate_accepted'] is False and unknown['original_operation_replayed'] is False and unknown['gate_tested']=='production import source lineage preflight' and unknown['gateError'].startswith('Upload lineage:') and unknown['native_receipt_lost']
 negative=read(m['runtime_negative']);assert negative['controlled_change']['before']==negative['controlled_change']['after'] and negative['controlled_change']['accepted'] is False and negative['changed_loaded_code_accepted'] is False and negative['restored_functions_verified']==53
 sample=read(m['default_sample'])['output']['output']['ports'][0];assert sample['row_count']==15 and len(sample['sample'])==10 and 'exact_table' not in sample
 assert read(m['typescript'])['status']=='PASS' and read(m['typescript'])['version']=='5.2.2'
 tests=(ROOT/m['tests']).read_text();assert 'ℹ pass 1483' in tests and 'ℹ fail 0' in tests and 'ℹ skipped 1' in tests
 assert read(m['closed'])['closed'] is True
 return {'status':'PASS','runtime_revision':m['runtime_revision'],'public_cases':len(m['cases']),'native_cells':total,'loaded_functions':53,'R16_1':'PASS','R16_2':'PASS','R16_3':'PASS','save_new_session_full_equality':True,'hermes_acceptance':False,'subplan_complete':False}
if __name__=='__main__':print(json.dumps(verify(read(str(HERE.relative_to(ROOT)/'provenance.json'))),ensure_ascii=False))
