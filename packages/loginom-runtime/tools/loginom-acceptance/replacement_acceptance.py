"""Independent autonomous Node 11 goal audit; no model or browser is launched here."""
import argparse, hashlib, json
from pathlib import Path
from audit import knowledge_scope
from evidence import PREFIX, KNOWLEDGE_TOOLS
from preflight import runtime_pin
from prepare_binding import verified_prepare_v1
from grouping_node_acceptance import model_completed
from node_public_acceptance_evidence import verify_public_nodes_and_saves, verify_public_delivery
from artifact_delivery_evidence import verify_delivered_import_output
from node_configuration_evidence import verify_configuration_readback
from existing_import_evidence import _verify_existing_import_output
from node_apply_save_chain import verify_save_chain
from node_apply_reopen_binding import verify_reopen_binding
from user_result_evidence import normalize_user_evidence
from replacement_session_evidence import verify_session_evidence
from replacement_evidence_audit import audit as operation_audit
from replacement_persistence_evidence import verify_persistence
from replacement_configuration_evidence import normalized
from replacement_lifecycle_evidence import checkpoint
from replacement_upload_probe import FIXTURES, descriptors, prompt as render_prompt, validate_catalog
WORK=Path(__file__).resolve().parent
ROOT=WORK.parents[1]
CODE='b05715340937f9c828e03bc6ec7a88f3adf086da'
RUNTIME='8d6d4b3cd7f5d19a3ac1e9ac6537ff8219f97f9898326227df3f3ae55dcb1380'
DOCK_SKILL='afa295bf48dc48da5d3c995665a06ef2190ff620bae3243d46557e0371536790'
FIX=WORK/'fixtures/replacement'
load=lambda name:json.loads((FIX/name).read_text())
def graph():
    ports=[dict(node_label=n,tids=[n+s for s in (';Input_Connection[0]',';Input_Var[0]',';Output_Data[0]')]) for n in ('Main','Partial')]
    ports += [dict(node_label=n,tids=[n+s for s in (';Input_Add',';Input_Data[0]',';Output_Data[0]')]) for n in ('Typed','Preserved')]
    return dict(nodes=sorted(['Main','Partial','Typed','Preserved']),ports=sorted(ports,key=lambda p:p['node_label']),links=sorted(['Main|Output_Data[0]|Typed|Input_Data[0]','Partial|Output_Data[0]|Preserved|Input_Data[0]']))
def string_rule(name,old,new):
    return dict(field=dict(kind='input_field',name=name),type='string',case_sensitive=True,pairs=[{'from':dict(type='string',value=old),'to':dict(type='string',value=new)}],other=dict(mode='keep'))
def semantic_rules(rules):return sorted([normalized(r) for r in rules],key=lambda r:r['field']['name'])
def report(checks):return dict(passed=bool(checks) and all(x.get('passed') is True for x in checks.values()),checks=checks,scope='node11_typed_partial_mode_switch_and_persistence',autonomous_acceptance=bool(checks) and all(x.get('passed') is True for x in checks.values()),subplan_complete=False)
def audit(request,evidence,prompt,pin):
    evidence,projection=normalize_user_evidence(evidence);checks={'public_projection':projection}
    def check(k,v):checks[k]=dict(passed=bool(v))
    try:
        validate_catalog(pin['manifest_uri'],pin['manifest_sha256'],'/test-2')
        check('coordinator_stage_pin',pin['staged'] is True and pin['readback_verified'] is True and pin['activated'] is False and pin['code_commit']==CODE and pin['runtime_revision']==RUNTIME and request['manifest_uri']==pin['manifest_uri'] and request['manifest_sha256']==pin['manifest_sha256'])
        goal=WORK/'goals/replacement-node-complete.txt';path=request['package_path'];run_id=request['run_id'];directory=request['storage_directory']
        check('goal',request['goal_id']=='replacement-node-complete' and directory=='/test-2' and path==directory+'/packages/Dock-acceptance-'+run_id+'.lgp' and request['goal_sha256']==hashlib.sha256(goal.read_bytes()).hexdigest() and prompt==render_prompt(goal.read_text(),path,directory,run_id) and evidence['run_id']==run_id)
        check('model',model_completed(request,evidence))
        check('frozen_export',all(evidence.get(k) is True for k in ('export_complete','runtime_source_unchanged','harness_unchanged','native_skill_unchanged')) and request['fault_injection'] is False and request['runtime_source_pin']['client_revision']==RUNTIME)
        check('native_skill',request['native_skill']['sha256']==request['runtime_source_pin']['inputs']['plugins/loginom-dock-hermes/skills/loginom/SKILL.md'])
        check('artifacts',request['input_artifacts']==descriptors(run_id,directory))
        allowed=KNOWLEDGE_TOOLS|{PREFIX+n for n in ('dock_prepare','dock_action_describe','dock_workspace_observe','dock_diagnostics','dock_node_apply','dock_node_status','dock_node_wait','dock_artifact_deliver','dock_artifact_delivery_status','dock_action_run')}
        check('ordinary_dock_only',all(c['tool'] in allowed for c in evidence['calls']) and all(knowledge_scope(c) for c in evidence['calls'] if c['tool'] in KNOWLEDGE_TOOLS))
        events=evidence['events'];rs=[e['request'] for e in events if e.get('phase')=='node_apply_prepared']
        check('eleven_operations',len(rs)==11)
        if len(rs)!=11:return report(checks)
        imports=rs[:2];typed,initial,partial,to_replace,to_add=rs[2:7];again=rs[7:9];typed_after,partial_after=rs[9:]
        results={r['operation_id']:checkpoint(events,r['operation_id']) for r in rs}
        result=lambda r:results[r['operation_id']]
        check('initial_labels',[r['target'].get('label') for r in rs[:4]]==['Main','Partial','Typed','Preserved'] and all(r['target']['kind']=='new' for r in rs[:4]))
        check('exact_reads',all(r['finish']=='execute' and r['read']['ports']==[0] and r['read']['require_exact_numbers'] is True for r in rs))
        declarations=[load('parameters-multi.json'),dict(output_mode='add',rules=[string_rule('B','old','New')]),dict(rules=[string_rule('C','stay','Stayed')]),dict(output_mode='replace'),dict(output_mode='add')]
        for i,(r,wanted) in enumerate(zip(rs[2:7],declarations)):
            p=dict(r['parameters']);rules=p.pop('rules',None);w=dict(wanted);wr=w.pop('rules',None)
            check('requested_parameters_'+str(i),p==w and ((rules is None and wr is None) or (rules is not None and wr is not None and semantic_rules(rules)==semantic_rules(wr))))
            check('replacement_contract_'+str(i),r['target']['type']=='transform.replace_columns' and r['mode']=='exact')
        for node,source in [(typed,imports[0]),(initial,imports[1])]:check('link_'+node['target']['label'],node['inputs']==[dict(source=result(source)['node'],output=0,input=0)])
        for r in rs[4:7]:check('partial_identity_'+r['operation_id'],r['target']['kind']=='existing' and r['target']['ref']==result(initial)['node'] and r['inputs']==[])
        expected=['expected-multi.json','expected-partial-before2.json','expected-partial-add.json','expected-partial-replace.json','expected-partial-add.json']
        for i,(r,file) in enumerate(zip(rs[2:7],expected)):
            checks['output_'+r['operation_id']]=operation_audit(events,r,load(file))
            rb=result(r)['configuration']['readback']
            rules=declarations[0]['rules'] if i==0 else [string_rule('B','old','New')]+([] if i==1 else [string_rule('C','stay','Stayed')])
            check('effective_settings_'+str(i),semantic_rules(rb['rules'])==semantic_rules(rules)
                  and rb['output_mode']==('replace' if i==3 else 'add')
                  and rb['input_mapping']['autosync'] is True and rb['output_mapping']['autosync'] is False)

        deliveries=[c for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_deliver'];check('two_deliveries',len({c['arguments']['operation_id'] for c in deliveries})==2)
        before=min(c['row'] for c in deliveries);early=dict(evidence,calls=[c for c in evidence['calls'] if c['row']<before],tools=[t for t in evidence['tools'] if t['row']<before]);prep_ids={c['arguments'].get('operation_id','prepare') for c in early['calls'] if c['tool']==PREFIX+'dock_prepare'}
        early['events']=[e for e in events if e.get('event')!='workspace_prepared' or e.get('state',{}).get('operation_id') in prep_ids]
        prepared=verified_prepare_v1(early,PREFIX,deliveries[0]['session_id'],before);check('owned_draft',prepared is not None)
        if prepared is None:return report(checks)
        check('runtime_target',bool(request.get('loginom_url')) and prepared['loginomUrl']==request['loginom_url'] and all(e.get('session_id')==prepared['sessionId'] and e.get('runtime_revision')==RUNTIME and e.get('manifest_sha256')==pin['manifest_sha256'] for e in events))
        for i,(r,file) in enumerate(zip(imports,FIXTURES)):
            s=r['parameters']['settings'];names=['Id','Category','Code','Amount','Keep'] if i==0 else ['A','A_Replace','B','C'];types=['integer','string','integer','real','string'] if i==0 else ['string']*4
            wanted=[dict(name=n,label=n,type=t,data_kind='Непрерывный' if t=='real' else 'Дискретный',used=True) for n,t in zip(names,types)]
            cols=[{k:v for k,v in c.items() if k!='source_name' or v!=c.get('name')} for c in s['columns']]
            check('import_contract_'+str(i),r['target']['type']=='imports.text' and r['mode']=='delimited' and cols==wanted and s['format']==dict(delimiter=';',decimal_separator='.',null_marker='NULL',text_qualifier='"') and all(s['source'][k]==v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()))
            checks['import_config_'+str(i)]=verify_configuration_readback(events,r)
            op=r['parameters']['source']['upload_operation_id'].removesuffix(':upload');calls=[c for c in evidence['calls'] if c['tool'] not in (PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status') or c['arguments'].get('operation_id')==op];ids={(c['session_id'],c['tool_call_id']) for c in calls}
            subset=dict(evidence,calls=calls,tools=[t for t in evidence['tools'] if (t['session_id'],t['tool_call_id']) in ids]);delivery=verify_public_delivery(subset,r,prepared);checks['delivery_'+str(i)]=delivery
            if delivery['passed']:checks['source_'+str(i)]=verify_delivered_import_output(events,r,(FIX/file).read_bytes(),delivery['delivery'],RUNTIME)
        revisions=pin['save_revisions'];saves=[e for e in events if e.get('phase')=='completed' and e.get('action_key') in revisions];save_ids=[e['operation_id'] for e in saves]
        checks['public_calls']=verify_public_nodes_and_saves(evidence,{r['operation_id']:r for r in rs},save_ids,allow_validation_refusals=True)
        checks['save_chain']=verify_save_chain(events,imports[0],path,revisions,expected_graphs=[graph(),graph()],stages=[('package.save_checkpoint',path,False),('package.save_as',path,True)])
        for i,(a,b) in enumerate(zip(imports,again)):
            checks['import_reopen_'+str(i)]=verify_reopen_binding(evidence,a,b,save_ids[-1],path)
            checks['import_persisted_'+str(i)]=_verify_existing_import_output(events,a,b,(FIX/list(FIXTURES)[i]).read_bytes(),reopened_package=True)
        for a,b,file in [(typed,typed_after,'expected-multi.json'),(to_add,partial_after,'expected-partial-add.json')]:
            states=[e['state'] for e in events if e.get('event')=='workspace_prepared' and e.get('state',{}).get('workflow_ref')==b['workflow_ref']]
            if len(states)!=1:raise ValueError('unique_reopen_preparation')
            checks['persistence_'+file]=verify_persistence(events,a,b,load(file),graph(),path,states[0],save_ids,revisions=revisions)
        check('required_gates',all(k in checks for k in ('source_0','source_1','persistence_expected-multi.json','persistence_expected-partial-add.json')))
    except (KeyError,TypeError,ValueError,IndexError,AttributeError,StopIteration) as e:checks['malformed_or_missing_evidence']=dict(passed=False,error=str(e))
    return report(checks)
def audit_directory(directory,pin):
    request=json.loads((directory/'request.json').read_text());evidence=json.loads((directory/'evidence.json').read_text())
    result=audit(request,evidence,(directory/'scenario.txt').read_text(),pin)
    hashes=request['harness_inputs'];result['checks']['harness_files']=dict(passed=bool(hashes) and all((WORK/n).is_file() and hashlib.sha256((WORK/n).read_bytes()).hexdigest()==v for n,v in hashes.items()))
    result['checks']['current_runtime']=dict(passed=runtime_pin(ROOT)==request['runtime_source_pin'])
    result['checks']['isolated_session_pins']=verify_session_evidence(directory,request,evidence,pin,DOCK_SKILL)
    return report(result['checks'])
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);p.add_argument('--candidate-pin',type=Path,required=True);a=p.parse_args();r=audit_directory(a.run_dir,json.loads(a.candidate_pin.read_text()));out=a.run_dir/'replacement-acceptance-audit.json'
    with out.open('x') as f:f.write(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(passed=r['passed'],failures=[k for k,v in r['checks'].items() if not v['passed']])));raise SystemExit(0 if r['passed'] else 1)
