#!/usr/bin/env python3
"""Independent diagnostic smoke audit. Never invokes browser/model or edits raw evidence."""
import copy,hashlib,json,shutil,sys,tempfile
from pathlib import Path
from text_export_acceptance import export_check,terminal,bytes_audit,CASES,WORK
from text_export_observer_run import verify_run_observer
from text_export_origin import observed_origin

def native_audit(r,replace_request=None):
    run=json.loads((r/'request.json').read_text());sessions=list((r/'private/dock-state/sessions').iterdir());assert len(sessions)==1;s=sessions[0]
    events=[json.loads(x) for x in (s/'execution-events.jsonl').read_text().splitlines()]
    request=replace_request or json.loads((r/'replace-body.json').read_text());dest=request['parameters']['destination']
    original=terminal(events,'smoke-original');replaced=terminal(events,'smoke-replace');reject=terminal(events,'smoke-reject')
    result={'scope':'native diagnostic smoke, not user-v1 or Hermes acceptance','original':export_check(original,'csv',events,r,dest),'replace':export_check(replaced,'csv',events,r,dest)}
    assert reject['status']=='FAILED' and reject['cleanup_complete'] is True
    assert not any(e.get('operation_id')=='smoke-reject' and e.get('phase')=='node_execution_prepared' for e in events)
    result['reject_no_execution']=True
    result['outer']=verify_run_observer(r,run,request);assert result['outer']['passed'],result['outer']
    obs=[json.loads(x) for x in (r/'observer/observer.jsonl').read_text().splitlines()]
    ledger=obs[2]['payload']['action_ledger'];result['observer_elapsed_ms']=obs[-1]['mono_ms']-obs[0]['mono_ms'];assert result['observer_elapsed_ms']<=60000
    result['observer_downloads']=sum(e['step']['kind']=='download' for e in ledger);assert result['observer_downloads']==1
    result['actual_dispatch_count']=len((r/'observer/actual-dispatch.jsonl').read_text().splitlines());assert result['actual_dispatch_count']==1
    result['replace_prepared_count']=sum(e.get('operation_id')=='smoke-replace' and e.get('phase')=='node_apply_prepared' for e in events);assert result['replace_prepared_count']==1
    c=CASES['csv'];fixture=json.loads((WORK/'fixtures/text-export'/c['fixture']).read_text());data=(WORK/'fixtures/text-export'/c['expected_path']).read_bytes()
    result['baseline_event_negatives']=bytes_audit.challenge_events(original,fixture,c['settings'],data,dest,events,run['runtime_source_pin']['client_revision'])
    origin_negatives=[]
    for kind in ['missing_origin','foreign_origin','foreign_epoch','foreign_document','foreign_workflow','foreign_session','foreign_profile','foreign_build','foreign_platform','foreign_browser','stale_observation','conflicting_target_origin']:
        changed=copy.deepcopy(events);e=next(x for x in changed if x.get('operation_id')=='smoke-original' and x.get('phase')=='node_observation_completed');o=e['outcome']['output']
        if kind=='missing_origin':o.pop('origin')
        elif kind=='foreign_origin':o['origin']='https://foreign.invalid'
        elif kind=='foreign_epoch':o['dom_epoch']['document']='stale'
        elif kind=='foreign_document':o['prepared_node_context']['document_id']='foreign'
        elif kind=='foreign_workflow':o['workflow_ref']['prefix']='foreign'
        elif kind=='foreign_session':e['session_id']='foreign'
        elif kind=='foreign_profile':e['target']['profile_id']='foreign'
        elif kind=='foreign_build':e['target']['loginom_build']='7.4.1'
        elif kind=='foreign_platform':e['target']['platform']='foreign'
        elif kind=='foreign_browser':e['target']['browser']='foreign'
        elif kind=='stale_observation':changed.remove(e);changed.append(e)
        elif kind=='conflicting_target_origin':e['target']['origin']='https://foreign.invalid'
        try:observed_origin(changed,'smoke-original',original['output']['node'],run['runtime_source_pin']['client_revision'],s.name)
        except (AssertionError,KeyError):origin_negatives.append(kind)
        else:raise AssertionError('Accepted native origin mutation: '+kind)
    result['rejected_native_origin_tamperings']=len(origin_negatives)
    changes=[(0,['run_id'],'old-run'),(0,['session_id'],'old-session'),(0,['runtime'],'old-runtime'),
      (0,['baseline','original_event_index'],999999),(0,['reject','cleanup_complete'],False),(0,['deadline_ms'],4),
      (2,['destination'],'/test-2/other.csv'),(2,['bytes'],3),(2,['sha256'],'0'*64),(2,['cleanup_complete'],False),
      (2,['workflow_returned'],False),(2,['download_count'],2),(2,['listener_before_gesture'],False),(2,['native_file'],'original/result.csv'),
      (2,['after','settings_verified'],True),(2,['after','workflow_ref','workflow_id'],'other'),(2,['after','graph','nodes'],[]),(2,['before','complete'],False),
      (2,['raw',1,'kind'],'download_gesture'),(2,['raw',3,'payload','suggested_name'],'old.csv'),(2,['raw',3,'session_id'],'old-session'),
      (2,['raw',4,'payload','node_id'],'other'),(3,['read_id'],'old-read'),(3,['request_sha256'],'0'*64)]
    negatives=[]
    with tempfile.TemporaryDirectory(prefix='node17-native-negatives-') as tmp:
        target=Path(tmp)/r.name;target.mkdir();shutil.copytree(r/'observer',target/'observer');ss=target/'private/dock-state/sessions'/s.name;ss.mkdir(parents=True)
        for name in ['session.json','execution-events.jsonl']:shutil.copy2(s/name,ss/name)
        f=original['output']['output']['file_artifacts'][0];relative=Path('artifacts/input')/('output-'+f['artifact_id'])/Path(dest).name
        (ss/relative).parent.mkdir(parents=True);shutil.copy2(s/relative,ss/relative)
        actual=json.loads((r/'observer/actual-dispatch.jsonl').read_text())
        for index,path,value in changes:
            changed=copy.deepcopy(obs);item=changed[index]['payload']
            for key in path[:-1]:item=item[key]
            item[path[-1]]=value;previous='0'*64;lines=[]
            for i,e in enumerate(changed):
                e.update(seq=i+1,previous=previous);line=json.dumps(e,ensure_ascii=False,separators=(',',':'));previous=hashlib.sha256(line.encode()).hexdigest();lines.append(line)
            (target/'observer/observer.jsonl').write_text('\n'.join(lines)+'\n')
            actions=[]
            for e in changed[2]['payload']['action_ledger']:
                actions.extend([dict(phase='prepared',**{k:e[k] for k in ['seq','step','code_sha256','run_id','session_id','mono_start']}),dict(phase='completed',**e)])
            (target/'observer/observer-actions.jsonl').write_text('\n'.join(json.dumps(x) for x in actions)+'\n')
            (target/'observer/actual-dispatch.jsonl').write_text(json.dumps({**actual,'after_observer_chain_sha256':previous})+'\n')
            check=verify_run_observer(target,run,request);assert not check['passed'],str(path);negatives.append(path)
    result['rejected_native_proof_tamperings']=len(negatives)
    result['runtime_unchanged']=all(hashlib.sha256(Path(n).read_bytes()).hexdigest()==h for n,h in run['runtime_source_pin']['inputs'].items())
    result['harness_unchanged']=all(hashlib.sha256((WORK/n).read_bytes()).hexdigest()==h for n,h in run['harness_inputs'].items())
    assert result['runtime_unchanged'] and result['harness_unchanged']
    result.update(passed=True,candidate_evidence_ready=True,settings_verified=False,global_atomicity_verified=False,hermes_acceptance=False)
    return result
if __name__=='__main__':
    r=Path(sys.argv[1]).resolve()
    try:result=native_audit(r)
    except Exception as e:result={'passed':False,'candidate_evidence_ready':False,'reason':type(e).__name__+': '+str(e)}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    with (r/'native-audit.json').open('x') as out:json.dump(result,out,ensure_ascii=False,indent=2);out.write('\n')
    sys.exit(0 if result.get('passed') else 1)
