"""Independent negative audit: verified source disappears before new import.

Requires the authenticated journal and original bytes. This does not establish
package persistence, prove fixture deletion itself, or admit recovery/retry.
"""
import hashlib
from node_procedure_evidence import verify_internal_sequence
from import_limits import import_step_budget


def verify_import_source_error(events, request, source_bytes, result, replayed):
    op = request['operation_id']
    seq = verify_internal_sequence(events, op, max_steps=import_step_budget(request))
    failures = [f for f in seq['failures'] if f != 'incomplete_mutation']
    rows = [e for e in events if e.get('operation_id') == op]
    source = request['parameters']['source']
    path = request['parameters']['settings']['source']['source_path']
    if request.get('target', {}).get('kind') != 'new' or request.get('finish') != 'execute':
        failures.append('negative_request_scope')
    if len(source_bytes) != source['bytes'] or hashlib.sha256(source_bytes).hexdigest() != source['sha256']:
        failures.append('original_bytes')
    uploads = [e['outcome'] for e in events if e.get('operation_id') == source['upload_operation_id']
               and e.get('outcome', {}).get('output', {}).get('server_copy_verification')]
    if not uploads:
        failures.append('verified_upload_missing')
    for u in uploads:
        out = u['output']; proof = out['server_copy_verification']
        verified = [e.get('outcome', {}) for e in events if e.get('operation_id') == proof.get('verification_id')
                    and e.get('phase') == 'verification_completed']
        if (u.get('status') != 'SUCCEEDED' or u.get('cleanup_complete') is not True
                or u.get('action_key') != 'artifact.upload' or out.get('artifact_id') != source['artifact_id']
                or proof.get('bytes_verified') is not True or proof.get('upload_completion_verified') is not True
                or proof.get('status') != 'SUCCEEDED' or len(verified) != 1):
            failures.append('upload_proof')
        for value in [out, proof] + [v.get('output', {}) for v in verified]:
            if any(value.get(k) != expected for k, expected in [('bytes', source['bytes']), ('sha256', source['sha256']), ('destination', path)]):
                failures.append('upload_identity')
        if any(v.get('status') != 'SUCCEEDED' or v.get('cleanup_complete') is not True
               or v.get('output', {}).get('bytes_verified') is not True
               or v.get('output', {}).get('upload_operation_id') != source['upload_operation_id'] for v in verified):
            failures.append('download_proof')
    phases = [(e['phase'], e.get('receipt', {}).get('phase')) for e in rows if e['phase'].startswith('node_phase_')]
    names = ['source', 'target', 'input_mapping', 'open']
    if any(name == 'workflow' for _, name in phases):
        names.insert(1, 'workflow')
        workflow = [e.get('receipt', {}) for e in rows if e['phase'] == 'node_phase_completed' and e.get('receipt', {}).get('phase') == 'workflow']
        if len(workflow) != 1:
            failures.append('workflow_receipt')
        else:
            value = workflow[0].get('value', {})
            if (workflow[0].get('status') != 'verified' or value.get('verified') is not True
                    or value.get('status') != 'SUCCEEDED' or value.get('cleanup_complete') is not True
                    or value.get('document_id') != request['document_id'] or value.get('workflow_ref') != request['workflow_ref']):
                failures.append('workflow_binding')
    expected = [(event, name) for name in names
                for event in ['node_phase_prepared', 'node_phase_completed']] + [('node_phase_prepared', 'configure')]
    if phases != expected or any(e['phase'] == 'node_checkpoint' for e in rows):
        failures.append('phase_order_or_unexpected_finish')
    mutations = seq['mutations']
    if not mutations or any(o.get('status') != 'SUCCEEDED' for _, _, o in mutations[:-1]):
        failures.append('unexpected_prior_failure')
    step, action, failed = mutations[-1] if mutations else (None, {}, {})
    if (action.get('verb') != 'wizard_step' or action.get('expected_stage') != 'text_import_format'
            or failed.get('status') != 'AMBIGUOUS' or failed.get('phase') != 'observing'
            or failed.get('effect_possible') is not True or failed.get('cleanup_complete') is not True
            or failed.get('error', {}).get('code') != 'WIZARD_SOURCE_VALIDATION_FAILED'):
        failures.append('terminal_failure')
    internal = [e for e in rows if e.get('internal_provenance') == 'client_node_procedure_v1']
    if not internal or internal[-1].get('phase') != 'node_step_completed' or internal[-1].get('step') != step:
        failures.append('activity_after_failure')
    before = seq['observations'][-1][1] if seq['observations'] else {}
    buttons = [e for e in before.get('ui', {}).get('elements', []) if e.get('ref') == action.get('ref')]
    if (len(buttons) != 1 or buttons[0].get('tid') != before.get('wizard', {}).get('root_tid', '')+';btnNext'
            or any(a.get('verb') in ['execute_wizard', 'finish_wizard', 'confirm_wizard_close'] for _, a, _ in mutations)
            or len([a for _, a, _ in mutations if a.get('verb') == 'wizard_step']) != 1):
        failures.append('unexpected_launch_or_step')
    after = failed.get('output', {})
    wizard = after.get('wizard', {}); error = wizard.get('source_validation', {})
    message = f'Файл "{path}" не найден'
    if (error.get('status') != 'observed' or error.get('message') != message or error.get('field') != 'file_name'
            or not error.get('field_ref') or error.get('root_ref') != wizard.get('root_ref')
            or wizard.get('controls', {}).get('btnError', {}).get('enabled') is not True
            or failed.get('error', {}).get('message') != message):
        failures.append('owned_source_error')
    for state in [before, after]:
        w = state.get('wizard', {}); binding = state.get('prepared_node_context', {})
        if (w.get('stage') != 'text_import_file' or w.get('root_ref') != wizard.get('root_ref')
                or w.get('import_source', {}).get('fields', {}).get('source_path', {}).get('value') != path
                or binding.get('verified') is not True or binding.get('document_id') != request['document_id']
                or binding.get('workflow_id') != request['workflow_ref']['workflow_id']
                or binding.get('node_id') != result.get('output', {}).get('node', {}).get('node_id')
                or state.get('ui', {}).get('dialogs') != [] or state.get('ui', {}).get('masks') != []):
            failures.append('failure_binding')
    trace = failed.get('trace', [])
    if (len([t for t in trace if t.get('event') == 'ui_gesture_applied']) != 1
            or len([t for t in trace if t.get('event') == 'wizard_source_validation_failed' and t.get('message') == message]) != 1):
        failures.append('single_gesture_error_evidence')
    out = result.get('output', {})
    if (result.get('status') != 'AMBIGUOUS' or result.get('effect_possible') is not True
            or out.get('pending_phase') != 'configure' or out.get('package_saved') is not False
            or out.get('execution') != {'status': 'not_requested', 'execution_id': None}
            or out.get('output', {}).get('status') != 'not_refreshed'
            or out.get('error', {}).get('cause') != {'code': 'WIZARD_SOURCE_VALIDATION_FAILED', 'message': message}
            or result != replayed):
        failures.append('result_or_replay')
    return {'passed': not failures, 'failures': sorted(set(failures)), 'scope': 'verified_source_missing_before_new_import'}


if __name__ == '__main__':
    import argparse
    import copy
    import json
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', required=True)
    args = parser.parse_args(); directory = Path(args.run_dir)
    read = lambda name: json.loads((directory / name).read_text())
    events = [json.loads(line) for line in (directory/'execution-events.jsonl').read_text().splitlines()]
    request, result, replayed, artifact, session = [read(n+'.json') for n in ['request','result','replayed','artifact','session']]
    body = (directory/artifact['name']).read_bytes()
    audit = verify_import_source_error(events, request, body, result, replayed)
    rows = [e for e in events if e.get('operation_id') == request['operation_id']]
    if any(e.get('session_id') != session['sessionId'] or e.get('runtime_revision') != session['clientRevision'] for e in rows):
        audit['failures'].append('fixed_session_runtime');audit['passed'] = False
    audit['runtime_revision'] = session['clientRevision']
    (directory/'independent-source-error-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    mutations = {
        'foreign_error_root': lambda e,r,p: e[-1]['outcome']['output']['wizard']['source_validation'].update(root_ref='foreign'),
        'foreign_node': lambda e,r,p: e[-1]['outcome']['output']['prepared_node_context'].update(node_id='foreign'),
        'wrong_error': lambda e,r,p: e[-1]['outcome']['error'].update(code='WIZARD_STEP_NOT_CONFIRMED'),
        'wrong_source': lambda e,r,p: e[-1]['outcome']['output']['wizard']['import_source']['fields']['source_path'].update(value='/other.csv'),
        'double_gesture': lambda e,r,p: e[-1]['outcome']['trace'].append({'event':'ui_gesture_applied'}),
        'unreleased_gesture': lambda e,r,p: e[-1]['outcome'].update(cleanup_complete=False),
        'unexpected_execution': lambda e,r,p: r['output']['execution'].update(status='completed'),
        'false_persistence': lambda e,r,p: r['output'].update(package_saved=True),
        'changed_replay': lambda e,r,p: p.update(status='SUCCEEDED'),
    }
    negatives = []
    # Mutate the actual terminal internal receipt while preserving the rest of
    # the real journal. This supplements the small deterministic unit fixture.
    for name, mutate in mutations.items():
        changed, r, p = copy.deepcopy(events), copy.deepcopy(result), copy.deepcopy(replayed)
        terminal = next(e for e in reversed(changed) if e.get('operation_id') == request['operation_id'] and e.get('phase') == 'node_step_completed')
        mutate([terminal], r, p)
        test = verify_import_source_error(changed, request, body, r, p)
        negatives.append({'case':name,'rejected':not test['passed'],'failures':test['failures']})
    (directory/'independent-source-error-negative-audits.json').write_text(json.dumps(negatives,ensure_ascii=False,indent=2))
    print(json.dumps({'audit':audit,'negative_cases':len(negatives),'all_rejected':all(n['rejected'] for n in negatives)},ensure_ascii=False))
    raise SystemExit(0 if audit['passed'] and all(n['rejected'] for n in negatives) else 1)
