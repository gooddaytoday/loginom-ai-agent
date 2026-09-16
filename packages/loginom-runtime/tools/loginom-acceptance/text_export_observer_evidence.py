"""Independent unadmitted observer proof verifier; no native reader or model call.

`expected` must be derived from the actual public reject/original ledger, not
copied from proof.json. The outer gate stays closed pending native smoke.
"""
import hashlib,json,stat,math
from pathlib import Path
REVISION='node17-reject-read-observer.2-unadmitted'
def sha(data):return hashlib.sha256(data).hexdigest()
def verify_observer(directory,expected,replace_request):
    if not __debug__: return {"passed":False,"reason":"Verifier requires assertions enabled"}
    directory=Path(directory)
    try:
        lines=(directory/'observer.jsonl').read_bytes().splitlines();events=[];previous='0'*64
        assert len(lines)==4,'Missing/extra/incomplete observer events'
        for i,line in enumerate(lines):
            e=json.loads(line);assert e['seq']==i+1 and e['previous']==previous
            assert isinstance(e['mono_ms'],(int,float)) and math.isfinite(e['mono_ms']) and (not events or e['mono_ms']>=events[-1]['mono_ms'])
            previous=sha(line);events.append(e)
        assert [e['kind'] for e in events]==['reject_bound','read_started','read_completed','replace_dispatch']
        b=events[0]['payload'];r=events[2]['payload'];d=events[3]['payload'];read_id=b['read_id']
        for key in ['run_id','session_id','runtime','baseline','reject','identity','source_edge','workflow_ref','origin','overall_deadline_ms']:assert b[key]==expected[key],key
        assert b['observer_revision']==REVISION
        assert b['reject']['status']=='FAILED' and b['reject']['cleanup_complete'] is True and b['reject']['verification']=='text_export_conflict_rejected'
        assert b['baseline']['original_event_index']<b['reject']['terminal_event_index']
        assert events[3]['mono_ms']<b['deadline_ms']<=events[0]['mono_ms']+60000
        assert b['deadline_ms']<=b['overall_deadline_ms']
        assert events[1]['payload']['read_id']==r['read_id']==d['read_id']==read_id
        encoded=json.dumps(replace_request,ensure_ascii=False,separators=(',',':')).encode()
        assert b['request_sha256']==d['request_sha256']==sha(encoded),'Request changed'
        args=replace_request['params']['arguments'];assert args['parameters']['overwrite']=='replace'
        assert r['destination']==b['baseline']['destination']==b['reject']['destination']==args['parameters']['destination']
        assert r['cleanup_complete'] is True and r['workflow_returned'] is True and r['download_count']==1
        assert r['before']==r['after'] and r['before']['complete'] is True
        assert r['before']['settings_verified'] is False and 'settings' not in r['before'] and 'source_settings' not in r['before']
        assert r['before']['workflow_ref']==expected['workflow_ref']
        for key in ['document_id','workflow_id','node_id','source_node_id']:assert r['before'][key]==expected['identity'][key]
        for key in ['graph','workflow_ref']:assert isinstance(r['before'][key],dict) and r['before'][key]
        verify_action_ledger(r['action_ledger'],expected,r['before'],r['after'])
        actions=[json.loads(x) for x in (directory/'observer-actions.jsonl').read_text().splitlines()]
        assert len(actions)==2*len(r['action_ledger'])
        for i,entry in enumerate(r['action_ledger']):
            assert actions[2*i]==dict(phase='prepared',**{k:entry[k] for k in ['seq','step','code_sha256','run_id','session_id','mono_start']})
            assert actions[2*i+1]==dict(phase='completed',**entry)
        assert events[1]['mono_ms']<=r['action_ledger'][0]['mono_start'] and r['action_ledger'][-1]['mono_end']<=events[2]['mono_ms']
        raw=r['raw'];assert [x['kind'] for x in raw]==['snapshot_before','download_listener','download_gesture','download_completed','workflow_return','snapshot_after']
        assert r['listener_before_gesture'] is True
        for i,x in enumerate(raw):assert x['seq']==i+1 and x['read_id']==read_id and x['session_id']==b['session_id'] and x['origin']==b['origin']
        assert raw[0]['payload']==r['before'] and raw[5]['payload']==r['after'] and raw[4]['payload']==b['identity']
        name=Path(r['destination']).name;assert raw[3]['payload']=={'suggested_name':name,'download_completed':True,'destination':r['destination']}
        assert r['native_file']=='reject-baseline/'+read_id+'/'+name and r['native_file']!=b['baseline']['native_file']
        p=directory/r['native_file'];assert p.resolve().is_relative_to(directory.resolve())
        assert all(not x.is_symlink() for x in [p,*p.parents] if x!=directory.parent)
        info=p.lstat();assert stat.S_ISREG(info.st_mode) and info.st_size<=16777216
        data=p.read_bytes();assert len(data)==r['bytes']==b['baseline']['bytes'] and sha(data)==r['sha256']==b['baseline']['sha256']
        # Actual outer dispatcher integration must also require this anchor.
        # A local `replace_dispatch` intent alone is not actual dispatch proof.
        actual=expected['actual_replace_dispatch'];assert actual['operation_id']==args['operation_id']
        assert actual['after_observer_chain_sha256']==previous and actual['mono_ms']>=events[3]['mono_ms']
        assert actual['before_product_dispatch'] is True
        return {'passed':True,'scope':'unadmitted_observer_proof','bytes':len(data),'sha256':sha(data),'global_atomicity_verified':False,'settings_verified':False}
    except (AssertionError,KeyError,TypeError,ValueError,OSError) as e:
        return {'passed':False,'scope':'unadmitted_observer_proof','reason':str(e),'global_atomicity_verified':False,'settings_verified':False}

def project_graph(g,c):
    assert g['complete'] is True and g['interaction_ready'] is True and g['document_id']==c['identity']['document_id'] and g['workflow_ref']==c['workflow_ref']
    for node in [c['identity']['node_id'],c['identity']['source_node_id']]:
        assert len([n for n in g['nodes'] if n['ref']==dict(document_id=c['identity']['document_id'],workflow_id=c['identity']['workflow_id'],node_id=node)])==1
    assert [e for e in g['links'] if e['target']==c['identity']['node_id']]==[c['source_edge']]
    return dict(complete=True,**c['identity'],workflow_ref=g['workflow_ref'],settings_verified=False,graph=dict(nodes=[{k:v for k,v in n.items() if k!='dom_epoch'} for n in g['nodes']],links=g['links'],foreign_links=g['foreign_links']))

def safe_return_refusal(r):
    return (r.get('status')=='NOT_APPLIED' and r.get('phase')=='preconditions'
        and r.get('error',{}).get('code')=='UI_EPOCH_CHANGED' and r.get('effect_possible') is False
        and r.get('cleanup_complete') is True and isinstance(r.get('trace'),list)
        and not any(e.get('event') in ['ui_preconditions_verified','ui_gesture_applied'] for e in r['trace']))

def return_binding(step):
    s,e=step['snapshot'],step['element']
    return dict(document=s.get('dom_epoch',{}).get('document'),workflow=s.get('workflow_ref'),
        active_identity=s.get('active_identity'),package=s.get('package_identity'),
        target={k:e.get(k) for k in ['tid','label','kind','scope']})

def verify_download_reveal(step,response):
    import copy
    from upload_verify import reveal_trace_valid
    s,e=step['snapshot'],step['element'];declaration=step.get('reveal')
    if e['interaction']['state']=='point_observed':
        assert declaration is None
        assert not any(x.get('event') in ['download_file_revealed','download_reveal_confirmed'] for x in response.get('trace',[]))
        return
    assert e['interaction']['state']=='outside_viewport'
    scroll=e['scroll'];assert isinstance(scroll.get('ref'),str) and scroll['ref']
    assert type(scroll['top']) is int and type(scroll['max_top']) is int and 0<=scroll['top']<=scroll['max_top']
    assert declaration=={'file_ref':e['ref'],'owner_ref':scroll['ref'],'from':scroll['top'],'max_top':scroll['max_top'],'limit':1000}
    adjusted=copy.deepcopy(response);trace=adjusted['trace']
    assert len(trace)==3
    moved,confirmed,_=trace
    assert confirmed.pop('max_top_before')==moved['max_top']
    after=confirmed.pop('max_top_after')
    assert type(after) is int and after>=moved['to'] and abs(after-moved['max_top'])<=1
    assert reveal_trace_valid(adjusted,adjusted,s,e['ref']),'Native reveal proof differs'

def verify_search_scroll(step,response,c):
    assert set(step)=={'kind','name','snapshot','element','delta_y'}
    s=step['snapshot'];el=step['element'];b=el['scroll'];root=s['observation_root']
    assert step['name']==Path(c['baseline']['destination']).name
    assert s['authenticated'] is True and s['origin']==c['origin'] and s['loginom_build']=='7.4.2' and not s['ui']['dialogs'] and not s['ui']['masks']
    assert s['file_storage']['directory']=='/test-2'
    prefix=s['workflow_ref']['prefix'];assert root['identity']['anchor_tid']==prefix+';FileStorageForm;pnlFileStorage;tbl'
    assert s['ui']['elements'].count(el)==1 and el['tid'].startswith(prefix+';FileStorageForm;colName_')
    assert 'scroll' in el['allowed_actions'] and el['interaction']['state']=='point_observed'
    assert b['ref']==root['ref'] and type(b['top']) is int and type(b['max_top']) is int and 0<=b['top']<=b['max_top']
    delta=step['delta_y'];assert type(delta) is int and 0<abs(delta)<=1000
    if safe_return_refusal(response):return
    assert response['status']=='SUCCEEDED' and response['cleanup_complete'] is True and response['output']['gesture_applied'] is True
    moves=[e for e in response['trace'] if e['event']=='ui_scroll_applied'];assert len(moves)==1
    m=moves[0];assert m['owner_ref']==b['ref'] and m['from']==b['top'] and m['to']==max(0,min(b['max_top'],b['top']+delta)) and m['to']!=b['top']
    out=response['output'];assert out['workflow_ref']==s['workflow_ref'] and out['file_storage']['directory']==s['file_storage']['directory'] and out['dom_epoch']['document']==s['dom_epoch']['document']

def verify_action_ledger(ledger,c,before,after):
    assert 6<=len(ledger)<=512
    kinds=[e['step']['kind'] for e in ledger];assert kinds[0]==kinds[-1]=='graph'
    assert kinds.count('files')==kinds.count('download')==1
    returns=[e for e in ledger if e['step']['kind']=='return']
    assert 1<=len(returns)<=3 and returns[-1]['response'].get('status')=='SUCCEEDED'
    assert all(safe_return_refusal(e['response']) for e in returns[:-1]),'Unsafe return retry'
    assert all(return_binding(e['step'])==return_binding(returns[0]['step']) for e in returns),'Return owner changed'
    d=kinds.index('download');ret=max(i for i,k in enumerate(kinds) if k=='return');assert 0<d<ret<len(kinds)-1
    assert not any(k in ['files','folder','home','download','search_scroll'] for k in kinds[d+1:])
    search=[e for e in ledger if e['step']['kind']=='search_scroll'];assert len(search)<=36 and sum(e['response'].get('status')=='SUCCEEDED' for e in search)<=12
    refs=set();name=Path(c['baseline']['destination']).name;document_epoch=None;files_owner=None
    graph_owner={k:c['workflow_ref'][k] for k in ['tab_tid','prefix']}
    for i,e in enumerate(ledger):
        step=e['step'];kind=step['kind'];assert kind in ['graph','roots','root','row','files','home','folder','download','return','search_scroll']
        assert e['seq']==i+1 and e['run_id']==c['run_id'] and e['session_id']==c['session_id'] and e['cleanup_complete'] is True
        assert math.isfinite(e['mono_start']) and math.isfinite(e['mono_end']) and e['mono_end']>=e['mono_start'] and (i==0 or e['mono_start']>=ledger[i-1]['mono_end'])
        assert len(e['code_sha256'])==64 and all(x in '0123456789abcdef' for x in e['code_sha256'])
        response=e['response'];refused=kind in ['return','search_scroll'] and safe_return_refusal(response)
        assert refused or 'status' not in response or response['status']=='SUCCEEDED'
        if kind=='search_scroll':
            assert step['element']['ref'] in refs
            verify_search_scroll(step,response,c)
        if kind in ['graph','roots']:assert set(step)=={'kind'}
        if kind=='root':assert set(step)=={'kind','ref'} and step['ref'] in refs
        if kind=='row':assert set(step)=={'kind','name'} and step['name'] in ['test-2',name]
        if kind in ['roots','root','row']:
            obs=response['output'];assert obs['authenticated'] is True and obs['origin']==c['origin'] and obs['loginom_build']=='7.4.2' and not obs['ui']['dialogs']
            epoch=obs['dom_epoch']['document'];assert isinstance(epoch,str) and epoch
            if document_epoch is None:document_epoch=epoch
            assert epoch==document_epoch,'Observer UI document changed'
            owner={k:obs['workflow_ref'][k] for k in ['tab_tid','prefix']};assert all(owner.values())
            fs=obs.get('file_storage',{})
            if kinds.index('files')<i<ret and fs.get('status')=='observed' and fs.get('directory') in ['/','/test-2']:
                if files_owner is None:files_owner=owner
                assert owner==files_owner,'Observer storage owner changed'
            if i>ret:assert owner in [files_owner,graph_owner],'Foreign return owner'
        if kind in ['files','home','folder','return','download']:

            s=step['snapshot'];el=step['element'];assert s['authenticated'] is True and s['origin']==c['origin'] and s['loginom_build']=='7.4.2' and not s['ui']['dialogs'] and not s['ui']['masks']
            assert s['ui']['elements'].count(el)==1 and el['ref'] in refs
            prefix=s['workflow_ref']['prefix']
            expected={'files':'MF;cntMain;tlbMainToolbar;btnFilestorage','home':prefix+';cnrNaviMode;b.s_Сервер>Файлы','return':c['workflow_ref']['tab_tid'],'folder':prefix+';FileStorageForm;colName_test-2','download':prefix+';FileStorageForm;colName_'+name}[kind]
            assert el['tid']==expected and ('double_click' if kind in ['folder','download'] else 'click') in el['allowed_actions']
            assert response['cleanup_complete'] is True
            if kind!='download' and not refused:assert response['output']['gesture_applied'] is True
            if kind=='folder':assert s['file_storage']['directory']=='/' and el['storage_entry']['kind']=='folder' and el['label']=='test-2'
            if kind=='download':
                assert s['file_storage']['directory']=='/test-2' and el['label']==name and el['storage_entry']['bytes']==c['baseline']['bytes']
                verify_download_reveal(step,response)
                out=response['output'];assert out['suggested_name']==name and out['destination']==c['baseline']['destination'] and out['download_completed'] is True
                assert response['observer_download_count']==1 and response['observer_listener_registered'] is True
                assert out['output_binding']==dict(session_id=c['session_id'],document_id=c['identity']['document_id'],workflow_id=c['identity']['workflow_id'],node_id=c['identity']['node_id'],execution_id=c['baseline']['execution_id'],destination=c['baseline']['destination'],directory='/test-2')
        refs.update(x['ref'] for x in response.get('output',{}).get('ui',{}).get('elements',[]))
    assert project_graph(ledger[0]['response'],c)==before and project_graph(ledger[-1]['response'],c)==after
