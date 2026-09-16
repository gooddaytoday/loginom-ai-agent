"""Independent full-goal Duplicates audit: public calls, native state, bytes and persistence."""
import argparse,hashlib,json
from pathlib import Path
from audit import knowledge_scope
from evidence import PREFIX,KNOWLEDGE_TOOLS
from preflight import runtime_pin
from prepare_binding import verified_prepare_v1
from grouping_node_acceptance import model_completed,SAVE_REVISIONS
from node_public_acceptance_evidence import verify_public_nodes_and_saves,verify_public_delivery
from artifact_delivery_evidence import verify_delivered_import_output
from node_configuration_evidence import verify_configuration_readback
from persisted_import_evidence import verify_persisted_import
from full_read_evidence import verify_full_read
from identity_import_evidence import verify_identity_import_mapping
from node_apply_reopen_binding import verify_reopen_binding
from node_apply_save_chain import verify_save_chain
from workflow_activation_evidence import verify_workflow_activation
from node_efficiency import node_efficiency
from user_result_evidence import normalize_user_evidence
from node_procedure_evidence import verify_internal_sequence
from duplicates_upload_probe import FIXTURES,descriptors,prompt as render_prompt,validate_catalog
from duplicates_test_fixtures import duplicates_fixtures
from duplicates_configuration_evidence import verify_duplicates_configuration
from duplicates_output_evidence import verify_duplicates_output
from duplicates_close_evidence import verify_duplicates_close
from duplicates_graph_evidence import verify_duplicates_graph
WORK=Path(__file__).resolve().parent;ROOT=WORK.parents[1]

def report(checks):
    return dict(passed=bool(checks) and all(v.get('passed') is True for v in checks.values()),checks=checks,scope='duplicates-node-complete-scenario',subplan_complete=False)


def audit(request,evidence,prompt):
    evidence,projection=normalize_user_evidence(evidence);checks={'user_result_projection':projection}
    if not projection['passed']:return report(checks)
    def check(key,value):checks[key]=dict(passed=bool(value))
    try:
        path=request['package_path'];goal=WORK/'goals/duplicates-node-complete.txt'
        check('declared_goal',request['goal_id']=='duplicates-node-complete' and request['goal_sha256']==hashlib.sha256(goal.read_bytes()).hexdigest() and prompt==render_prompt(goal.read_text(),path,request['storage_directory'],request['run_id']))
        check('goal_identity',evidence.get('run_id')==request['run_id'] and path==request['storage_directory']+'/packages/Dock-acceptance-'+request['run_id']+'.lgp' and request['schema_version']==2)
        check('model_completed',model_completed(request,evidence))
        check('complete_frozen_export',evidence.get('export_complete') is True and evidence.get('runtime_source_unchanged') is True and evidence.get('harness_unchanged') is True and evidence.get('native_skill_unchanged') is True and request['fault_injection'] is False)
        validate_catalog(request['manifest_uri'],request['manifest_sha256'],request['storage_directory'])
        check('explicit_target',bool(request.get('loginom_url')) and all(t['result'].get('loginomUrl')==request['loginom_url'] for t in evidence['tools'] if t.get('tool')==PREFIX+'dock_prepare' and t['result'].get('prepared') is True))
        check('native_skill',request['native_skill']['sha256']==request['runtime_source_pin']['inputs'].get('plugins/loginom-dock-hermes/skills/loginom/SKILL.md'))
        check('artifact_descriptors',request['input_artifacts']==descriptors(request['run_id'],request['storage_directory']))
        efficiency=node_efficiency(evidence);check('efficiency',evidence.get('efficiency')==efficiency and efficiency['usage_complete'] and efficiency['phases_complete'])
        allowed=KNOWLEDGE_TOOLS|{PREFIX+n for n in ('dock_prepare','dock_action_describe','dock_workspace_observe','dock_diagnostics','dock_operation_inspect','dock_node_apply','dock_node_status','dock_node_wait','dock_node_resume','dock_node_cancel','dock_node_stop','dock_operation_recover','dock_artifact_delivery_resume','dock_artifact_deliver','dock_artifact_delivery_status','dock_action_run')}
        check('no_ui_fallback',all(c['tool'] in allowed for c in evidence['calls']))
        check('knowledge_scope',all(knowledge_scope(c) for c in evidence['calls'] if c['tool'] in KNOWLEDGE_TOOLS))
        events=evidence['events'];requests=[e['request'] for e in events if e.get('phase')=='node_apply_prepared']
        check('sixteen_operations',len(requests)==16)
        if len(requests)!=16:return report(checks)
        def result(r):
            xs=[e['result'] for e in events if e.get('operation_id')==r['operation_id'] and e.get('phase')=='node_checkpoint']
            if len(xs)!=1 or xs[0]['status']!='SUCCEEDED':raise ValueError('unique_successful_checkpoint')
            return xs[0]
        results={r['operation_id']:result(r) for r in requests}
        before,again=requests[:10],requests[10:]
        imports={r['target'].get('label'):r for r in before if r['target']['type']=='imports.text' and r['target']['kind']=='new'}
        marks={r['target'].get('label'):r for r in before if r['target']['type']=='research.duplicates' and r['target']['kind']=='new'}
        changes=[r for r in before if r['target']['kind']=='existing']
        fixtures=duplicates_fixtures();labels=['Node12-'+k for k in fixtures]
        check('exact_six_new_nodes',set(imports)==set(labels) and set(marks)=={n+'-mark' for n in labels} and len(changes)==4)
        if not checks['exact_six_new_nodes']['passed']:return report(checks)
        keyonly,done,closed,restored=changes
        initial=marks['Node12-main10-mark'];main_node=result(initial)['node']
        for r in changes:check(r['operation_id']+'_existing_contract',r['target']['type']=='research.duplicates' and r['target']['ref']==main_node and r['inputs']==[] and r['mappings']==[])
        keyparams=dict(input_fields=['Key','Sub'],output_fields=[])
        check('key_only_contract',keyonly['parameters']==keyparams and keyonly['finish']=='execute')
        check('done_contract',done['parameters']==keyparams and done['finish']=='done' and done['read']['ports']==[] and result(done)['execution']==dict(status='not_requested',execution_id=None) and result(done)['output']['status']=='not_refreshed')
        check('close_contract',closed['parameters']==dict(input_fields=['Id'],output_fields=['Key']) and closed['finish']=='close' and closed['read']['ports']==[])
        check('restored_contract',restored['parameters']==fixtures['main10']['parameters'] and restored['finish']=='execute')
        checks['close_preservation']=verify_duplicates_close(events,done,closed,restored)
        deliveries=[c for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_deliver'];check('three_deliveries',len({c['arguments']['operation_id'] for c in deliveries})==3)
        first=min(c['row'] for c in deliveries);early=dict(evidence,calls=[c for c in evidence['calls'] if c['row']<first],tools=[t for t in evidence['tools'] if t['row']<first]);prep_ids={c['arguments'].get('operation_id','prepare') for c in early['calls'] if c['tool']==PREFIX+'dock_prepare'}
        early['events']=[e for e in events if e.get('event')!='workspace_prepared' or e.get('state',{}).get('operation_id') in prep_ids]
        prepared=verified_prepare_v1(early,PREFIX,deliveries[0]['session_id'],first);check('owned_draft',prepared is not None)
        if prepared is None:return report(checks)
        check('journal_pins',all(e.get('session_id')==prepared['sessionId'] and e.get('runtime_revision')==request['runtime_source_pin']['client_revision'] and e.get('manifest_sha256')==request['manifest_sha256'] for e in events))
        repeated={result(r)['node']['node_id']:r for r in again}
        check('six_existing_nodes_after_open',len(repeated)==6 and all(r['target']['kind']=='existing' and r['inputs']==[] and r['mappings']==[] and r['finish']=='execute' for r in again))
        pairs=[]
        ports=[dict(node_label=n,tids=[n+';Input_Connection[0]',n+';Input_Var[0]',n+';Output_Data[0]']) for n in labels]+[dict(node_label=n+'-mark',tids=[n+'-mark;Input_Data[0]',n+'-mark;Output_Data[0]']) for n in labels]
        graph=dict(nodes=sorted(labels+[n+'-mark' for n in labels]),ports=sorted(ports,key=lambda p:p['node_label']),links=sorted(n+'|Output_Data[0]|'+n+'-mark|Input_Data[0]' for n in labels))
        row_counts={}
        for key,f in fixtures.items():
            label='Node12-'+key;ir=imports[label];mr=marks[label+'-mark'];inode=result(ir)['node'];mnode=result(mr)['node']
            settings=ir['parameters']['settings'];actual=[{k:v for k,v in c.items() if k!='source_name' or v!=c.get('name')} for c in settings['columns']]
            checks[key+'_identity_mapping']=verify_identity_import_mapping(events,ir,f['data'])
            check(key+'_import_contract',ir['mode']=='delimited' and ir['finish']=='execute' and ir['inputs']==[] and checks[key+'_identity_mapping']['passed'] and actual==[dict(c,used=True) for c in f['columns']] and settings['format']==dict(delimiter=';',decimal_separator='.',null_marker='__NULL__',text_qualifier='"') and all(settings['source'][k]==v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()))
            check(key+'_mark_contract',mr['mode']=='mark' and mr['finish']=='execute' and mr['parameters']==f['parameters'] and mr['mappings']==[] and mr['inputs']==[dict(source=inode,output=0,input=0)])
            checks[key+'_import_config']=verify_configuration_readback(events,ir)
            op=ir['parameters']['source']['upload_operation_id'].removesuffix(':upload')
            calls=[c for c in evidence['calls'] if c['tool'] not in (PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status') or c['arguments'].get('operation_id')==op];ids={(c['session_id'],c['tool_call_id']) for c in calls}
            subset=dict(evidence,calls=calls,tools=[t for t in evidence['tools'] if (t['session_id'],t['tool_call_id']) in ids]);delivery=verify_public_delivery(subset,ir,prepared);checks[key+'_delivery']=delivery
            if delivery['passed']:checks[key+'_source_bytes']=verify_delivered_import_output(events,ir,f['data'],delivery['delivery'],request['runtime_source_pin']['client_revision'])
            later_i,later_m=repeated[inode['node_id']],repeated[mnode['node_id']]
            seed=restored if key=='main10' else mr;pairs.extend([(ir,later_i,False),(seed,later_m,True)])
            checks[key+'_persisted_import']=verify_persisted_import(evidence,ir,later_i,f['data'],path,SAVE_REVISIONS,expected_rows=len(f['rows']),expected_graphs=[graph,graph],stages=[('package.save_checkpoint',path,False),('package.save_as',path,True)])
            row_counts[inode['node_id']]=row_counts[mnode['node_id']]=len(f['rows'])
            check(key+'_persistent_node',later_m['target']['ref']['node_id']==mnode['node_id'] and later_m['parameters']==f['parameters'] and result(later_m)['execution']['execution_id']!=result(seed)['execution']['execution_id'])
            # Saved roles must already be present before the handler can rewrite them.
            sequence=verify_internal_sequence(events,later_m['operation_id'],max_steps=4096)
            raw=next(s['node_duplicates'] for _,s in sequence['observations'] if s.get('node_duplicates'))
            def roles(fs):return sorted(tuple(c[k] for k in ('name','label','type','data_kind','usage_type')) for c in fs)
            check(key+'_persisted_roles',roles(raw['fields'])==roles(result(seed)['configuration']['readback']['fields']))
            for suffix,r in [('initial',mr),('persisted',later_m)]:checks[key+'_'+suffix+'_output']=verify_duplicates_output(events,r,f['rows'],f['duplicate_groups'],f['contradiction_groups'],source_columns=f['columns'])
        f=fixtures['main10']
        checks['key_only_output']=verify_duplicates_output(events,keyonly,f['rows'],[[1,2,3],[4,5,6],[9,10]],[],source_columns=f['columns'])
        checks['restored_output']=verify_duplicates_output(events,restored,f['rows'],f['duplicate_groups'],f['contradiction_groups'],source_columns=f['columns'])
        for r in requests:
            if r['finish']=='execute':checks[r['operation_id']+'_full_read']=verify_full_read(events,r,row_counts[result(r)['node']['node_id']])
            if r['target']['type']=='research.duplicates':
                checks[r['operation_id']+'_graph']=verify_duplicates_graph(events,r)
                if r['finish']!='close':checks[r['operation_id']+'_configuration']=verify_duplicates_configuration(events,r)
            checks[r['operation_id']+'_workflow']=verify_workflow_activation(events,r)
        saves=[e for e in events if e.get('phase')=='completed' and e.get('action_key') in SAVE_REVISIONS]
        checks['public_calls']=verify_public_nodes_and_saves(evidence,{r['operation_id']:r for r in requests},[e['operation_id'] for e in saves],allow_validation_refusals=True)
        checks['save_chain']=verify_save_chain(events,next(iter(imports.values())),path,SAVE_REVISIONS,expected_graphs=[graph,graph],stages=[('package.save_checkpoint',path,False),('package.save_as',path,True)])
        if checks['save_chain']['passed']:
            save_id=checks['save_chain']['save_operation_ids'][-1]
            for i,(a,b,mark) in enumerate(pairs):checks['reopen_binding_'+str(i)]=verify_reopen_binding(evidence,a,b,save_id,path,duplicates=mark)
        check('all_gates_present',all(k in checks for k in ['reopen_binding_5']+[key+'_source_bytes' for key in fixtures]))
    except (KeyError,TypeError,ValueError,IndexError,AttributeError,StopIteration) as error:
        checks['malformed_evidence']=dict(passed=False,error=str(error))
    return report(checks)


def audit_directory(directory):
    request=json.loads((directory/'request.json').read_text());evidence=json.loads((directory/'evidence.json').read_text());result=audit(request,evidence,(directory/'scenario.txt').read_text());hashes=request['harness_inputs']
    required={p.name for pattern in ('*.py','*.mjs') for p in WORK.glob(pattern)}|{'goals/duplicates-node-complete.txt'}|{'fixtures/duplicates/'+n for n in FIXTURES}
    result['checks']['frozen_harness']=dict(passed=required<=set(hashes) and all((WORK/name).resolve().is_relative_to(WORK) and (WORK/name).is_file() and hashlib.sha256((WORK/name).read_bytes()).hexdigest()==sha for name,sha in hashes.items()))
    result['checks']['current_runtime_pin']=dict(passed=runtime_pin(ROOT)==request['runtime_source_pin']);return report(result['checks'])


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);a=p.parse_args();r=audit_directory(a.run_dir);(a.run_dir/'duplicates-node-audit.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(passed=r['passed'],failures=[k for k,v in r['checks'].items() if not v['passed']])));raise SystemExit(0 if r['passed'] else 1)
