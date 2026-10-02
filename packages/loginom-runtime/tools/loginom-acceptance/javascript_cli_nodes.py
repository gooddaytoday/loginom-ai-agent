"""Bind one actual compact standalone node lifecycle to immutable native receipts.

Independent of business Table/source/settings/Save/cold audits. Does not execute
JavaScript, use a historical Hermes envelope, or certify complete CLI acceptance.
"""
import copy
import hashlib
import json
import re
from datetime import datetime
from artifact_delivery_evidence import preupload_delivery_restarts
from javascript_cli_evidence import terminal_tool,value_digest
from javascript_cli_candidate import hexadecimal


LOCAL_RECEIPT_TOOLS = {'loginom_'+name for name in ('dock_prepare','dock_action_run','dock_action_describe',
    'dock_artifact_deliver','dock_artifact_delivery_status','dock_artifact_delivery_resume','dock_node_apply','dock_node_wait','dock_node_status',
    'dock_node_resume','dock_node_read','dock_node_cancel','dock_node_stop','dock_operation_inspect')}


def native_identity(row, expected):
    return (row.get('session_id') == expected['runtime_session_id'] and row.get('runtime_revision') == expected['runtime_revision']
        and row.get('manifest_sha256') == expected['action_manifest_sha256'] and row.get('target') == expected['target'])


def cli_public_calls(events):
    calls = []
    seen = {}
    for event in events:
        if event.get('type') != 'tool_use':continue
        part = event['part']
        tool = terminal_tool(part)
        if part['id'] in seen:
            if seen[part['id']] != tool:raise ValueError('cli_node_changed_delivery')
            continue
        seen[part['id']] = tool
        # Remote knowledge read tools can return plain text. They remain covered
        # by the outer SQLite/CLI transport auditor, not by this receipt decoder.
        if part['tool'] not in LOCAL_RECEIPT_TOOLS:continue
        result = None
        if part['state']['status'] == 'completed':
            text = part['state']['output'].lstrip()
            result,end = json.JSONDecoder().raw_decode(text)
            if not isinstance(result,dict) or text[end:].strip() and not text[end:].startswith('\n\n'):
                raise ValueError('cli_node_public_receipt_shape')
        calls.append(dict(part=part,result=result))
    return sorted(calls,key=lambda c:(c['part']['state']['time']['end'],c['part']['state']['time']['start'],c['part']['id']))


def verify_preupload_public_resumes(calls, operation_id, restarts, expected):
    """Require the observed no-upload refusal before each same-operation resume."""
    used = set()
    for start,checkpoint,restarted in restarts:
        checkpoint_time = datetime.fromisoformat(checkpoint['recorded_at'].replace('Z','+00:00')).timestamp()*1000
        restart_time = datetime.fromisoformat(restarted['recorded_at'].replace('Z','+00:00')).timestamp()*1000
        resumes = [c for c in calls if c['part']['tool'] == 'loginom_dock_artifact_delivery_resume'
            and c['part']['state']['input'].get('operation_id') == operation_id
            and c['part']['state']['time']['start'] <= restart_time <= c['part']['state']['time']['end']]
        if len(resumes) != 1:raise ValueError('cli_node_delivery_public_resume_missing')
        part = resumes[0]['part']
        args,time = part['state']['input'],part['state']['time']
        resume_id = args.get('resume_id')
        if (part['sessionID'] != expected['cli_session_id'] or part['state']['status'] != 'completed'
                or set(args) != {'operation_id','resume_id','budget_ms'}
                or not isinstance(resume_id,str) or not re.fullmatch('[A-Za-z0-9_.:-]{1,80}',resume_id) or resume_id in used
                or type(args['budget_ms']) is not int or not 1000 <= args['budget_ms'] <= 1800000
                or not checkpoint_time <= time['start']
                or not time['start']+args['budget_ms'] <= restarted['deadline_at'] <= time['end']+args['budget_ms']):
            raise ValueError('cli_node_delivery_public_resume_binding')
        used.add(resume_id)
        refusals = []
        for call in calls:
            previous = call['part']
            if (previous['tool'] not in ('loginom_dock_artifact_deliver','loginom_dock_artifact_delivery_status',
                    'loginom_dock_artifact_delivery_resume') or previous['sessionID'] != expected['cli_session_id']
                    or previous['state']['input'].get('operation_id') != operation_id
                    or not checkpoint_time <= previous['state']['time']['end'] <= time['start']):continue
            value = call['result']
            if value is None and previous['state']['status'] == 'error':
                try:value = json.loads(previous['state']['error'])
                except (ValueError,TypeError):continue
            if not isinstance(value,dict):continue
            output = value.get('output',{})
            if (value.get('operation_id') == operation_id and value.get('state') == 'settled'
                    and value.get('status') == 'AMBIGUOUS' and value.get('cleanup_complete') is True
                    and output.get('upload_submitted_or_unknown') is False
                    and output.get('inspection_required') is False and output.get('cleanup_complete') is True
                    and output.get('upload_operation_id') == operation_id+':upload'
                    and output.get('next_step',{}).get('tool') == 'dock_artifact_delivery_resume'
                    and output['next_step'].get('original_operation_id') == operation_id):refusals.append(value)
        if not refusals:raise ValueError('cli_node_delivery_public_preupload_checkpoint')
        originals = [c for c in calls if c['part']['tool'] == 'loginom_dock_artifact_deliver'
            and c['part']['sessionID'] == expected['cli_session_id']
            and c['part']['state']['input'].get('operation_id') == operation_id
            and c['part']['state']['input'].get('artifact_id') == start['artifact_id']
            and c['part']['state']['time']['start'] <= checkpoint_time]
        if not originals:raise ValueError('cli_node_delivery_original_request_missing')


def expanded_cli_node(request, workflow, uploads):
    """Independent check of the documented compact-profile expansion only."""
    if 'budgets' in request or request['workflow_ref'] != {'workflow_id':workflow['workflow_id']}:
        raise ValueError('cli_node_compact_request_scope')
    value = copy.deepcopy(request)
    value['workflow_ref'] = copy.deepcopy(workflow)
    value['mappings'] = value.get('mappings',[])
    ports = [] if value['finish'] != 'execute' or value['target']['type'] == 'exports.text' else [0,1] if value['target']['type'] == 'transform.filter_data' else [0]
    value['read'] = dict(ports=ports,sample_rows=5 if ports else 0,require_exact_numbers=False) | value.get('read',{})
    value['budgets'] = dict(configure_ms=600000,execute_ms=120000,total_ms=600000)
    if value['target']['kind'] == 'new' and value['target']['type'] == 'imports.text' and value['parameters'].get('settings'):
        parameters = value['parameters']
        settings = parameters['settings']
        upload = uploads.get(parameters.get('source',{}).get('upload_operation_id'),{})
        source = dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True)
        if upload.get('artifact_id') == parameters.get('source',{}).get('artifact_id') and upload:
            source['source_path'] = upload['destination']
        source.update(settings.get('source',{}))
        settings['source'] = source
        settings['format'] = dict(delimiter=',',decimal_separator='.',null_marker='',text_qualifier='"') | settings.get('format',{})
        if isinstance(settings.get('columns'),list):
            settings['columns'] = [dict(label=c['name'],data_kind='Непрерывный' if c['type']=='real' else 'Дискретный',used=True) | c for c in settings['columns']]
    if value['target']['kind'] == 'new' and value['target']['type'] == 'exports.text':
        value['parameters'] = dict(encoding='UTF-8',delimiter=',',header='names',bom=False,line_ending='LF',
            decimal_separator='.',null_marker='',text_qualifier='"') | value['parameters']
    return value


def compact_port_facts(port):
    """Preserve exact public schema/cells while omitting source-only UI metadata."""
    keys = ('port','port_guid','fresh','execution_id','schema','row_count','sample','sample_rows','sample_complete',
        'precision','table','exact_table','read_coverage','read_consistency','cell_precision','binding','limitations')
    value = {k:port[k] for k in keys if k in port}
    value['schema'] = [{k:c[k] for k in ('index','name','label','type','data_kind') if k in c} for c in port['schema']]
    cell_keys = ('type','value','decimal','representation','display_text','precision','is_null','timezone','cell_type','native')
    value['sample'] = [[{k:c[k] for k in cell_keys if k in c and not (k=='display_text' and 'value' in c and c[k]==c['value'])}
        for c in row] for row in port['sample']]
    value['sample_rows'] = len(port['sample'])
    value['sample_complete'] = port['sample_complete']
    return value


def expanded_cli_read(args,request,checkpoint,source_id):
    if (set(args)-{'operation_id','source_operation_id','read'} or args.get('source_operation_id') != source_id
            or request['target']['type'] != 'programming.javascript' or request['finish'] != 'execute'
            or checkpoint.get('execution',{}).get('status') != 'completed'):
        raise ValueError('cli_node_read_source_contract')
    readback = checkpoint['configuration']['readback']
    node = checkpoint['node']
    receipts = readback['receipt_ids']
    names = ('finish','output_mapping','node_finish','materialization_execute','execute')
    if (checkpoint['configuration'].get('status') != 'applied' or readback.get('kind') != 'javascript'
            or readback.get('scope') != 'observed_after_verified_finish' or readback.get('values_are') != 'independent_owned_source_readback'
            or readback.get('schema_mode') not in ('code','declared') or readback.get('settings_preserved') is not True
            or readback.get('wizard_commit_verified') is not True or readback.get('execution_effects',{}).get('explicit_execute_requested') is not True
            or 'internal_execution_started' not in readback['execution_effects'] or readback['execution_effects']['internal_execution_started'] is not None
            or any(readback.get('node',{}).get(k) != node[k] for k in ('document_id','workflow_id','node_id'))
            or len(set(receipts)) != len(receipts) or any(source_id+':'+name not in receipts for name in names)
            or any(len([p for p in checkpoint['phases'] if p.get('receipt_id') == rid
                and rid == source_id+':'+p.get('phase','') and p.get('status') == 'verified']) != 1 for rid in receipts)):
        raise ValueError('cli_node_read_retained_configuration')
    mapping = readback['output_mapping']
    fields = mapping['fields']
    if (type(mapping.get('port')) is not int or mapping['port'] != 0 or 'output_mappings' in readback or not fields
            or len({f['name'] for f in fields}) != len(fields)
            or any(type(f.get('index')) is not int or f['index'] != i
                or any(not isinstance(f.get(k),str) for k in ('name','label','type','data_kind','source_name'))
                or 'excluded' in f and type(f['excluded']) is not bool for i,f in enumerate(fields))):
        raise ValueError('cli_node_read_retained_mapping')
    schema = [{k:f[k] for k in ('name','label','type','data_kind')} | dict(index=i)
        for i,f in enumerate(f for f in fields if f.get('excluded') is not True)]
    source = readback['source']
    if (set(source) != {'sha256','utf8_bytes','lf_lines'} or not hexadecimal(source['sha256'],64)
            or type(source['utf8_bytes']) is not int or not 0 <= source['utf8_bytes'] <= 32768
            or type(source['lf_lines']) is not int or not 1 <= source['lf_lines'] <= 1024 or not schema):
        raise ValueError('cli_node_read_retained_source')
    read = dict(ports=[0],sample_rows=10,require_exact_numbers=False) | args.get('read',{})
    if (set(read) != {'ports','sample_rows','require_exact_numbers'} or read['ports'] != [0] or type(read['ports'][0]) is not int
            or type(read['sample_rows']) is not int or not 0 <= read['sample_rows'] <= 100
            or type(read['require_exact_numbers']) is not bool):
        raise ValueError('cli_node_read_compact_arguments')
    return dict(operation_id=args['operation_id'],contract_revision=request['contract_revision'],document_id=node['document_id'],
        workflow_ref=request['workflow_ref'],target=dict(kind='existing',type=request['target']['type'],label=request['target']['label'],ref=node),
        inputs=[],mode='read_existing_output',parameters=dict(source_operation_id=source_id,schemas=[dict(port=0,schema=schema)],
            javascript_source=dict(source_sha256=source['sha256'],source_utf8_bytes=source['utf8_bytes'],source_lf_lines=source['lf_lines'])),
        mappings=[],finish='execute',read=read,budgets=dict(configure_ms=600000,execute_ms=600000,total_ms=600000))


def verify_cli_node_binding(events, native_events, operation_id, expected, *, source_operation_id=None):
    failures = []
    source_sha = None
    try:
        if (not isinstance(operation_id,str) or not operation_id
                or any(not isinstance(expected.get(k),str) or not expected[k] for k in ('cli_session_id','runtime_session_id'))
                or any(not hexadecimal(expected.get(k),64) for k in ('runtime_revision','action_manifest_sha256'))):
            raise ValueError('cli_node_external_identity_pin')
        calls = cli_public_calls(events)
        reading = source_operation_id is not None
        if reading and (not isinstance(source_operation_id,str) or not source_operation_id or source_operation_id == operation_id):
            raise ValueError('cli_node_read_source_operation_pin')
        if any(c['part']['tool'] == 'loginom_dock_node_resume' and c['part']['state']['input'].get('operation_id') == operation_id for c in calls):
            raise ValueError('cli_node_resume_requires_reconciliation_audit')
        first_tool = 'loginom_dock_node_read' if reading else 'loginom_dock_node_apply'
        selected = [c for c in calls if c['part']['tool'] in (first_tool,'loginom_dock_node_wait','loginom_dock_node_status')
            and c['part']['state']['input'].get('operation_id') == operation_id]
        if not selected or selected[0]['part']['tool'] != first_tool:
            raise ValueError('cli_node_original_apply_missing')
        admissions = [(i,r) for i,r in enumerate(native_events) if r.get('operation_id') == operation_id and r.get('phase') == 'node_apply_prepared']
        checkpoints = [(i,r) for i,r in enumerate(native_events) if r.get('operation_id') == operation_id and r.get('phase') == 'node_checkpoint']
        ends = [(i,r) for i,r in enumerate(native_events) if r.get('operation_id') == operation_id and r.get('phase') == 'completed']
        if len(admissions) != 1 or len(checkpoints) != 1 or len(ends) != 1 or not admissions[0][0] < checkpoints[0][0] < ends[0][0]:
            raise ValueError('cli_node_native_lifecycle_receipts')
        rows = [r for r in native_events if r.get('operation_id') == operation_id]
        if any(not native_identity(r,expected) for r in rows):
            raise ValueError('cli_node_native_runtime_pin')
        native = admissions[0][1]['request']
        prior = None
        if reading:
            proof = verify_cli_node_binding(events,native_events,source_operation_id,expected)
            if not proof['passed']:raise ValueError('cli_node_read_source_binding_unverified')
            source_ends = [(i,r) for i,r in enumerate(native_events) if r.get('operation_id') == source_operation_id and r.get('phase') == 'completed']
            if len(source_ends) != 1 or source_ends[0][0] >= admissions[0][0]:raise ValueError('cli_node_read_source_order')
            source_request = next(r['request'] for r in native_events if r.get('operation_id') == source_operation_id and r.get('phase') == 'node_apply_prepared')
            prior = source_ends[0][1]['outcome']['output']
            if (prior['execution']['execution_id'] == checkpoints[0][1]['result'].get('execution',{}).get('execution_id')
                    or any(c['part']['state']['time']['end'] > selected[0]['part']['state']['time']['start'] for c in calls
                        if c['result'] and c['result'].get('operation_id') == source_operation_id and c['result'].get('state') == 'settled')):
                raise ValueError('cli_node_read_source_order_or_freshness')
        references,uploads = {},{}
        for call in calls:
            if call is selected[0]:break
            part,result = call['part'],call['result']
            if part['sessionID'] != expected['cli_session_id'] or part['state']['status'] != 'completed':continue
            if part['tool'] == 'loginom_dock_prepare' and result.get('prepared') is True:
                state = result['workspace']
                receipts = [r for r in native_events[:admissions[0][0]] if r.get('event') == 'workspace_prepared' and r.get('state') == state]
                if len(receipts) != 1 or not native_identity(receipts[0],expected) or result.get('sessionId') != expected['runtime_session_id']:
                    raise ValueError('cli_node_issued_workflow_receipt')
                if state.get('status') != 'READY' or state.get('authenticated') is not True or state.get('target_verified') is not True:
                    raise ValueError('cli_node_issued_workflow_not_ready')
                flow = state['workflow_ref']
                references[(state['document_id'],flow['workflow_id'])] = flow
            if part['tool'] == 'loginom_dock_action_run' and result.get('status') == 'SUCCEEDED':
                matching = [r['outcome'] for r in native_events[:admissions[0][0]] if native_identity(r,expected) and r.get('phase') == 'completed'
                    and r.get('operation_id') == result.get('operation_id') and r.get('action_key') in ('package.save_checkpoint','package.save_as')]
                if len(matching) == 1:
                    continuations = matching[0].get('output',{}).get('workflow_continuations',[])
                    public = result.get('output',{}).get('workflow_continuations',[])
                    if public != [{k:c[k] for k in ('document_id','workflow_ref')} for c in continuations]:
                        raise ValueError('cli_node_save_continuations')
                    for continuation in continuations:
                        flow = continuation['workflow_ref']
                        references[(continuation['document_id'],flow['workflow_id'])] = flow
            if part['tool'] in ('loginom_dock_artifact_deliver','loginom_dock_artifact_delivery_status','loginom_dock_artifact_delivery_resume') and result.get('state') == 'settled':
                output = result.get('output',{})
                if output.get('status') == 'SUCCEEDED' and output.get('upload_completion_verified') is True and output.get('cleanup_complete') is True:
                    complete = [r for r in native_events[:admissions[0][0]] if r.get('phase') == 'artifact_delivery_completed' and r.get('operation_id') == result.get('operation_id')]
                    starts = [r for r in native_events[:admissions[0][0]] if r.get('phase') == 'artifact_delivery_prepared' and r.get('operation_id') == result.get('operation_id')]
                    restarts = preupload_delivery_restarts(native_events[:admissions[0][0]],result.get('operation_id'))
                    if (len(complete) != 1 or len(starts) != 1+len(restarts) or not native_identity(complete[0],expected)
                            or any(not native_identity(start,expected) for start in starts)
                            or value_digest(complete[0].get('result')) != value_digest(output)):
                        raise ValueError('cli_node_delivery_path_receipt')
                    verify_preupload_public_resumes(calls,result['operation_id'],restarts,expected)
                    uploads[output['upload_operation_id']] = dict(artifact_id=starts[0]['artifact_id'],destination=output['destination'])
        checkpoint,outcome = checkpoints[0][1]['result'],ends[0][1]['outcome']
        if (checkpoint.get('status') != 'SUCCEEDED' or checkpoint.get('operation_id') != operation_id
                or checkpoint.get('cleanup_complete') is not True or checkpoint.get('package_saved') is not False
                or outcome.get('status') != 'SUCCEEDED' or outcome.get('operation_id') != operation_id
                or outcome.get('action_key') != 'node.apply' or value_digest(outcome.get('output')) != value_digest(checkpoint)
                or outcome.get('cleanup_complete') is not True or outcome.get('error') is not None):
            raise ValueError('cli_node_checkpoint_outcome_binding')
        if reading:
            delivered_source = checkpoint.get('output',{}).get('javascript_source',{})
            if (checkpoint.get('configuration',{}).get('status') != 'not_requested'
                    or delivered_source.get('source_operation_id') != source_operation_id
                    or any(delivered_source.get(k) != v for k,v in native['parameters']['javascript_source'].items())
                    or not hexadecimal(delivered_source.get('settings_sha256'),64)):
                raise ValueError('cli_node_read_output_source_binding')
        settled = False
        for call in selected:
            part,result = call['part'],call['result']
            args = part['state']['input']
            if part['sessionID'] != expected['cli_session_id'] or part['state']['status'] != 'completed':
                raise ValueError('cli_node_public_call_owner_or_error')
            if reading and part['tool'] == first_tool:
                if value_digest(expanded_cli_read(args,source_request,prior,source_operation_id)) != value_digest(native):
                    raise ValueError('cli_node_read_compact_expansion_changed')
            elif part['tool'] == 'loginom_dock_node_apply':
                ref = references.get((args.get('document_id'),args.get('workflow_ref',{}).get('workflow_id')))
                if ref is None or value_digest(expanded_cli_node(args,ref,uploads)) != value_digest(native):
                    raise ValueError('cli_node_compact_expansion_changed')
                if native['target']['type'] == 'programming.javascript' and 'source_text' in args['parameters']:
                    source_sha = hashlib.sha256(args['parameters']['source_text'].encode('utf-8')).hexdigest()
            elif set(args)-({'operation_id','timeout_ms'} if part['tool'] == 'loginom_dock_node_wait' else {'operation_id'}):
                raise ValueError('cli_node_poll_arguments')
            if (result.get('result_version') != 'user-v1' or result.get('operation_id') != operation_id
                    or result.get('attempt') != 1 or result.get('state') not in ('running','settled')
                    or settled and result.get('state') != 'settled' or result.get('error') is not None):
                raise ValueError('cli_node_public_job_snapshot')
            if result['state'] != 'settled':continue
            settled = True
            if (result.get('status') != 'SUCCEEDED' or result.get('action_key') != 'node.apply'
                    or result.get('cleanup_complete') is not True or result.get('effect_possible') is not outcome.get('effect_possible')
                    or value_digest({k:result.get(k) for k in ('node','execution','configuration','package_saved')})
                        != value_digest({k:checkpoint.get(k) for k in ('node','execution','configuration','package_saved')})):
                raise ValueError('cli_node_public_checkpoint_identity')
            for key in ('status','execution_id','evidence_ref','no_output_requested','javascript_source'):
                if value_digest(result.get('output',{}).get(key)) != value_digest(checkpoint.get('output',{}).get(key)):
                    raise ValueError('cli_node_public_output_identity')
            native_ports = checkpoint.get('output',{}).get('ports',[])
            if value_digest(result.get('output',{}).get('ports',[])) != value_digest([compact_port_facts(p) for p in native_ports]):
                raise ValueError('cli_node_public_port_schema_or_cells')
        if not settled:raise ValueError('cli_node_public_terminal_missing')
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'cli_node_binding_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),operation_id=operation_id,public_source_sha256=source_sha,
        scope='compact_standalone_output_read_to_retained_source_and_native_checkpoint_binding' if source_operation_id is not None
            else 'one_compact_standalone_node_to_native_checkpoint_binding',public_port_delivery_verified=not failures,model_code_semantics_verified=False,
        input_upload_verified=False,business_output_verified=False,persistence_verified=False,cli_acceptance_verified=False)
