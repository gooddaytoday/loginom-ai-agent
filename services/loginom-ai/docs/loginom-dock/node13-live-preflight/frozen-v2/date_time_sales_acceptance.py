"""Full declared-goal audit plus separately collected independent persistence.

Consumes the standard redacted request/scenario/evidence export; never trusts
Hermes prose. A missing component fails closed. No model or browser launch.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from audit import knowledge_scope
from evidence import PREFIX, KNOWLEDGE_TOOLS
from user_result_evidence import normalize_user_evidence
from prepare_binding import verified_prepare_v1
from grouping_node_acceptance import model_completed
from node_public_acceptance_evidence import verify_public_nodes_and_saves, verify_public_delivery
from artifact_delivery_evidence import verify_delivered_import_output
from node_configuration_evidence import verify_configuration_readback
from date_time_goal_oracle import GOAL, FIXTURES, IMPORT_SCHEMA, artifact, render
from date_time_goal_evidence import LABELS, TYPES, PARENTS, checkpoint, one, output_checks, save_checkpoint
from date_time_persistence import events_at, operation, opened_path, public_success, semantic_configuration
from date_time_admission import check as admission_check, digest, INPUTS, receipt


def prepared_pins_match(prepared, remote):
    return (prepared.get('skillRevision') == remote['skill']['revision']
        and prepared.get('loginomUrl') == remote['frontend']['url']+'?testable=true'
        and prepared.get('workspace', {}).get('target') == dict(profile_id='loginom-7.4.2-macos-chromium-ru',
            loginom_build='7.4.2',platform='macos',browser='chromium'))


def analytical_nodes(state):
    """The native graph includes the standard scenario-variables service icon."""
    service = [n for n in state['nodes'] if n.get('type') == 'bg-vendor-icon-modelvariables']
    if len(service) > 1 or any(n.get('label') != 'Переменные сценария' or n.get('inputs') or n.get('outputs') for n in service):
        raise ValueError('unexpected_service_node')
    ids = {n['ref']['node_id'] for n in service}
    if any(link.get('source') in ids or link.get('target') in ids for link in state['links']):
        raise ValueError('unexpected_service_link')
    return [n for n in state['nodes'] if n not in service]


def report(checks):
    return dict(passed=bool(checks) and all(c.get('passed') is True for c in checks.values()),
                checks=checks, scope='date-time-sales-declared-goal-and-independent-persistence',
                node_admitted=False, model_started=False)


def browser_results(path):
    results = []
    for content in json.loads(path.read_text()).get('content', []):
        match = re.search(r'^### Result\n([\s\S]*?)(?:\n### |$)', content.get('text', ''))
        if match:
            try:
                results.append(json.loads(match[1]))
            except ValueError:
                pass
    return results


def diagnostics(before_events, final, index, base, package_path, revision):
    """The operator opens the exact saved package in another owned session.

    Dedicated diagnostic configuration inspection is permitted here only; the
    normal Hermes path has no extra wizard opening or save_as requirement.
    """
    checks = {}
    try:
        directory = (base/index['session_directory']).resolve()
        after = events_at(directory)
        checks['direct_exact_open'] = dict(passed=opened_path(directory, package_path))
        checks['all_six_nodes'] = dict(passed=set(index['operations']) == set(LABELS))
        checks['fresh_session'] = dict(passed=bool(after) and all(e.get('runtime_revision') == revision for e in after)
            and {e.get('session_id') for e in after}.isdisjoint({e.get('session_id') for e in before_events}))
        # Preserve diagnostic evidence immutability without using an assertion
        # written by the model as proof of persistence.
        refs = index['files']
        checks['diagnostic_hashes'] = dict(passed={'execution-events.jsonl', 'public-api.jsonl'} <= set(refs)
            and {p.name for p in directory.glob('browser-*.json')} <= set(refs)
            and all((directory/n).resolve().is_relative_to(directory) and digest(directory/n) == sha for n, sha in refs.items()))
        opened = one([r for p in directory.glob('browser-*.json') for r in browser_results(p)
            if isinstance(r, dict) and r.get('operation_id') == 'base-open' and r.get('status') == 'READY'
            and r.get('package_ref', {}).get('path') == package_path], 'one_exact_diagnostic_open')
        graph_file = index['graph_browser_file']
        if graph_file not in refs or not re.fullmatch(r'browser-\d+\.json', graph_file):
            raise ValueError('raw_graph_file')
        state = one([r for r in browser_results(directory/graph_file) if isinstance(r, dict) and r.get('complete') is True
                     and isinstance(r.get('nodes'), list)], 'one_raw_reopened_graph')
        saved_nodes = analytical_nodes(state)
        nodes = {n['label']: n for n in saved_nodes}
        expected_links = [dict(source=nodes[parent]['ref']['node_id'], target=nodes[child]['ref']['node_id'], input=0, output=0)
                          for child, parent in PARENTS.items()]
        checks['raw_saved_graph'] = dict(passed=set(nodes) == set(LABELS) and len(saved_nodes) == 6
            and state['document_id'] == opened['document_id'] and not state['foreign_links']
            and sorted(state['links'], key=lambda v: json.dumps(v, sort_keys=True)) == sorted(expected_links, key=lambda v: json.dumps(v, sort_keys=True))
            and all(n['type'] == TYPES[label] and n['ref']['node_id'] == final[label][1]['node']['node_id'] for label, n in nodes.items()))
        from date_time_saved_import_evidence import verify_saved_import, readonly_wizard_mutations
        from node_procedure_evidence import verify_internal_sequence
        if index.get('protocol_revision') != 2 or index.get('import_protocol') != 'read_cancel_download_execute':
            raise ValueError('diagnostic_protocol_v2_required')
        positions = {e['operation_id']: i for i, e in enumerate(after) if e.get('phase') in ('node_apply_prepared', 'diagnostic_import_prepared')}
        completions = {e['operation_id']: i for i, e in enumerate(after) if e.get('phase') in ('node_checkpoint', 'diagnostic_import_completed')}
        checks['upstream_before_downstream'] = dict(passed=all(positions[index['operations'][parent]] < completions[index['operations'][parent]]
            < positions[index['operations'][child]] for child, parent in PARENTS.items()))
        for label in LABELS:
            old_request, old = final[label]
            if label == 'Продажи':
                imported = one([e['result'] for e in after if e.get('phase') == 'diagnostic_import_completed'
                    and e.get('operation_id') == index['operations'][label]], 'one_diagnostic_import_result')
                checks[label+'_identity'] = dict(passed=imported['node'] == nodes[label]['ref'])
                checks[label+'_download_pinned'] = dict(passed=imported['source_download']['download_file'] in refs)
                checks[label+'_persisted_configuration_and_output'] = verify_saved_import(after, index['operations'][label], old_request, old, directory)
                continue
            request, saved = operation(after, index['operations'][label])
            value = saved['result']
            preserved = (request['parameters'] == {} if label != 'Продажи' else
                         request['parameters'] == dict(source=old_request['parameters']['source'], settings={}))
            checks[label+'_identity'] = dict(passed=request['target']['kind'] == 'existing'
                and request['target']['type'] == TYPES[label] and request['target']['ref'] == value['node']
                and value['node'] == nodes[label]['ref']
                and value['node']['node_id'] == old['node']['node_id'] and preserved
                and request['mappings'] == [] and request['inputs'] == [] and request['finish'] == 'execute'
                and value['execution']['execution_id'] != old['execution']['execution_id']
                and public_success(directory, request['operation_id']))
            if label in ('Календарь', 'Пустой календарь'):
                equal = semantic_configuration(dict(result=old)) == semantic_configuration(saved)
            else:
                def settings(v):
                    return {k: x for k, x in v['configuration']['readback'].items() if k not in ('node', 'receipt_ids')}
                equal = settings(old) == settings(value)
            checks[label+'_persisted_configuration'] = dict(passed=equal)
            checks[label+'_fresh_full_output'] = output_checks(after, request, label)
            sequence = verify_internal_sequence(after, request['operation_id'], max_steps=4096)
            checks[label+'_no_settings_repair'] = dict(passed=not sequence['failures'] and not readonly_wizard_mutations(sequence, allow_finish=True))
        checks['no_diagnostic_reconfiguration'] = dict(passed=len([e for e in after if e.get('phase') == 'node_apply_prepared']) == 5
            and len([e for e in after if e.get('phase') == 'diagnostic_import_prepared']) == 1
            and not any(e.get('action_key', '').startswith(('package.save', 'artifact.upload')) for e in after))
    except (KeyError, TypeError, ValueError, IndexError, OSError, AttributeError) as error:
        checks['complete_diagnostic_contract'] = dict(passed=False, reason=str(error))
    return dict(passed=bool(checks) and all(c.get('passed') is True for c in checks.values()), checks=checks,
                scope='independent_reopen_all_six_nodes')


def audit(request, evidence, prompt, admission, admission_base, diagnostic_index, diagnostic_base):
    evidence, projection = normalize_user_evidence(evidence)
    checks = {'user_projection': projection, 'admission': admission_check(admission, admission_base)}
    def check(name, value):
        checks[name] = dict(passed=bool(value))
    try:
        run_id = request['run_id']; path = '/test-3/packages/Dock-date-time-'+run_id+'.lgp'
        check('goal_identity', request['goal_id'] == 'date-time-sales' and evidence['run_id'] == run_id
              and request['package_path'] == path and request['storage_directory'] == '/test-3'
              and admission['run_id'] == run_id and request['goal_sha256'] == digest(GOAL) and prompt == render(run_id))
        check('model', model_completed(request, evidence))
        check('complete_frozen_export', all(evidence.get(k) is True for k in
            ('export_complete', 'runtime_source_unchanged', 'harness_unchanged', 'native_skill_unchanged')))
        check('no_fault_injection', request['fault_injection'] is False and not evidence.get('operator_fault_receipt'))
        check('pinned_candidate', request['runtime_source_pin'] == admission['runtime_source_pin']
            and request['manifest_uri'] == admission['catalog']['manifest_uri']
            and request['manifest_sha256'] == admission['catalog']['manifest_sha256']
            and request['acceptance_inputs_sha256'] == digest(INPUTS))
        check('native_skill', request['native_skill']['sha256'] == request['runtime_source_pin']['inputs'].get('plugins/loginom-dock-hermes/skills/loginom/SKILL.md'))
        check('artifact', request['input_artifact'] == artifact(run_id))
        allowed = KNOWLEDGE_TOOLS | {PREFIX+n for n in ('dock_prepare', 'dock_action_describe', 'dock_workspace_observe',
            'dock_diagnostics', 'dock_operation_inspect', 'dock_operation_recover', 'dock_node_apply', 'dock_node_wait',
            'dock_node_status', 'dock_artifact_deliver', 'dock_artifact_delivery_status', 'dock_action_run')}
        check('tool_scope', bool(evidence['calls']) and all(c['tool'] in allowed for c in evidence['calls']))
        check('knowledge_scope', all(knowledge_scope(c) for c in evidence['calls'] if c['tool'] in KNOWLEDGE_TOOLS))
        events = evidence['events']
        requests = [e['request'] for e in events if e.get('phase') == 'node_apply_prepared']
        check('seven_executed_node_operations', len(requests) == 7)
        created = {}; by_label = {n: [] for n in LABELS}; final = {}
        for r in requests:
            value = checkpoint(events, r)
            if r['target']['kind'] == 'new':
                label = r['target']['label']
                if label not in LABELS or label in created:
                    raise ValueError('unique_declared_node')
                created[label] = value['node']
            else:
                label = one([n for n, ref in created.items() if r['target']['ref'] == ref], 'owned_existing_node')
            if r['target']['type'] != TYPES[label]:
                raise ValueError('declared_type')
            by_label[label].append(r); final[label] = (r, value)
        check('exact_goal_operations', set(created) == set(LABELS) and all(len(by_label[n]) == (2 if n == 'Календарь' else 1) for n in LABELS))
        for label in LABELS:
            for i, r in enumerate(by_label[label]):
                parent = PARENTS.get(label)
                wanted = [] if parent is None else [dict(source=created[parent], input=0, output=0)]
                check(label+str(i)+'_links', r['inputs'] == (wanted if i == 0 else []))
                checks[label+str(i)+'_output'] = output_checks(events, r, label, initial=label == 'Календарь' and i == 0)
        first, changed = by_label['Календарь']
        check('saved_computed_output_only_change', changed['parameters'] == {} and changed['inputs'] == []
              and final['Календарь'][1]['node'] == checkpoint(events, first)['node'])
        empty_filter = by_label['Нет продаж'][0]
        check('empty_filter', empty_filter['mode'] == 'conditions' and empty_filter['parameters'] ==
            dict(groups=[[dict(field=dict(kind='input_field', name='Id'), type='integer', operator='<', value=0)]]))
        seed = by_label['Продажи'][0]; settings = seed['parameters']['settings']
        check('import_contract', [{k: c[k] for k in ('name', 'label', 'type')} for c in settings['columns']] == IMPORT_SCHEMA
            and all(c['used'] is True for c in settings['columns'])
            and settings['format'] == dict(delimiter=';', text_qualifier='"', decimal_separator='.', null_marker='NULL')
            and all(settings['source'][k] == v for k, v in dict(encoding='UTF-8', rows_to_skip=0, first_line_as_title=True).items()))
        checks['import_configuration'] = verify_configuration_readback(events, seed)
        deliveries = [c for c in evidence['calls'] if c['tool'] == PREFIX+'dock_artifact_deliver']
        delivery_start = one(deliveries, 'one_source_delivery')
        before = delivery_start['row']
        early = dict(evidence, calls=[c for c in evidence['calls'] if c['row'] < before], tools=[t for t in evidence['tools'] if t['row'] < before])
        prepared = verified_prepare_v1(early, PREFIX, delivery_start['session_id'], before)
        if prepared is None:
            raise ValueError('owned_prepare')
        check('prepared_remote_pins', prepared_pins_match(prepared,receipt(admission['remote_pin'],admission_base)))
        check('single_pinned_session', all(e.get('session_id') == prepared['sessionId']
            and e.get('runtime_revision') == admission['runtime_source_pin']['client_revision']
            and e.get('manifest_sha256') == admission['catalog']['manifest_sha256'] for e in events))
        checks['public_delivery'] = verify_public_delivery(evidence, seed, prepared)
        checks['source_bytes'] = verify_delivered_import_output(events, seed, (FIXTURES/'sales.csv').read_bytes(),
            checks['public_delivery']['delivery'], admission['runtime_source_pin']['client_revision'])
        save = save_checkpoint(events, requests, path, admission['catalog']['save_checkpoint_revision'])
        checks['one_final_checkpoint'] = save
        checks['public_calls'] = verify_public_nodes_and_saves(evidence, {r['operation_id']: r for r in requests},
            [save['operation_id']], allow_validation_refusals=True)
        checks['independent_persistence'] = diagnostics(events, final, diagnostic_index, diagnostic_base,
                                                      path, admission['runtime_source_pin']['client_revision'])
    except (KeyError, TypeError, ValueError, IndexError, OSError, AttributeError) as error:
        checks['complete_contract'] = dict(passed=False, reason=str(error))
    required = {'source_bytes', 'public_calls', 'one_final_checkpoint', 'independent_persistence'} | {
        label+str(i)+'_output' for label in LABELS for i in range(2 if label == 'Календарь' else 1)}
    check('all_required_components', required <= set(checks))
    return report(checks)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run_directory', type=Path)
    parser.add_argument('--admission', type=Path, required=True)
    parser.add_argument('--diagnostics', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    load = lambda p: json.loads(p.read_text())
    result = audit(load(args.run_directory/'request.json'), load(args.run_directory/'evidence.json'),
        (args.run_directory/'scenario.txt').read_text(), load(args.admission), args.admission.resolve().parent,
        load(args.diagnostics), args.diagnostics.resolve().parent)
    with args.output.open('x') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
