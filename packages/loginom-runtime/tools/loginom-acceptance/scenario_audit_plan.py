"""Build a reviewable reopen plan from recorded model operations, never a recipe."""
import argparse
import json
import re
from pathlib import Path

from run import MANIFEST_ROOT, write
from scenario_recovered_calculator import recover_created_calculator
from scenario_profile import validate_profile


def require(value, message):
    if not value:
        raise ValueError(message)


def confirmed_save(result, path):
    output = result.get('output', {})
    if result.get('status') != 'SUCCEEDED' or result.get('cleanup_complete') is not True:
        return False
    if output.get('package_ref', {}).get('path') != path:
        return False
    if result.get('action_key') == 'package.save_checkpoint':
        return output.get('save_completed') is True
    if result.get('action_key') == 'package.save_as':
        return (result.get('phase') == 'verified' and output.get('reopened') is True
                and output.get('package_ref', {}).get('active_identity') == path)
    return False


def first_read_schema(source, port):
    """Audit a first read against the completed operation's observed mapping."""
    config = source.get('configuration', {})
    readback = config.get('readback', {})
    require(source.get('cleanup_complete') is True and source.get('execution', {}).get('status') == 'completed'
            and config.get('status') == 'applied' and readback.get('node') == source['node']
            and readback.get('scope') == 'observed_before_verified_finish'
            and readback.get('values_are') == 'observed_ui_values', 'First read lacks an owned mapping readback')
    operation = source['operation_id']
    receipts = readback.get('receipt_ids', [])
    require(operation+':finish' in receipts and operation+':output_mapping' in receipts
            and len(set(receipts)) == len(receipts) and all(sum(
                p.get('receipt_id') == receipt and p.get('status') == 'verified'
                and receipt == operation+':'+p.get('phase', '') for p in source.get('phases', [])) == 1
                for receipt in receipts), 'First read lacks completed mapping receipts')
    mappings = readback.get('output_mappings', [readback.get('output_mapping', {})])
    selected = [m for m in mappings if m.get('port') == port]
    require(len(selected) == 1, 'First read introduced an unrecorded output port')
    fields = selected[0].get('fields', [])
    require(fields and all(f.get('index') == i and all(isinstance(f.get(k), str)
            for k in ('name', 'label', 'type', 'source_name')) and
            ('excluded' not in f or isinstance(f['excluded'], bool)) for i, f in enumerate(fields))
            and len({f['name'] for f in fields}) == len(fields), 'First read mapping is incomplete')
    active = [f for f in fields if not f.get('excluded', False)]
    require(active, 'First read mapping has no active columns')
    return active


def build_plan(request, evidence, *, allow_field_reordering=False, diagnostic_saved_only=False):
    if request.get('phase')=='acceptance':
        require(evidence.get('effective_profile',{}).get('status')=='VERIFIED', 'Effective Xiaomi/MiMo/medium profile unverified')
    process_completed = evidence['process']['returncode'] == 0 and not evidence['process']['timed_out']
    require(evidence['runtime_source_unchanged'] is True and (process_completed or diagnostic_saved_only), 'Completed unchanged model run required')
    model = request.get('model', 'mimo-v2.5')
    provider = request.get('provider', 'xiaomi')
    validate_profile(provider, model)
    if provider != 'xiaomi':
        require(request.get('phase') == 'diagnostic', 'Comparison profiles are diagnostic only')
        profile = evidence.get('effective_profile', {})
        require(profile.get('status') == 'VERIFIED' and profile.get('sessions')
                and all(s.get('model') == model and s.get('provider') == provider
                        for s in profile['sessions']), 'Effective comparison profile differs')
    require(evidence['effective_models'] and all(r['model'] == model for r in evidence['effective_models']), 'Effective model differs')
    results = [t['result'] for t in evidence['tools'] if isinstance(t.get('result'), dict)]
    require(any(confirmed_save(r, request['package']) for r in results), 'Target save not confirmed')
    preparation = next(r for r in results if r.get('prepared') is True)
    pins = preparation['knowledge']['session_manifest']
    require(re.fullmatch(r'[A-Za-z0-9_.-]+', pins['actionCatalogVersion']), 'Invalid catalog version')
    baseline_event = next(e for e in evidence['events'] if e.get('phase') == 'node_target_checkpoint' and e.get('target_state', {}).get('baseline'))
    baseline = baseline_event['target_state']['baseline']
    require(baseline['complete'] is True and not baseline['foreign_links'], 'Initial graph incomplete')
    nodes = {n['ref']['node_id']: dict(id=n['ref']['node_id'], label=n['label'], type=n['type']) for n in baseline['nodes']}
    links = {(e['source'], e['output'], e['target'], e['input']) for e in baseline['links']}
    calls = {}
    read_calls = {}
    for call in evidence['calls']:
        if call['tool'].endswith('dock_node_read'):
            args = call['arguments']
            read_calls.setdefault(args['operation_id'], []).append(args)
            continue
        if call['tool'].endswith(('dock_node_apply', 'dock_node_resume')):
            args = call['arguments']
            if call['tool'].endswith('dock_node_resume') and set(args) == {'operation_id'}:
                require(args['operation_id'] in calls, 'ID-only resume lacks an original recorded request')
                continue
            calls.setdefault(args['operation_id'], []).append(args)
    completed = {}
    for result in results:
        if result.get('status') == 'SUCCEEDED' and result.get('node'):
            completed[result['operation_id']] = result
    outputs = {}
    inspected = []
    recovered_creations = []
    read_provenance = []
    seen_completed = {}
    for operation, result in completed.items():
        if operation in read_calls:
            candidates=read_calls[operation]
            require(operation not in calls and all(c==candidates[0] for c in candidates), 'Read operation ID has conflicting requests')
            args=candidates[0]
            require(set(args)<= {'operation_id','source_operation_id','read','budget_ms'}, 'Read request contains configuration')
            source=seen_completed.get(args.get('source_operation_id'))
            require(source and source['node']==result['node'], 'Read source is absent, incomplete or belongs to another node')
            require(result.get('configuration',{}).get('status')=='not_requested'
                    and result.get('cleanup_complete') is True and result.get('execution',{}).get('status')=='completed',
                    'Read result lacks settled execution without configuration')
            node=result['node']['node_id']
            ports=result.get('output',{}).get('ports',[])
            require(ports, 'Read result has no output')
            for port in ports:
                retained=outputs.get((node,port['port']))
                if retained is None:
                    retained = dict(node_id=node, type=nodes[node]['type'], port=port['port'],
                                    schema=first_read_schema(source, port['port']), allow_field_reordering=allow_field_reordering)
                    outputs[node, port['port']] = retained
                identity=lambda fields: sorted((f['name'],f['label'],f['type']) for f in fields)
                require(identity(retained['schema'])==identity(port['schema']), 'Read changed output field identity')
                retained.update(name=operation+'-port'+str(port['port']),schema=port['schema'])
            read_provenance.append(dict(operation_id=operation,source_operation_id=args['source_operation_id'],node_id=node,configuration_changed=False))
            seen_completed[operation]=result
            continue
        candidates = calls.get(operation, [])
        require(candidates, 'Successful node has no recorded request')
        require(all(c == candidates[0] for c in candidates), 'Same operation ID carries changed requests')
        args = candidates[0]
        effective_parameters=args['parameters']
        node = result['node']['node_id']
        require(result['node']['document_id'] == baseline['document_id'], 'Model switched document')
        if args['target']['kind'] == 'new':
            require(node not in nodes, 'Duplicate created node identity')
            nodes[node] = dict(id=node, label=args['target']['label'], type=args['target']['type'])
        else:
            if node not in nodes:
                info,edge,effective_parameters,provenance=recover_created_calculator(args,result,calls,results,evidence['events'],nodes,links)
                nodes[node]=info;links.add(edge);recovered_creations.append(provenance)
            require(node in nodes, 'Existing target absent from recorded graph')
            require(not args.get('inputs'), 'Existing-node link changes need manual graph review')
        for edge in args.get('inputs', []):
            links.add((edge['source']['node_id'], edge['output'], node, edge['input']))
        for port in result.get('output', {}).get('ports', []):
            outputs[node, port['port']] = dict(name=operation+'-port'+str(port['port']), node_id=node, type=args['target']['type'], port=port['port'], schema=port['schema'], allow_field_reordering=allow_field_reordering)
        if args['target']['type'] == 'exports.text':
            outputs[node, None] = dict(name=operation+'-configuration', node_id=node, type='exports.text', port=None, schema=[], configuration_only=True, expected_destination=args['parameters']['destination'])
        seen_completed[operation]=result
        inspected.append(dict(operation_id=operation, node_id=node, parameters=effective_parameters, mappings=args.get('mappings', [])))
    require(outputs, 'No completed analytical outputs')
    edges = [dict(source=s, output=o, target=t, input=i) for s,o,t,i in links]
    edges.sort(key=lambda e: json.dumps(e, separators=(',', ':'), ensure_ascii=False))
    return dict(operator_reviewed=False, task=request['task']['number'], run_id=request['run_id'],
                acceptance_eligible=process_completed and not diagnostic_saved_only and provider == 'xiaomi',
                diagnostic_saved_only=diagnostic_saved_only,
                package_path=request['package'], old_document_id=baseline['document_id'],
                runtime_revision=request['runtime_source_pin']['client_revision'],
                manifest_uri=MANIFEST_ROOT+pins['actionCatalogVersion']+'/manifest.json', manifest_sha256=pins['actionManifestDigest'],
                expected_graph=dict(nodes=sorted(nodes.values(), key=lambda n:n['id']), links=edges),
                outputs=list(outputs.values()), inspect_configuration=True,
                model_operations_for_review=inspected,
                recovered_creations=recovered_creations,
                output_read_operations=read_provenance,
                baseline_evidence=dict(recorded_at=baseline_event['recorded_at'], operation_id=baseline_event['operation_id']),
                review_required=['Compare the original description with these recorded model choices; this plan is not a correctness oracle.',
                                 'Check field-order policy, supported configuration readers and full-table widths before marking reviewed.'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--allow-field-reordering', action='store_true')
    parser.add_argument('--diagnostic-saved-only', action='store_true', help='Inspect a confirmed saved package from a failed run; never establish autonomous acceptance.')
    args = parser.parse_args()
    write(args.out, build_plan(json.loads((args.run/'request.json').read_text()), json.loads((args.run/'evidence.json').read_text()), allow_field_reordering=args.allow_field_reordering, diagnostic_saved_only=args.diagnostic_saved_only))
