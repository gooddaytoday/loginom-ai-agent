"""Bind one actual compact standalone node lifecycle to immutable native receipts.

Independent of business Table/source/settings/Save/cold audits. Does not execute
JavaScript, use a historical Hermes envelope, or certify complete CLI acceptance.
"""
import copy
import hashlib
import json
from javascript_cli_evidence import terminal_tool,value_digest
from javascript_cli_candidate import hexadecimal


LOCAL_RECEIPT_TOOLS = {'loginom_'+name for name in ('dock_prepare','dock_action_run','dock_action_describe',
    'dock_artifact_deliver','dock_artifact_delivery_status','dock_node_apply','dock_node_wait','dock_node_status',
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


def verify_cli_node_binding(events, native_events, operation_id, expected):
    failures = []
    source_sha = None
    try:
        if (not isinstance(operation_id,str) or not operation_id
                or any(not isinstance(expected.get(k),str) or not expected[k] for k in ('cli_session_id','runtime_session_id'))
                or any(not hexadecimal(expected.get(k),64) for k in ('runtime_revision','action_manifest_sha256'))):
            raise ValueError('cli_node_external_identity_pin')
        calls = cli_public_calls(events)
        if any(c['part']['tool'] == 'loginom_dock_node_resume' and c['part']['state']['input'].get('operation_id') == operation_id for c in calls):
            raise ValueError('cli_node_resume_requires_reconciliation_audit')
        selected = [c for c in calls if c['part']['tool'] in ('loginom_dock_node_apply','loginom_dock_node_wait','loginom_dock_node_status')
            and c['part']['state']['input'].get('operation_id') == operation_id]
        if not selected or selected[0]['part']['tool'] != 'loginom_dock_node_apply':
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
            if part['tool'] in ('loginom_dock_artifact_deliver','loginom_dock_artifact_delivery_status') and result.get('state') == 'settled':
                output = result.get('output',{})
                if output.get('status') == 'SUCCEEDED' and output.get('upload_completion_verified') is True and output.get('cleanup_complete') is True:
                    complete = [r for r in native_events[:admissions[0][0]] if r.get('phase') == 'artifact_delivery_completed' and r.get('operation_id') == result.get('operation_id')]
                    starts = [r for r in native_events[:admissions[0][0]] if r.get('phase') == 'artifact_delivery_prepared' and r.get('operation_id') == result.get('operation_id')]
                    if (len(complete) != 1 or len(starts) != 1 or not native_identity(complete[0],expected)
                            or not native_identity(starts[0],expected) or value_digest(complete[0].get('result')) != value_digest(output)):
                        raise ValueError('cli_node_delivery_path_receipt')
                    uploads[output['upload_operation_id']] = dict(artifact_id=starts[0]['artifact_id'],destination=output['destination'])
        checkpoint,outcome = checkpoints[0][1]['result'],ends[0][1]['outcome']
        if (checkpoint.get('status') != 'SUCCEEDED' or checkpoint.get('operation_id') != operation_id
                or checkpoint.get('cleanup_complete') is not True or checkpoint.get('package_saved') is not False
                or outcome.get('status') != 'SUCCEEDED' or outcome.get('operation_id') != operation_id
                or outcome.get('action_key') != 'node.apply' or value_digest(outcome.get('output')) != value_digest(checkpoint)
                or outcome.get('cleanup_complete') is not True or outcome.get('error') is not None):
            raise ValueError('cli_node_checkpoint_outcome_binding')
        settled = False
        for call in selected:
            part,result = call['part'],call['result']
            args = part['state']['input']
            if part['sessionID'] != expected['cli_session_id'] or part['state']['status'] != 'completed':
                raise ValueError('cli_node_public_call_owner_or_error')
            if part['tool'] == 'loginom_dock_node_apply':
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
        scope='one_compact_standalone_node_to_native_checkpoint_binding',public_port_delivery_verified=not failures,model_code_semantics_verified=False,
        input_upload_verified=False,business_output_verified=False,persistence_verified=False,cli_acceptance_verified=False)
