"""Independent audit of configure-boundary pause, inspected resume and fresh output."""
from import_limits import import_operation_step_budget

from import_output_evidence import verify_text_import_output
from workflow_activation_evidence import verify_workflow_activation


def verified_phase_order(events, request, expected, failures):
    """Retain legacy evidence; require the full proof for the newer workflow phase."""
    rows=[e for e in events if e.get('operation_id')==request.get('operation_id')]
    has_workflow=any(e.get('receipt',{}).get('phase')=='workflow' for e in rows)
    if not has_workflow:
        return expected
    checked=verify_workflow_activation(events,request)
    failures.extend('continuation_'+f for f in checked['failures'])
    return [expected[0],'workflow',*expected[1:]]


def verify_configured_import_resume(events,request,source_bytes):
    result=verify_text_import_output(events,request,source_bytes)
    failures=list(result['failures']);op=request['operation_id']
    rows=[e for e in events if e.get('operation_id')==op]
    accepted=[(i,e['receipt']['value']) for i,e in enumerate(rows) if e.get('phase')=='node_phase_completed' and e.get('receipt',{}).get('phase')=='configure']
    checked=[(i,e) for i,e in enumerate(rows) if e.get('phase')=='node_continuation_checked']
    paused=[(i,e.get('outcome',{})) for i,e in enumerate(rows) if e.get('phase')=='completed' and e.get('outcome',{}).get('status')=='AMBIGUOUS']
    resumes=[i for i,e in enumerate(rows) if e.get('phase')=='node_apply_resume_prepared']
    if len(accepted)!=1 or len(checked)!=1 or len(paused)!=1 or len(resumes)!=1:
        return dict(result,passed=False,failures=failures+['one_configured_pause_and_resume_required'])
    accepted_at,configured=accepted[0];checked_at,check=checked[0];paused_at,pause=paused[0]
    if not accepted_at<paused_at<resumes[0]<checked_at:failures.append('continuation_event_order')
    partial=pause.get('output',{})
    if (pause.get('cleanup_complete') is not True or partial.get('pending_phase') is not None
        or [p.get('phase') for p in partial.get('phases',[])]!=verified_phase_order(events,request,['source','target','input_mapping','open','configure'],failures)
        or partial.get('execution',{}).get('status')!='not_requested'
        or partial.get('output',{}).get('status')!='not_refreshed'):failures.append('unsafe_pause_boundary')
    if any(e.get('phase')=='node_step_prepared' for e in rows[accepted_at+1:checked_at+1]):failures.append('continuation_repeated_gesture')
    source=check.get('source',{});state=check.get('format',{});schema=check.get('schema',{})
    node=partial.get('node',{})
    if check.get('verified') is not True or check.get('boundary')!='configure':failures.append('continuation_not_verified')
    for context in [source.get('node_context',{}),state.get('prepared_node_context',{})]:
        if context.get('verified') is not True or context.get('surface')!='wizard' or any(not node.get(k) or context.get(k)!=node[k] for k in ['document_id','workflow_id','node_id']):failures.append('continuation_node_owner')
    if source.get('verified') is not True or source.get('source')!='retained_wizard_controls':failures.append('continuation_source_missing')
    for key in ['source_path','connection','encoding','rows_to_skip','first_line_as_title']:
        baseline=configured.get('source',{}).get('fields',{}).get(key,{})
        if baseline.get('status')!='observed' or baseline.get('truncated') or source.get('values',{}).get(key)!=baseline.get('value'):failures.append('continuation_source_changed')
    wizard=state.get('wizard',{})
    if wizard.get('stage')!='text_import_format' or wizard.get('column_parameters'):failures.append('continuation_wizard_surface')
    for key,field in configured.get('format',{}).get('fields',{}).items():
        actual=wizard.get('settings',{}).get('fields',{}).get(key,{})
        if actual.get('status')!='observed' or actual.get('truncated') or actual.get('value')!=field.get('value'):failures.append('continuation_format_changed')
    semantic=lambda fields:[{k:f.get(k) for k in ['index','name','label','type','data_kind','used']} for f in fields]
    if (schema.get('definition_complete') is not True or schema.get('schema_id')!=configured.get('schema_id')
        or semantic(schema.get('fields',[]))!=semantic(configured.get('columns',[]))):failures.append('continuation_columns_changed')
    return dict(result,passed=not failures,failures=sorted(set(failures)),configured_resume_verified=not failures,
                scope='configured_boundary_resume_and_fresh_output')


def verify_changed_null_resume_refusal(events,request,source_bytes):
    import hashlib
    from node_procedure_evidence import verify_internal_sequence
    op=request['operation_id'];rows=[e for e in events if e.get('operation_id')==op]
    seq=verify_internal_sequence(events, op, max_steps=import_operation_step_budget(events, op));failures=list(seq['failures'])
    identities=[(e.get('session_id'),e.get('runtime_revision'),e.get('target')) for e in rows]
    if not identities or not all(identities[0]) or any(i!=identities[0] for i in identities):failures.append('journal_identity')
    source=request['parameters']['source']
    if len(source_bytes)!=source['bytes'] or hashlib.sha256(source_bytes).hexdigest()!=source['sha256']:failures.append('source_bytes')
    completed=[e for e in rows if e.get('phase')=='node_phase_completed']
    if [e.get('receipt',{}).get('phase') for e in completed]!=verified_phase_order(events,request,['source','target','input_mapping','open','configure'],failures):failures.append('unexpected_phase_completion')
    checks=[(i,e) for i,e in enumerate(rows) if e.get('phase')=='node_continuation_checked']
    if len(checks)!=1 or not completed:return dict(passed=False,failures=failures+['one_continuation_check_required'])
    index,check=checks[0];accepted=completed[-1]['receipt']['value']
    paused=[(i,e.get('outcome',{})) for i,e in enumerate(rows) if e.get('phase')=='completed' and e.get('outcome',{}).get('status')=='AMBIGUOUS']
    if len(paused)!=2:return dict(passed=False,failures=failures+['pause_and_refusal_required'])
    (first_at,first),(last_at,last)=paused
    if not first_at<index<last_at:failures.append('refusal_order')
    if check.get('verified') is not False or check.get('boundary')!='configure':failures.append('refusal_not_verified')
    if any(e.get('phase') in ['node_step_prepared','node_phase_prepared','node_checkpoint'] for e in rows[first_at+1:]):failures.append('effect_after_pause')
    state=check.get('format',{});observed=state.get('wizard',{}).get('settings',{}).get('fields',{})
    baseline=accepted.get('format',{}).get('fields',{})
    if (state.get('wizard',{}).get('stage')!='text_import_format'
        or observed.get('null_marker',{}).get('status')!='observed'
        or observed.get('null_marker',{}).get('value')!='CHANGED_NULL_03'
        or baseline.get('null_marker',{}).get('value')=='CHANGED_NULL_03'
        or any(observed.get(k,{}).get('value')!=v.get('value') for k,v in baseline.items() if k!='null_marker')):failures.append('changed_null_not_observed')
    node=first.get('output',{}).get('node',{})
    for context in [state.get('prepared_node_context',{}),check.get('source',{}).get('node_context',{})]:
        if context.get('verified') is not True or any(not node.get(k) or context.get(k)!=node[k] for k in ['document_id','workflow_id','node_id']):failures.append('foreign_node')
    if last.get('cleanup_complete') is not True or last.get('output',{}).get('pending_phase') is not None:failures.append('unsafe_refusal')
    for key in ['phases','node','execution','output']:
        if key not in first.get('output',{}) or last.get('output',{}).get(key)!=first['output'][key]:failures.append('lost_partial_'+key)
    if first.get('output',{}).get('execution',{}).get('status')!='not_requested':failures.append('execution_started')
    return dict(passed=not failures,failures=sorted(set(failures)),scope='changed_null_configured_resume_refusal',
                execution_started=False,package_persistence_verified=False,hermes_acceptance_verified=False)


def verify_mapped_import_resume(events,request,source_bytes):
    result=verify_text_import_output(events,request,source_bytes);failures=list(result['failures'])
    rows=[e for e in events if e.get('operation_id')==request['operation_id']]
    checks=[(i,e) for i,e in enumerate(rows) if e.get('phase')=='node_continuation_checked']
    paused=[(i,e.get('outcome',{})) for i,e in enumerate(rows) if e.get('phase')=='completed' and e.get('outcome',{}).get('status')=='AMBIGUOUS']
    receipts={e['receipt']['phase']:(i,e['receipt']['value']) for i,e in enumerate(rows) if e.get('phase')=='node_phase_completed'}
    resumes=[i for i,e in enumerate(rows) if e.get('phase')=='node_apply_resume_prepared']
    if len(checks)!=1 or len(paused)!=1 or len(resumes)!=1 or not all(k in receipts for k in ['configure','output_mapping']):
        return dict(result,passed=False,failures=failures+['one_mapped_pause_resume_required'])
    checked_at,check=checks[0];paused_at,pause=paused[0];mapped_at,mapped=receipts['output_mapping'];configured=receipts['configure'][1]
    if not mapped_at<paused_at<resumes[0]<checked_at:failures.append('mapped_resume_order')
    partial=pause.get('output',{})
    if (pause.get('cleanup_complete') is not True or partial.get('pending_phase') is not None
        or [p.get('phase') for p in partial.get('phases',[])]!=verified_phase_order(events,request,['source','target','input_mapping','open','configure','output_mapping'],failures)
        or partial.get('execution',{}).get('status')!='not_requested'):failures.append('mapped_pause_boundary')
    if any(e.get('phase')=='node_step_prepared' for e in rows[paused_at+1:checked_at+1]):failures.append('mapped_resume_gesture')
    if check.get('verified') is not True or check.get('boundary')!='output_mapping':failures.append('mapped_resume_unverified')
    source=check.get('source',{});retained=check.get('retained',{});surface=check.get('surface',{})
    node=partial.get('node',{})
    for n in [source.get('node_context',{}),retained.get('node_context',{}),surface.get('prepared_node_context',{}),surface.get('node_mapping',{}).get('node_context',{})]:
        if n.get('verified') is not True or n.get('surface')!='wizard' or any(not node.get(k) or n.get(k)!=node[k] for k in ['document_id','workflow_id','node_id']):failures.append('mapped_resume_owner')
    for key in ['source_path','connection','encoding','rows_to_skip','first_line_as_title']:
        before=configured.get('source',{}).get('fields',{}).get(key,{})
        if source.get('verified') is not True or before.get('status')!='observed' or source.get('values',{}).get(key)!=before.get('value'):failures.append('mapped_resume_source')
    if retained.get('verified') is not True or retained.get('definition_complete') is not True:failures.append('mapped_resume_definition')
    for k in ['delimiter','text_qualifier','null_marker','decimal_separator']:
        before=configured.get('format',{}).get('fields',{}).get(k,{})
        if before.get('status')!='observed' or retained.get('values',{}).get(k)!=before.get('value'):failures.append('mapped_resume_format')
    semantic=lambda fs:[{k:f.get(k) for k in ['index','name','label','type','data_kind','used']} for f in fs]
    if semantic(retained.get('fields',[]))!=semantic(configured.get('columns',[])):failures.append('mapped_resume_columns')
    native=lambda m:{k:v for k,v in m.items() if k!='rendered_indices'}
    if native(surface.get('node_mapping',{}))!=native(mapped.get('native_mapping',{})):failures.append('mapped_resume_mapping')
    completion=surface.get('wizard',{}).get('completion',{});before=mapped.get('completion',{})
    if surface.get('wizard',{}).get('stage')!='done' or completion.get('ready') is not True or before.get('ready') is not True:failures.append('mapped_resume_done')
    fields=completion.get('fields',{});prior=before.get('fields',{})
    if not prior or set(fields)!=set(prior) or any(fields[k].get('status')!='observed' or fields[k].get('value')!=prior[k].get('value') for k in prior):failures.append('mapped_resume_completion')
    return dict(result,passed=not failures,failures=sorted(set(failures)),scope='mapped_boundary_resume_and_fresh_output',mapped_resume_verified=not failures)


def verify_changed_completion_resume_refusal(events,request):
    from node_procedure_evidence import verify_internal_sequence
    rows=[e for e in events if e.get('operation_id')==request['operation_id']]
    failures=list(verify_internal_sequence(events, request['operation_id'], max_steps=import_operation_step_budget(events, request['operation_id']))['failures'])
    identities=[(e.get('session_id'),e.get('runtime_revision'),e.get('target')) for e in rows]
    if not identities or not all(identities[0]) or any(i!=identities[0] for i in identities):failures.append('mapped_refusal_journal_identity')
    completed=[e['receipt'] for e in rows if e.get('phase')=='node_phase_completed']
    if [e.get('phase') for e in completed]!=verified_phase_order(events,request,['source','target','input_mapping','open','configure','output_mapping'],failures):failures.append('mapped_refusal_phases')
    checks=[(i,e) for i,e in enumerate(rows) if e.get('phase')=='node_continuation_checked']
    paused=[(i,e.get('outcome',{})) for i,e in enumerate(rows) if e.get('phase')=='completed' and e.get('outcome',{}).get('status')=='AMBIGUOUS']
    if len(checks)!=1 or len(paused)!=2 or not completed:return dict(passed=False,failures=failures+['mapped_refusal_records'])
    checked_at,check=checks[0];(first_at,first),(last_at,last)=paused
    if not first_at<checked_at<last_at or any(e.get('phase') in ['node_step_prepared','node_phase_prepared','node_checkpoint'] for e in rows[first_at+1:]):failures.append('mapped_refusal_effect')
    if check.get('boundary')!='output_mapping' or check.get('verified') is not False:failures.append('mapped_refusal_unverified')
    mapped=completed[-1]['value'];surface=check.get('surface',{});completion=surface.get('wizard',{}).get('completion',{})
    before=mapped.get('completion',{}).get('fields',{});after=completion.get('fields',{})
    if (surface.get('wizard',{}).get('stage')!='done' or after.get('label',{}).get('status')!='observed'
        or after.get('label',{}).get('value')!='Changed paused label 03' or before.get('label',{}).get('value')=='Changed paused label 03'
        or any(after.get(k,{}).get('value')!=v.get('value') for k,v in before.items() if k!='label')):failures.append('mapped_refusal_label')
    native=lambda m:{k:v for k,v in m.items() if k!='rendered_indices'}
    if native(surface.get('node_mapping',{}))!=native(mapped.get('native_mapping',{})):failures.append('mapped_refusal_mapping_changed')
    node=first.get('output',{}).get('node',{})
    for n in [surface.get('prepared_node_context',{}),check.get('source',{}).get('node_context',{}),check.get('retained',{}).get('node_context',{})]:
        if n.get('verified') is not True or any(not node.get(k) or n.get(k)!=node[k] for k in ['document_id','workflow_id','node_id']):failures.append('mapped_refusal_owner')
    if last.get('cleanup_complete') is not True or last.get('output',{}).get('pending_phase') is not None:failures.append('mapped_refusal_cleanup')
    for key in ['phases','node','execution','output']:
        if key not in first.get('output',{}) or last.get('output',{}).get(key)!=first['output'][key]:failures.append('mapped_refusal_partial_lost')
    if first.get('output',{}).get('execution',{}).get('status')!='not_requested':failures.append('mapped_refusal_execution')
    return dict(passed=not failures,failures=sorted(set(failures)),scope='changed_mapped_completion_resume_refusal',execution_started=False,hermes_acceptance_verified=False)


def verify_finished_import_resume(events,request,source_bytes):
    result=verify_text_import_output(events,request,source_bytes);failures=list(result['failures'])
    rows=[e for e in events if e.get('operation_id')==request['operation_id']]
    checks=[(i,e) for i,e in enumerate(rows) if e.get('phase')=='node_continuation_checked']
    paused=[(i,e.get('outcome',{})) for i,e in enumerate(rows) if e.get('phase')=='completed' and e.get('outcome',{}).get('status')=='AMBIGUOUS']
    finishes=[(i,e['receipt']['value']) for i,e in enumerate(rows) if e.get('phase')=='node_phase_completed' and e.get('receipt',{}).get('phase')=='finish']
    resumes=[i for i,e in enumerate(rows) if e.get('phase')=='node_apply_resume_prepared']
    if len(checks)!=1 or len(paused)!=1 or len(finishes)!=1 or len(resumes)!=1:
        return dict(result,passed=False,failures=failures+['one_finished_pause_resume_required'])
    finish_at,finish=finishes[0];check_at,check=checks[0];pause_at,pause=paused[0]
    if not finish_at<pause_at<resumes[0]<check_at:failures.append('finished_resume_order')
    partial=pause.get('output',{});node=partial.get('node',{});execution=finish.get('execution_group',{})
    if (pause.get('cleanup_complete') is not True or partial.get('pending_phase') is not None
        or [p.get('phase') for p in partial.get('phases',[])]!=verified_phase_order(events,request,['source','target','input_mapping','open','configure','output_mapping','finish'],failures)
        or partial.get('execution',{})!={'status':'pending','execution_id':finish.get('execution_id')}
        or partial.get('output',{}).get('status')!='not_refreshed'):failures.append('finished_pause_state')
    if any(e.get('phase')=='node_step_prepared' for e in rows[pause_at+1:check_at+1]):failures.append('finished_resume_gesture_before_check')
    if check.get('verified') is not True or check.get('boundary')!='finish':failures.append('finished_resume_unverified')
    before=finish.get('continuation_surface',{});after=check.get('surface',{})
    if not before or before!=after:failures.append('finished_document_or_surface_changed')
    if (not before.get('dom_epoch',{}).get('document') or type(before.get('dom_epoch',{}).get('revision')) is not int
        or before.get('wizard',{}).get('status')!='absent'):failures.append('finished_epoch_or_wizard')
    processes=before.get('node_processes',{});outputs=before.get('node_outputs',{})
    for context in [before.get('prepared_node_context',{}),processes.get('node_context',{}),outputs.get('node_context',{})]:
        if context.get('verified') is not True or context.get('surface')!='graph' or any(not node.get(k) or context.get(k)!=node[k] for k in ['document_id','workflow_id','node_id']):failures.append('finished_owner')
    if (processes.get('verified') is not True or processes.get('inventory_complete') is not True
        or processes.get('show_completed') is not True or processes.get('root_id')!=execution.get('root_id')):failures.append('finished_inventory')
    groups=[p for p in processes.get('processes',[]) if p.get('parent_id') is None and p.get('process_id')==execution.get('group_id') and p.get('record_id')==execution.get('group_record_id')]
    if len(groups)!=1 or groups[0].get('state')!='completed' or groups[0].get('error') is not False:failures.append('finished_process')
    ports=outputs.get('ports',[])
    if outputs.get('verified') is not True or len(ports)!=1 or ports[0].get('active') is not True:failures.append('finished_output_inactive')
    if finish.get('execution_id')!=execution.get('execution_id') or finish.get('execution_started') is not True:failures.append('finished_execution_identity')
    return dict(result,passed=not failures,failures=sorted(set(failures)),scope='finished_boundary_resume_and_same_execution_output',finished_resume_verified=not failures)


def verify_async_import_run(events,request,source_bytes,start,probes,final,*,completed_stop_request=None):
    result=verify_text_import_output(events,request,source_bytes);failures=list(result['failures']);op=request['operation_id']
    phase_order=verified_phase_order(events,request,['source','target','input_mapping','open','configure','output_mapping','finish','execute','read'],failures)
    states=[start.get('started',{}),start.get('replay',{})]+[p.get('status',{}) for p in probes]+[final]
    if (start.get('started',{}).get('state')!='running' or not probes or len(probes)>1800
        or final.get('state')!='settled' or final.get('outcome',{}).get('status')!='SUCCEEDED'):failures.append('async_lifecycle_missing')
    for state in states:
        if state.get('operation_id')!=op or state.get('attempt')!=1 or state.get('cancel_requested') is not False or (type(state.get('server_stop_requested')) is not bool if completed_stop_request is not None else state.get('server_stop_requested') is not False) or state.get('error') is not None:failures.append('async_identity_or_cancel')
    if completed_stop_request is not None:
        stop=completed_stop_request;before=stop.get('status',{});after=stop.get('requested',{})
        if (type(stop.get('before')) is not int or stop.get('before')!=stop.get('after')
            or before.get('state')!='running' or before.get('server_stop_requested') is not False
            or before.get('progress',{}).get('pending_phase')!='execute'
            or before.get('progress',{}).get('execution',{}).get('status')!='pending'
            or before.get('operation_id')!=op or after.get('server_stop_requested') is not True
            or {k:v for k,v in before.items() if k!='server_stop_requested'}!={k:v for k,v in after.items() if k!='server_stop_requested'}):failures.append('invalid_server_stop_request')
        flags=[state.get('server_stop_requested') for state in states]
        if flags[:2]!=[False,False] or flags[-1] is not True or any(flags[i] is True and flags[i+1] is False for i in range(len(flags)-1)):failures.append('server_stop_latch_changed')
        if before.get('progress',{}).get('execution',{}).get('execution_id')!=final.get('outcome',{}).get('output',{}).get('execution',{}).get('execution_id'):failures.append('server_stop_execution_changed')
        if any(e.get('phase')=='node_server_stop_requested' or e.get('phase')=='node_step_prepared' and e.get('action',{}).get('verb')=='cancel_process' for e in events):failures.append('completed_race_sent_cancel')
    previous=-1;accepted=[];execution_id=None;node=None
    for probe in probes:
        if type(probe.get('before')) is not int or probe.get('before')!=probe.get('after') or probe['before']<previous:failures.append('status_browser_activity')
        previous=probe.get('before',previous)
        progress=probe.get('status',{}).get('progress')
        if progress is None:continue
        phases=progress.get('accepted_phases',[])
        if phases!=phase_order[:len(phases)] or phases[:len(accepted)]!=accepted:failures.append('async_phase_regression')
        accepted=phases
        current=progress.get('node')
        if current:
            if node is not None and current!=node:failures.append('async_node_changed')
            node=current
        execution=progress.get('execution',{})
        if execution.get('execution_id'):
            if execution_id and execution['execution_id']!=execution_id:failures.append('async_execution_changed')
            execution_id=execution['execution_id']
    expected=next((e.get('outcome') for e in reversed(events) if e.get('operation_id')==op and e.get('phase')=='completed' and e.get('outcome',{}).get('status')=='SUCCEEDED'),None)
    if not expected or final.get('outcome')!=expected:failures.append('async_result_not_journal_result')
    end=final.get('progress',{})
    if end.get('accepted_phases')!=phase_order or end.get('cleanup_complete') is not True or end.get('pending_phase') is not None:failures.append('async_final_progress')
    if not expected or end.get('node')!=expected.get('output',{}).get('node'):failures.append('async_final_node')
    return dict(result,passed=not failures,failures=sorted(set(failures)),scope='completed_execution_won_stop_race' if completed_stop_request is not None else 'async_node_status_wait_and_fresh_output',
                async_lifecycle_verified=not failures,server_stop_verified=False,long_server_execution_verified=False)


def verify_background_cancel_resume(events,request,source_bytes,cancel,attempts):
    boundary=cancel.get('boundary')
    verifier={'configure':verify_configured_import_resume,'output_mapping':verify_mapped_import_resume,'finish':verify_finished_import_resume,
              'execute_wait':verify_text_import_output}.get(boundary)
    if verifier is None:return dict(passed=False,failures=['unknown_cancel_boundary'])
    result=verifier(events,request,source_bytes);failures=list(result['failures']);op=request['operation_id']
    receipt=cancel.get('cancelled',{})
    if (cancel.get('before')!=cancel.get('after') or type(cancel.get('before')) is not int
        or receipt.get('operation_id')!=op or receipt.get('attempt')!=1 or receipt.get('state')!='running'
        or receipt.get('cancel_requested') is not True or receipt.get('server_stop_requested') is not False):failures.append('background_cancel_receipt')
    if len(attempts)!=2:return dict(result,passed=False,failures=failures+['two_background_attempts_required'])
    for index,attempt in enumerate(attempts,1):
        start,probes,final=attempt['start'],attempt['probes'],attempt['final']
        states=[start.get('started',{}),start.get('replay',{})]+[p.get('status',{}) for p in probes]+[final]
        if not probes or start.get('started',{}).get('state')!='running' or final.get('state')!='settled':failures.append('background_attempt_states')
        for state in states:
            if state.get('operation_id')!=op or state.get('attempt')!=index or state.get('server_stop_requested') is not False or state.get('error') is not None:failures.append('background_attempt_identity')
        if any(type(p.get('before')) is not int or p.get('before')!=p.get('after') for p in probes):failures.append('background_status_browser')
        if final.get('cancel_requested')!=(index==1):failures.append('background_cancellation_not_isolated')
        expected='AMBIGUOUS' if index==1 else 'SUCCEEDED'
        if final.get('outcome',{}).get('status')!=expected or final.get('outcome',{}).get('cleanup_complete') is not True:failures.append('background_attempt_outcome')
        recorded=[e['outcome'] for e in events if e.get('operation_id')==op and e.get('phase')=='completed' and e.get('outcome',{}).get('status')==expected]
        if not recorded or final.get('outcome')!=recorded[0]:failures.append('background_journal_outcome')
    first,last=attempts[0]['final'],attempts[1]['final']
    if first.get('progress',{}).get('node')!=last.get('progress',{}).get('node'):failures.append('background_recreated_node')
    return dict(result,passed=not failures,failures=sorted(set(failures)),scope='background_cancel_inspect_resume_'+str(boundary),
                background_cancel_resume_verified=not failures,server_stop_verified=False)
