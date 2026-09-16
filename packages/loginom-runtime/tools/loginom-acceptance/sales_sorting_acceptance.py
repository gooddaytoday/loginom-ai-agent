"""Independent sales-sorting-complete scenario auditor, not the entire subplan gate."""
import argparse
import hashlib
import json
from pathlib import Path
import re

from audit import approved_model, knowledge_scope
from evidence import PREFIX, KNOWLEDGE_TOOLS
from preflight import runtime_pin
from prepare_binding import verified_prepare_v1
from sales_upload_probe import FIXTURE, descriptor, prompt as render_prompt
from node_public_acceptance_evidence import verify_public_nodes_and_saves, verify_public_delivery
from node_apply_persistence_evidence import verify_sales_persistence
from artifact_delivery_evidence import verify_delivered_import_output
from workflow_activation_evidence import verify_workflow_activation
from node_efficiency import node_efficiency
from node_configuration_evidence import verify_configuration_readback
from grouping_configuration_evidence import verify_grouping_configuration
from grouping_output_evidence import verify_grouping_output
from sales_sorting_contract import verify_sales_goal,sales_rows,branch_rows,branch_key,sales_graph
from sorting_configuration_evidence import verify_sorting_configuration
from sorting_output_evidence import verify_sorting_output
from calculator_configuration_evidence import verify_calculator_configuration
from calculator_output_evidence import verify_calculator_output
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
        goal = WORK/'goals/sales-sorting-complete.txt'
        check('goal_identity', request.get('goal_id') == 'sales-sorting-complete'
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
        check('eight_node_operations',len(declarations)==8)
        if len(declarations)!=8:return report(checks)
        seed,calc,*branches_and_reopened=[e['request'] for e in declarations]
        branches=branches_and_reopened[:4];reopened=branches_and_reopened[4:]
        initial=[seed,calc,*branches]
        def node_result(r):
            found=[e['result'] for e in evidence['events'] if e.get('phase')=='node_checkpoint' and e.get('operation_id')==r['operation_id']]
            if len(found)!=1:raise ValueError('one_node_checkpoint')
            return found[0]
        results={r['operation_id']:node_result(r) for r in initial+reopened}
        checks['declared_task']=verify_sales_goal(initial,reopened,results,source_bytes)
        checks['import_configuration']=verify_configuration_readback(evidence['events'],seed)
        checks['calculator_configuration']=verify_calculator_configuration(evidence['events'],calc)
        checks['calculator_output']=verify_calculator_output(evidence['events'],calc,*sales_rows(source_bytes))
        for r in branches+reopened:
            key=branch_key(r,results)
            columns,rows=branch_rows(source_bytes,key)
            if r['mode']=='aggregate':
                checks[r['operation_id']+'_configuration']=verify_grouping_configuration(evidence['events'],r)
                checks[r['operation_id']+'_output']=verify_grouping_output(evidence['events'],r,columns,rows)
            else:
                checks[r['operation_id']+'_configuration']=verify_sorting_configuration(evidence['events'],r)
                checks[r['operation_id']+'_output']=verify_sorting_output(evidence['events'],r,columns,rows,rows)
        for r in initial+reopened:
            checks[r['operation_id']+'_workflow_activation']=verify_workflow_activation(evidence['events'],r)
        first_node_calls = [c for c in evidence['calls'] if c.get('tool') == PREFIX+'dock_node_apply' and c.get('arguments') == seed]
        deliveries = [c for c in evidence['calls'] if c.get('tool') == PREFIX+'dock_artifact_deliver']
        if not first_node_calls or not deliveries:
            check('public_start_calls', False)
            return report(checks)
        before = min(c['row'] for c in deliveries)
        # Reopening legitimately adds another preparation. Verify the initial
        # draft on the original prefix of calls and its corresponding journal.
        initial_evidence = dict(evidence, calls=[c for c in evidence['calls'] if c['row'] < before],
                       tools=[r for r in evidence['tools'] if r['row'] < before])
        prep_ids = {c.get('arguments', {}).get('operation_id', 'prepare') for c in initial_evidence['calls'] if c.get('tool') == PREFIX+'dock_prepare'}
        initial_evidence['events'] = [e for e in evidence['events'] if e.get('event') != 'workspace_prepared' or e.get('state', {}).get('operation_id') in prep_ids]
        prepared = verified_prepare_v1(initial_evidence, PREFIX, deliveries[0]['session_id'], before)
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
            {r['operation_id']:r for r in initial+reopened}, [e['operation_id'] for e in saves],allow_validation_refusals=True)
        checks['delivery_public'] = verify_public_delivery(evidence, seed, prepared)
        if checks['delivery_public']['passed']:
            checks['delivery_bytes_output'] = verify_delivered_import_output(evidence['events'], seed, source_bytes,
                checks['delivery_public']['delivery'], request['runtime_source_pin']['client_revision'])
        graphs=[sales_graph(initial[:1]),sales_graph(initial[:4]),sales_graph(initial),sales_graph(initial)]
        stages=[('package.save_checkpoint',path+'.draft.lgp',False)]*3+[('package.save_as',path,True)]
        checks['saves']=verify_save_chain(evidence['events'],seed,path,SAVE_REVISIONS,expected_graphs=graphs,stages=stages)
        if checks['saves']['passed']:
            ids=checks['saves']['save_operation_ids']
            positions=lambda phase,op:[i for i,e in enumerate(evidence['events']) if e.get('phase')==phase and e.get('operation_id')==op]
            check('save_stage_boundaries',all(positions('node_checkpoint',initial[n]['operation_id'])[0]<positions('prepared',ids[i])[0]
                and (n==5 or positions('completed',ids[i])[0]<positions('node_apply_prepared',initial[n+1]['operation_id'])[0])
                for i,n in enumerate((0,3,5))))
            for r in reopened:
                original=next(x for x in branches if x['mode']=='keys' and branch_key(x,results)==branch_key(r,results))
                checks[r['operation_id']+'_reopen_binding']=verify_reopen_binding(evidence,original,r,ids[-1],path,sorting=True)
                def semantics(result):
                    return {k:v for k,v in result['configuration']['readback'].items() if k not in ('node','receipt_ids')}
                check(r['operation_id']+'_persisted_settings',semantics(results[original['operation_id']])==semantics(results[r['operation_id']]))
                check(r['operation_id']+'_fresh_execution',results[original['operation_id']]['execution']['execution_id']!=results[r['operation_id']]['execution']['execution_id'])
        read_ids={c.get('arguments',{}).get('operation_id') for c in evidence['calls'] if c.get('tool')==PREFIX+'dock_workspace_observe'}
        allowed_ids={r['operation_id'] for r in initial+reopened}|{e['operation_id'] for e in saves}|read_ids
        seed_pos=next(i for i,e in enumerate(evidence['events']) if e.get('phase')=='node_checkpoint' and e.get('operation_id')==seed['operation_id'])
        check('no_intervening_operation',not any(e.get('phase') in ('prepared','node_apply_prepared','artifact_delivery_prepared','download_prepared')
            and e.get('operation_id') not in allowed_ids for e in evidence['events'][seed_pos+1:]))
        check('all_components_ran','delivery_bytes_output' in checks and sum(k.endswith('_reopen_binding') for k in checks)==2)
    except (KeyError, TypeError, ValueError, IndexError, AttributeError) as error:
        checks['malformed_evidence'] = dict(passed=False, error_type=type(error).__name__)
    return report(checks)


def report(checks):
    passed = bool(checks) and all(c.get('passed') is True for c in checks.values())
    return dict(passed=passed, checks=checks, scope='sales-sorting-complete-scenario', subplan_complete=False)


def audit_directory(directory):
    request = json.loads((directory/'request.json').read_text())
    evidence = json.loads((directory/'evidence.json').read_text())
    result = audit(request, evidence, (directory/'scenario.txt').read_text(), (WORK/FIXTURE).read_bytes())
    hashes = request.get('harness_inputs', {})
    required = {p.relative_to(WORK).as_posix() for pattern in ('*.py', '*.mjs') for p in WORK.glob(pattern)} | {FIXTURE, 'goals/sales-sorting-complete.txt'}
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
    (args.run_dir/'sales-sorting-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(dict(passed=result['passed'], failures=[k for k, v in result['checks'].items() if not v['passed']])))
    raise SystemExit(0 if result['passed'] else 1)
