"""Independent autonomous Join scenario audit; other matrix gates remain separate."""
import argparse,hashlib,json,re
from copy import deepcopy
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
from node_apply_reopen_binding import verify_reopen_binding
from node_apply_save_chain import verify_save_chain
from workflow_activation_evidence import verify_workflow_activation
from node_efficiency import node_efficiency
from user_result_evidence import normalize_user_evidence
from join_configuration_evidence import verify_join_configuration
from grouping_output_evidence import verify_grouping_output
from node_procedure_evidence import verify_internal_sequence
from join_upload_probe import FIXTURES,descriptors,prompt as render_prompt,MANIFEST_URI,MANIFEST_SHA
from join_oracle import expected
import join_review_upload_probe
import join_upload_probe
WORK=Path(__file__).resolve().parent;ROOT=WORK.parents[1]
def persisted_settings_equal(before,after,*,allow_key_promotion=False):
    def semantics(res):return {k:deepcopy(v) for k,v in res['configuration']['readback'].items() if k not in ('node','receipt_ids')}
    a,b=semantics(before),semantics(after)
    if allow_key_promotion:
        # Loginom 7.4.2 serializes autosynchronized Join inputs with keys first.
        # Only that stable partition is allowed; aliases, links, flags and the
        # entire ordered output mapping still require exact equality.
        for port,mapping in enumerate(a['input_mappings']):
            observed=b['input_mappings'][port]
            if mapping['autosync'] is True:
                keys={k['left' if port==0 else 'right'] for k in a['keys']}
                fields=mapping['fields'];ordered=[f for f in fields if f['name'] in keys]+[f for f in fields if f['name'] not in keys]
                promoted=[dict(f,index=i) for i,f in enumerate(ordered)]
                if observed['fields']==promoted:mapping['fields']=promoted
    return a==b

def report(checks):return dict(passed=bool(checks) and all(v.get('passed') is True for v in checks.values()),checks=checks,scope='join-node-complete-scenario',subplan_complete=False)
def audit(request,evidence,prompt):
    evidence,projection=normalize_user_evidence(evidence)
    checks={'user_result_projection':projection}
    if not projection['passed']:return report(checks)
    def check(k,v):checks[k]=dict(passed=bool(v))
    try:
        review=request.get('goal_id')=='join-review-complete';goal_id='join-review-complete' if review else 'join-node-complete'
        probe=join_review_upload_probe if review else join_upload_probe;fixture_dir='fixtures/join-review' if review else 'fixtures/join'
        run_id=request['run_id'];directory=request['storage_directory'];path=directory+'/packages/Dock-acceptance-'+run_id+'.lgp';goal=WORK/'goals'/(goal_id+'.txt')
        check('goal_identity',request.get('goal_id')==goal_id and re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id) and evidence.get('run_id')==run_id and request['package_path']==path)
        check('goal_prompt',prompt==probe.prompt(goal.read_text(),path,directory,run_id) and request['goal_sha256']==hashlib.sha256(goal.read_bytes()).hexdigest())
        check('two_artifacts',request['input_artifacts']==probe.descriptors(run_id,directory))
        check('model',model_completed(request,evidence))
        check('complete_frozen_export',evidence.get('export_complete') is True and evidence.get('runtime_source_unchanged') is True and evidence.get('harness_unchanged') is True and evidence.get('native_skill_unchanged') is True and request['fault_injection'] is False)
        check('catalog',request['manifest_uri']==MANIFEST_URI and request['manifest_sha256']==MANIFEST_SHA)
        check('native_skill',request['native_skill']['sha256']==request['runtime_source_pin']['inputs'].get('plugins/loginom-dock-hermes/skills/loginom/SKILL.md'))
        efficiency=node_efficiency(evidence);check('efficiency',evidence.get('efficiency')==efficiency and efficiency['usage_complete'] and efficiency['phases_complete'])
        allowed=KNOWLEDGE_TOOLS|{PREFIX+n for n in ('dock_prepare','dock_action_describe','dock_workspace_observe','dock_diagnostics','dock_operation_inspect','dock_node_apply','dock_node_status','dock_node_wait','dock_artifact_deliver','dock_artifact_delivery_status','dock_action_run')}
        check('no_ui_fallback',all(c['tool'] in allowed for c in evidence['calls']))
        check('knowledge_scope',all(knowledge_scope(c) for c in evidence['calls'] if c['tool'] in KNOWLEDGE_TOOLS))
        events=evidence['events'];requests=[e['request'] for e in events if e.get('phase')=='node_apply_prepared'];check('nine_operations',len(requests)==9)
        if len(requests)!=9:return report(checks)
        left,right,initial,changed,done,closed,left2,right2,join2=requests
        def result(r):
            xs=[e['result'] for e in events if e.get('operation_id')==r['operation_id'] and e.get('phase')=='node_checkpoint']
            if len(xs)!=1 or xs[0]['status']!='SUCCEEDED':raise ValueError('unique_successful_checkpoint')
            return xs[0]
        results=[result(r) for r in requests];lr,rr,jr,cr,dr,clr,l2r,r2r,j2r=results
        files=[(WORK/fixture_dir/name).read_bytes() for name in probe.FIXTURES]
        for i,(r,label,names) in enumerate([(left,'Левая',['LKey','Part','LValue']),(right,'Правая',['RKey','PartR','RValue'])]):
            names=[('L' if i==0 else 'R')+str(n).zfill(2) for n in range(1,41)] if review else names
            settings=r['parameters']['settings'];columns=[dict(name=n,label=n,type='integer' if not review and j==1 else 'string',data_kind='Дискретный',used=True) for j,n in enumerate(names)]
            check('import_contract_'+str(i),r['target']['kind']=='new' and r['target']['type']=='imports.text' and r['target']['label']==label and r['mode']=='delimited' and r['finish']=='execute' and [{k:v for k,v in c.items() if k!='source_name' or v!=c.get('name')} for c in settings['columns']]==columns and settings['format']==dict(delimiter=';',decimal_separator='.',null_marker='NULL',text_qualifier='"') and all(settings['source'][k]==v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()))
            checks['import_config_'+str(i)]=verify_configuration_readback(events,r)
        if review:
            check('exact_read_mode',all(r['read']==dict(ports=[0],sample_rows=1,require_exact_numbers=True) for r in (left,right,initial,changed,left2,right2,join2)))
            check('initial_join',initial['target']['kind']=='new' and initial['target']['label']=='Результат' and initial['target']['type']=='transform.join_data' and initial['mode']=='inner' and initial['parameters']==dict(keys=[dict(left='L40',right='R40')],case_sensitive=True,include_joined_keys=True) and initial['finish']=='execute')
            links=[dict(source=lr['node'],output=0,input=0),dict(source=rr['node'],output=0,input=1)]
            check('source_edges',initial['inputs']==links and changed['inputs']==[])
            check('changed_join',changed['target']['kind']=='existing' and changed['target']['ref']==jr['node']==cr['node'] and changed['mode']=='left' and changed['parameters']==dict(keys=[dict(left='L39',right='R39')],case_sensitive=True,include_joined_keys=False) and changed['finish']=='execute' and changed['mappings']==[])
            def layout(res,right_names):
                rb=res['configuration']['readback'];fields=rb['output_mapping']['fields']
                return ([f['name'] for f in fields if not f['excluded']]==['L'+str(n).zfill(2) for n in range(2,41)]+['RightText']+right_names
                    and [(f['name'],f['source_name']) for f in fields if f['excluded']]==[('L01','L01')] and rb['output_mapping']['autosync'] is False)
            check('initial_layout',layout(jr,['R'+str(n).zfill(2) for n in range(2,41)]))
            check('changed_layout',layout(cr,['R'+str(n).zfill(2) for n in range(2,41) if n!=39]))
            for key,r,mode,keys,include in [('initial_output',initial,'inner',[('L40','R40')],True),('changed_output',changed,'left',[('L39','R39')],False),('persisted_output',join2,'left',[('L39','R39')],False)]:
                c,rows=expected(*files,keys,mode,True,include)
                keep=[i for i,f in enumerate(c) if f['name']!='L01'];rows=[[row[i] for i in keep] for row in rows];c=[dict(f,name='RightText',label='RightText') if f['name']=='R01' else f for i,f in enumerate(c) if i in keep]
                checks[key]=verify_grouping_output(events,r,c,rows)
            for r in (initial,changed,done,join2):checks[r['operation_id']+'_config']=verify_join_configuration(events,r)
        else:
            check('initial_join',initial['target']['kind']=='new' and initial['target']['label']=='Результат' and initial['target']['type']=='transform.join_data' and initial['mode']=='inner' and initial['parameters']==dict(keys=[dict(left='LKey',right='RKey')],case_sensitive=True,include_joined_keys=False) and initial['finish']=='execute')
            links=[dict(source=lr['node'],output=0,input=0),dict(source=rr['node'],output=0,input=1)]
            check('source_edges',initial['inputs']==links and changed['inputs'] in ([],links))
            check('changed_join',changed['target']['ref']==jr['node']==cr['node'] and changed['mode']=='left' and changed['parameters']==dict(keys=[dict(left='KeyLeft',right='KeyRight'),dict(left='Part',right='PartR')],case_sensitive=False,include_joined_keys=True) and changed['finish']=='execute')
            rb=cr['configuration']['readback'];check('changed_layout',[f['name'] for f in rb['output_mapping']['fields'] if not f['excluded']]==['RightText','KeyLeft','LValue','KeyRight','PartR'] and [(f['name'],f['source_name']) for f in rb['output_mapping']['fields'] if f['excluded']]==[('Part','Part')] and rb['output_mapping']['autosync'] is False and all(v['autosync'] is False for v in rb['input_mappings']))
            for r in (initial,changed,done,join2):checks[r['operation_id']+'_config']=verify_join_configuration(events,r)
            c,rows=expected(*files,[('LKey','RKey')],'inner',True,False);checks['initial_output']=verify_grouping_output(events,initial,c,rows)
            c,rows=expected(*files,[('LKey','RKey'),('Part','PartR')],'left',False,True)
            selected=[5,0,2,3,4];columns=[{**c[i],'name':n,'label':n} for i,n in zip(selected,['RightText','KeyLeft','LValue','KeyRight','PartR'])];rows=[[r[i] for i in selected] for r in rows]
            for key,r in [('changed_output',changed),('persisted_output',join2)]:checks[key]=verify_grouping_output(events,r,columns,rows)
        for r,res,finish in [(done,dr,'done'),(closed,clr,'close')]:
            seq=verify_internal_sequence(events,r['operation_id'],max_steps=4096)
            check(finish+'_semantics',not seq['failures'] and r['target']['ref']==cr['node'] and r['parameters']=={} and r['inputs']==[] and r['mappings']==[] and r['finish']==finish and res['execution']['status']=='not_requested' and res['output']['status']=='not_refreshed' and (finish!='close' or res['configuration']['status']=='discarded'))
        deliveries=[c for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_deliver'];check('two_delivery_operations',len({c['arguments']['operation_id'] for c in deliveries})==2)
        before=min(c['row'] for c in deliveries);early=dict(evidence,calls=[c for c in evidence['calls'] if c['row']<before],tools=[r for r in evidence['tools'] if r['row']<before]);prep_ids={c['arguments'].get('operation_id','prepare') for c in early['calls'] if c['tool']==PREFIX+'dock_prepare'}
        early['events']=[e for e in events if e.get('event')!='workspace_prepared' or e.get('state',{}).get('operation_id') in prep_ids]
        prepared=verified_prepare_v1(early,PREFIX,deliveries[0]['session_id'],before);check('owned_draft',prepared is not None)
        if prepared is None:return report(checks)
        check('journal_pins',all(e.get('session_id')==prepared['sessionId'] and e.get('runtime_revision')==request['runtime_source_pin']['client_revision'] and e.get('manifest_sha256')==MANIFEST_SHA for e in events))
        for i,r in enumerate((left,right)):
            op=r['parameters']['source']['upload_operation_id'].removesuffix(':upload')
            selected_calls=[c for c in evidence['calls'] if c['tool'] not in (PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status') or c['arguments'].get('operation_id')==op];ids={(c['session_id'],c['tool_call_id']) for c in selected_calls}
            subset=dict(evidence,calls=selected_calls,tools=[t for t in evidence['tools'] if (t['session_id'],t['tool_call_id']) in ids]);delivery=verify_public_delivery(subset,r,prepared);checks['delivery_'+str(i)]=delivery
            if delivery['passed']:checks['source_bytes_'+str(i)]=verify_delivered_import_output(events,r,files[i],delivery['delivery'],request['runtime_source_pin']['client_revision'])
        saves=[e for e in events if e.get('phase')=='completed' and e.get('action_key') in SAVE_REVISIONS]
        checks['public_calls']=verify_public_nodes_and_saves(evidence,{r['operation_id']:r for r in requests},[e['operation_id'] for e in saves],allow_validation_refusals=True)
        ports=[dict(node_label=n,tids=[n+';Input_Connection[0]',n+';Input_Var[0]',n+';Output_Data[0]']) for n in ['Левая','Правая']]+[dict(node_label='Результат',tids=['Результат;Input_Data[0]','Результат;Input_Data[1]','Результат;Output_Data[0]'])]
        graph=dict(nodes=['Левая','Правая','Результат'],ports=ports,links=['Левая|Output_Data[0]|Результат|Input_Data[0]','Правая|Output_Data[0]|Результат|Input_Data[1]'])
        checks['save_chain']=verify_save_chain(events,left,path,SAVE_REVISIONS,expected_graphs=[graph,graph],stages=[('package.save_checkpoint',path,False),('package.save_as',path,True)])
        if checks['save_chain']['passed']:
            save_id=checks['save_chain']['save_operation_ids'][-1]
            for i,(a,b) in enumerate([(left,left2),(right,right2),(changed,join2)]):checks['reopen_binding_'+str(i)]=verify_reopen_binding(evidence,a,b,save_id,path,join=i==2)
        for i,(a,b) in enumerate([(left,left2),(right,right2)]):checks['persisted_import_'+str(i)]=_verify_existing_import_output(events,a,b,files[i],reopened_package=True)
        check('persisted_settings',persisted_settings_equal(cr,dr) and persisted_settings_equal(cr,j2r,allow_key_promotion=review) and cr['node']['node_id']==j2r['node']['node_id'] and cr['execution']['execution_id']!=j2r['execution']['execution_id'])
        for r in requests:checks[r['operation_id']+'_workflow']=verify_workflow_activation(events,r)
        check('all_gates_present',all(k in checks for k in ('source_bytes_0','source_bytes_1','reopen_binding_2','persisted_import_0','persisted_import_1')))
    except (KeyError,TypeError,ValueError,IndexError,AttributeError) as e:checks['malformed_evidence']=dict(passed=False,error=str(e))
    return report(checks)
def audit_directory(directory):
    request=json.loads((directory/'request.json').read_text());evidence=json.loads((directory/'evidence.json').read_text());result=audit(request,evidence,(directory/'scenario.txt').read_text());hashes=request['harness_inputs']
    review=request.get('goal_id')=='join-review-complete';probe=join_review_upload_probe if review else join_upload_probe;fixture_dir='fixtures/join-review' if review else 'fixtures/join'
    required={p.name for pattern in ('*.py','*.mjs') for p in WORK.glob(pattern)}|{'goals/'+('join-review-complete' if review else 'join-node-complete')+'.txt'}|{fixture_dir+'/'+n for n in probe.FIXTURES}
    result['checks']['frozen_harness']=dict(passed=required<=set(hashes) and all((WORK/name).resolve().is_relative_to(WORK) and (WORK/name).is_file() and hashlib.sha256((WORK/name).read_bytes()).hexdigest()==sha for name,sha in hashes.items()))
    result['checks']['current_runtime_pin']=dict(passed=runtime_pin(ROOT)==request['runtime_source_pin']);return report(result['checks'])
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);a=p.parse_args();r=audit_directory(a.run_dir);(a.run_dir/'join-node-audit.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(passed=r['passed'],failures=[k for k,v in r['checks'].items() if not v['passed']])));raise SystemExit(0 if r['passed'] else 1)
