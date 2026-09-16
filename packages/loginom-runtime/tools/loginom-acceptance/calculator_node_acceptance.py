"""Independent calculator-node-complete scenario auditor, not the entire subplan gate."""
import argparse
import hashlib
import json
from pathlib import Path
import re

from audit import approved_model, knowledge_scope
from evidence import PREFIX, KNOWLEDGE_TOOLS
from preflight import runtime_pin
from prepare_binding import verified_prepare_v1
from upload_probe import FIXTURE, descriptor, prompt as render_prompt
from node_public_acceptance_evidence import verify_public_nodes_and_saves, verify_public_delivery
from node_apply_persistence_evidence import verify_sales_persistence
from artifact_delivery_evidence import verify_delivered_import_output
from workflow_activation_evidence import verify_workflow_activation
from node_efficiency import node_efficiency
from node_configuration_evidence import verify_configuration_readback
from calculator_configuration_evidence import verify_calculator_configuration
from calculator_output_evidence import verify_calculator_output
from calculator_goal_contract import verify_goal,expected_rows,OUTPUT_COLUMNS
from node_apply_save_chain import verify_save_chain
from node_apply_reopen_binding import verify_reopen_binding
from existing_import_evidence import _verify_existing_import_output

WORK = Path(__file__).resolve().parent
ROOT = WORK.parents[1]
MANIFEST_URI = 'viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.08-node-apply.1-candidate/manifest.json'
MANIFEST_SHA = '936ef73d933e85bfd8429b8b0f2b515c543ca415a2b22ba57e108232c54ddf44'
SAVE_REVISIONS = {'package.save_checkpoint': '2', 'package.save_as': '2'}


def model_completed(request, evidence):
    usage = evidence.get('process', {}).get('usage', {})
    return (request.get('model_profile') == 'chatgpt-sol' and request.get('fallback_allowed') is False
            and approved_model(request, evidence) and usage.get('completed') is True
            and usage.get('failed') is False and type(usage.get('api_calls')) is int and usage['api_calls'] > 0)


def audit(request, evidence, prompt, source_bytes):
    checks = {}
    def check(name, value):
        checks[name] = dict(passed=bool(value))
    try:
        run_id, directory = request['run_id'], request['storage_directory']
        path = directory+'/packages/Dock-acceptance-'+run_id+'.lgp'
        goal = WORK/'goals/calculator-node-complete.txt'
        check('goal_identity', request.get('goal_id') == 'calculator-node-complete'
              and bool(re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}', run_id)) and evidence.get('run_id') == run_id
              and request.get('package_path') == path and request.get('schema_version') == 2)
        check('goal_prompt', prompt == render_prompt(goal.read_text(), path, directory, run_id)
              and request.get('goal_sha256') == hashlib.sha256(goal.read_bytes()).hexdigest())
        check('declared_artifact', request.get('input_artifact') == descriptor(run_id, directory))
        check('model', model_completed(request, evidence))
        measured = node_efficiency(evidence)
        check('efficiency', evidence.get('efficiency') == measured and measured['usage_complete']
              and measured['phases_complete'] and measured['model_api_calls'] is not None)
        check('no_fault_injection', request.get('fault_injection') is False and not evidence.get('operator_fault_receipt'))
        check('complete_export', evidence.get('export_complete') is True and evidence.get('calls') and evidence.get('tools') and evidence.get('events'))
        check('source_unchanged', evidence.get('runtime_source_unchanged') is True and evidence.get('harness_unchanged') is True)
        native = request.get('native_skill', {})
        check('native_skill', evidence.get('native_skill_unchanged') is True and native.get('source') == 'plugins/loginom-dock-hermes/skills/loginom/SKILL.md'
              and native.get('sha256') == request['runtime_source_pin']['inputs'].get(native.get('source')))
        check('catalog', request.get('manifest_uri') == MANIFEST_URI and request.get('manifest_sha256') == MANIFEST_SHA)
        allowed = KNOWLEDGE_TOOLS | {PREFIX+n for n in ('dock_prepare', 'dock_action_describe', 'dock_workspace_observe',
            'dock_diagnostics', 'dock_operation_inspect', 'dock_node_apply', 'dock_node_status', 'dock_node_wait', 'dock_artifact_deliver',
            'dock_artifact_delivery_status', 'dock_action_run')}
        check('tool_scope', all(c.get('tool') in allowed for c in evidence['calls']))
        check('knowledge_scope', all(knowledge_scope(c) for c in evidence['calls'] if c.get('tool') in KNOWLEDGE_TOOLS))
        declarations = [e for e in evidence['events'] if e.get('phase') == 'node_apply_prepared']
        check('four_node_operations',len(declarations)==4)
        if len(declarations)!=4:return report(checks)
        seed,calc,reopened,calc_reopened=[e['request'] for e in declarations]
        checks['declared_task']=verify_goal(seed,calc,source_bytes)
        for label,r in [('seed',seed),('reopened',reopened)]:
            checks[label+'_configuration']=verify_configuration_readback(evidence['events'],r)
        for label,r in [('calculator',calc),('calculator_reopened',calc_reopened)]:
            checks[label+'_configuration']=verify_calculator_configuration(evidence['events'],r)
            checks[label+'_output']=verify_calculator_output(evidence['events'],r,OUTPUT_COLUMNS,expected_rows(source_bytes))
        for label,r in [('seed',seed),('calculator',calc),('reopened',reopened),('calculator_reopened',calc_reopened)]:
            checks[label+'_workflow_activation']=verify_workflow_activation(evidence['events'],r)
        first_node_calls = [c for c in evidence['calls'] if c.get('tool') == PREFIX+'dock_node_apply' and c.get('arguments') == seed]
        deliveries = [c for c in evidence['calls'] if c.get('tool') == PREFIX+'dock_artifact_deliver']
        if not first_node_calls or not deliveries:
            check('public_start_calls', False)
            return report(checks)
        before = min(c['row'] for c in deliveries)
        # Reopening legitimately adds another preparation. Verify the initial
        # draft on the original prefix of calls and its corresponding journal.
        initial = dict(evidence, calls=[c for c in evidence['calls'] if c['row'] < before],
                       tools=[r for r in evidence['tools'] if r['row'] < before])
        prep_ids = {c.get('arguments', {}).get('operation_id', 'prepare') for c in initial['calls'] if c.get('tool') == PREFIX+'dock_prepare'}
        initial['events'] = [e for e in evidence['events'] if e.get('event') != 'workspace_prepared' or e.get('state', {}).get('operation_id') in prep_ids]
        prepared = verified_prepare_v1(initial, PREFIX, deliveries[0]['session_id'], before)
        check('initial_owned_draft', prepared is not None)
        if prepared is None:
            return report(checks)
        pins = prepared.get('executor', {}).get('session_manifest', {})
        check('actual_catalog', pins.get('actionManifestDigest') == MANIFEST_SHA)
        check('journal_pins', all(e.get('session_id') == prepared['sessionId']
              and e.get('runtime_revision') == request['runtime_source_pin']['client_revision']
              and e.get('manifest_sha256') == MANIFEST_SHA for e in evidence['events']))
        check('seed_workspace', seed.get('document_id') == prepared['workspace'].get('document_id')
              and seed.get('workflow_ref') == prepared['workspace'].get('workflow_ref'))
        saves = [e for e in evidence['events'] if e.get('phase') == 'completed' and e.get('action_key') in SAVE_REVISIONS]
        checks['public_nodes_saves'] = verify_public_nodes_and_saves(evidence,
            {r['operation_id']:r for r in (seed,calc,reopened,calc_reopened)}, [e['operation_id'] for e in saves],allow_validation_refusals=True)
        checks['delivery_public'] = verify_public_delivery(evidence, seed, prepared)
        if checks['delivery_public']['passed']:
            checks['delivery_bytes_output'] = verify_delivered_import_output(evidence['events'], seed, source_bytes,
                checks['delivery_public']['delivery'], request['runtime_source_pin']['client_revision'])
        def node_result(r):
            found=[e['result'] for e in evidence['events'] if e.get('phase')=='node_checkpoint' and e.get('operation_id')==r['operation_id']]
            if len(found)!=1:raise ValueError('one_node_checkpoint')
            return found[0]
        initial_import,initial_calc,opened_import,opened_calc=map(node_result,(seed,calc,reopened,calc_reopened))
        check('one_input_link',calc['inputs']==[dict(source=initial_import['node'],output=0,input=0)])
        check('restored_nodes',reopened['target'].get('ref',{}).get('node_id')==initial_import['node']['node_id']
            and calc_reopened['target'].get('ref',{}).get('node_id')==initial_calc['node']['node_id'])
        source_port=dict(node_label='Продажи',tids=['Продажи;Input_Connection[0]','Продажи;Input_Var[0]','Продажи;Output_Data[0]'])
        calc_port=dict(node_label='Расчёт',tids=['Расчёт;Input_Data[0]','Расчёт;Input_Var[0]','Расчёт;Output_Data[0]'])
        graphs=[dict(nodes=['Продажи'],ports=[source_port],links=[]),
            dict(nodes=['Продажи','Расчёт'],ports=[source_port,calc_port],links=['Продажи|Output_Data[0]|Расчёт|Input_Data[0]'])]
        checks['saves']=verify_save_chain(evidence['events'],seed,path,SAVE_REVISIONS,expected_graphs=graphs)
        if checks['saves']['passed']:
            save_id=checks['saves']['save_operation_ids'][1]
            checks['import_reopen_binding']=verify_reopen_binding(evidence,seed,reopened,save_id,path)
            checks['calculator_reopen_binding']=verify_reopen_binding(evidence,calc,calc_reopened,save_id,path,calculator=True)
        if checks.get('import_reopen_binding',{}).get('passed'):
            checks['persisted_import']=_verify_existing_import_output(evidence['events'],seed,reopened,source_bytes,reopened_package=True)
        def semantics(result):
            rb=result['configuration']['readback']
            return {k:v for k,v in rb.items() if k not in ('node','receipt_ids')}
        check('persisted_calculator_settings',semantics(initial_calc)==semantics(opened_calc))
        check('fresh_calculator_execution',initial_calc['execution']['execution_id']!=opened_calc['execution']['execution_id'])
        check('reopened_calculator_unchanged',calc_reopened['parameters']=={'expressions':[]}
            and calc_reopened['mappings']==[] and calc_reopened['inputs']==[] and calc_reopened['finish']=='execute')
        # After accepting the seed node, only the two package saves, prepared
        # final workflow and reexecution may produce another operation.
        seed_positions = [i for i, e in enumerate(evidence['events']) if e.get('phase') == 'node_checkpoint' and e.get('operation_id') == seed['operation_id']]
        read_ids = {c.get('arguments', {}).get('operation_id') for c in evidence['calls'] if c.get('tool') == PREFIX+'dock_workspace_observe'}
        allowed_ids = {seed['operation_id'], calc['operation_id'], reopened['operation_id'], calc_reopened['operation_id'], *[e['operation_id'] for e in saves]} | read_ids
        check('single_seed_checkpoint', len(seed_positions) == 1)
        if len(seed_positions) == 1:
            extra = [e for e in evidence['events'][seed_positions[0]+1:] if e.get('phase') in
                     ('prepared', 'node_apply_prepared', 'artifact_delivery_prepared', 'download_prepared')
                     and e.get('operation_id') not in allowed_ids]
            check('no_intervening_operation', not extra)
        check('all_components_ran', all(k in checks for k in ('delivery_bytes_output','persisted_import','calculator_reopen_binding')))
    except (KeyError, TypeError, ValueError, IndexError, AttributeError) as error:
        checks['malformed_evidence'] = dict(passed=False, error_type=type(error).__name__)
    return report(checks)


def report(checks):
    passed = bool(checks) and all(c.get('passed') is True for c in checks.values())
    return dict(passed=passed, checks=checks, scope='calculator-node-complete-scenario', subplan_complete=False)


def audit_directory(directory):
    request = json.loads((directory/'request.json').read_text())
    evidence = json.loads((directory/'evidence.json').read_text())
    result = audit(request, evidence, (directory/'scenario.txt').read_text(), (WORK/FIXTURE).read_bytes())
    hashes = request.get('harness_inputs', {})
    required = {p.relative_to(WORK).as_posix() for pattern in ('*.py', '*.mjs') for p in WORK.glob(pattern)} | {FIXTURE, 'goals/calculator-node-complete.txt'}
    frozen = required <= set(hashes) and all(
        (WORK/name).resolve().is_relative_to(WORK) and (WORK/name).is_file()
        and hashlib.sha256((WORK/name).read_bytes()).hexdigest() == digest for name, digest in hashes.items())
    result['checks']['frozen_harness'] = dict(passed=frozen)
    result['checks']['current_runtime_pin'] = dict(passed=runtime_pin(ROOT) == request.get('runtime_source_pin'))
    return report(result['checks'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', type=Path, required=True)
    args = parser.parse_args()
    result = audit_directory(args.run_dir)
    (args.run_dir/'calculator-node-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(dict(passed=result['passed'], failures=[k for k, v in result['checks'].items() if not v['passed']])))
    raise SystemExit(0 if result['passed'] else 1)
