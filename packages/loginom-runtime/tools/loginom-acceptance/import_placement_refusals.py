"""Exact text-import placement refusal, distinct from its earlier storage upload.

This is a component proof, not import-output or full-goal acceptance. No input
events/calls are removed; the enclosing auditor checks projection and successors.
"""
from copy import deepcopy
import re
from evidence import PREFIX
from user_result_evidence import project_node


def source_proof(evidence, pairs, request, source, start):
    from missing_values_refusals import one
    events=evidence['events']; op=request['operation_id']
    upload=source['upload_operation_id']; verify=source['verification_id']
    assert len({op,upload,verify})==3
    path=request['parameters']['settings']['source']['source_path']
    assert source['destination']==path and type(source['bytes']) is int and source['bytes']>=0
    assert re.fullmatch('[0-9a-f]{64}',source['sha256'])
    supplied=request['parameters']['source']
    assert set(supplied)<= {'artifact_id','upload_operation_id','bytes','sha256'}
    assert all(source[k]==v for k,v in supplied.items())
    assert all(k in supplied for k in ('artifact_id','upload_operation_id'))
    delivery=one([e for e in events if e.get('phase')=='artifact_delivery_completed' and e['result'].get('upload_operation_id')==upload])
    delivery_id=delivery['operation_id'];assert upload==delivery_id+':upload' and verify==delivery_id+':verify'
    wanted={op,upload,verify,delivery_id}
    related=[e for e in events if e.get('operation_id') in wanted]
    assert all(all(e[k]==start[k] for k in ('session_id','runtime_revision','manifest_sha256')) for e in related)
    def row(phase,oid):return one([e for e in related if e.get('operation_id')==oid and e.get('phase')==phase])
    prepared=row('prepared',upload); submitted=row('completed',upload); transfer=row('transfer_completed',upload)
    dp=row('download_prepared',verify); downloaded=row('download_completed',verify)
    checked=row('download_verified',verify); final=row('verification_completed',verify)
    admitted=prepared['checkpoint']['artifact']; grant=admitted['upload']
    assert admitted['artifact_id']==source['artifact_id'] and all(admitted[k]==source[k] for k in ('bytes','sha256'))
    assert path==grant['destination']==grant['directory']+'/'+admitted['name'] and grant['overwrite'] in ('reject','replace') and grant['grant_id']
    args=prepared['parameters']
    assert set(args)=={'artifact_id','upload_grant_id','observation_id','destination','overwrite'} and args['observation_id']
    assert args==dict(artifact_id=admitted['artifact_id'],upload_grant_id=grant['grant_id'],observation_id=args['observation_id'],destination=path,overwrite=grant['overwrite'])
    for e in (submitted,transfer):
        assert e['parameters']==args and e['checkpoint']==prepared['checkpoint'] and e['action_key']=='artifact.upload'
    assert prepared['checkpoint']['file_storage']['status']=='observed' and prepared['checkpoint']['file_storage']['directory']==grant['directory']
    for e in (dp,downloaded,checked,final):
        assert e['checkpoint']==dp['checkpoint'] and e['checkpoint']['artifact']==admitted and e['parameters']==dp['parameters']
        assert e['parameters']['upload_operation_id']==upload and e['parameters']['observation_id']
    raw=downloaded['outcome']; verified=checked['outcome']; finalized=final['outcome']; done=transfer['outcome']
    for value,oid,key in ((raw,verify,'artifact.download'),(verified,verify,'artifact.verify'),(finalized,verify,'artifact.verify'),(done,upload,'artifact.upload')):
        assert value['status']=='SUCCEEDED' and value['operation_id']==oid and value['action_key']==key
        assert value['cleanup_complete'] is True and value['effect_possible'] is True and value['error'] is None
    expected=dict(artifact_id=admitted['artifact_id'],upload_grant_id=grant['grant_id'],upload_operation_id=upload,destination=path,suggested_name=admitted['name'],download_completed=True,bytes_verification_required=True,file_ref=raw['output']['file_ref'],observation_id=dp['parameters']['observation_id'])
    assert raw['output']==expected and expected['file_ref']
    assert verified['output']==dict(expected,bytes_verification_required=False,bytes_verified=True,bytes=source['bytes'],sha256=source['sha256'],upload_completion_verified=False)
    expected_final=deepcopy(verified);expected_final['output']['upload_completion_verified']=True;assert finalized==expected_final
    assert verified['trace']==raw['trace']
    discovery=one([t for t in raw['trace'] if t.get('event')=='artifact_file_discovered'])
    binding=dp['checkpoint']['discovery'];assert all(discovery[k]==binding[k] for k in ('document','workflow_ref','active_tab_ref'))
    assert discovery['file_ref']==expected['file_ref'] and discovery['directory']==grant['directory']
    assert discovery['file_tid']==binding['workflow_ref']['prefix']+';FileStorageForm;colName_'+re.sub(r'\s','_',admitted['name']).replace(',','')
    moves=[t for t in raw['trace'] if t.get('event')=='artifact_discovery_scroll']
    assert discovery['scrolls']==len(moves)<=16
    previous=None
    for move in moves:
        assert all(type(move[k]) in (int,float) for k in ('from','to','actual','max'))
        assert move['applied'] is True and move['grid_tid']==binding['workflow_ref']['prefix']+';FileStorageForm;pnlFileStorage;tbl'
        assert move['directory']==grant['directory'] and move['actual']==move['to'] and 0<abs(move['to']-move['from'])<=700 and 0<=move['to']<=move['max']
        assert previous is None or move['from']==previous
        previous=move['to']
    gesture=one([t for t in raw['trace'] if t.get('event')=='download_gesture_result'])
    assert gesture['status']=='SUCCEEDED' and gesture['cleanup_complete'] is True and gesture['error_code'] is None
    proof=dict(verification_id=verify,status='SUCCEEDED',bytes_verified=True,upload_completion_verified=True,destination=path,bytes=source['bytes'],sha256=source['sha256'])
    original=submitted['outcome'];assert original['operation_id']==upload and original['cleanup_complete'] is True and original['effect_possible'] is True
    assert original['output']==dict(upload_submitted=True,artifact_id=admitted['artifact_id'],upload_grant_id=grant['grant_id'],destination=path,bytes=source['bytes'],sha256=source['sha256'],verification_required=True)
    assert original['status']=='AMBIGUOUS' and original['error']['code']=='UPLOAD_SERVER_VERIFICATION_REQUIRED'
    assert done['output']==dict(original['output'],verification_required=False,transfer_postcondition='destination_bytes_digest_and_size',server_copy_verification=proof)
    assert done['trace']==original['trace'] and one([t for t in done['trace'] if t.get('event')=='upload_native_input_settled'])['policy']==grant['overwrite']
    assert delivery['result']==dict(status='SUCCEEDED',upload_operation_id=upload,destination=path,bytes=source['bytes'],sha256=source['sha256'],verification_id=verify,cleanup_complete=True,upload_completion_verified=True)
    delivery_start=row('artifact_delivery_prepared',delivery_id)
    assert all(delivery_start[k]==admitted[k] for k in ('artifact_id','bytes','sha256'))
    assert delivery_start['overwrite']==grant['overwrite'] and delivery_start['destination']==path
    assert row('artifact_delivery_upload_receipt',delivery_id)['upload']==original
    # Only the observed internal upload settlement is permitted. No public
    # recovery or delivery resume is admitted by this refusal classification.
    assert [e['phase'] for e in related if e['operation_id']==delivery_id]==['artifact_delivery_prepared','artifact_delivery_upload_receipt','artifact_delivery_completed']
    assert [e['phase'] for e in related if e['operation_id']==upload]==['prepared','completed','reconciled','transfer_completed']
    reconciled=row('reconciled',upload)
    assert reconciled['outcome']==original and reconciled['parameters']==args and reconciled['checkpoint']==prepared['checkpoint']
    assert [e['phase'] for e in related if e['operation_id']==verify]==['download_prepared','download_completed','download_verified','verification_completed']
    chain=[delivery_start,prepared,submitted,dp,downloaded,checked,transfer,final,delivery,start]
    assert [events.index(e) for e in chain]==sorted(set(events.index(e) for e in chain))
    starts=[(c,t) for c,t in pairs if c['tool']==PREFIX+'dock_artifact_deliver' and c['arguments'].get('operation_id')==delivery_id]
    call,_=one(starts); assert call['arguments']['artifact_id']==admitted['artifact_id'] and call['arguments']['upload_grant_id']==grant['grant_id']
    prep_call,prep_reply=one([(c,t) for c,t in pairs if c['tool']==PREFIX+'dock_prepare' and t['result'].get('prepared') is True and t['result'].get('sessionId')==start['session_id'] and t['row']<call['row']])
    assert prep_reply['result']['workspace']['document_id']==request['document_id']
    assert one([a for a in prep_reply['result']['input_artifacts'] if a['artifact_id']==admitted['artifact_id']])==admitted
    public=[(c,t) for c,t in pairs if c['tool'] in {PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status'} and c['arguments'].get('operation_id')==delivery_id]
    terminal=[]
    for c,t in public:
        v=t['result'];assert v['state'] in ('running','settled')
        assert project_node(dict(operation_id=delivery_id,state=v['state'],outcome=delivery['result'] if v['state']=='settled' else None,error=None))==v
        if v['state']=='settled':terminal.append(t['row'])
    node_calls=[c['row'] for c,t in pairs if c['tool']==PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==op]
    assert terminal and node_calls and min(terminal)<min(node_calls)
    return dict(source=source,upload_effect_possible=True,refused_node_effect_possible=False)


def prove(evidence,pairs,request,declaration,end):
    from missing_values_refusals import one,digest,graph_proof
    r=request;op=r['operation_id'];events=evidence['events'];rows=[e for e in events if e.get('operation_id')==op]
    assert r['target']['kind']=='new' and r['target']['type']=='imports.text' and r['mode']=='delimited' and r['inputs']==[]
    allowed={'prepared','node_apply_prepared','node_phase_prepared','node_phase_completed','node_target_checkpoint','node_target_effect_prepared','node_target_refusal_observed','node_phase_refused','completed','verification_delivered'}
    assert all(e.get('phase') in allowed for e in rows)
    start=one([e for e in rows if e['phase']=='prepared'])
    assert start['action_key']=='node.apply' and start['parameters']==r and start['checkpoint']==end['checkpoint'] and events.index(start)<events.index(declaration)
    assert all(e.get('operation_id')==op for e in events[events.index(start):events.index(end)+1])
    sig=digest(dict(request=r,handler_revision='text-import-output-v2'));assert declaration['signature']==sig
    prepared=[e for e in rows if e['phase']=='node_phase_prepared'];accepted=[e for e in rows if e['phase']=='node_phase_completed']
    assert [e['receipt']['phase'] for e in prepared]==['source','workflow','target']
    assert [e['receipt']['phase'] for e in accepted]==['source','workflow']
    for e in prepared+accepted:
        assert e['signature']==sig and e['receipt']['receipt_id']==op+':'+e['receipt']['phase']
    for i,e in enumerate(accepted):
        receipt=e['receipt'];v=receipt['value']
        assert receipt['status']=='verified' and receipt['effect_possible'] is False
        assert v['verified'] is True and v['cleanup_complete'] is True and v['effect_possible'] is False
        assert rows.index(prepared[i])<rows.index(e)<rows.index(prepared[i+1])
    workflow=accepted[1]['receipt']['value']
    assert workflow['status']=='SUCCEEDED' and workflow['document_id']==r['document_id'] and workflow['workflow_ref']==r['workflow_ref']
    assert workflow['trace']==[dict(event=kind,document_id=r['document_id'],workflow_ref=r['workflow_ref'],tab_tid=r['workflow_ref']['tab_tid'],active=True) for kind in ('prepared_workflow_observed','prepared_workflow_active')]
    refused=one([e for e in rows if e['phase']=='node_phase_refused']);f=refused['receipt'];assert refused['signature']==sig
    assert f==dict(prepared[-1]['receipt'],status='NOT_APPLIED',effect_possible=False,cleanup_complete=True)
    out=end['outcome'];n=out['output']
    assert out['operation_id']==op and out['action_key']=='node.apply' and out['action_revision']==r['contract_revision']
    assert out['status']==n['status']=='NOT_APPLIED' and out['effect_possible'] is n['effect_possible'] is False
    assert out['cleanup_complete'] is n['cleanup_complete'] is True and out['trace']==[] and out['error']==n['error']
    assert out['error']['code']=='NODE_APPLY_STOPPED' and n['warnings']==[]
    assert n['operation_id']==op and n['node'] is None and n['pending_phase'] is None and n['package_saved'] is False
    assert n['execution']==dict(status='not_requested',execution_id=None) and n['output']==dict(status='not_refreshed',evidence_ref=None,ports=[])
    assert n['phases']==[{k:v for k,v in e['receipt'].items() if k!='value'} for e in accepted]
    proof=source_proof(evidence,pairs,r,accepted[0]['receipt']['value']['source'],start)
    attempts=graph_proof(events,r)
    graph_phases=[e['phase'] for e in rows if e['phase'].startswith('node_target_')]
    assert graph_phases==['node_target_checkpoint']+['node_target_effect_prepared','node_target_refusal_observed','node_target_checkpoint']*attempts
    assert all(e['receipt']['before_node'] is None for e in prepared)
    assert all(e['target_state']['baseline']['foreign_links']==[] for e in rows if e['phase']=='node_target_checkpoint')
    first=next(e for e in rows if e['phase']=='node_target_effect_prepared');last=[e for e in rows if e['phase']=='node_target_refusal_observed'][-1]
    assert rows.index(prepared[-1])<rows.index(first)<rows.index(last)<rows.index(refused)<rows.index(end)
    return dict(request=r,outcome=out,attempts=attempts,**proof)
