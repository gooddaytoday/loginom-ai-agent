"""Verify this source phase against frozen, local public evidence. No browser/model calls."""
import hashlib, importlib.util, json
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
spec=importlib.util.spec_from_file_location('public_audit',HERE/'public-audit.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def verify(manifest):
 for group in ['evidence','harness','prototype_sources']:
  for path,digest in manifest[group].items():assert sha(ROOT/path)==digest,(group,path)
 pin=hashlib.sha256()
 for item in manifest['client_source_manifest']:
  path=(ROOT/'client/lib'/item['path']).resolve();assert sha(path)==item['sha256'],str(path)
  pin.update((item['path']+'\0').encode());pin.update(path.read_bytes())
 assert pin.hexdigest()==manifest['runtime_revision']
 cells=0
 for case in manifest['cases']:
  body=json.loads((ROOT/case['path']).read_text());cells+=module.audit(body,case['mode'])
 before=json.loads((ROOT/manifest['cases'][0]['path']).read_text());after=json.loads((ROOT/manifest['cases'][3]['path']).read_text())
 a=before['output']['ports'][0];b=after['output']['ports'][0]
 assert a['schema']==b['schema'] and a['exact_table']==b['exact_table']
 assert before['node']['document_id']!=after['node']['document_id'] and before['execution']!=after['execution'] and a['binding']['read_id']!=b['binding']['read_id']
 for key in ['mode','information','transposed','ignore_empty','input_mapping','output_mapping']:assert before['configuration']['readback'][key]==after['configuration']['readback'][key]
 old=ROOT/manifest['before_directory'];new=ROOT/manifest['after_directory']
 first=json.loads((old/'public-restore-import.json').read_text())['output']['configuration']['readback'];second=json.loads((new/'public-restore-import.json').read_text())['output']['configuration']['readback']
 for key in ['source','format','columns','output_mapping']:assert first[key]==second[key]
 save=json.loads((old/'public-save-checkpoint.json').read_text());assert save['status']=='SUCCEEDED' and save['output']['save_completed'] and save['output']['workflow_preserved']
 assert save['output']['workflow_continuations'][0]['document_id']==before['node']['document_id']
 raw=json.loads((old/'public-default-sample.json').read_text());assert raw['status']=='SUCCEEDED';p=raw['output']['output']['ports'][0]
 assert p['row_count']==15 and len(p['sample'])==10 and p['sample_complete'] is False and 'exact_table' not in p
 assert any(c['type']=='variant' and c['precision']=='unverified' for row in p['sample'] for c in row)
 negatives=json.loads((new/'production-native-negatives.json').read_text())
 for key in ['stale','foreign']:assert negatives[key]['accepted'] is False and negatives[key]['before']==negatives[key]['after']
 d=negatives['deactivate'];assert d['accepted'] is False and d['overlapped'];life=d['lifecycle']
 assert life['published'] is False and life['retired'] is True and life['pending']==0 and life['requests']==life['releasedRequests']==life['releasedResponses']==4
 for root in [old,new]:
  session=json.loads((root/'session.json').read_text());assert session['clientRevision']==manifest['runtime_revision'] and session['clientSourceManifest']==manifest['client_source_manifest']
  geometry=json.loads((root/'geometry.json').read_text());assert geometry['viewport'] is None and geometry['window']['width']>=geometry['window']['availableWidth']*.9
  proofs=[json.loads(line) for line in (root/'execution-events.jsonl').open() if '"phase":"collapse_native_full_completed"' in line]
  for proof in proofs:
   p=proof['proof'];assert {f['name']:f['sha256'] for f in p['frontends']}==manifest['frontend_sha256']
   assert p['count_loader_sha256']==manifest['count_loader_sha256']
   life=p['lifecycle'];assert life['published'] is True and life['pending']==0 and life['retired'] is False
   assert life['requests']==life['releasedRequests']==life['releasedResponses']==p['coverage']['cells_read']
  assert len(proofs)==(3 if root==old else 4)
 closed=json.loads((ROOT/'.dock/node16/exact-final-browser-closed.json').read_text());assert closed['all_owned_live_browsers_closed'] and not closed['remaining_owned_browser_or_mcp_pids']
 # The ENOSPC delivery stays ambiguous; no retelling it as an accepted upload.
 interrupted=json.loads((old/'public-nulls-seed.json').read_text());assert interrupted['outcome']['status']=='AMBIGUOUS' and interrupted['phase']=='destination'
 assert (old/'browser-1256.json').stat().st_size==0
 assert 'ℹ pass 1477' in (ROOT/'.dock/node16/exact-final-client-tests.txt').read_text()
 assert 'ℹ fail 0' in (ROOT/'.dock/node16/exact-final-client-tests.txt').read_text()
 return {'status':'PASS','scope':'node16_exact_wiring_source_phase','public_cases':len(manifest['cases']),'native_cells':cells,
  'save_new_session_full_equality':True,'native_change_negatives':3,'runtime_revision':manifest['runtime_revision'],
  'source_files':len(manifest['client_source_manifest']),'evidence_files':len(manifest['evidence']),'hermes_acceptance':False,'subplan_complete':False}
if __name__=='__main__':print(json.dumps(verify(json.loads((HERE/'provenance.json').read_text())),ensure_ascii=False))
