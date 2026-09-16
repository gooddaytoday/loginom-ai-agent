"""Independently validate user-v1 projections before adapting legacy auditors.

The original evidence is never edited. Native settings, execution and persistence
still require their existing raw-observation verifiers.
"""
from copy import deepcopy
from evidence import PREFIX


def pick(obj, keys):
    return {k:deepcopy(obj[k]) for k in keys.split() if k in obj}


def project_node(snapshot):
    outcome=snapshot.get('outcome') or {}; node=outcome.get('output') or {}; data=node.get('output') or {}
    output=pick(data,'status evidence_ref execution_id no_output_requested')
    if 'ports' in data:
        output['ports']=[]
        for port in data['ports']:
            p=pick(port,'port port_guid fresh execution_id schema row_count sample sample_rows sample_complete precision table exact_table read_coverage read_consistency cell_precision binding limitations')
            p['schema']=[pick(c,'index name label type data_kind') for c in port['schema']]
            p['sample']=[]
            for row in port['sample']:
                cells=[]
                for c in row:
                    cell=pick(c,'type value decimal representation display_text precision is_null timezone cell_type native')
                    if 'value' in cell and cell.get('display_text')==cell['value']:cell.pop('display_text',None)
                    cells.append(cell)
                p['sample'].append(cells)
            p['sample_rows']=len(p['sample']);p['sample_complete']=port.get('sample_complete',False)
            output['ports'].append(p)
    if 'file_artifacts' in data:
        output['file_artifacts']=[pick(f,'artifact_id destination bytes sha256 execution_id verification_id freshness_basis') for f in data['file_artifacts']]
    if 'format_restoration' in data:output['format_restoration']=pick(data['format_restoration'],'restored table')
    if 'workflow_return' in data:output['workflow_returned']=data['workflow_return'].get('verified') is True
    if not node:output.update(deepcopy(outcome))
    result={'result_version':'user-v1',**pick(snapshot,'operation_id attempt state cancel_requested server_stop_requested')}
    if snapshot['state']=='running' and 'progress' in snapshot:result['progress']=snapshot['progress']
    result.update(pick(outcome,'status action_key phase effect_possible cleanup_complete'))
    result.update(pick(node,'node execution package_saved configuration'))
    result.update(output=output,error=snapshot.get('error') or outcome.get('error'),limitations=node.get('warnings',[]))
    return result


def project_action(outcome):
    result=deepcopy(outcome);result.pop('trace',None)
    if result.get('status')=='SUCCEEDED' and result.get('action_key') in ('package.save_as','package.save_checkpoint'):
        result['output']=pick(result['output'],'package_ref reopened workflow_preserved save_completed persisted_content_verified workflow_continuations')
        if 'workflow_continuations' in result['output']:
            result['output']['workflow_continuations']=[pick(x,'document_id workflow_ref') for x in result['output']['workflow_continuations']]
    result['result_version']='user-v1';return result


def normalize_user_evidence(evidence, *, terminal_outcomes=None):
    # Explicit scoped verifier input only; all existing callers remain strict.
    terminal_outcomes=terminal_outcomes or {}
    if not any(t.get('result',{}).get('result_version')=='user-v1' for t in evidence.get('tools',[]) if isinstance(t.get('result'),dict)):
        return deepcopy(evidence),{'passed':True,'scope':'legacy_diagnostic_results'}
    from node_public_acceptance_evidence import paired_public_calls,proven_validation_refusal
    result=deepcopy(evidence); pairs,failures=paired_public_calls(result)
    events=result['events']; active_preparation=None
    accepted_ids={e['operation_id'] for e in events if e.get('phase')=='node_apply_prepared'}
    def one(values,label):
        if len(values)!=1:raise ValueError(label)
        return values[0]
    try:
        if failures:raise ValueError('user_public_pairing')
        for call,reply in sorted(pairs,key=lambda pair:pair[0]['row']):
            tool=call['tool'];args=call.get('arguments',{});value=reply.get('result',{})
            if proven_validation_refusal(call,reply,events,accepted_ids,pairs):continue
            if tool in {PREFIX+x for x in ('dock_node_apply','dock_node_wait','dock_node_status','dock_artifact_deliver','dock_artifact_delivery_status')} and value.get('result_version')!='user-v1':raise ValueError('user_mixed_result_profile')
            if tool==PREFIX+'dock_prepare':
                if value.get('prepared') is True:
                    state=value['workspace']
                    ev=one([e for e in events if e.get('event')=='workspace_prepared' and e.get('state')==state and e.get('session_id')==value.get('sessionId')],'user_prepare_journal')
                    if state.get('status')!='READY' or state.get('target_verified') is not True or not (state.get('ownership_verified') is True and args.get('intent','new_draft')=='new_draft' or args.get('intent')=='open_package' and state.get('created_draft') is False and state.get('package_ref',{}).get('persisted') is True and bool(args.get('package_path')) and state['package_ref'].get('path')==args['package_path']) or state.get('document_id') is None or state.get('session_id')!=value['sessionId'] or state.get('operation_id')!=args.get('operation_id','prepare'):
                        raise ValueError('user_prepare_identity')
                    active_preparation=(call['session_id'],state,ev,reply['row'])
                else:active_preparation=None
            if tool==PREFIX+'dock_node_apply' and set(args.get('workflow_ref',{}))=={'workflow_id'}:
                if active_preparation is None or active_preparation[0]!=call['session_id']:raise ValueError('user_missing_preparation')
                _,state,ev,prepared_row=active_preparation
                if prepared_row>=call['row']:raise ValueError('user_preparation_reply_order')
                if state['document_id']!=args.get('document_id') or state['workflow_ref']['workflow_id']!=args['workflow_ref']['workflow_id']:raise ValueError('user_stale_workflow')
                declaration=one([e for e in events if e.get('phase')=='node_apply_prepared' and e.get('operation_id')==args.get('operation_id')],'user_node_declaration')
                if declaration.get('session_id')!=ev['session_id'] or events.index(declaration)<=events.index(ev):raise ValueError('user_preparation_order')
                expanded=deepcopy(args);expanded['workflow_ref']=deepcopy(state['workflow_ref'])
                if expanded!=declaration['request']:raise ValueError('user_expanded_request')
                call['arguments']=expanded
            if value.get('result_version')!='user-v1':continue
            operation=args.get('operation_id')
            if value.get('error') is not None and tool in {PREFIX+x for x in ('dock_node_apply','dock_node_wait','dock_node_status')} and operation not in terminal_outcomes:
                # The Text export goal intentionally proves native overwrite rejection.
                refused=[e for e in events if e.get('operation_id')==operation and e.get('phase')=='node_phase_refused' and e.get('receipt',{}).get('verification')=='text_export_conflict_rejected' and e['receipt'].get('cleanup_complete') is True]
                executed=any(e.get('operation_id')==operation and e.get('phase')=='node_execution_prepared' for e in events)
                if not (value.get('state')=='settled' and value.get('status')=='FAILED' and value.get('cleanup_complete') is True and value['error'].get('code')=='NODE_APPLY_STOPPED' and len(refused)==1 and not executed):raise ValueError('user_node_error')

            if tool in {PREFIX+x for x in ('dock_node_apply','dock_node_wait','dock_node_status')}:
                if value.get('state')=='settled':
                    end=one([e for e in events if e.get('phase')=='completed' and e.get('operation_id')==operation and e.get('action_key')=='node.apply'],'user_node_end')
                    if operation in terminal_outcomes and (end['outcome']!=terminal_outcomes[operation] or end['outcome']['status'] not in ('FAILED','NOT_APPLIED')):raise ValueError('unbound_terminal_outcome')
                    if operation not in terminal_outcomes and value.get('error')!=end['outcome'].get('error'):raise ValueError('user_node_error_projection')
                    raw={**pick(value,'operation_id attempt state cancel_requested server_stop_requested'),'outcome':end['outcome'],'error':None if operation in terminal_outcomes else value.get('error')}
                elif value.get('state')=='running':
                    raw={**pick(value,'operation_id attempt state cancel_requested server_stop_requested progress'),'outcome':None,'error':None if operation in terminal_outcomes else value.get('error')}
                else:raise ValueError('user_node_state')
                if project_node(raw)!=value:raise ValueError('user_node_projection:'+str(operation))
                reply['result']=raw
            elif tool==PREFIX+'dock_action_run':
                end=one([e for e in events if e.get('phase')=='completed' and e.get('operation_id')==operation and e.get('action_key')==args.get('action_key')],'user_action_end')
                if project_action(end['outcome'])!=value:raise ValueError('user_action_projection')
                reply['result']=deepcopy(end['outcome'])
            elif tool in {PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status'}:
                if value.get('state') not in ('running','settled'):raise ValueError('user_delivery_state')
                end=one([e for e in events if e.get('phase')=='artifact_delivery_completed' and e.get('operation_id')==operation],'user_delivery_end')
                raw={'operation_id':operation,'state':value['state'],'outcome':end['result'] if value['state']=='settled' else None,'error':None}
                if project_node(raw)!=value:raise ValueError('user_delivery_projection')
                raw.update(phase='completed' if value['state']=='settled' else 'running',upload_operation_id=end['result']['upload_operation_id'])
                reply['result']=raw
        return result,{'passed':True,'scope':'user_v1_exact_projection_and_prepared_workflow'}
    except (KeyError,TypeError,ValueError,AttributeError) as error:
        return result,{'passed':False,'failures':[str(error)]}
