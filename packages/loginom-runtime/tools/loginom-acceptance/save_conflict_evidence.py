"""Seed -> save -> bound continuation/patch -> refuse -> replace -> no-resave QA.

The ordinary existing-node verifier never accepts a changed navigation path.
This composition first proves its origin in the exact completed save receipt.
"""
import argparse
import json
from pathlib import Path
from existing_import_evidence import _verify_existing_import_output


def verify_save_refusal_receipt(outcome, path):
    failures=[]
    if (outcome.get('status')!='NOT_APPLIED' or outcome.get('cleanup_complete') is not True
            or outcome.get('error') is not None or outcome.get('output')!=dict(path=path,conflict=True)):
        failures.append('refusal_outcome')
    trace=outcome.get('trace',[]);order=[]
    for event in ('save_requested','save_conflict_observed','conflict_rejected','cleanup_completed'):
        rows=[(i,t) for i,t in enumerate(trace) if t.get('event')==event]
        if len(rows)!=1:failures.append('refusal_'+event);continue
        i,t=rows[0];order.append(i)
        if event=='save_requested' and t.get('path')!=path:failures.append('refusal_destination')
        if event=='save_conflict_observed' and (t.get('path')!=path or t.get('message')!='"'+path+'" уже существует. Вы хотите заменить его?'):
            failures.append('refusal_exact_question')
        if event=='cleanup_completed' and t.get('resource')!='transient_dialog':failures.append('refusal_cleanup_owner')
    if order!=sorted(order):failures.append('refusal_order')
    if any(t.get('event') in ('overwrite_confirmed','save_flow_completed','postcondition_verified','saved_package_closed','reopened_package_observed','cleanup_failed') for t in trace):
        failures.append('refusal_unexpected_effect')
    return dict(passed=not failures,failures=sorted(set(failures)),file_bytes_verified=False)


def verify_save_conflict_cycle(events, seed, patch, reopened, source_bytes, parameters):
    failures=[]
    def one(op, phase):
        rows=[(i,e) for i,e in enumerate(events) if e.get('operation_id')==op and e.get('phase')==phase]
        if len(rows)!=1:
            failures.append('unique_'+op+'_'+phase);return -1,{}
        return rows[0]
    path=parameters.get('path')
    if parameters.get('conflict_policy')!='fail' or not isinstance(path,str) or not path.startswith('/') or not path.endswith('.lgp'):
        return dict(passed=False,failures=['exact_initial_destination'])
    seed_i,seed_cp=one(seed['operation_id'],'node_checkpoint')
    seed_node=seed_cp.get('result',{}).get('node',{})
    seed_graph={'nodes':[seed['target']['label']],'ports':[{'node_label':seed['target']['label'],
                'tids':[seed['target']['label']+';Input_Connection[0]',seed['target']['label']+';Input_Var[0]',seed['target']['label']+';Output_Data[0]']}],'links':[]}
    identities=[]
    def write(op, policy, workflow, previous_path, refusal=False):
        pi,prepared=one(op,'prepared');ci,completed=one(op,'completed')
        identities.extend([prepared,completed]);out=completed.get('outcome',{});cp=prepared.get('checkpoint',{})
        expected=dict(path=path,conflict_policy=policy)
        for row in (prepared,completed):
            if (row.get('action_key')!='package.save_checkpoint' or row.get('action_revision')!='1'
                    or row.get('parameters')!=expected or row.get('checkpoint')!=cp):failures.append(op+'_contract')
        if (pi>=ci or cp.get('path')!=path or cp.get('workflow_ref')!={k:workflow[k] for k in ('tab_tid','prefix')}
                or cp.get('package_identity',{}).get('path') not in ([None,''] if previous_path is None else [previous_path])
                or cp.get('graph')!=seed_graph):failures.append(op+'_checkpoint')
        if (out.get('status')!=('NOT_APPLIED' if refusal else 'SUCCEEDED') or out.get('cleanup_complete') is not True
                or out.get('error') is not None or out.get('operation_id')!=op or out.get('action_key')!='package.save_checkpoint'):
            failures.append(op+'_outcome')
        trace=out.get('trace',[])
        def receipt(event):
            ts=[(i,t) for i,t in enumerate(trace) if t.get('event')==event]
            if len(ts)!=1:failures.append(op+'_'+event);return -1,{}
            return ts[0]
        requested_i,requested=receipt('save_requested')
        if requested.get('path')!=path:failures.append(op+'_requested_path')
        if refusal or policy=='replace':
            qi,question=receipt('save_conflict_observed');ai,_=receipt('conflict_rejected' if refusal else 'overwrite_confirmed')
            if (not requested_i<qi<ai or question.get('path')!=path
                    or question.get('message')!='"'+path+'" уже существует. Вы хотите заменить его?'):
                failures.append(op+'_exact_conflict')
        if any(t.get('event') in ['saved_package_closed','reopened_package_observed'] for t in trace):failures.append(op+'_unexpected_reopen')
        if refusal:
            failures.extend(op+'_'+f for f in verify_save_refusal_receipt(out,path)['failures'])
            if out.get('output')!=dict(path=path,conflict=True):failures.append(op+'_refusal_output')
            if any(t.get('event') in ['overwrite_confirmed','postcondition_verified','save_flow_completed'] for t in trace):failures.append(op+'_refusal_saved')
            clean=[i for i,t in enumerate(trace) if t.get('event')=='cleanup_completed' and t.get('resource')=='transient_dialog']
            if len(clean)!=1 or clean[0]<=ai:failures.append(op+'_refusal_cleanup')
            return pi,ci,None
        output=out.get('output',{})
        if (output.get('package_ref')!=dict(kind='package',path=path,active_identity=path)
                or output.get('reopened') is not False or output.get('workflow_preserved') is not True
                or output.get('save_completed') is not True or output.get('persisted_content_verified') is not False):failures.append(op+'_save_output')
        fi,flow=receipt('save_flow_completed');oi,observed=receipt('open_saved_package_observed');bi,bound=receipt('save_continuations_observed');vi,post=receipt('postcondition_verified')
        if not requested_i<fi<oi<bi<vi:failures.append(op+'_save_order')
        if (flow.get('path')!=path or observed.get('requested_path')!=path or observed.get('actual_path')!=path
                or observed.get('workflow_ref')!=cp.get('workflow_ref') or observed.get('workflow_matches') is not True
                or observed.get('path_matches') is not True or observed.get('graph_matches') is not True
                or observed.get('graph')!=seed_graph or post.get('graph')!=seed_graph
                or post.get('proof')!='awaited_save_flow_same_open_workflow' or post.get('package_path')!=path):failures.append(op+'_saved_identity')
        continuations=output.get('workflow_continuations',[])
        selected=[c for c in continuations if c.get('document_id')==seed['document_id'] and c.get('previous_workflow_ref')==workflow]
        if bound.get('continuations')!=continuations or len(selected)!=1:
            failures.append(op+'_continuation');return pi,ci,None
        next_workflow=selected[0].get('workflow_ref',{})
        if any(next_workflow.get(k)!=workflow.get(k) for k in ('workflow_id','tab_tid','prefix')):failures.append(op+'_continued_identity')
        return pi,ci,next_workflow
    initial_pi,initial_ci,continued=write('save-import','fail',seed['workflow_ref'],None)
    if patch.get('workflow_ref')!=continued or patch.get('target',{}).get('ref')!=seed_node:
        failures.append('saved_patch_continuation_binding')
    patch_pi,_=one(patch['operation_id'],'node_apply_prepared');patch_ci,patch_cp=one(patch['operation_id'],'node_checkpoint')
    refusal_pi,refusal_ci,_=write('save-existing-fail','fail',patch['workflow_ref'],path,True)
    replace_pi,replace_ci,continued_again=write('save-existing-replace','replace',patch['workflow_ref'],path)
    if continued_again!=patch['workflow_ref']:failures.append('replacement_changed_workflow')
    qi,qe=one('checkpoint-reopen-qa','checkpoint_reopen_qa');ci,ce=one('reopened-package-checkpoint','reopened_package_checkpoint')
    prep_i,pe=one('prepare-saved','saved_package_prepared');reopen_i,_=one(reopened['operation_id'],'node_apply_prepared')
    if not seed_i<initial_pi<initial_ci<patch_pi<patch_ci<refusal_pi<refusal_ci<replace_pi<replace_ci<qi<ci<prep_i<reopen_i:
        failures.append('save_cycle_order')
    qa=qe.get('qa',{});expected_trace=[dict(event='qa_menu_opened'),dict(event='qa_close_clicked'),
        dict(event='qa_saved_package_closed',workflow_ref=patch['workflow_ref']),dict(event='qa_menu_opened'),
        dict(event='qa_open_clicked'),dict(event='qa_open_confirmed',path=path),dict(event='qa_reopened_path_observed',path=path)]
    if (qa.get('status')!='SUCCEEDED' or qa.get('save_performed') is not False or qa.get('path')!=path
            or qa.get('trace')!=expected_trace or qa.get('closed') is not True or qa.get('reopened') is not True):failures.append('qa_without_resave')
    fresh=ce.get('checkpoint',{});fresh_cp=fresh.get('checkpoint',{})
    if (fresh.get('status')!='NOT_APPLIED' or fresh.get('effect_possible') is not False or fresh.get('cleanup_complete') is not True
            or fresh_cp.get('path')!=path or fresh_cp.get('package_identity',{}).get('path')!=path or fresh_cp.get('graph')!=seed_graph
            or fresh_cp.get('workflow_ref')!={k:reopened['workflow_ref'][k] for k in ('tab_tid','prefix')}):failures.append('qa_reopened_graph')
    prep=pe.get('preparation',{})
    if (prep.get('status')!='READY' or prep.get('created_draft') is not False or prep.get('effect_possible') is not False
            or prep.get('package_ref',{}).get('path')!=path or prep.get('package_ref',{}).get('persisted') is not True
            or prep.get('document_id')!=seed['document_id'] or prep.get('workflow_ref')!=reopened.get('workflow_ref')):failures.append('qa_reopened_binding')
    if (reopened['target']['ref'].get('node_id')!=seed_node.get('node_id')
            or any(reopened['workflow_ref'].get(k)==patch['workflow_ref'].get(k) for k in ('workflow_id','prefix','tab_tid'))):failures.append('qa_fresh_workflow_same_node')
    allowed={seed['operation_id'],patch['operation_id'],reopened['operation_id'],'save-import','save-existing-fail','save-existing-replace','checkpoint-reopen-qa','reopened-package-checkpoint','prepare-saved'}
    for row in events[seed_i:reopen_i+1]:
        if row.get('operation_id') not in allowed:failures.append('intervening_operation')
        if any(row.get(k)!=seed_cp.get(k) for k in ('session_id','runtime_revision','target')):failures.append('cycle_runtime_binding')
    if failures:return dict(passed=False,failures=sorted(set(failures)),package_persistence_verified=False)
    patched=_verify_existing_import_output(events,seed,patch,source_bytes,continued_workflow=True)
    if not patched['passed']:return dict(passed=False,failures=['patch_'+x for x in patched['failures']],package_persistence_verified=False)
    baseline=patched['expected_settings']
    if reopened['parameters']['settings']!={'columns':[{'name':baseline['columns'][0]['name'],'label':baseline['columns'][0]['label']}]}:
        return dict(passed=False,failures=['reopened_noop_required'],package_persistence_verified=False)
    final=_verify_existing_import_output(events,patch,reopened,source_bytes,reopened_package=True,verified_seed=patched,baseline_settings=baseline)
    return {**final,'scope':'save_patch_refuse_replace_no_resave_reopen_output','package_path':path,
            'save_conflict_rejected':True,'explicit_replacement_verified':final['passed'],
            'package_persistence_verified':final['passed'],'hermes_acceptance_verified':False}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--run-dir',required=True);directory=Path(parser.parse_args().run_dir)
    read=lambda name:json.loads((directory/name).read_text())
    events=[json.loads(x) for x in (directory/'execution-events.jsonl').read_text().splitlines()]
    result=verify_save_conflict_cycle(events,read('request.json'),read('save-patch-request.json'),read('reopened-request.json'),
        (directory/read('artifact.json')['name']).read_bytes(),read('save-request.json'))
    (directory/'independent-save-conflict-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps(result,ensure_ascii=False));raise SystemExit(0 if result['passed'] else 1)
