"""Independent full-goal Union audit: public calls, native state, bytes and persistence."""
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
from existing_import_evidence import _verify_existing_import_output
from node_apply_reopen_binding import verify_reopen_binding,union_unchanged_parameters
from node_apply_save_chain import verify_save_chain
from workflow_activation_evidence import verify_workflow_activation
from node_efficiency import node_efficiency
from user_result_evidence import normalize_user_evidence
from calculator_output_evidence import verify_calculator_output
from node_procedure_evidence import verify_internal_sequence
from union_configuration_evidence import verify_union_configuration
from union_graph_evidence import verify_third_input,verify_unchanged_inputs
from union_upload_probe import FIXTURES,descriptors,prompt as render_prompt,MANIFEST_URI,MANIFEST_SHA
from union_oracle import expected
WORK=Path(__file__).resolve().parent;ROOT=WORK.parents[1]
LABELS=['Главная','Вторая','Третья']
NAMES=[['Code','Amount','Note'],['Memo','Value','Key'],['Item','Total','Text','Extra']]

def report(checks):return dict(passed=bool(checks) and all(v.get('passed') is True for v in checks.values()),checks=checks,scope='union-node-complete-scenario',subplan_complete=False)
def persisted_equal(a,b):
    def settings(result):return {k:v for k,v in result['configuration']['readback'].items() if k not in ('node','receipt_ids')}
    return settings(a)==settings(b)
def table_declaration(request,count,alias=False):
    p=request['parameters']
    wanted=[dict(port=1,fields=[dict(source='SourceKey' if alias else 'Key',main='Code'),dict(source='Value',main='Amount'),dict(source='Memo',main='Note')])]
    if count==3:wanted.append(dict(port=2,fields=[dict(source='Item',main='Code'),dict(source='Total',main='Amount'),dict(source='Text',main='Note'),dict(source='Extra',main=None)]))
    return request['mode']=='append_all' and union_unchanged_parameters(p,dict(prefixes=dict(enabled=False,name='Union',label='Объединение'),tables=wanted))
def output_contract(events,request,count,alias=False):
    e=expected(count);columns=[dict(name=n,label=n,type=t) for n,t in zip(e['columns'],e['types'])];rows=e['rows']
    if alias:
        columns=[dict(name=n,label='Same',type=t) for n,t in [('Comment','string'),('Identifier','string'),('Sum','integer')]]
        rows=[[r[2],r[0],r[1]] for r in rows]
    return verify_calculator_output(events,request,columns,rows)

def audit(request,evidence,prompt):
    evidence,projection=normalize_user_evidence(evidence);checks={'user_result_projection':projection}
    if not projection['passed']:return report(checks)
    def check(key,value):checks[key]=dict(passed=bool(value))
    try:
        path=request['package_path'];goal=WORK/'goals/union-node-complete.txt'
        check('declared_goal',request['goal_id']=='union-node-complete' and request['goal_sha256']==hashlib.sha256(goal.read_bytes()).hexdigest() and prompt==render_prompt(goal.read_text(),path,request['storage_directory'],request['run_id']))
        check('goal_identity',evidence.get('run_id')==request['run_id'] and path==request['storage_directory']+'/packages/Dock-acceptance-'+request['run_id']+'.lgp' and request['schema_version']==2)
        check('model_completed',model_completed(request,evidence))
        check('complete_frozen_export',evidence.get('export_complete') is True and evidence.get('runtime_source_unchanged') is True and evidence.get('harness_unchanged') is True and evidence.get('native_skill_unchanged') is True and request['fault_injection'] is False)
        check('catalog',request['manifest_uri']==MANIFEST_URI and request['manifest_sha256']==MANIFEST_SHA)
        check('explicit_target',bool(request.get('loginom_url')) and all(t['result'].get('loginomUrl')==request['loginom_url'] for t in evidence['tools'] if t.get('tool')==PREFIX+'dock_prepare' and t['result'].get('prepared') is True))
        check('native_skill',request['native_skill']['sha256']==request['runtime_source_pin']['inputs'].get('plugins/loginom-dock-hermes/skills/loginom/SKILL.md'))
        check('artifact_descriptors',request['input_artifacts']==descriptors(request['run_id'],request['storage_directory']))
        efficiency=node_efficiency(evidence);check('efficiency',evidence.get('efficiency')==efficiency and efficiency['usage_complete'] and efficiency['phases_complete'])
        allowed=KNOWLEDGE_TOOLS|{PREFIX+n for n in ('dock_prepare','dock_action_describe','dock_workspace_observe','dock_diagnostics','dock_operation_inspect','dock_node_apply','dock_node_status','dock_node_wait','dock_node_resume','dock_node_cancel','dock_node_stop','dock_operation_recover','dock_artifact_delivery_resume','dock_artifact_deliver','dock_artifact_delivery_status','dock_action_run')}
        check('no_ui_fallback',all(c['tool'] in allowed for c in evidence['calls']))
        check('knowledge_scope',all(knowledge_scope(c) for c in evidence['calls'] if c['tool'] in KNOWLEDGE_TOOLS))
        events=evidence['events'];requests=[e['request'] for e in events if e.get('phase')=='node_apply_prepared'];check('twelve_operations',len(requests)==12)
        if len(requests)!=12:return report(checks)
        imports=requests[:3];initial,third,changed,done,closed=requests[3:8];again=requests[8:11];last=requests[11]
        def result(r):
            xs=[e['result'] for e in events if e.get('operation_id')==r['operation_id'] and e.get('phase')=='node_checkpoint']
            if len(xs)!=1 or xs[0]['status']!='SUCCEEDED':raise ValueError('unique_successful_checkpoint')
            return xs[0]
        results={r['operation_id']:result(r) for r in requests};jr,tr,cr,dr,clr,final=[results[r['operation_id']] for r in (initial,third,changed,done,closed,last)]
        by_label={r['target']['label']:r for r in imports}
        if set(by_label)!=set(LABELS):raise ValueError('exact_import_labels')
        imports=[by_label[label] for label in LABELS];files=[(WORK/'fixtures/union'/name).read_bytes() for name in FIXTURES]
        for i,r in enumerate(imports):
            settings=r['parameters']['settings'];columns=[dict(name=n,label=n,type='integer' if j==1 else 'string',data_kind='Дискретный',used=True) for j,n in enumerate(NAMES[i])]
            actual=[{k:v for k,v in c.items() if k!='source_name' or v!=c.get('name')} for c in settings['columns']]
            check('import_contract_'+str(i),r['target']['kind']=='new' and r['target']['type']=='imports.text' and r['mode']=='delimited' and r['finish']=='execute' and actual==columns and settings['format']==dict(delimiter=';',decimal_separator='.',null_marker='NULL',text_qualifier='"') and all(settings['source'][k]==v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()))
            checks['import_config_'+str(i)]=verify_configuration_readback(events,r)
        check('exact_read_mode',all(r['read']['ports']==[0] and r['read']['require_exact_numbers'] is True for r,count in list(zip(imports,[3,2,2]))+[(initial,5),(third,7),(changed,7)]+[(r,3) for r in again]+[(last,7)]))
        links=[dict(source=results[r['operation_id']]['node'],output=0,input=i) for i,r in enumerate(imports)]
        check('initial_union',initial['target']['kind']=='new' and initial['target']['type']=='transform.union_data' and initial['target']['label']=='Результат' and initial['finish']=='execute' and table_declaration(initial,2) and initial['inputs']==links[:2])
        check('third_union',third['target']['kind']=='existing' and third['target']['type']=='transform.union_data' and third['target']['ref']==jr['node']==tr['node'] and third['finish']=='execute' and table_declaration(third,3) and third['inputs'] in (links[2:],links))
        checks['third_graph_delta']=verify_third_input(events,third)
        check('changed_union',changed['target']['kind']=='existing' and changed['target']['type']=='transform.union_data' and changed['target']['ref']==tr['node']==cr['node'] and changed['inputs'] in ([],links) and changed['finish']=='execute' and table_declaration(changed,3,True))
        checks['changed_graph_unchanged']=verify_unchanged_inputs(events,changed)
        rb=cr['configuration']['readback'];input1=rb['input_mappings'][1];output=rb['output_mapping']
        check('changed_layout',input1['autosync'] is False and [(f['name'],f['label'],f['source_name']) for f in input1['fields']]==[('SourceKey','Same','Key'),('Memo','Same','Memo'),('Value','Same','Value')] and output['autosync'] is False and [(f['name'],f['label'],f['source_name']) for f in output['fields'] if not f['excluded']]==[('Comment','Same','Note'),('Identifier','Same','Code'),('Sum','Same','Amount')] and [(f['name'],f['label'],f['source_name']) for f in output['fields'] if f['excluded']]==[('Extra','Extra','Extra')])
        for key,r,count,alias in [('initial_output',initial,2,False),('third_output',third,3,False),('changed_output',changed,3,True),('persisted_output',last,3,True)]:checks[key]=output_contract(events,r,count,alias)
        for r in (initial,third,changed,done,last):checks[r['operation_id']+'_config']=verify_union_configuration(events,r)
        for r,res,finish in [(done,dr,'done'),(closed,clr,'close')]:
            seq=verify_internal_sequence(events,r['operation_id'],max_steps=4096)
            check(finish+'_semantics',not seq['failures'] and r['target']['ref']==cr['node'] and union_unchanged_parameters(r['parameters'],changed['parameters']) and r['inputs']==[] and r['mappings']==[] and r['finish']==finish and res['execution']['status']=='not_requested' and res['output']['status']=='not_refreshed' and (finish!='close' or res['configuration']['status']=='discarded'))
        deliveries=[c for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_deliver'];check('three_delivery_operations',len({c['arguments']['operation_id'] for c in deliveries})==3)
        before=min(c['row'] for c in deliveries);early=dict(evidence,calls=[c for c in evidence['calls'] if c['row']<before],tools=[r for r in evidence['tools'] if r['row']<before]);prep_ids={c['arguments'].get('operation_id','prepare') for c in early['calls'] if c['tool']==PREFIX+'dock_prepare'}
        early['events']=[e for e in events if e.get('event')!='workspace_prepared' or e.get('state',{}).get('operation_id') in prep_ids]
        prepared=verified_prepare_v1(early,PREFIX,deliveries[0]['session_id'],before);check('owned_draft',prepared is not None)
        if prepared is None:return report(checks)
        check('journal_pins',all(e.get('session_id')==prepared['sessionId'] and e.get('runtime_revision')==request['runtime_source_pin']['client_revision'] and e.get('manifest_sha256')==MANIFEST_SHA for e in events))
        for i,r in enumerate(imports):
            op=r['parameters']['source']['upload_operation_id'].removesuffix(':upload')
            calls=[c for c in evidence['calls'] if c['tool'] not in (PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status') or c['arguments'].get('operation_id')==op];ids={(c['session_id'],c['tool_call_id']) for c in calls}
            subset=dict(evidence,calls=calls,tools=[t for t in evidence['tools'] if (t['session_id'],t['tool_call_id']) in ids]);delivery=verify_public_delivery(subset,r,prepared);checks['delivery_'+str(i)]=delivery
            if delivery['passed']:checks['source_bytes_'+str(i)]=verify_delivered_import_output(events,r,files[i],delivery['delivery'],request['runtime_source_pin']['client_revision'])
        saves=[e for e in events if e.get('phase')=='completed' and e.get('action_key') in SAVE_REVISIONS]
        checks['public_calls']=verify_public_nodes_and_saves(evidence,{r['operation_id']:r for r in requests},[e['operation_id'] for e in saves],allow_validation_refusals=True)
        ports=[dict(node_label=n,tids=[n+';Input_Connection[0]',n+';Input_Var[0]',n+';Output_Data[0]']) for n in LABELS]+[dict(node_label='Результат',tids=['Результат;Input_Add','Результат;Input_Data[0]','Результат;Input_Data[1]','Результат;Input_Data[2]','Результат;Output_Data[0]'])]
        graph=dict(nodes=sorted(LABELS+['Результат']),ports=sorted(ports,key=lambda p:p['node_label']),links=sorted(n+'|Output_Data[0]|Результат|Input_Data['+str(i)+']' for i,n in enumerate(LABELS)))
        checks['save_chain']=verify_save_chain(events,imports[0],path,SAVE_REVISIONS,expected_graphs=[graph,graph],stages=[('package.save_checkpoint',path,False),('package.save_as',path,True)])
        later={r['target']['ref']['node_id']:r for r in again};pairs=[(r,later[results[r['operation_id']]['node']['node_id']]) for r in imports]
        if checks['save_chain']['passed']:
            save_id=checks['save_chain']['save_operation_ids'][-1]
            for i,(a,b) in enumerate(pairs+[(changed,last)]):checks['reopen_binding_'+str(i)]=verify_reopen_binding(evidence,a,b,save_id,path,union=i==3)
        for i,(a,b) in enumerate(pairs):checks['persisted_import_'+str(i)]=_verify_existing_import_output(events,a,b,files[i],reopened_package=True)
        check('persisted_settings',persisted_equal(cr,dr) and persisted_equal(cr,final) and cr['node']['node_id']==final['node']['node_id'] and cr['execution']['execution_id']!=final['execution']['execution_id'])
        for r in requests:checks[r['operation_id']+'_workflow']=verify_workflow_activation(events,r)
        check('all_gates_present',all(k in checks for k in ('source_bytes_0','source_bytes_1','source_bytes_2','reopen_binding_3','persisted_import_0','persisted_import_1','persisted_import_2')))
    except (KeyError,TypeError,ValueError,IndexError,AttributeError) as e:checks['malformed_evidence']=dict(passed=False,error=str(e))
    return report(checks)

def audit_directory(directory):
    request=json.loads((directory/'request.json').read_text());evidence=json.loads((directory/'evidence.json').read_text());result=audit(request,evidence,(directory/'scenario.txt').read_text());hashes=request['harness_inputs']
    required={p.name for pattern in ('*.py','*.mjs') for p in WORK.glob(pattern)}|{'goals/union-node-complete.txt'}|{'fixtures/union/'+n for n in FIXTURES}
    result['checks']['frozen_harness']=dict(passed=required<=set(hashes) and all((WORK/name).resolve().is_relative_to(WORK) and (WORK/name).is_file() and hashlib.sha256((WORK/name).read_bytes()).hexdigest()==sha for name,sha in hashes.items()))
    result['checks']['current_runtime_pin']=dict(passed=runtime_pin(ROOT)==request['runtime_source_pin']);return report(result['checks'])
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);a=p.parse_args();r=audit_directory(a.run_dir);(a.run_dir/'union-node-audit.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(passed=r['passed'],failures=[k for k,v in r['checks'].items() if not v['passed']])));raise SystemExit(0 if r['passed'] else 1)
