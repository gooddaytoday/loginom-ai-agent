"""Contract2 outer binding from the actual run journal, never observer claims.

Native admission is still independently blocked by text_export_readiness.py.
"""
import hashlib,json,re
from pathlib import Path
from text_export_observer_evidence import verify_observer
from text_export_origin import observed_origin

def one(xs):
    if len(xs)!=1:raise ValueError('Unique actual observer anchor required')
    return xs[0]
def sha(data):return hashlib.sha256(data).hexdigest()
def verify_run_observer(directory,run,replace_request):
    checks={'passed':False,'scope':'node17_contract2_run_binding','settings_verified':False,'global_atomicity_verified':False}
    try:
        if not __debug__:raise ValueError('Assertions must remain enabled')
        root=(directory/'observer').resolve();assert root.parent==directory.resolve() and not (directory/'observer').is_symlink()
        actual=one([json.loads(x) for x in (root/'actual-dispatch.jsonl').read_text().splitlines()]);assert actual['seq']==1 and actual['run_id']==run['run_id']
        assert re.fullmatch(r'[A-Za-z0-9-]{1,128}',actual['session_id'])
        session_dir=directory/'private/dock-state/sessions'/actual['session_id'];assert session_dir.resolve().is_relative_to(directory.resolve()) and not session_dir.is_symlink()
        session=json.loads((session_dir/'session.json').read_text());assert session['sessionId']==actual['session_id'] and session['clientRevision']==run['runtime_source_pin']['client_revision']
        raw=(session_dir/'execution-events.jsonl').read_bytes().splitlines(keepends=True);count=actual['journal_line_count'];assert isinstance(count,int) and 0<count<len(raw)
        prefix=b''.join(raw[:count]);assert sha(prefix)==actual['journal_prefix_sha256']
        events=[json.loads(x) for x in raw];past=events[:count]
        assert all(e['session_id']==session['sessionId'] and e['runtime_revision']==session['clientRevision'] for e in past)
        prepared=one([(i,e) for i,e in enumerate(events) if e.get('phase')=='node_apply_prepared' and e.get('operation_id')==replace_request['operation_id']]);assert prepared[0]>=count and prepared[1]['request']==replace_request
        wire=actual['request'];assert wire['method']=='tools/call' and wire['params']['name']=='dock_node_apply' and {**wire['params']['arguments'],'workflow_ref':replace_request['workflow_ref']}==replace_request
        assert wire['params']['arguments']['workflow_ref'] in [replace_request['workflow_ref'],{'workflow_id':replace_request['workflow_ref']['workflow_id']}]
        destination=replace_request['parameters']['destination'];assert destination==f"/test-2/Dock-export-{run['run_id']}-csv.csv" and replace_request['parameters']['overwrite']=='replace'
        original_i,original=one([(i,e) for i,e in enumerate(past) if e.get('phase')=='completed' and any(f.get('destination')==destination for f in e.get('outcome',{}).get('output',{}).get('output',{}).get('file_artifacts',[]))])
        f=one(original['outcome']['output']['output']['file_artifacts']);node=original['outcome']['output']['node'];assert original['outcome']['status']=='SUCCEEDED' and f['freshness_basis']=='native_absence_check_and_completed_execution'
        refused=one([e for e in past if e.get('phase')=='node_phase_refused' and e.get('receipt',{}).get('verification')=='text_export_conflict_rejected' and e['receipt']['before_node']['node_id']==node['node_id']])
        ri,reject=one([(i,e) for i,e in enumerate(past) if e.get('phase')=='completed' and e['operation_id']==refused['operation_id']])
        assert original_i<ri and reject['outcome']['status']=='FAILED' and reject['outcome']['cleanup_complete'] is True and refused['receipt']['cleanup_complete'] is True
        assert reject['parameters']['parameters']['destination']==destination and reject['parameters']['parameters'].get('overwrite')!='replace'
        assert replace_request['target']['ref']==node==reject['parameters']['target']['ref'] and replace_request['workflow_ref']==original['parameters']['workflow_ref'] and replace_request['document_id']==node['document_id']
        inp=one(original['parameters']['inputs']);source=inp['source'];assert source['document_id']==node['document_id'] and source['workflow_id']==node['workflow_id']
        si,se=one([(i,e) for i,e in enumerate(past) if e.get('phase')=='completed' and e.get('outcome',{}).get('output',{}).get('node',{}).get('node_id')==source['node_id'] and e['outcome']['status']=='SUCCEEDED']);assert si<original_i
        completed={e['operation_id'] for e in past if e.get('phase')=='completed'}
        assert all(e['operation_id'] in completed for e in past if e.get('phase')=='node_apply_prepared')
        assert not any(e.get('phase')=='completed' for e in past[ri+1:])
        bound=json.loads((root/'observer.jsonl').read_text().splitlines()[0])['payload']
        # Deadline is a host-clock bound, not reconstructed from wall-clock UI
        # dates. The outer run timeout and wrapper source pin bind its origin.
        assert actual['mono_ms']<bound['overall_deadline_ms']
        expected=dict(run_id=run['run_id'],session_id=session['sessionId'],runtime=session['clientRevision'],origin=observed_origin(past,original['operation_id'],node,runtime=session['clientRevision'],session=session['sessionId']),overall_deadline_ms=bound['overall_deadline_ms'],workflow_ref=replace_request['workflow_ref'],identity={**node,'source_node_id':source['node_id']},source_edge=dict(source=source['node_id'],output=inp['output'],target=node['node_id'],input=inp['input']),
            baseline=dict(original_event_hash=sha(raw[original_i].rstrip(b'\r\n')),original_event_index=original_i,operation_id=original['operation_id'],execution_id=f['execution_id'],destination=destination,bytes=f['bytes'],sha256=f['sha256'],native_file='artifacts/input/output-'+f['artifact_id']+'/'+Path(destination).name,source_event_hash=sha(raw[si].rstrip(b'\r\n')),source_event_index=si),
            reject=dict(terminal_event_hash=sha(raw[ri].rstrip(b'\r\n')),terminal_event_index=ri,operation_id=reject['operation_id'],status='FAILED',cleanup_complete=True,verification='text_export_conflict_rejected',destination=destination),actual_replace_dispatch=actual)
        original_file=session_dir/expected['baseline']['native_file'];assert original_file.resolve().is_relative_to(session_dir.resolve()) and not original_file.is_symlink()
        assert original_file.stat().st_size<=16777216
        data=original_file.read_bytes();assert len(data)==f['bytes'] and sha(data)==f['sha256']
        result=verify_observer(root,expected,wire);assert result['passed'],result.get('reason')
        checks.update(passed=True,proof=result)
    except (AssertionError,KeyError,TypeError,ValueError,IndexError,OSError) as e:checks['reason']=str(e)
    return checks
