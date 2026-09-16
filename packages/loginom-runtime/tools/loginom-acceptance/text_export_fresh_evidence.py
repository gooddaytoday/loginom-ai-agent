"""Independent fresh-session receipt adapter; never manufactures journal events."""
import hashlib,json,re,subprocess,types
from pathlib import Path
from datetime import datetime
from text_export_origin import canonical_origin,ORIGIN
from text_export_reopen_owner import graph_identity
from row_filter_configuration_evidence import verify_filter_configuration
from row_filter_output_evidence import verify_filter_output

WORK=Path(__file__).resolve().parent
ROOT=WORK.parents[1]
NODE=Path.home()/'.loginom-dock/releases/0.1.0-dev.20260910.3-80ca61417ec7/runtime/node'

def one(values,reason):
    assert len(values)==1,reason
    return values[0]
def sha(data):return hashlib.sha256(data).hexdigest()
def read(directory,name):
    assert Path(name).name==name, 'Unsafe receipt name'
    p=directory/name;assert p.is_file() and not p.is_symlink(), 'Missing regular receipt'
    return json.loads(p.read_text())
def browser_result(value):
    assert not value.get('isError'), 'Browser receipt reports error'
    text='\n'.join(c['text'] for c in value['content'] if c['type']=='text')
    match=re.search(r'^### Result\n([\s\S]*?)(?:\n### |$)',text)
    assert match, 'Native browser result missing'
    return json.loads(match[1])

def verify_preparation(binding,prep,session,ledger,requests,responses,expected_code,package_path,model_sessions):
    sid=session['sessionId'];seq=binding['preparation_sequence']
    assert sid==binding['session_id']==prep['session_id'] and sid not in model_sessions, 'Fresh session identity differs'
    assert binding['account']=='test-2' and binding['storage_directory']=='/test-2', 'Foreign fresh account/storage'
    assert binding['package_path']==prep['package_ref']['path']==package_path, 'Foreign original package'
    assert binding['loginom_url']==ORIGIN+'/app/?testable=true', 'Foreign preparation URL'
    assert seq==3 and [e['sequence'] for e in ledger]==list(range(1,len(ledger)+1)), 'Missing/reordered browser receipt'
    previous=None
    for e in ledger:
        n=e['sequence'];assert sha(requests[n])==e['request_sha256'] and sha(responses[n])==e['response_sha256'], 'Browser receipt digest differs'
        start,end=map(datetime.fromisoformat,(e['started_at'],e['completed_at']))
        assert start<=end and (previous is None or previous<=start), 'Browser receipt order differs'
        previous=end
    assert json.loads(requests[seq])['code']==expected_code, 'Native preparation invocation differs'
    assert browser_result(json.loads(responses[seq]))==prep, 'Preparation/browser result differs'
    assert browser_result(json.loads(responses[2])) is True, 'Native login receipt missing'
    login=json.loads(requests[2])['code']
    assert '.fill("test-2")' in login and 'LoginForm;Login;btnLogin' in login, 'Login account invocation differs'
    assert prep['status']=='READY' and prep['phase']=='exact_workflow_ready' and prep['authenticated'] is True and prep['target_verified'] is True, 'Unverified fresh preparation'
    assert prep['created_draft'] is False and prep['ownership_verified'] is False and prep['package_ref']['persisted'] is True, 'Expected native open_package semantics'
    assert not any('(только чтение)' in x.get('label','') for x in prep['workflow_ref']['navigation_path']), 'Read-only original'
    geometry=browser_result(json.loads(responses[1]));window=geometry['window']
    assert geometry['viewport'] is None and window['width']==window['outerWidth'] and window['width']>=window['availableWidth']*.9, 'Fresh window not maximized'
    assert window['platform'].startswith('Mac') and 'Chrome/' in window['userAgent'] and canonical_origin(window['origin'])==ORIGIN, 'Native browser platform/origin differs'
    return {'session_id':sid,'prepared_at':ledger[seq-1]['completed_at'],'native_preparation_verified':True}

def bind_fresh(run_dir,baseline,directory,events):
    binding=read(directory,'fresh-binding.json');prep=read(directory,'preparation.json');session=read(directory,'session.json')
    assert binding['version']==1 and Path(binding['model_run_directory']).resolve()==run_dir.resolve(), 'Wrong model run binding'
    assert set(binding['original_files_sha256'])=={'request.json','scenario.txt','evidence.json','full-audit.json'}, 'Incomplete original provenance'
    for name,digest in binding['original_files_sha256'].items():assert sha((run_dir/name).read_bytes())==digest,'Original model evidence changed'
    assert binding['harness_sha256']==sha((WORK/'text-export-fresh.mjs').read_bytes()), 'Fresh harness revision differs'
    model_request=json.loads((run_dir/'request.json').read_text());runtime=model_request['runtime_source_pin']['client_revision']
    assert session['clientRevision']==runtime and all(e['runtime_revision']==runtime and e['session_id']==session['sessionId'] for e in events), 'Foreign fresh runtime/session'
    ledger=[json.loads(x) for x in (directory/'browser-ledger.jsonl').read_text().splitlines()]
    requests={e['sequence']:(directory/('browser-request-'+str(e['sequence'])+'.json')).read_bytes() for e in ledger}
    responses={e['sequence']:(directory/('browser-'+str(e['sequence'])+'.json')).read_bytes() for e in ledger}
    options={'loginomUrl':ORIGIN+'/app/?testable=true','compatibility':{'profile_id':'loginom-7.4.2-macos-chromium','loginom_build':'7.4.2','platform':'macos','browser':'chromium'},'sessionId':session['sessionId'],'operationId':'prepare','intent':'open_package','packagePath':baseline['package_path'],'timeoutMs':15000}
    code="import {makeWorkspacePrepareCode} from './client/lib/workspace.mjs';process.stdout.write(makeWorkspacePrepareCode(JSON.parse(process.argv[1])));"
    expected=subprocess.check_output([str(NODE),'--input-type=module','-e',code,json.dumps(options)],cwd=ROOT,text=True)
    proof=verify_preparation(binding,prep,session,ledger,requests,responses,expected,baseline['package_path'],{e['session_id'] for e in baseline['events']})
    assert all(datetime.fromisoformat(e['recorded_at'])>=datetime.fromisoformat(proof['prepared_at']) for e in events), 'Execution precedes actual fresh preparation'
    assert not any(e.get('event')=='workspace_prepared' for e in events), 'Fresh adapter cannot accept synthesized preparation events'
    # The final model save must be the last successful package mutation and
    # refer to the exact original; model-side audit already verifies public pairs.
    saves=[e for e in baseline['events'] if e.get('phase')=='completed' and e.get('action_key') in ('package.save_as','package.save_checkpoint')]
    last=saves[-1];assert last['action_key']=='package.save_checkpoint' and last['outcome']['status']=='SUCCEEDED' and last['parameters']['path']==baseline['package_path'], 'Original final save missing'
    old_graphs=[e['target_state']['final_graph'] for e in baseline['events'] if e.get('phase')=='node_target_checkpoint' and e['target_state'].get('completed')]
    old_graph=old_graphs[-1]
    assert old_graph['document_id']!=prep['document_id'], 'Fresh browser reused model document'
    assert not any(e.get('action_key') in ('package.save_as','package.save_checkpoint') for e in events), 'Fresh verification must not save original'
    return {'directory':directory,'ledger':ledger,'responses':responses,'prep':prep,'session':session,'runtime':runtime,'old_graph':old_graph,'binding':binding,'proof':proof}

def fresh_origin(events,operation,node,runtime=None,session=None,*,context):
    own=[(i,e) for i,e in enumerate(events) if e.get('operation_id')==operation];assert own,'No fresh operation'
    sid=context['session']['sessionId'];prep=context['prep']
    assert runtime==context['runtime'] and session==sid,'Foreign requested fresh context'
    assert node['document_id']==prep['document_id'] and node['workflow_id']==prep['workflow_ref']['workflow_id'], 'Foreign fresh node owner'
    terminal=one([i for i,e in own if e.get('phase')=='completed'],'Unique fresh completion required')
    observations=[];bound=[]
    for i,e in own:
        assert e['session_id']==sid and e['runtime_revision']==runtime and e.get('manifest_sha256') is None,'Foreign diagnostic receipt context'
        assert canonical_origin(e['target']['origin'])==ORIGIN and e['target']['loginom_build']=='7.4.2','Foreign fresh target'
        o=e.get('outcome',{}).get('output',{})
        if not isinstance(o,dict):continue
        if e.get('phase')=='node_observation_completed':assert 'origin' in o,'Missing native fresh origin'
        if 'origin' not in o:continue
        assert i<terminal and o['authenticated'] is True and o['loginom_build']=='7.4.2','Invalid fresh native observation order'
        origin=canonical_origin(o['origin']);assert origin==ORIGIN
        epoch=o.get('dom_epoch',{}).get('document');assert isinstance(epoch,str) and epoch,'Missing fresh native epoch'
        observations.append((origin,epoch));owner=o.get('prepared_node_context')
        if owner is not None:
            assert owner['verified'] is True and all(owner.get(k)==v for k,v in node.items()),'Foreign fresh native GUID'
            assert all(o['workflow_ref'].get(k)==prep['workflow_ref'][k] for k in ('prefix','tab_tid')),'Foreign fresh tab/prefix'
            if e.get('phase')=='node_observation_completed':bound.append((origin,epoch))
    assert bound and len(set(observations))==1 and set(bound)==set(observations),'Missing/conflicting fresh origin/epoch'
    target=one([e['target_state'] for i,e in own if e.get('phase')=='node_target_checkpoint' and e['target_state'].get('completed')],'Unique fresh native graph required')
    graph=target['final_graph'];assert graph['document_id']==prep['document_id'] and all(graph['workflow_ref'][k]==prep['workflow_ref'][k] for k in ('workflow_id','prefix','tab_tid')),'Foreign fresh graph owner'
    assert graph_identity(context['old_graph'])==graph_identity(graph),'Fresh original GUID/full graph changed'
    assert one([n for n in graph['nodes'] if n['ref']['node_id']==node['node_id']],'Fresh node absent')['ref']==node,'Fresh node identity differs'
    return ORIGIN

def audit_external_fresh(run_dir,baseline,directory,prefix,*,export_check,bytes_audit,preserved):
    events=[json.loads(x) for x in (directory/'execution-events.jsonl').read_text().splitlines()]
    context=bind_fresh(run_dir,baseline,directory,events);m=read(directory,'external-manifest.json')
    assert m['model_run_directory']==str(run_dir.resolve()) and set(m['exports'])=={'changed','typed','wide','zero'}
    assert m['output_prefix']==prefix+'-external-'+context['session']['sessionId']+'-','Nonunique fresh output prefix'
    # Clone the immutable byte auditor function with the explicit fresh origin
    # adapter; every byte/configuration/execution assertion remains unchanged.
    byte_function=types.FunctionType(bytes_audit.audit.__code__,{**bytes_audit.audit.__globals__,'observed_origin':lambda *a,**k:fresh_origin(*a,**k,context=context)},bytes_audit.audit.__name__,bytes_audit.audit.__defaults__)
    check_export=types.FunctionType(export_check.__code__,{**export_check.__globals__,'bytes_audit':types.SimpleNamespace(audit=byte_function)},export_check.__name__,export_check.__defaults__)
    checks={}
    for case,item in m['exports'].items():
        receipt=read(directory,item['receipt']);request=receipt['request'];before=baseline['results'][item['baseline_operation_id']]
        assert one([e['request'] for e in events if e.get('phase')=='node_apply_prepared' and e.get('operation_id')==request['operation_id']],'Fresh request declaration differs')==request
        assert request['parameters']['destination']==m['output_prefix']+{'changed':'changed.csv','typed':'typed.csv','wide':'wide.tsv','zero':'zero.csv'}[case]
        checks[case]=check_export(receipt['result'],case,events,directory,request['parameters']['destination']);checks[case]['persistence']=preserved(before,receipt['result'],request)
    empty=read(directory,m['empty_receipt']);request=empty['request'];result=empty['result'];assert request['parameters']=={} and request['inputs']==[] and request['mappings']==[] and result['status']=='SUCCEEDED','Empty was reconfigured or failed'
    assert request['target']['type']=='transform.filter_data' and request['target']['kind']=='existing'
    baseline_filter=one([o for o in baseline['results'].values() if o.get('output',{}).get('node',{}).get('node_id')==result['output']['node']['node_id'] and o.get('output',{}).get('configuration',{}).get('readback',{}).get('kind')=='row_filter' and o['output']['operation_id'].startswith('reopen-')],'Model Empty baseline missing')
    assert result['output']['configuration']['readback']['groups']==baseline_filter['output']['configuration']['readback']['groups'],'Empty saved groups changed'
    checks['empty_configuration']=verify_filter_configuration(events,request);assert checks['empty_configuration']['passed']
    model_ports=baseline_filter['output']['output']['ports'];columns=[{k:c[k] for k in ('name','label','type','data_kind')} for c in model_ports[0]['schema']];expected_ports=[[],json.loads((WORK/'fixtures/text-export/escaping.json').read_text())['rows']]
    checks['empty_output']=verify_filter_output(events,request,columns,expected_ports);assert checks['empty_output']['passed']
    assert checks['empty_output']['execution_id']!=baseline_filter['output']['execution']['execution_id'],'Stale Empty execution'
    end=one([i for i,e in enumerate(events) if e.get('operation_id')==request['operation_id'] and e.get('phase')=='completed'],'Missing Empty completion')
    zero=read(directory,m['exports']['zero']['receipt'])['request']['operation_id'];start=one([i for i,e in enumerate(events) if e.get('operation_id')==zero and e.get('phase')=='node_apply_prepared'],'Missing zero preparation');assert end<start,'Empty execution must precede zero'
    inventory=read(directory,m['inventory_receipt']);assert inventory['loading'] is False and inventory['count']==inventory['total']==len(inventory['entries'])
    assert any(n.get('text')=='test-2' for n in inventory['navigation'])
    paths={x['FilePath'] for x in inventory['entries']};assert len(baseline['absence_paths'])==2 and all(p not in paths for p in baseline['absence_paths'])
    assert all(x.get('FilePath','').startswith('/test-2/') for x in inventory['matching'])
    native_inventory=[]
    for e in context['ledger']:
        try:value=browser_result(json.loads(context['responses'][e['sequence']]))
        except (AssertionError,ValueError,KeyError):continue
        if value==inventory:native_inventory.append(e)
    assert len(native_inventory)==1 and datetime.fromisoformat(native_inventory[0]['completed_at'])>max(datetime.fromisoformat(e['recorded_at']) for e in events),'Native complete inventory receipt missing or out of order'
    cleanup=read(directory,'session-cleanup.json');assert cleanup=={'package_closed':True,'unsaved_changes_discarded':True,'logged_out':True,'account':'test-2'},'Own session not cleanly closed'
    native_cleanup=[]
    for e in context['ledger']:
        try:value=browser_result(json.loads(context['responses'][e['sequence']]))
        except (AssertionError,ValueError,KeyError):continue
        if value==cleanup:native_cleanup.append(e)
    assert len(native_cleanup)==1 and datetime.fromisoformat(native_cleanup[0]['completed_at'])>max(datetime.fromisoformat(e['recorded_at']) for e in events),'Native cleanup receipt missing or out of order'
    discard=read(directory,'package-discard.json')
    assert discard=={'package_closed':True,'unsaved_changes_discarded':True,'original_package':baseline['package_path']},'Original discard binding missing'
    discarded=[]
    for e in context['ledger']:
        try:value=browser_result(json.loads(context['responses'][e['sequence']]))
        except (AssertionError,ValueError,KeyError):continue
        if value==discard:discarded.append(e)
    assert len(discarded)==1 and native_inventory[0]['sequence']<discarded[0]['sequence']<native_cleanup[0]['sequence'],'Original discard/logout order differs'

    return {'passed':True,'checks':checks,'absence_done_close':True,'session':context['session']['sessionId'],'actual_preparation_browser_receipt':True,'original_graph_guid_verified':True,'original_not_saved':True,'session_cleanup_verified':True}
