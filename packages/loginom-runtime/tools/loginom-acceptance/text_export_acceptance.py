"""Node17 full-goal auditor. Reads native bytes; never creates expected native results.

A model run alone remains pending until independent fresh-session evidence is
supplied. Preparatory live evidence is never substituted for a later model run.
"""
import argparse,hashlib,importlib.util,json,stat
from pathlib import Path
from text_export_readiness import require_reject_baseline_reader
from text_export_observer_run import verify_run_observer
from evidence import PREFIX,KNOWLEDGE_TOOLS
from audit import knowledge_scope
from grouping_node_acceptance import model_completed
from preflight import runtime_pin
from user_result_evidence import normalize_user_evidence
from node_public_acceptance_evidence import paired_public_calls,verify_public_delivery
from artifact_delivery_evidence import verify_delivered_import_output
from prepare_binding import verified_prepare_v1
from existing_import_evidence import _verify_existing_import_output
from text_export_import_contract import verify_unchanged_import_request
from import_output_evidence import verify_text_import_output
from node_configuration_evidence import verify_configuration_readback
from text_export_upload_probe import CONTRACT,MANIFEST_URI,MANIFEST_SHA,FIXTURES,prompt,descriptors
WORK=Path(__file__).resolve().parent;ROOT=WORK.parents[1]
_spec=importlib.util.spec_from_file_location('text_export_bytes',WORK/'audit-text-export.py')
bytes_audit=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(bytes_audit)
CASES={x['case']:x for x in CONTRACT['cases']}

def one(values):
    assert len(values)==1,'Expected exactly one evidence record'
    return values[0]
def events_at(directory):return [json.loads(x) for x in (directory/'execution-events.jsonl').read_text().splitlines() if x.strip()]
def terminal(events,op):return one([e['outcome'] for e in events if e.get('operation_id')==op and e.get('phase')=='completed'])
def safe_bytes(path):
    assert not path.is_symlink() and stat.S_ISREG(path.lstat().st_mode) and path.stat().st_size<=16777216
    return path.read_bytes()
def export_check(outcome,case,events,directory,destination):
    c=CASES[case];f=one(outcome['output']['output']['file_artifacts']);paths=list(directory.glob('**/artifacts/input/output-'+f['artifact_id']+'/*'));p=one(paths);assert p.resolve().is_relative_to(directory.resolve())
    data=safe_bytes(p);fixture=json.loads((WORK/'fixtures/text-export'/c['fixture']).read_text())
    result=bytes_audit.audit(outcome,fixture,c['settings'],data,destination,events=events,expected_runtime=CONTRACT['runtime'])
    assert [f['type'] for f in outcome['output']['configuration']['readback']['input_mapping']['fields']]==c['types'],'Independent field types differ'
    assert data==safe_bytes(WORK/'fixtures/text-export'/c['expected_path']) and result['sha256']==c['sha256'] and result['bytes']==c['bytes']
    return result

def preserved(before,after,request,*,new_session=False):
    b=before['output'];a=after['output'];rb=b['configuration']['readback'];ra=a['configuration']['readback']
    assert request['target']['kind']=='existing' and request['inputs']==[] and request['mappings']==[] and set(request['parameters'])=={'destination'}
    assert b['node']['node_id']==a['node']['node_id'] and (b['node']['document_id']!=a['node']['document_id'] or (b['node'].get('workflow_id') and a['node'].get('workflow_id') and b['node']['workflow_id']!=a['node']['workflow_id']))
    assert rb['input_mapping']==ra['input_mapping']
    assert {k:v for k,v in rb['settings'].items() if k!='destination'}=={k:v for k,v in ra['settings'].items() if k!='destination'}
    if b['execution']['status']=='completed':assert b['execution']['execution_id']!=a['execution']['execution_id']
    return {'passed':True,'same_guid_mapping_settings':True,'new_document_or_workflow':True}

def audit_external(run_dir,baseline,external_dir,prefix):
    """External manifest identifies raw receipts, not self-reported PASS flags."""
    m=json.loads((external_dir/'external-manifest.json').read_text());assert m['model_run_directory']==str(run_dir.resolve())
    events=events_at(external_dir);session=json.loads((external_dir/'session.json').read_text());assert session['clientRevision']==CONTRACT['runtime']
    assert session['sessionId'] not in {e['session_id'] for e in baseline['events']}
    prep=json.loads((external_dir/'preparation.json').read_text());assert prep['status']=='READY' and prep['package_ref']['path']==baseline['package_path']
    expected={'changed','typed','wide','zero'};assert set(m['exports'])==expected
    checks={}
    for case,item in m['exports'].items():
        assert Path(item['receipt']).name==item['receipt'];r=json.loads((external_dir/item['receipt']).read_text());before=baseline['results'][item['baseline_operation_id']]
        assert one([e['request'] for e in events if e.get('phase')=='node_apply_prepared' and e.get('operation_id')==r['request']['operation_id']])==r['request']
        checks[case]=export_check(r['result'],case,events,external_dir,r['request']['parameters']['destination']);checks[case]['persistence']=preserved(before,r['result'],r['request'])
        assert r['request']['parameters']['destination'].startswith(prefix+'-external-')
    inventory=json.loads((external_dir/m['inventory_receipt']).read_text());assert inventory['loading'] is False and inventory['count']==inventory['total']==len(inventory['entries'])
    assert any('test-2' in n.get('text','') for n in inventory['navigation'])
    paths={x['FilePath'] for x in inventory['entries']};assert len(baseline['absence_paths'])==2 and all(p not in paths for p in baseline['absence_paths'])
    assert all(x.get('FilePath','').startswith('/test-2/') for x in inventory['matching'])
    return {'passed':True,'checks':checks,'absence_done_close':True,'session':session['sessionId']}

def audit_directory(directory,external_dir=None):
    checks={}
    def check(name,value):
        checks[name]={'passed':bool(value)}
        assert value,name
    try:
        require_reject_baseline_reader()
        request=json.loads((directory/'request.json').read_text());raw=json.loads((directory/'evidence.json').read_text());evidence,projection=normalize_user_evidence(raw);checks['projection']=projection;assert projection['passed'] and projection['scope']=='user_v1_exact_projection_and_prepared_workflow' and request['result_profile']=='user-v1'
        check('declared_goal',request['goal_id']=='text-export-node-complete' and (directory/'scenario.txt').read_text()==prompt((WORK/'goals/text-export-node-complete.txt').read_text(),request['package_path'],request['storage_directory'],request['run_id']))
        check('model',model_completed(request,evidence) and evidence['process']['returncode']==0 and not evidence['process']['timed_out'])
        check('frozen',all(evidence[k] is True for k in ['export_complete','runtime_source_unchanged','harness_unchanged','native_skill_unchanged']) and runtime_pin(ROOT)==request['runtime_source_pin'] and request['runtime_source_pin']['client_revision']==CONTRACT['runtime'])
        check('harness',all((WORK/p).resolve().is_relative_to(WORK) and hashlib.sha256((WORK/p).read_bytes()).hexdigest()==h for p,h in request['harness_inputs'].items()))
        check('catalog',request['manifest_uri']==MANIFEST_URI and request['manifest_sha256']==MANIFEST_SHA)
        check('identity',request['storage_directory']=='/test-2' and request['loginom_url']=='http://logi-test-plan.bg.local/app/?testable=true' and evidence['run_id']==request['run_id'])
        check('auth',evidence['auth_guard']['installed'] is True and evidence['auth_guard']['blocked_attempts']==0 and evidence['auth_connection_unchanged'] is True)
        allowed=KNOWLEDGE_TOOLS|{PREFIX+x for x in ['dock_prepare','dock_action_describe','dock_workspace_observe','dock_diagnostics','dock_operation_inspect','dock_node_apply','dock_node_wait','dock_node_status','dock_artifact_deliver','dock_artifact_delivery_status','dock_action_run']}
        check('tools_scope',all(c['tool'] in allowed for c in evidence['calls']) and all(knowledge_scope(c) for c in evidence['calls'] if c['tool'] in KNOWLEDGE_TOOLS))
        ev=evidence['events'];requests=[e['request'] for e in ev if e.get('phase')=='node_apply_prepared'];check('exact_operations',len(requests)==22 and len({r['operation_id'] for r in requests})==22)
        outcomes={r['operation_id']:terminal(ev,r['operation_id']) for r in requests};pairs,failures=paired_public_calls(evidence);assert not failures
        nodepairs=[(c,t) for c,t in pairs if c['tool'] in {PREFIX+x for x in ['dock_node_apply','dock_node_wait','dock_node_status']}]
        check('public_operation_ids',{c['arguments']['operation_id'] for c,t in nodepairs}==set(outcomes))
        for r in requests:
            own=[(c,t) for c,t in nodepairs if c['arguments']['operation_id']==r['operation_id']];starts=[c for c,t in own if c['tool']==PREFIX+'dock_node_apply'];assert len(starts)==1 and starts[0]['arguments']==r
            settled=[t['result'] for c,t in own if t['result'].get('state')=='settled'];assert settled and all(t.get('outcome')==outcomes[r['operation_id']] and t.get('attempt')==1 for t in settled)
        imports=requests[:3];check('initial_imports',{r['target'].get('label') for r in imports}=={'Main','Typed','Wide'} and all(r['target']['kind']=='new' and r['target']['type']=='imports.text' for r in imports))
        check('input_descriptors',request['input_artifacts']==descriptors(request['run_id'],request['storage_directory']))
        for r in imports:
            name={'Main':'main.csv','Typed':'typed.csv','Wide':'wide.csv'}[r['target']['label']];checks['source_'+name]=verify_text_import_output(ev,r,(WORK/'fixtures/text-export/input'/name).read_bytes());assert checks['source_'+name]['passed']
            checks['source_configuration_'+name]=verify_configuration_readback(ev,r);assert checks['source_configuration_'+name]['passed']
        deliveries=[c for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_deliver'];check('three_deliveries',len(deliveries)==3)
        before=min(c['row'] for c in deliveries);early=dict(evidence,calls=[c for c in evidence['calls'] if c['row']<before],tools=[t for t in evidence['tools'] if t['row']<before]);prep_ids={c['arguments'].get('operation_id','prepare') for c in early['calls'] if c['tool']==PREFIX+'dock_prepare'}
        early['events']=[e for e in ev if e.get('event')!='workspace_prepared' or e.get('state',{}).get('operation_id') in prep_ids]
        prepared=verified_prepare_v1(early,PREFIX,deliveries[0]['session_id'],before);check('owned_draft',prepared is not None)
        check('journal_pins',all(e.get('session_id')==prepared['sessionId'] and e.get('runtime_revision')==CONTRACT['runtime'] and e.get('manifest_sha256')==MANIFEST_SHA for e in ev))
        for r in imports:
            op=r['parameters']['source']['upload_operation_id'].removesuffix(':upload');calls=[c for c in evidence['calls'] if c['tool'] not in (PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status') or c['arguments'].get('operation_id')==op];ids={(c['session_id'],c['tool_call_id']) for c in calls};subset=dict(evidence,calls=calls,tools=[t for t in evidence['tools'] if (t['session_id'],t['tool_call_id']) in ids]);delivery=verify_public_delivery(subset,r,prepared);name={'Main':'main.csv','Typed':'typed.csv','Wide':'wide.csv'}[r['target']['label']];checks['delivery_'+name]=delivery;assert delivery['passed']
            checks['delivered_source_'+name]=verify_delivered_import_output(ev,r,(WORK/'fixtures/text-export/input'/name).read_bytes(),delivery['delivery'],CONTRACT['runtime']);assert checks['delivered_source_'+name]['passed']
            again=one([q for q in requests if q['target']['type']=='imports.text' and q['target']['kind']=='existing' and q['target']['ref']['node_id']==outcomes[r['operation_id']]['output']['node']['node_id']])
            checks['persisted_request_'+name]=verify_unchanged_import_request(ev,r,again,outcomes[r['operation_id']]['output']['node'],(WORK/'fixtures/text-export/input'/name).read_bytes())
            checks['persisted_source_'+name]=_verify_existing_import_output(ev,r,again,(WORK/'fixtures/text-export/input'/name).read_bytes(),reopened_package=True);assert checks['persisted_source_'+name]['passed']
        exp=[r for r in requests if r['target']['type']=='exports.text'];check('export_count',len(exp)==14)
        prefix='/test-2/Dock-export-'+request['run_id'];roles=[('csv','csv.csv'),('typed','typed.csv'),('wide','wide.tsv'),('empty','empty.csv'),('zero','zero.csv'),('tsv','tsv.tsv'),('reject','csv.csv'),('csv','csv.csv'),('done','done.csv'),('close','closed.csv'),('changed','reopen-changed.csv'),('typed','reopen-typed.csv'),('wide','reopen-wide.tsv'),('zero','reopen-zero.csv')]
        before_reopen={};after_reopen={}
        for index,(r,(case,suffix)) in enumerate(zip(exp,roles)):
            op=r['operation_id'];out=outcomes[op];dest=prefix+'-'+suffix;assert r['parameters']['destination']==dest and r['mode']=='delimited' and r['mappings']==[] and r['read']=={'ports':[],'sample_rows':0,'require_exact_numbers':False}
            if index<4:assert r['target']['kind']=='new' and len(r['inputs'])==1
            else:assert r['target']['kind']=='existing' and r['inputs']==[]
            if case=='reject':
                assert r['parameters'].get('overwrite','reject')=='reject' and out['status']=='FAILED' and out['cleanup_complete'] is True
                refused=one([e['receipt'] for e in ev if e.get('operation_id')==op and e.get('phase')=='node_phase_refused']);assert refused['verification']=='text_export_conflict_rejected' and refused['settings_unchanged'] is True and refused['cleanup_complete'] is True
                assert not any(e.get('phase') in ['node_execution_prepared','export_file_bytes_verified'] or (e.get('phase')=='node_phase_completed' and e['receipt']['phase'] in ['finish','execute','read']) for e in ev if e.get('operation_id')==op)
            elif case in ('done','close'):
                assert r['finish']==case and out['status']=='SUCCEEDED' and out['output']['execution']['status']=='not_requested' and not out['output']['output'].get('file_artifacts') and out['output']['configuration']['status']==('applied' if case=='done' else 'discarded') and out['output']['output']['status']=='not_refreshed'
            else:
                assert r['finish']=='execute';checks['bytes_'+str(index)]=export_check(out,case,ev,directory,dest)
                assert out['output']['output']['file_artifacts'][0]['freshness_basis']==('explicit_replace_and_completed_native_execution' if index==7 else 'native_absence_check_and_completed_execution')
            if index==7:
                assert r['parameters']['overwrite']=='replace'
                checks['reject_baseline_observer']=verify_run_observer(directory,request,r)
                assert checks['reject_baseline_observer']['passed']
            if index in [1,2,4,8]:before_reopen[{1:'typed',2:'wide',4:'zero',8:'changed'}[index]]=out
            if index>=10:after_reopen[case]=out;checks['model_persist_'+case]=preserved(before_reopen[case],out,r)
        # Preserve source identity independently of what the export requested.
        ids={r['target']['label']:outcomes[r['operation_id']]['output']['node']['node_id'] for r in imports}
        filt=requests[3];assert filt['target']['type']=='transform.filter_data' and filt['parameters']=={'groups':[[{'field':{'kind':'row_number'},'operator':'>','type':'integer','value':1000}]]}
        fr=outcomes[filt['operation_id']]['output'];assert [p['row_count'] for p in fr['output']['ports']]==[0,5];ids['Empty']=fr['node']['node_id']
        filter_again=one([q for q in requests if q['target']['type']=='transform.filter_data' and q['target']['kind']=='existing']);assert filter_again['parameters']=={} and filter_again['mappings']==[] and filter_again['target']['ref']['node_id']==ids['Empty'];assert [p['row_count'] for p in outcomes[filter_again['operation_id']]['output']['output']['ports']]==[0,5]
        for r,name in zip(exp[:4],['Main','Typed','Wide','Empty']):assert r['inputs']==[{'source':{**outcomes[r['operation_id']]['output']['node'],'node_id':ids[name]},'output':0,'input':0}]
        saves=[e for e in ev if e.get('phase')=='completed' and e.get('action_key') in ['package.save_as','package.save_checkpoint']];check('saves',len(saves)==3 and [e['action_key'] for e in saves]==['package.save_checkpoint','package.save_as','package.save_checkpoint'])
        assert {c['arguments']['operation_id'] for c,t in pairs if c['tool']==PREFIX+'dock_action_run'}=={e['operation_id'] for e in saves}
        for e in saves:
            assert e['parameters']['path']==request['package_path'] and e['outcome']['status']=='SUCCEEDED' and e['outcome']['output']['package_ref']['path']==request['package_path']
            matching=[(c,t) for c,t in pairs if c['tool']==PREFIX+'dock_action_run' and c['arguments']['operation_id']==e['operation_id']];assert len(matching)==1 and matching[0][1]['result']==e['outcome']
        check('separate_session_gate_present',external_dir is not None)
        checks['external']=audit_external(directory,{'events':ev,'package_path':request['package_path'],'results':outcomes,'absence_paths':[prefix+'-done.csv',prefix+'-closed.csv']},external_dir,prefix)
    except (AssertionError,KeyError,TypeError,ValueError,IndexError,OSError) as e:checks['incomplete_or_invalid']={'passed':False,'reason':str(e)}
    return {'passed':bool(checks) and all(c.get('passed') is True for c in checks.values()),'scope':'node17_full_goal','checks':checks}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);p.add_argument('--external-dir',type=Path);args=p.parse_args();report=audit_directory(args.run_dir,args.external_dir);print(json.dumps(report,ensure_ascii=False));raise SystemExit(0 if report['passed'] else 1)
