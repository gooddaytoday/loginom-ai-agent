"""Small integration audit on existing native evidence verifiers.

Model completion alone never passes: saved graphs and independently executed
leaf results in a new browser are required for the final verdict.
"""
import argparse
from copy import deepcopy
import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re

import rc_combined_goal as goal
from evidence import PREFIX, KNOWLEDGE_TOOLS
from preflight import runtime_pin
from audit import knowledge_scope
from node_apply_acceptance import model_completed
from user_result_evidence import normalize_user_evidence
from node_public_acceptance_evidence import verify_public_nodes_and_saves, verify_public_delivery
from prepare_binding import verified_prepare_v1
from artifact_delivery_evidence import verify_delivered_import_output
from calculator_output_evidence import verify_calculator_output
from row_filter_output_evidence import verify_filter_output
from full_read_evidence import verify_full_read
from node_procedure_evidence import verify_internal_sequence
from import_execution_evidence import verify_execution_observations
from import_output_evidence import verify_table_output_observations

def need(condition, message):
    if not condition:
        raise ValueError(message)

def one(items, message):
    need(len(items) == 1, message)
    return items[0]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def package_cleanup_proof(reports, prepared, path, save_operation):
    report = one(reports, 'one_prepared_session_cleanup')
    receipt = report['receipt']
    need(report['profile_owned'] is True and report['session_id']==prepared['sessionId']==receipt['session_id'], 'cleanup_owned_session')
    need(receipt['version']==1 and receipt['status']=='SUCCEEDED' and receipt['document_id']==prepared['workspace']['document_id']
         and receipt['account']=='test-2' and receipt['package_path']==path and receipt['save_operation_id']==save_operation,
         'cleanup_saved_identity')
    need(receipt['package_closed'] is True and receipt['logged_out'] is True and receipt['unsaved_changes_discarded'] is False
         and receipt['packages_before']==1 and receipt['packages_after']==0, 'cleanup_closed_and_logged_out')
    return dict(passed=True,receipt=receipt)

def expected_edges(spec):
    return sorted((source, output, name, index) for name, (_, inputs) in spec.items()
                  for index, (source, output) in enumerate(inputs))

def saved_graph_matches(graph, spec):
    need(sorted(graph['nodes']) == sorted(spec), 'saved_graph_nodes')
    edges = []
    for link in graph['links']:
        source, out, target, inp = link.split('|')
        p = re.fullmatch(r'Output_Data\[(\d+)\]', out)
        q = re.fullmatch(r'Input_Data\[(\d+)\]', inp)
        need(p is not None and q is not None, 'saved_graph_table_ports')
        edges.append((source, int(p[1]), target, int(q[1])))
    need(sorted(edges) == expected_edges(spec), 'saved_graph_edges')

def save_proof(events, requests, path, spec):
    keys = ('package.save_checkpoint', 'package.save_as')
    si, start = one([(i,e) for i,e in enumerate(events) if e.get('phase') == 'prepared' and e.get('action_key') in keys], 'one_save_start')
    ei, end = one([(i,e) for i,e in enumerate(events) if e.get('phase') == 'completed' and e.get('action_key') in keys], 'one_save_end')
    last = max(i for i,e in enumerate(events) if e.get('phase') == 'node_checkpoint')
    need(last < si < ei and start['action_key'] == end['action_key'] == 'package.save_checkpoint', 'final_save_order')
    for key in ('operation_id','parameters','checkpoint','action_revision','session_id','runtime_revision','target'):
        need(start.get(key) == end.get(key), 'save_binding_' + key)
    need(start['action_revision'] == '2' and start['parameters'] == dict(path=path, conflict_policy='fail'), 'save_revision_and_destination')
    cp, out = start['checkpoint'], end['outcome']
    saved_graph_matches(cp['graph'], spec)
    need(cp['path'] == path and cp['package_identity']['path'] == '', 'new_package_save')
    data = out['output']
    need(out['status'] == 'SUCCEEDED' and out['cleanup_complete'] is True and out.get('error') is None
         and data['save_completed'] is True and data['workflow_preserved'] is True and data['reopened'] is False
         and data['package_ref'] == dict(kind='package',path=path,active_identity=path), 'save_completed')
    trace = out['trace']
    stages = [one([(i,t) for i,t in enumerate(trace) if t.get('event') == name], 'save_trace_' + name)
              for name in ('save_requested','save_flow_completed','open_saved_package_observed','postcondition_verified')]
    need([i for i,_ in stages] == sorted(i for i,_ in stages), 'save_trace_order')
    observed, post = stages[-2][1], stages[-1][1]
    need(observed['actual_path'] == observed['requested_path'] == post['package_path'] == path
         and observed['path_matches'] is True and observed['graph_matches'] is True
         and observed['graph'] == post['graph'] == cp['graph']
         and post['proof'] == 'awaited_save_flow_same_open_workflow', 'save_native_postcondition')
    return dict(passed=True, operation_id=start['operation_id'], graph=cp['graph'])

def table_proofs(events, request, expected):
    if 'ports' in expected:
        result = verify_filter_output(events,request,expected['ports'][0]['columns'],[p['rows'] for p in expected['ports']])
        return dict(passed=result['passed'], values=result)
    result = verify_calculator_output(events,request,expected['columns'],expected['rows'],
                                     launch_mode='wizard' if request['target']['type']=='imports.text' else 'graph')
    full = verify_full_read(events,request,len(expected['rows']))
    return dict(passed=result['passed'] and full['passed'],values=result,complete=full)

def export_proof(run, events, request, expected, runtime):
    terminal=one([e['outcome'] for e in events if e.get('phase')=='completed'
                  and e.get('operation_id')==request['operation_id']], 'export_terminal')
    artifact=one(terminal['output']['output']['file_artifacts'],'export_artifact')
    # This is the retained native browser download, not an oracle-generated file.
    files=list((run/'private/dock-state/sessions').glob('*/artifacts/input/output-'+artifact['artifact_id']+'/'+Path(artifact['destination']).name))
    native=one(files,'retained_native_export')
    need(native.is_file() and not native.is_symlink() and native.stat().st_size<=16*1024*1024,'native_export_file')
    spec=importlib.util.spec_from_file_location('rc_text_export_audit',goal.WORK/'audit-text-export.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    fixture=dict(names=[c['name'] for c in expected['columns']],labels=[c['label'] for c in expected['columns']],rows=expected['rows'])
    settings=dict(delimiter=';',header='names',bom=False,line_ending='\n',null_marker='NULL')
    result=module.audit(terminal,fixture,settings,native.read_bytes(),request['parameters']['destination'],events=events,expected_runtime=runtime)
    return dict(result,native_file=str(native),byte_source='native_browser_download')

def reopened_table_proof(events, result, expected):
    seq=verify_internal_sequence(events,result['operation_id'],max_steps=4096)
    proof=verify_execution_observations(seq['observations'],seq['mutations'],result['node'],launch_mode='graph')
    failures=[*seq['failures'],*proof['failures']]
    if any(s.get('wizard',{}).get('status')=='observed' for _,s in seq['observations']):failures.append('node_wizard_opened_during_reopen')
    marker='__RC_ORACLE_NULL__';stream=io.StringIO(newline='')
    writer=csv.writer(stream,delimiter=';',lineterminator='\n')
    writer.writerow([c['name'] for c in expected['columns']])
    writer.writerows([[marker if v is None else v for v in row] for row in expected['rows']])
    settings=dict(source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),
                  format=dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker=marker),
                  columns=[dict(c,used=True) for c in expected['columns']])
    request=dict(target=dict(kind='existing'),parameters=dict(settings=settings),mappings=[],read=dict(sample_rows=10))
    # Pass the actual independent read result to the raw-cell verifier. It does
    # not require or manufacture a node.apply/node_checkpoint journal event.
    failures.extend(verify_table_output_observations(seq['observations'],seq['mutations'],request,stream.getvalue().encode(),result,proof['execution_id']))
    return dict(passed=not failures,failures=sorted(set(failures)),execution_id=proof['execution_id'])

def reopened_graph_proof(graph,plan):
    spec=goal.SPECS[plan['case']]
    need(graph['complete'] is True and graph['foreign_links']==[],'reopened_graph_incomplete')
    by_id={n['ref']['node_id']:n['label'] for n in graph['nodes']}
    need(len(by_id)==len(spec) and set(by_id.values())==set(spec),'reopened_graph_nodes')
    for n in graph['nodes']:
        expected=plan['nodes'][n['label']]
        need(n['ref']['node_id']==expected['node']['node_id'] and n['type']==expected['type'],'reopened_node_identity')
    edges=sorted((by_id[e['source']],e['output'],by_id[e['target']],e['input']) for e in graph['links'])
    need(edges==expected_edges(spec),'reopened_graph_links')
    return dict(passed=True)

def reopen_audit(directory,plan):
    checks={}
    try:
        index=json.loads((directory/'index.json').read_text());prep=index['prepare'];session=index['session']
        need(index['scope']=='rc-independent-saved-graph' and index['model_started'] is False
             and index['settings_reapplied'] is False and index['package_saved'] is False,'independent_scope')
        need(index['case']==plan['case'] and index['run_id']==plan['run_id'] and prep['status']=='READY'
             and prep['document_id']!=plan['old_document_id'] and prep['package_ref']['path']==plan['package_path']
             and session['sessionId']!=plan['old_session_id'] and session['clientRevision']==plan['runtime_revision'],'fresh_saved_identity')
        need(index['geometry']['viewport'] is None and index['geometry']['window']['width']>=index['geometry']['window']['availableWidth']*.9,'expanded_native_window')
        checks['fresh_saved_identity']=dict(passed=True)
        need(not any(c.get('label','').endswith('(только чтение)') for c in prep['workflow_ref']['navigation_path']),'fresh_package_readonly')
        cleanup=index['package_cleanup']
        need(cleanup['version']==1 and cleanup['status']=='SUCCEEDED' and cleanup['session_id']==session['sessionId']
             and cleanup['document_id']==prep['document_id'] and cleanup['account']=='test-2' and cleanup['package_path']==plan['package_path']
             and cleanup['package_closed'] is True and cleanup['logged_out'] is True and cleanup['packages_after']==0,'fresh_cleanup_identity')
        response=json.loads((directory/f"browser-{index['cleanup_response_sequence']}.json").read_text())
        native=[]
        for block in response.get('content',[]):
            if block.get('type')=='text':
                match=re.search(r'^### Result\n([\s\S]*?)(?:\n### |$)',block['text'])
                try:native.append(json.loads(match[1] if match else block['text']))
                except (ValueError,TypeError):pass
        need(response.get('isError') is not True and cleanup in native,'fresh_native_cleanup_response')
        checks['fresh_package_cleanup']=dict(passed=True,discarded_temporary_views=cleanup['unsaved_changes_discarded'])
        for key in ['graph_before','graph_after']:
            checks[key]=reopened_graph_proof(index[key],plan)
            need(index[key]['document_id']==prep['document_id'] and index[key]['workflow_ref']==prep['workflow_ref'],'graph_workspace_binding')
        need(set(index['results'])==set(plan['leaves']),'all_saved_leaves')
        events=[json.loads(line) for line in (directory/'execution-events.jsonl').read_text().splitlines()]
        need({e['session_id'] for e in events}=={session['sessionId']}
             and {e['runtime_revision'] for e in events}=={plan['runtime_revision']},'independent_journal_identity')
        expected=json.loads((goal.FIXTURES/'expected.json').read_text())[plan['case']]
        for name,value in index['results'].items():
            result=value['result'];node=result['node']
            need(node==dict(document_id=prep['document_id'],workflow_id=prep['workflow_ref']['workflow_id'],node_id=plan['nodes'][name]['node']['node_id']),'saved_leaf_binding')
            checks['table_'+name]=reopened_table_proof(events,result,expected[name])
    except (KeyError,TypeError,ValueError,IndexError,AttributeError) as error:
        checks['audit_error']=dict(passed=False,reason=str(error))
    return dict(passed=bool(checks) and all(x.get('passed') is True for x in checks.values()),checks=checks)

def model_audit(run):
    request=json.loads((run/'request.json').read_text()); raw=json.loads((run/'evidence.json').read_text())
    evidence, projection=normalize_user_evidence(raw)
    checks={'public_projection':projection}; plan=None
    def check(name, value):checks[name]=dict(passed=bool(value))
    try:
        gid=request['goal_id']; case=gid.removeprefix('rc-combined-'); spec=goal.SPECS[case]
        need(gid in goal.GOALS,'declared_rc_goal')
        path='/test-2/packages/Dock-acceptance-'+request['run_id']+'.lgp'
        template=goal.WORK/'goals'/f'{gid}.txt'
        check('goal_and_inputs', request['package_path']==path and request['input_artifacts']==goal.descriptors(gid,request['run_id'],'/test-2')
              and request['goal_sha256']==digest(template) and (run/'scenario.txt').read_text()==goal.prompt(gid,template.read_text(),path,'/test-2',request['run_id'])
              and request['manifest_uri']==goal.MANIFEST_URI and request['manifest_sha256']==goal.MANIFEST_SHA)
        check('model',model_completed(request,evidence))
        check('immutable_runtime_and_evidence',evidence.get('export_complete') is True and evidence.get('run_id')==request['run_id']
              and evidence.get('runtime_source_unchanged') is True and evidence.get('harness_unchanged') is True
              and evidence.get('native_skill_unchanged') is True and request.get('fault_injection') is False
              and request['runtime_source_pin']==runtime_pin(goal.WORK.parents[1]))
        check('harness_pins',all((goal.WORK/name).is_file() and digest(goal.WORK/name)==value for name,value in request['harness_inputs'].items()))
        check('knowledge_scope',all(knowledge_scope(c) for c in evidence['calls'] if c['tool'] in KNOWLEDGE_TOOLS))
        allowed={PREFIX+n for n in ('dock_prepare','dock_action_describe','dock_workspace_observe','dock_diagnostics','dock_node_apply','dock_node_wait','dock_node_status','dock_artifact_deliver','dock_artifact_delivery_status','dock_action_run')}
        check('script_handlers_only',all(c['tool'] in allowed or c['tool'] in KNOWLEDGE_TOOLS for c in evidence['calls']))
        events=evidence['events']; declarations=[e for e in events if e.get('phase')=='node_apply_prepared']
        requests={e['request']['target']['label']:e['request'] for e in declarations}
        need(len(declarations)==len(spec) and set(requests)==set(spec),'exact_declared_nodes')
        outputs={name:one([e['result'] for e in events if e.get('phase')=='node_checkpoint' and e.get('operation_id')==req['operation_id']], 'checkpoint_'+name) for name,req in requests.items()}
        for name,(type_,parents) in spec.items():
            req=requests[name];inputs=[{'source':outputs[parent]['node'],'output':port,'input':i} for i,(parent,port) in enumerate(parents)]
            check('graph_'+name,req['target']['kind']=='new' and req['target']['type']==type_ and req['finish']=='execute'
                  and req['inputs']==inputs and outputs[name]['status']=='SUCCEEDED')
        expected=json.loads((goal.FIXTURES/'expected.json').read_text())[case]
        for name,value in expected.items():checks['table_'+name]=table_proofs(events,requests[name],value)
        if case=='export':
            need(requests['Export']['parameters']['destination']=='/test-2/RC-'+request['run_id']+'-long.csv','export_destination')
            checks['export_bytes']=export_proof(run,events,requests['Export'],expected['Long'],request['runtime_source_pin']['client_revision'])
        caller=one(list({c['session_id'] for c in evidence['calls']}),'one_caller')
        first=min(c['row'] for c in evidence['calls'] if c['tool']==PREFIX+'dock_node_apply')
        prepared=verified_prepare_v1(evidence,PREFIX,caller,first);need(prepared is not None,'prepared_workspace')
        check('preparation',True)
        import_names=[n for n,(t,_) in spec.items() if t=='imports.text']
        for name,file in zip(import_names,goal.GOALS[gid]):
            req=requests[name];artifact=req['parameters']['source']['artifact_id']
            need(req['parameters']['settings']['format']['null_marker']=='NULL','import_null_marker_'+name)
            ids={c['arguments']['operation_id'] for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_deliver' and c['arguments'].get('artifact_id')==artifact}
            need(len(ids)==1,'delivery_id_'+name)
            selected=deepcopy(evidence)
            excluded={c['tool_call_id'] for c in evidence['calls'] if c['tool'] in (PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status') and c['arguments'].get('operation_id') not in ids}
            selected['calls']=[c for c in selected['calls'] if c['tool_call_id'] not in excluded]
            selected['tools']=[t for t in selected['tools'] if t['tool_call_id'] not in excluded]
            delivery=verify_public_delivery(selected,req,prepared);checks['delivery_'+name]=delivery
            if delivery['passed']:
                checks['import_'+name]=verify_delivered_import_output(events,req,(goal.FIXTURES/file).read_bytes(),delivery['delivery'],request['runtime_source_pin']['client_revision'])
        save=save_proof(events,list(requests.values()),path,spec);checks['save']=save
        checks['package_cleanup']=package_cleanup_proof(evidence.get('package_cleanup',[]),prepared,path,save['operation_id'])
        need(any(e.get('event')=='isolated_package_cleanup' and e.get('cleanup')==checks['package_cleanup']['receipt'] for e in events),'cleanup_native_journal')
        checks['public_calls']=verify_public_nodes_and_saves(evidence,{r['operation_id']:r for r in requests.values()},[save['operation_id']],allow_validation_refusals=True)
        plan={'case':case,'package_path':path,'run_id':request['run_id'],'runtime_revision':request['runtime_source_pin']['client_revision'],
              'manifest_uri':request['manifest_uri'],'manifest_sha256':request['manifest_sha256'],
              'old_document_id':prepared['workspace']['document_id'],'old_session_id':prepared['sessionId'],
              'nodes':{name:dict(type=spec[name][0],node=out['node']) for name,out in outputs.items()},
              'leaves':goal.LEAVES[case],'graph':save['graph']}
    except (KeyError,TypeError,ValueError,IndexError,AttributeError,AssertionError,StopIteration) as error:
        checks['audit_error']=dict(passed=False,reason=str(error))
    passed=all(c.get('passed') is True for c in checks.values())
    return dict(passed=False,model_checks_passed=passed,ready_for_reopen=passed,checks=checks,reopen_plan=plan if passed else None,
                scope='combined_handlers_model_phase',limitation='Independent reopen remains required')

def main():
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--reopen',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    result=model_audit(a.run)
    if a.reopen and result['model_checks_passed']:
        result['checks']['independent_reopen']=reopen_audit(a.reopen,result['reopen_plan'])
        result['passed']=result['checks']['independent_reopen']['passed']
        result['scope']='combined_handlers_complete_scenario'
        result['limitation']=None if result['passed'] else 'Independent reopen did not pass'
    a.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'passed':result['passed'],'ready_for_reopen':result['ready_for_reopen'],'failed':[k for k,v in result['checks'].items() if not v.get('passed')]}))
    return 0 if (result['passed'] if a.reopen else result['ready_for_reopen']) else 1

if __name__=='__main__':raise SystemExit(main())
