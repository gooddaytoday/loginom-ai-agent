"""Independent transfer completion from same-session server-copy byte proof."""
from prepare_binding import successful_prepare
import copy
import upload_probe
import rename_effect
import math
from urllib.parse import urlsplit
from datetime import datetime


def pending_upload_ui_refusal(call, evidence, prefix):
    """Only the new persisted before-browser guard receipt can waive a call."""
    try:
        if call.get('tool')!=prefix+'dock_ui_action':return False
        args=call['arguments'];op=args['operation_id'];session=call['session_id']
        key=(session,call['tool_call_id'])
        calls=evidence['calls'];tools=evidence['tools'];events=evidence['events']
        peers=[c for c in calls if (c.get('session_id'),c.get('tool_call_id'))==key]
        replies=[t for t in tools if (t.get('session_id'),t.get('tool_call_id'))==key]
        if len(peers)!=1 or len(replies)!=1 or not isinstance(op,str) or not op:return False
        reply=replies[0];r=reply['result'];out=r['output'];refusal=out['request_refusal'];pending=out['operation']
        upload_id=refusal['pending_operation_id']
        if (reply.get('tool')!=call['tool'] or not call['row']<reply['row']
                or r.get('status')!='FAILED' or r.get('action_key')!='request.validate' or r.get('action_revision')!='1'
                or r.get('operation_id') is not None or r.get('phase')!='request_rejected'
                or r.get('effect_possible') is not False or r.get('cleanup_complete') is not True
                or r.get('request_rejected') is not True or r.get('trace')!=[] or r.get('error',{}).get('code')!='REQUEST_REJECTED'
                or refusal!={'operation_id':op,'pending_operation_id':upload_id,'reason':'upload_pending','browser_invoked':False}
                or pending.get('operation_id')!=upload_id or pending.get('state')!='pending'
                or pending.get('cleanup_confirmed') is not True or pending.get('effect_state')!='partial_or_unverified'):return False
        if sum(c.get('arguments',{}).get('operation_id')==op for c in calls)!=1:return False
        records=[e for e in events if e.get('operation_id')==op]
        if len(records)!=1:return False
        record=records[0]
        if (record.get('phase')!='ui_request_rejected' or record.get('action_key')!='request.validate'
                or record.get('pending_operation_id')!=upload_id or record.get('outcome')!=r
                or record.get('parameters')!={'action':args['action'],'observation_id':args['observation_id'],
                    'recovery_operation_id':args.get('recovery_operation_id')}):return False
        uploads=[c for c in calls if c['tool']==prefix+'dock_artifact_upload' and c.get('arguments',{}).get('operation_id')==upload_id]
        verifies=[c for c in calls if c['tool']==prefix+'dock_artifact_verify' and c.get('arguments',{}).get('operation_id')==upload_id]
        if len(uploads)!=len(verifies) or len(uploads)!=1:return False
        upload=uploads[0];verify=verifies[0]
        verification_start=[e for e in events if e.get('operation_id')==verify.get('arguments',{}).get('verification_id')
            and e.get('phase')=='download_prepared']
        if len(verification_start)!=1 or verification_start[0].get('session_id')!=record.get('session_id'):return False
        uploaded=[t for t in tools if (t.get('session_id'),t.get('tool_call_id'),t.get('tool'))==
            (session,upload['tool_call_id'],upload['tool'])]
        if (len(uploaded)!=1 or upload.get('session_id')!=session or verify.get('session_id')!=session
                or not upload['row']<uploaded[0]['row']<call['row']<reply['row']<verify['row']):return False
        source=uploaded[0]['result']
        completed=[e for e in events if e.get('operation_id')==upload_id and e.get('phase')=='completed']
        if (source.get('status')!='AMBIGUOUS' or source.get('action_key')!='artifact.upload'
                or source.get('operation_id')!=upload_id or source.get('cleanup_complete') is not True
                or source.get('output',{}).get('upload_submitted') is not True or pending.get('outcome')!=source
                or len(completed)!=1 or completed[0].get('outcome')!=source
                or not record.get('session_id') or record['session_id']!=completed[0].get('session_id')):return False
        stamps=[datetime.fromisoformat(e['recorded_at'].replace('Z','+00:00')) for e in (completed[0],record,verification_start[0])]
        if any(t.tzinfo is None for t in stamps) or not stamps[0]<stamps[1]<stamps[2]:return False
        # No overlap with another potentially mutating request may be hidden.
        if any(c!=call and call['row']<=c['row']<=reply['row'] and c.get('tool','').endswith(
            ('dock_ui_action','dock_action_run','dock_operation_recover','dock_artifact_upload','dock_artifact_verify')) for c in calls):return False
        return True
    except (KeyError,TypeError,ValueError,AttributeError):return False


def _reveal_origin(value):
    if not isinstance(value,str):return value
    try:
        url=urlsplit(value)
        if (url.scheme in ('http','https') and url.hostname and not url.username and not url.password
                and url.path in ('','/') and not url.query and not url.fragment):return value.rstrip('/')
    except ValueError:pass
    return value


def reveal_receipt_projection(receipt):
    """Mirror only the known root-URL redaction difference in reveal evidence."""
    projected=copy.deepcopy(receipt)
    if not isinstance(projected,dict):return projected
    trace=projected.get('trace',[])
    if isinstance(trace,list):
        for event in trace:
            if isinstance(event,dict) and event.get('event')=='download_reveal_confirmed' and 'origin' in event:
                event['origin']=_reveal_origin(event['origin'])
    return projected


def reveal_receipt_equal(left,right):
    return reveal_receipt_projection(left)==reveal_receipt_projection(right)


def reveal_trace_valid(raw, result, snapshot, file_ref):
    """A reveal is a native, upload-bound viewport effect, never a second tool."""
    try:
        trace=reveal_receipt_projection(raw).get('trace',[])
        if not isinstance(trace,list) or trace!=reveal_receipt_projection(result).get('trace',[]):return False
        files=[e for e in snapshot.get('ui',{}).get('elements',[]) if e.get('ref')==file_ref]
        if len(files)!=1:return False
        file=files[0];needed=file.get('interaction',{}).get('state') in ('outside_viewport','point_not_observed')
        names=[e.get('event') for e in trace]
        if not needed:
            return not trace or trace==[{'event':'download_gesture_result','status':'SUCCEEDED',
                'effect_possible':True,'cleanup_complete':True,'error_code':None}]
        if names!=['download_file_revealed','download_reveal_confirmed','download_gesture_result']:return False
        moved,confirmed,gesture=trace;scroll=file['scroll'];document=snapshot['dom_epoch']['document']
        if not document or not snapshot.get('active_tab_ref') or not snapshot.get('origin') or not snapshot.get('loginom_build'):return False
        if gesture!={'event':'download_gesture_result','status':'SUCCEEDED','effect_possible':True,'cleanup_complete':True,'error_code':None}:return False
        if set(moved)!={'event','applied','file_ref','owner_ref','from','to','max_top','delta','document'}:return False
        numbers=[moved[k] for k in ('from','to','max_top','delta')]
        if any(type(x) not in (float,int) or not math.isfinite(x) for x in numbers):return False
        if type(moved['delta']) is not int:return False
        if (moved['applied'] is not True or moved['file_ref']!=file_ref or moved['owner_ref']!=scroll.get('ref')
                or not moved['owner_ref'] or moved['from']!=scroll.get('top') or moved['max_top']!=scroll.get('max_top')
                or moved['document']!=document or not 0<abs(moved['delta'])<=1000
                or moved['to']!=moved['from']+moved['delta'] or not 0<=moved['from']<=moved['max_top']
                or not 0<=moved['to']<=moved['max_top']):return False
        return confirmed=={'event':'download_reveal_confirmed','file_ref':file_ref,'owner_ref':scroll['ref'],
            'document':document,'interaction':'point_observed','file_tid':file['tid'],
            **{k:snapshot[k] for k in ('loginom_build','workflow_ref','active_tab_ref','package_identity')},
            'origin':_reveal_origin(snapshot['origin']),
            'directory':snapshot['file_storage']['directory']}
    except (KeyError,TypeError,ValueError,AttributeError):return False


def audit(evidence, checks, request, prefix, mutations, storage_audit):
    def check(name, value):
        checks.append({'name':name,'passed':bool(value)})
    refused={(c['session_id'],c['tool_call_id']) for c in evidence['calls'] if pending_upload_ui_refusal(c,evidence,prefix)}
    evidence={**evidence,'calls':[c for c in evidence['calls'] if (c['session_id'],c['tool_call_id']) not in refused],
        'tools':[t for t in evidence['tools'] if (t['session_id'],t['tool_call_id']) not in refused]}
    calls,tools,events=(evidence[k] for k in ('calls','tools','events'))
    verifies=[c for c in calls if c['tool']==prefix+'dock_artifact_verify']
    check('one_server_copy_verification',len(verifies)==1)
    if len(verifies)!=1:return {'all_assertions_passed':False,'assertions':checks,'goal':'file-upload-verify'}
    call=verifies[0];args=call.get('arguments',{})
    before={**evidence,'calls':[c for c in calls if c['row']<call['row']],
            'tools':[t for t in tools if t['row']<call['row']]}
    upload_probe.audit(before,checks,request,prefix,mutations,storage_audit)
    uploads=[c for c in before['calls'] if c['tool']==prefix+'dock_artifact_upload']
    upload_id=uploads[0].get('arguments',{}).get('operation_id') if len(uploads)==1 else None
    check('verification_identifiers_bound',set(args)=={'operation_id','verification_id','observation_id','file_ref'}
          and all(isinstance(v,str) and bool(v) for v in args.values())
          and args.get('operation_id')==upload_id and args.get('verification_id')!=upload_id)
    prepared=successful_prepare(evidence,prefix,call['session_id'],call['row'])
    artifacts=prepared.get('input_artifacts',[]) if prepared else []
    artifact=artifacts[0] if len(artifacts)==1 else {}
    descriptor=upload_probe.descriptor(request['run_id'],request['storage_directory'])
    # One observation can have multiple delivered pages. Bind the exact page
    # which issued this file ref, never the first page or a different session.
    reads=[t for t in before['tools'] if t['tool']==prefix+'dock_workspace_observe'
           and t.get('session_id')==call.get('session_id')
           and t['result'].get('output',{}).get('observation_id')==args.get('observation_id')
           and any(item.get('ref')==args.get('file_ref') for item in t['result'].get('output',{}).get('ui',{}).get('elements',[]))]
    read=reads[0]['result'] if len(reads)==1 else {}
    output=read.get('output',{})
    targets=[r for r in output.get('ui',{}).get('elements',[]) if r.get('ref')==args.get('file_ref')]
    check('verification_targets_exact_delivered_csv',len(targets)==1 and targets[0].get('label')==descriptor['name']
          and targets[0].get('tid')==output.get('workflow_ref',{}).get('prefix','')+';FileStorageForm;colName_'+descriptor['name']
          and 'double_click' in targets[0].get('allowed_actions',[]))
    inspections=[t for t in before['tools'] if t['tool']==prefix+'dock_operation_inspect'
                 and t['result'].get('output',{}).get('operation_id')==upload_id]
    inspected=inspections[-1]['result']['output'] if inspections else {}
    compact={key:inspected.get(key) for key in ('operation_id','state','cleanup_confirmed','effect_state','recovery_options','next_steps')}
    original=inspected.get('outcome',{})
    compact['outcome_summary']={key:original.get(key) for key in ('status','action_key','operation_id')}
    compact['outcome_summary']['detail_tool']='dock_operation_inspect'
    comparable=copy.deepcopy(read);context=comparable.get('output',{}).pop('operation',None)
    records=[e for e in events if e.get('phase')=='observation_completed' and e.get('operation_id')==read.get('operation_id')]
    check('file_read_bound_to_raw_journal',bool(read.get('operation_id')) and len(records)==1
          and context==compact and compact.get('state')=='pending' and compact.get('cleanup_confirmed') is True
          and rename_effect.journal_equal(records[0].get('outcome',{}),comparable))
    replies=[t for t in tools if t['session_id']==call['session_id'] and t['tool_call_id']==call['tool_call_id']
             and t['tool']==call['tool'] and t['row']>call['row']]
    result=replies[0]['result'] if len(replies)==1 else {}
    destination=request['storage_directory']+'/'+descriptor['name']
    raw_output={'artifact_id':artifact.get('artifact_id'),'upload_grant_id':artifact.get('upload',{}).get('grant_id'),
                'upload_operation_id':upload_id,'destination':destination,'suggested_name':descriptor['name'],
                'download_completed':True,'bytes_verification_required':True,'file_ref':args.get('file_ref'),'observation_id':args.get('observation_id')}
    expected={**raw_output,'bytes_verification_required':False,'bytes_verified':True,
              'bytes':descriptor['bytes'],'sha256':descriptor['sha256'],'upload_completion_verified':True}
    check('host_verified_exact_bytes',result.get('status')=='SUCCEEDED' and result.get('action_key')=='artifact.verify'
          and result.get('action_revision')=='1' and result.get('operation_id')==args.get('verification_id')
          and result.get('phase')=='verified' and result.get('cleanup_complete') is True and result.get('error') is None
          and result.get('output')==expected)
    raw_records=[e for e in events if e.get('phase')=='download_completed' and e.get('operation_id')==args.get('verification_id')]
    raw=raw_records[0].get('outcome',{}) if len(raw_records)==1 else {}
    check('download_reveal_bound_to_issued_file',reveal_trace_valid(raw,result,output,args.get('file_ref')))
    check('native_download_bound_to_verification',len(raw_records)==1 and raw.get('output')==raw_output
          and raw.get('action_key')=='artifact.download' and raw.get('action_revision')=='1'
          and raw.get('operation_id')==args.get('verification_id') and raw.get('status')=='SUCCEEDED'
          and raw.get('phase')=='downloaded' and raw.get('cleanup_complete') is True and raw.get('effect_possible') is True
          and raw.get('error') is None)
    verified=[e for e in events if e.get('phase')=='download_verified' and e.get('operation_id')==args.get('verification_id')]
    byte_result=copy.deepcopy(result)
    byte_result.setdefault('output',{})['upload_completion_verified']=False
    check('host_proof_bound_to_artifact_and_request',len(verified)==1 and reveal_receipt_equal(verified[0].get('outcome'),byte_result)
          and verified[0].get('parameters')=={'upload_operation_id':upload_id,'observation_id':args.get('observation_id'),'file_ref':args.get('file_ref')}
          and verified[0].get('checkpoint',{}).get('artifact')==artifact)
    after=[t for t in tools if t['tool']==prefix+'dock_operation_inspect' and t['row']>call['row']]
    summary={'verification_id':args.get('verification_id'),'status':'SUCCEEDED','bytes_verified':True,
             'upload_completion_verified':True,'destination':destination,'bytes':descriptor['bytes'],'sha256':descriptor['sha256']}
    transfers=[e for e in events if e.get('phase')=='transfer_completed' and e.get('operation_id')==upload_id]
    completed=transfers[0].get('outcome',{}) if len(transfers)==1 else {}
    check('transfer_completion_recorded',len(transfers)==1 and completed.get('status')=='SUCCEEDED'
          and completed.get('action_key')=='artifact.upload' and completed.get('operation_id')==upload_id
          and completed.get('cleanup_complete') is True and completed.get('error') is None
          and completed.get('output',{}).get('transfer_postcondition')=='destination_bytes_digest_and_size'
          and completed['output'].get('verification_required') is False and completed['output'].get('server_copy_verification')==summary)
    finalized=[e for e in events if e.get('phase')=='verification_completed' and e.get('operation_id')==args.get('verification_id')]
    check('final_verification_recorded',len(finalized)==1 and reveal_receipt_equal(finalized[0].get('outcome'),result))
    check('verified_transfer_releases_pending',bool(after) and all(t['result'].get('output',{}).get('state')=='resolved'
          and t['result']['output'].get('operation_id')==upload_id
          and t['result']['output'].get('outcome')==completed
          and t['result']['output']['outcome'].get('output',{}).get('server_copy_verification')==summary for t in after))
    check('no_mutations_after_verification',not any(c['tool'] in mutations and c['row']>call['row'] for c in calls))
    return {'all_assertions_passed':all(c['passed'] for c in checks),'assertions':checks,'goal':'file-upload-verify',
            'destination':destination,'limitations':['Confirmed replace transfer satisfies exact destination byte postcondition. Reject/conflict and download budget remain open.']}
