"""Bind normal worker Save receipts and delivered dirty state, not cold persistence.

The outer auditor owns frozen evidence, catalog/path allocation, native admission,
business correctness and process cleanup. A rendered Save graph is not GUID proof.
"""
import json
import re
from javascript_cli_evidence import value_digest
from javascript_cli_nodes import cli_public_calls,native_identity,verify_cli_node_binding


SAVE_KEYS = ('package.save_checkpoint','package.save_as')


def public_json_blocks(part):
    text = part['state']['output'].strip()
    values = []
    while text:
        value,end = json.JSONDecoder().raw_decode(text)
        if not isinstance(value,dict):raise ValueError('cli_save_public_block_shape')
        values.append(value)
        tail = text[end:]
        if tail.strip() and not tail.startswith('\n\n'):raise ValueError('cli_save_public_block_separator')
        text = tail.strip()
    return values


def owned_package_path(path,account):
    return (isinstance(account,str) and bool(re.fullmatch(r'[^/\\\x00-\x1f]+',account))
        and isinstance(path,str) and path.startswith('/'+account+'/') and path.endswith('.lgp')
        and all(p and p not in ('.','..') and not re.search(r'[\\\x00-\x1f]',p) for p in path.split('/')[1:]))


def verify_save_trace(outcome,checkpoint):
    key,path = outcome['action_key'],checkpoint['path']
    trace = outcome['trace']
    names = (['save_requested','save_flow_completed','open_saved_package_observed','postcondition_verified']
        if key == 'package.save_checkpoint' else
        ['save_requested','save_flow_completed','saved_package_closed','package_open_command_ready','reopened_package_observed','postcondition_verified'])
    selected = []
    for name in names:
        matches = [(i,t) for i,t in enumerate(trace) if t.get('event') == name]
        if len(matches) != 1:raise ValueError('cli_save_native_trace_receipts')
        selected.append(matches[0])
    if [i for i,t in selected] != sorted(i for i,t in selected):raise ValueError('cli_save_native_trace_order')
    times = [t['at_ms'] for t in trace]
    if any(type(t) is not int or t < 0 for t in times) or times != sorted(times):
        raise ValueError('cli_save_native_trace_time')
    saved,flow,observed,post = selected[0][1],selected[1][1],selected[-2][1],selected[-1][1]
    reopened = key == 'package.save_as'
    graph = checkpoint['graph']
    if (saved.get('path') != path or flow.get('path') != path or observed.get('requested_path') != path
            or observed.get('actual_path') != path or observed.get('path_matches') is not True
            or observed.get('graph_matches') is not True or value_digest(observed.get('graph')) != value_digest(graph)
            or value_digest(post.get('graph')) != value_digest(graph) or post.get('package_path') != path
            or post.get('reopened') is not reopened):
        raise ValueError('cli_save_native_trace_path_graph')
    if not reopened and (observed.get('workflow_matches') is not True
            or value_digest(observed.get('workflow_ref')) != value_digest(checkpoint['workflow_ref'])
            or value_digest(post.get('workflow_ref')) != value_digest(checkpoint['workflow_ref'])
            or post.get('proof') != 'awaited_save_flow_same_open_workflow' or post.get('persisted_content_verified') is not False
            or any(t.get('event') in ('saved_package_closed','reopened_package_observed') for t in trace)):
        raise ValueError('cli_save_native_checkpoint_workflow')
    conflicts = [(i,t) for i,t in enumerate(trace) if t.get('event') == 'save_conflict_observed']
    overwrites = [(i,t) for i,t in enumerate(trace) if t.get('event') == 'overwrite_confirmed']
    if any(t.get('event') == 'conflict_rejected' for t in trace):raise ValueError('cli_save_native_conflict')
    return selected,conflicts,overwrites


def verify_cli_last_save(events,native_events,source_operation_id,final_path,revisions,expected):
    failures = []
    final_id = None
    try:
        if (not owned_package_path(final_path,expected.get('account')) or set(revisions) != set(SAVE_KEYS)
                or any(not isinstance(r,str) or not r for r in revisions.values())):
            raise ValueError('cli_save_external_path_catalog_pin')
        source = verify_cli_node_binding(events,native_events,source_operation_id,expected)
        if not source['passed']:raise ValueError('cli_save_source_binding_unverified')
        source_start = next(r for r in native_events if r.get('operation_id') == source_operation_id and r.get('phase') == 'node_apply_prepared')['request']
        source_ends = [(i,r) for i,r in enumerate(native_events) if r.get('operation_id') == source_operation_id and r.get('phase') == 'completed']
        source_pos,source_end = source_ends[0]
        node = source_end['outcome']['output']['node']
        if source_start['target']['type'] != 'programming.javascript' or source_start['finish'] != 'execute':
            raise ValueError('cli_save_source_not_javascript_execute')
        flow = {k:source_start['workflow_ref'][k] for k in ('tab_tid','prefix')}
        public_calls = cli_public_calls(events)
        calls = [c for c in public_calls if c['part']['tool'] == 'loginom_dock_action_run'
            and c['part']['state']['input'].get('action_key') in SAVE_KEYS]
        starts = [(i,r) for i,r in enumerate(native_events) if r.get('phase') == 'prepared' and r.get('action_key') in SAVE_KEYS]
        if not calls or not starts:raise ValueError('cli_save_missing')
        call_ids = {c['part']['state']['input'].get('operation_id') for c in calls}
        ids = [r.get('operation_id') for i,r in starts]
        native_ids = {r.get('operation_id') for r in native_events if r.get('action_key') in SAVE_KEYS}
        if (len(set(ids)) != len(ids) or set(ids) != call_ids or source_operation_id in ids
                or native_ids != set(ids) or any(not isinstance(i,str) or not i for i in ids)):
            raise ValueError('cli_save_operation_coverage')
        final_pos,final_start = starts[-1]
        final_id = final_start['operation_id']
        if (final_pos <= source_pos or final_start['parameters'].get('path') != final_path
                or calls[-1]['part']['state']['input'].get('operation_id') != final_id):
            raise ValueError('cli_save_not_final_source_path')
        source_delivery = [c for c in public_calls if c['part']['tool'] in ('loginom_dock_node_apply','loginom_dock_node_status','loginom_dock_node_wait')
            and c['part']['state']['input'].get('operation_id') == source_operation_id and c['result'].get('state') == 'settled']
        if not source_delivery or any(c['part']['state']['time']['start'] < source_delivery[0]['part']['state']['time']['end']
                for c in calls if c['part']['state']['input'].get('operation_id') == final_id):
            raise ValueError('cli_save_public_source_order')
        owned = set()
        last_dirty = None
        previous_dirty_pos = -1
        for start_pos,start in starts:
            op,key,parameters = start['operation_id'],start['action_key'],start['parameters']
            path,policy = parameters.get('path'),parameters.get('conflict_policy')
            rows = [(i,r) for i,r in enumerate(native_events) if r.get('operation_id') == op]
            ends = [(i,r) for i,r in rows if r.get('phase') == 'completed']
            dirty = [(i,r) for i,r in rows if r.get('phase') == 'saved_package_state_observed']
            selected = [c for c in calls if c['part']['state']['input'].get('operation_id') == op]
            if (len(ends) != 1 or not start_pos < ends[0][0] or len(dirty) != len(selected)
                    or any(i <= ends[0][0] for i,r in dirty) or any(not native_identity(r,expected) for i,r in rows)):
                raise ValueError('cli_save_native_receipt_order_or_pin')
            end_pos,end = ends[0]
            if start_pos <= previous_dirty_pos:raise ValueError('cli_save_native_stage_overlap')
            previous_dirty_pos = dirty[-1][0]
            checkpoint = start['checkpoint']
            if (set(parameters) != {'path','conflict_policy'} or not owned_package_path(path,expected['account'])
                    or policy not in ('fail','replace') or policy == 'replace' and path not in owned
                    or checkpoint.get('path') != path or value_digest(checkpoint.get('workflow_ref')) != value_digest(flow)
                    or checkpoint.get('package_identity',{}).get('path') not in ({''} if not owned else owned)):
                raise ValueError('cli_save_native_path_ownership')
            graph = checkpoint['graph']
            if (set(graph) != {'nodes','ports','links'} or not isinstance(graph['nodes'],list) or not graph['nodes']
                    or any(not isinstance(n,str) or not n for n in graph['nodes']) or len(set(graph['nodes'])) != len(graph['nodes'])
                    or not isinstance(graph['ports'],list) or {p['node_label'] for p in graph['ports']} != set(graph['nodes'])
                    or len(graph['ports']) != len(graph['nodes']) or any(not isinstance(p['tids'],list)
                        or any(not isinstance(t,str) or not t for t in p['tids']) for p in graph['ports'])
                    or not isinstance(graph['links'],list) or any(not isinstance(t,str) or not t for t in graph['links'])
                    or op == final_id and (node.get('label') or source_start['target'].get('label')) not in graph['nodes']):
                raise ValueError('cli_save_rendered_graph_shape')
            if (any(r.get('action_key') != key or r.get('action_revision') != revisions[key]
                    or value_digest(r.get('parameters')) != value_digest(parameters)
                    or value_digest(r.get('checkpoint')) != value_digest(checkpoint) for r in (start,end))):
                raise ValueError('cli_save_native_contract_binding')
            outcome = end['outcome']
            output = outcome['output']
            reopened = key == 'package.save_as'
            if (outcome.get('operation_id') != op or outcome.get('action_key') != key or outcome.get('action_revision') != revisions[key]
                    or outcome.get('status') != 'SUCCEEDED' or outcome.get('phase') != 'verified'
                    or outcome.get('error') is not None or outcome.get('cleanup_complete') is not True or outcome.get('effect_possible') is not True
                    or value_digest(output.get('package_ref')) != value_digest(dict(kind='package',path=path,active_identity=path))
                    or output.get('reopened') is not reopened or not reopened and (output.get('workflow_preserved') is not True
                        or output.get('save_completed') is not True or output.get('persisted_content_verified') is not False)):
                raise ValueError('cli_save_native_success_contract')
            trace,conflicts,overwrites = verify_save_trace(outcome,checkpoint)
            if conflicts or overwrites:
                if (policy != 'replace' or path not in owned or checkpoint['package_identity']['path'] != path
                        or len(conflicts) != 1 or len(overwrites) != 1 or conflicts[0][1].get('path') != path
                        or not trace[0][0] < conflicts[0][0] < overwrites[0][0] < trace[1][0]):
                    raise ValueError('cli_save_native_conflict')
            continuations = output.get('workflow_continuations',[])
            continuation_rows = [t for t in outcome['trace'] if t.get('event') == 'save_continuations_observed']
            if not reopened and (len(continuation_rows) != 1 or value_digest(continuation_rows[0].get('continuations')) != value_digest(continuations)
                    or not any(c.get('document_id') == source_start['document_id']
                        and c.get('workflow_ref',{}).get('workflow_id') == source_start['workflow_ref']['workflow_id'] for c in continuations)
                    or any(c.get('document_id') != source_start['document_id']
                        or {k:c['workflow_ref'].get(k) for k in ('tab_tid','prefix')} != flow
                        or {k:c['previous_workflow_ref'].get(k) for k in ('tab_tid','prefix')} != flow
                        or c['workflow_ref'].get('workflow_id') != c['previous_workflow_ref'].get('workflow_id')
                        or any(not isinstance(ref.get('navigation_path'),list) or not ref['navigation_path']
                            for ref in (c['workflow_ref'],c['previous_workflow_ref'])) for c in continuations)
                    or len({c['workflow_ref'].get('workflow_id') for c in continuations}) != len(continuations)):
                raise ValueError('cli_save_native_continuations')
            public_output = {k:output[k] for k in ('package_ref','reopened','workflow_preserved','save_completed','persisted_content_verified','workflow_continuations') if k in output}
            if 'workflow_continuations' in public_output:
                public_output['workflow_continuations'] = [{k:c[k] for k in ('document_id','workflow_ref')} for c in continuations]
            for call,(dirty_pos,dirty_row) in zip(selected,dirty):
                part = call['part']
                if (part['sessionID'] != expected['cli_session_id'] or part['state']['status'] != 'completed'
                        or value_digest(part['state']['input']) != value_digest(dict(operation_id=op,action_key=key,parameters=parameters))):
                    raise ValueError('cli_save_public_call_binding')
                blocks = public_json_blocks(part)
                public = blocks[0]
                constraints = public.get('output',{}).get('reporting_constraints')
                comparable = {k:v for k,v in public.items() if k not in ('output','result_version')}
                native_comparable = {k:v for k,v in outcome.items() if k not in ('output','trace')}
                if (public.get('result_version') != 'user-v1' or value_digest(comparable) != value_digest(native_comparable)
                        or not isinstance(constraints,list) or not constraints or any(not isinstance(c,str) or not c for c in constraints)
                        or value_digest({k:v for k,v in public['output'].items() if k != 'reporting_constraints'}) != value_digest(public_output)):
                    raise ValueError('cli_save_public_receipt_binding')
                state,advice = dirty_row['state'],dirty_row['advice']
                if (type(state.get('version')) is not int or state.get('version') != 1 or state.get('session_id') != expected['runtime_session_id']
                        or state.get('document_id') != source_start['document_id'] or state.get('account') != expected['account']
                        or state.get('package_path') != path or type(state.get('modified')) is not bool
                        or state.get('observation') != 'after_confirmed_save' or state.get('read_only') is not True
                        or state.get('persisted_content_verified') is not False
                        or advice.get('kind') != 'dock_saved_package_state' or advice.get('save_operation_id') != op
                        or advice.get('package_path') != path or advice.get('modified') is not state['modified']
                        or advice.get('persisted_content_verified') is not False
                        or len([b for b in blocks[1:] if b.get('kind') == 'dock_saved_package_state']) != 1
                        or value_digest(blocks[1]) != value_digest(advice)):
                    raise ValueError('cli_save_dirty_state_binding')
                if not state['modified'] and set(advice) != {'kind','save_operation_id','package_path','modified','persisted_content_verified'}:
                    raise ValueError('cli_save_dirty_advice_contract')
                if state['modified'] and (set(advice) != {'kind','save_operation_id','package_path','modified','persisted_content_verified','next_step'}
                        or advice.get('next_step',{}).get('tool') != 'dock_action_run'
                        or value_digest(advice['next_step'].get('arguments')) != value_digest(dict(action_key='package.save_checkpoint',parameters=dict(path=path,conflict_policy='replace')))
                        or not isinstance(advice['next_step'].get('instruction'),str) or not advice['next_step']['instruction']):
                    raise ValueError('cli_save_dirty_advice_contract')
                verification = [(i,r) for i,r in rows if r.get('phase') == 'verification_delivered' and dirty_pos < i]
                if len(blocks) > 3 or len(blocks) == 3 and (not verification or value_digest(blocks[2]) != value_digest(verification[0][1]['verification'])):
                    raise ValueError('cli_save_public_verification_binding')
                if op == final_id:last_dirty = (dirty_pos,state)
            owned.add(path)
        if last_dirty is None or last_dirty[1]['modified'] is not False:raise ValueError('cli_save_final_dirty_or_unavailable')
        if any(r.get('phase') in ('node_apply_prepared','prepared') for r in native_events[final_pos+1:]):
            raise ValueError('cli_save_later_mutation_requires_checkpoint')
        if any(r.get('phase') == 'node_apply_prepared' and r.get('request',{}).get('target',{}).get('type') == 'programming.javascript'
                for r in native_events[source_pos+1:final_pos]):
            raise ValueError('cli_save_later_javascript_source')
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'cli_save_binding_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),save_operation_id=final_id,package_path=final_path,
        scope='normal_worker_public_save_and_native_dirty_state',save_receipt_verified=not failures,
        final_open_package_clean_verified=not failures,rendered_save_graph_consistency_verified=not failures,
        native_guid_graph_verified=False,settings_persistence_verified=False,cold_persistence_verified=False,
        process_cleanup_verified=False,cli_acceptance_verified=False)
