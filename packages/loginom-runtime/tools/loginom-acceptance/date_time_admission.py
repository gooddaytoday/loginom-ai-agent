"""Fail-closed, model-free admission scaffold. Does not run Hermes or publish pins."""
import argparse
import hashlib
import json
import subprocess
import re
from pathlib import Path
from date_time_goal_oracle import WORK, GOAL, artifact, frozen, render
from preflight import runtime_pin

ROOT = WORK.parents[1]
INPUTS = WORK/'fixtures/date-time/inputs.json'
GATES = ('R1_configure_positive', 'R1_configure_negative', 'R2_terminal_live',
         'targeted_regression', 'catalog_readback', 'isolated_environment', 'runner_adapter', 'coordinator_slot')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs_check():
    manifest = json.loads(INPUTS.read_text())
    if manifest['scope'] != 'preparation_only' or manifest['final_candidate'] is not None:
        raise ValueError('input_manifest_is_not_candidate')
    for name, sha in manifest['files'].items():
        path = (WORK/name).resolve()
        if not path.is_relative_to(WORK) or digest(path) != sha:
            raise ValueError('input_hash:'+name)
    required = {p.name for p in WORK.glob('*.py')} | {p.name for p in WORK.glob('*.mjs')}
    required |= {'goals/date-time-sales.txt', 'fixtures/date-time/sales.csv', 'fixtures/date-time/expected.json'}
    if not required <= set(manifest['files']):
        raise ValueError('auditor_dependency_inventory_incomplete')
    tables = frozen()
    if any(len(t['rows']) > 10 for t in tables.values() if isinstance(t, dict) and 'rows' in t):
        raise ValueError('fixture_exceeds_public_complete_sample_limit')
    return dict(passed=True, manifest_sha256=digest(INPUTS), files=len(manifest['files']))


def receipt(ref, base):
    path = (base/ref['path']).resolve()
    if digest(path) != ref['sha256']:
        raise ValueError('receipt_hash')
    return json.loads(path.read_text())


def check(admission, base):
    checks = {}
    def verify(name, fn):
        try:
            value = fn()
            checks[name] = dict(passed=value is True)
        except (KeyError, ValueError, TypeError, OSError) as error:
            checks[name] = dict(passed=False, reason=str(error))
    verify('frozen_inputs', lambda: inputs_check()['passed'] and admission['inputs_sha256'] == digest(INPUTS))
    verify('explicit_identity', lambda: admission['loginom_user'] == 'test-3' and admission['storage_directory'] == '/test-3'
           and admission['model'] == dict(provider='openai-codex', model='gpt-5.6-sol', reasoning='low', fallback=False)
           and bool(re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}', admission['run_id']))
           and admission['loginom_url'] == 'http://logi-test-plan.bg.local/app/?testable=true')
    verify('coordinator_budget', lambda: type(admission['budget']['timeout_seconds']) is int
           and 30 <= admission['budget']['timeout_seconds'] <= 14400
           and type(admission['budget']['max_turns']) is int and 1 <= admission['budget']['max_turns'] <= 100)
    verify('final_runtime', lambda: admission['runtime_source_pin'] == runtime_pin(ROOT))
    verify('source_commit', lambda: admission['source_commit'] == subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip())
    verify('source_archive', lambda: digest((base/admission['source_archive']['path']).resolve()) == admission['source_archive']['sha256'])
    verify('local_environment_pin', lambda: receipt(admission['environment_pin'],base)['runtime_source_pin'] == admission['runtime_source_pin'])
    verify('remote_skill_frontend_pin', lambda: bool(receipt(admission['remote_pin'],base)['frontend']['files'])
           and bool(receipt(admission['remote_pin'],base)['skill']['revision']))
    verify('catalog_bytes', lambda: admission['catalog']['manifest_uri'].startswith('viking://resources/loginom-dock/catalogs/')
           and 'parallel-pilot' not in admission['catalog']['manifest_uri']
           and digest((base/admission['catalog']['manifest_path']).resolve()) == admission['catalog']['manifest_sha256'])
    for gate in GATES:
        def valid_gate(gate=gate):
            ref = admission['gates'][gate]
            if ref['status'] != 'passed':
                return False
            r = receipt(ref, base)
            if (r['passed'] is not True or r['gate'] != gate or r['client_revision'] != admission['runtime_source_pin']['client_revision']
                    or r['source_commit'] != admission['source_commit'] or not r['evidence_refs']):
                return False
            for item in r['evidence_refs']:
                if digest((base/item['path']).resolve()) != item['sha256']:
                    return False
            if gate.startswith('R1_'):
                if r['phase'] != 'configure' or r['matrix_rows_per_field'] != 29 or r['full_matrix_verified'] is not True:
                    return False
                if gate.endswith('positive'):
                    if (not r['original_operation_id'] or r['original_operation_id'] != r['resumed_operation_id']
                            or r['repeated_uncertain_clicks'] != 0 or not r['receipt_id']
                            or r['same_original_receipt'] is not True or r['remaining_steps_verified'] is not True
                            or r['cleanup_verified'] is not True or r['owner_before'] != r['owner_after']
                            or not all(r['owner_before'][k] for k in ('document_id', 'workflow_id', 'node_id', 'field_record_id'))):
                        return False
                if gate.endswith('negative') and not {'foreign_owner', 'changed_matrix', 'missing_receipt', 'missing_draft'} <= set(r['rejected_cases']):
                    return False
            if gate == 'R2_terminal_live' and (r['node_type'] != 'transform.date_time' or r['evidence_kind'] != 'live' or not r['cleanup_verified']):
                return False
            if gate == 'catalog_readback' and (r['manifest_uri'] != admission['catalog']['manifest_uri'] or r['manifest_sha256'] != admission['catalog']['manifest_sha256']):
                return False
            if gate == 'runner_adapter' and (r['goal_id'] != 'date-time-sales' or not r['model_free_preflight_passed']):
                return False
            if gate == 'coordinator_slot' and (r['coordinator_task'] != '01a096e6-a321-7df2-99db-2cae02a305ee'
                    or not r['command_id'] or r['command_id'] != admission['slot_command_id'] or r['run_id'] != admission['run_id']
                    or r['budget'] != admission['budget']):
                return False
            return True
        verify(gate, valid_gate)
    # A direct open does not require save_as. Any copy/overwrite/reopen use does.
    verify('diagnostic_open_policy', lambda: admission['diagnostic_open_mode'] in ('direct_existing', 'save_as'))
    def save_as_gate():
        if admission['diagnostic_open_mode'] == 'direct_existing':
            return True
        r = receipt(admission['save_as_dependency'], base)
        return (r['passed'] is True and r['gate'] == 'save_as_node12' and r['client_revision'] == admission['runtime_source_pin']['client_revision'])
    verify('save_as_if_applicable', save_as_gate)
    return dict(passed=all(c['passed'] for c in checks.values()), checks=checks, model_started=False,
                scope='admission_document_and_local_bytes_only')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs-only', action='store_true')
    parser.add_argument('--admission', type=Path)
    parser.add_argument('--render', metavar='RUN_ID')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.inputs_only:
        value = inputs_check()
    elif args.render:
        inputs_check()
        value = dict(scope='preparation_only', run_id=args.render, input_artifact=artifact(args.render),
                     prompt=render(args.render), model_started=False, final_candidate=None)
    elif args.admission:
        value = check(json.loads(args.admission.read_text()), args.admission.resolve().parent)
    else:
        parser.error('Choose --inputs-only, --render or --admission; this scaffold never starts a model')
    text = json.dumps(value, ensure_ascii=False, indent=2)+'\n'
    if args.output:
        with args.output.open('x') as f:
            f.write(text)
    print(text)
    return 0 if value.get('passed', True) else 1


if __name__ == '__main__':
    raise SystemExit(main())
