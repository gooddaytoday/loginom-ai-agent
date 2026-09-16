"""Frozen autonomous review audit; checks all three Union regressions and persistence."""
import argparse, hashlib, json
from pathlib import Path
from union_node_acceptance import (knowledge_scope, PREFIX, KNOWLEDGE_TOOLS, runtime_pin,
    verified_prepare_v1, model_completed, SAVE_REVISIONS, verify_public_nodes_and_saves,
    verify_public_delivery, verify_delivered_import_output, verify_configuration_readback,
    _verify_existing_import_output, verify_reopen_binding, union_unchanged_parameters,
    verify_save_chain, verify_workflow_activation, node_efficiency, normalize_user_evidence,
    verify_calculator_output, verify_union_configuration, verify_unchanged_inputs, persisted_equal)
from user_result_evidence import project_action
from node_public_acceptance_evidence import paired_public_calls
from union_review_upload_probe import FIXTURES, descriptors, prompt as render_prompt, MANIFEST_URI, MANIFEST_SHA
WORK=Path(__file__).resolve().parent
ROOT=WORK.parents[1]
IMPORTS=['Главная','Широкая']
UNIONS=['Свободный','Длинный список','Много входов']
NAMES=[['A','B','C'],[f'F{i:02}' for i in range(40)]]

def report(checks):
    return dict(passed=bool(checks) and all(v.get('passed') is True for v in checks.values()),checks=checks,scope='union-review-complete',subplan_complete=False)

def parameters(label):
    fields=([dict(source=n,main=n) for n in NAMES[0]] if label==UNIONS[0] else
        [dict(source=n,main='A' if i==39 else 'B' if i==1 else 'C' if i==2 else None) for i,n in enumerate(NAMES[1])] if label==UNIONS[1] else
        [dict(source='C',main='A'),dict(source='A',main='B'),dict(source='B',main='C')])
    return dict(prefixes=dict(enabled=False,name='Union',label='Объединение'),tables=[dict(port=i,fields=fields) for i in range(1,8 if label==UNIONS[2] else 2)])

def expected(label):
    if label==UNIONS[0]:return NAMES[0],[['a','b','c']]*2
    if label==UNIONS[2]:return NAMES[0],[['a','b','c']]+[['c','a','b']]*7
    unmatched=[i for i in range(40) if i not in (1,2,39)]
    return NAMES[0]+[f'F{i:02}' for i in unmatched],[['a','b','c']+[None]*37,['v39','v01','v02']+[f'v{i:02}' for i in unmatched]]

def free_inputs(events,r):
    try:
        op=r['operation_id'];target=r['target']['ref']['node_id']
        state=[e['target_state'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_target_checkpoint'][-1]
        before,after=state['baseline'],state['final_graph']
        def nodes(g):return {n['ref']['node_id']:{k:v for k,v in n.items() if k!='dom_epoch'} for n in g['nodes']}
        b,a=nodes(before),nodes(after)
        joined=[i for i in r['inputs'] if i['input']==1]
        if len(joined)!=1:raise ValueError('free_input_request')
        edges=[dict(source=joined[0]['source']['node_id'],output=joined[0]['output'],target=target,input=1)]
        main=dict(edges[0],input=0)
        key=lambda e:(e['source'],e['output'],e['target'],e['input'])
        preview_events=[e for e in events if e.get('operation_id')==op and e.get('phase') in ('union_input_0_preflight_completed','union_input_1_preflight_completed')]
        previews=[e['proof'] for e in preview_events]
        passed=(state.get('completed') is True and state.get('pending') is None and before['complete'] and after['complete']
            and b==a and b[target]['label']==UNIONS[0] and b[target]['inputs']==[0,1]
            and [e for e in before['links'] if e['target']==target]==[main]
            and sorted(map(key,after['links']))==sorted(map(key,before['links']+edges))
            and before['foreign_links']==after['foreign_links'] and len(previews)==1
            and {e['phase'] for e in preview_events}=={'union_input_1_preflight_completed'}
            and all(p['verified'] and p['cleanup_complete'] and not p['settings_changed'] and p['parameters_valid'] for p in previews)
            and [x['kind'] for x in state['receipts']]==['connect']
            and all(x['verified'] and x['receipt']['status']=='SUCCEEDED' for x in state['receipts']))
        return dict(passed=bool(passed),scope='existing_free_input_connected_without_node_or_port_changes')
    except (KeyError,IndexError,TypeError,ValueError):return dict(passed=False,scope='existing_free_input_connected_without_node_or_port_changes')

def persisted_review_equal(a,b,label):
    if label!=UNIONS[1]:return persisted_equal(a,b)
    from copy import deepcopy
    x,y=deepcopy(a),deepcopy(b)
    try:
        old=x['configuration']['readback'];new=y['configuration']['readback']
        fields=old['input_mappings'][1]['fields'];actual=new['input_mappings'][1]['fields']
        names=[f['name'] for f in fields];mapped={'F01','F02','F39'}
        native=[n for n in names if n in mapped]+[n for n in names if n not in mapped]
        if [f['name'] for f in actual] not in (names,native):return False
        if len({f['name'] for f in actual})!=len(names):return False
        keyed={f['name']:f for f in actual}
        new['input_mappings'][1]['fields']=[dict(keyed[f['name']],index=f['index']) for f in fields]
        entries=new['tables'][0]['fields']
        if [f['source'] for f in entries] not in (names,native):return False
        keyed={f['source']:f for f in entries}
        if len(keyed)!=len(names):return False
        new['tables'][0]['fields']=[keyed[f['source']] for f in old['tables'][0]['fields']]
        return persisted_equal(x,y)
    except (KeyError,IndexError,TypeError):return False

def ui_reply_matches(reply,outcome):
    # UI replies page the recorded full observation after the action completes.
    # Bind every emitted item to that full observation, without requiring hidden
    # off-page records to be present in the public response.
    from copy import deepcopy
    expected=project_action(outcome) if reply.get('result_version')=='user-v1' else outcome
    a,b=deepcopy(reply),deepcopy(expected)
    if a==b:return True
    try:
        ao,bo=a.pop('output'),b.pop('output')
        if a!=b:return False
        if ao['origin'].rstrip('/')!=bo['origin'].rstrip('/'):return False
        for o in (ao,bo):
            for k in ('origin','page','observation_id','observation_revision'):o.pop(k,None)
        au,bu=ao.pop('ui'),bo.pop('ui')
        for item in bu.get('elements',[]):
            item.pop('bounding_box',None)
            if 'signature' in item:item['signature']={k:v for k,v in item['signature'].items() if k=='tag'}
            identity=item.get('identity',{})
            if item.get('tid') and identity.get('anchor_tid')==item['tid'] and identity.get('path')==[] and set(identity)<={'anchor_tid','path'}:item.pop('identity')
        if ao!=bo:return False
        au.pop('truncated',None);bu.pop('truncated',None)
        if set(au)!=set(bu):return False
        for key,items in au.items():
            if isinstance(items,list):
                if any(item not in bu[key] for item in items):return False
            elif items!=bu[key]:return False
        return True
    except (KeyError,TypeError,AttributeError):return False

def fixture_ui(evidence,seed,request):
    failures=[]
    try:
        events=evidence['events'];pairs,pair_failures=paired_public_calls(evidence);failures.extend(pair_failures)
        ui=[(c,r) for c,r in pairs if c['tool']==PREFIX+'dock_ui_action']
        if len(ui)!=3:raise ValueError('exact_three_fixture_clicks')
        target=request['target']['ref']['node_id'];prefix=request['workflow_ref']['prefix']
        tids=[prefix+';Graph;Главная|Output_Data-0|Свободный|Input_Data-1',prefix+';ModelForm;btnRemoveSelected','msgbox;tlb;yes']
        start=next(i for i,e in enumerate(events) if e.get('phase')=='node_checkpoint' and e.get('operation_id')==seed['operation_id'])
        stop=next(i for i,e in enumerate(events) if e.get('phase')=='node_apply_prepared' and e.get('operation_id')==request['operation_id'])
        previous=start
        for tid,(call,reply) in zip(tids,ui):
            args=call['arguments'];op=args['operation_id']
            begins=[(i,e) for i,e in enumerate(events) if e.get('phase')=='prepared' and e.get('operation_id')==op]
            ends=[(i,e) for i,e in enumerate(events) if e.get('phase')=='completed' and e.get('operation_id')==op]
            if len(begins)!=1 or len(ends)!=1:raise ValueError('fixture_ui_unique_receipts')
            bi,b=begins[0];ei,e=ends[0];out=e['outcome'];reply_value=reply['result']
            if not previous<bi<ei<stop:raise ValueError('fixture_ui_order')
            previous=ei
            if (b['action_key']!='ui.act' or b['action_revision']!='1' or e['checkpoint']!=b['checkpoint'] or e['parameters']!=b['parameters']
                or b['checkpoint']['target_tids']!=[tid] or b['parameters']['action']!=args['action'] or args['action']['verb']!='click'
                or set(args['action'])!={'verb','ref'} or b['parameters']['observation_id']!=args['observation_id']
                or b['parameters'].get('recovery_operation_id') is not None or out['status']!='SUCCEEDED' or out.get('cleanup_complete') is not True
                or not ui_reply_matches(reply_value,out)):raise ValueError('fixture_ui_bound_click')
            if tid=='msgbox;tlb;yes':
                observations=[r['result'].get('output',{}) for c,r in pairs if c['tool']==PREFIX+'dock_workspace_observe' and r['row']<call['row'] and r['result'].get('output',{}).get('observation_id')==args['observation_id']]
                if not any(any('Удалить выделенную связь?' in d.get('text','') for d in o.get('ui',{}).get('dialogs',[])) for o in observations):raise ValueError('fixture_single_link_confirmation')
        def final(r):return [e['target_state'] for e in events if e.get('phase')=='node_target_checkpoint' and e.get('operation_id')==r['operation_id']][-1]
        before=final(seed)['final_graph'];after=final(request)['baseline']
        def nodes(g):return {n['ref']['node_id']:{k:v for k,v in n.items() if k!='dom_epoch'} for n in g['nodes']}
        removed=[e for e in before['links'] if e['target']==target and e['input']==1]
        if len(removed)!=1 or nodes(before)!=nodes(after) or before['foreign_links']!=after['foreign_links']:raise ValueError('fixture_graph_identity')
        key=lambda e:(e['source'],e['output'],e['target'],e['input'])
        if sorted(map(key,after['links']))!=sorted(map(key,[e for e in before['links'] if e!=removed[0]])):raise ValueError('fixture_only_one_link_removed')
    except (KeyError,IndexError,TypeError,ValueError,StopIteration) as e:failures.append(str(e))
    return dict(passed=not failures,failures=failures,scope='three_authorized_fixture_clicks_no_configuration_fallback')

def audit(request,evidence,prompt):
    evidence,projection=normalize_user_evidence(evidence);checks={'user_result_projection':projection}
    if not projection['passed']:return report(checks)
    def check(k,v):checks[k]=dict(passed=bool(v))
    try:
        goal=WORK/'goals/union-review-complete.txt';path=request['package_path'];events=evidence['events']
        check('declared_goal',request['goal_id']=='union-review-complete' and request['goal_sha256']==hashlib.sha256(goal.read_bytes()).hexdigest() and prompt==render_prompt(goal.read_text(),path,request['storage_directory'],request['run_id']))
        check('goal_identity',evidence['run_id']==request['run_id'] and request['schema_version']==2 and path==request['storage_directory']+'/packages/Dock-acceptance-'+request['run_id']+'.lgp')
        check('model_completed',model_completed(request,evidence))
        check('frozen_export',all(evidence.get(k) is True for k in ('export_complete','runtime_source_unchanged','harness_unchanged','native_skill_unchanged')) and request['fault_injection'] is False)
        check('catalog',request['manifest_uri']==MANIFEST_URI and request['manifest_sha256']==MANIFEST_SHA)
        check('explicit_target',bool(request.get('loginom_url')) and all(t['result'].get('loginomUrl')==request['loginom_url'] for t in evidence['tools'] if t.get('tool')==PREFIX+'dock_prepare' and t['result'].get('prepared') is True))
        check('native_skill',request['native_skill']['sha256']==request['runtime_source_pin']['inputs'].get('plugins/loginom-dock-hermes/skills/loginom/SKILL.md'))
        check('artifact_descriptors',request['input_artifacts']==descriptors(request['run_id'],request['storage_directory']))
        efficiency=node_efficiency(evidence);check('efficiency',evidence.get('efficiency')==efficiency and efficiency['usage_complete'] and efficiency['phases_complete'])
        allowed=KNOWLEDGE_TOOLS|{PREFIX+n for n in ('dock_prepare','dock_action_describe','dock_workspace_observe','dock_diagnostics','dock_operation_inspect','dock_node_apply','dock_node_status','dock_node_wait','dock_artifact_deliver','dock_artifact_delivery_status','dock_action_run','dock_ui_action')}
        check('bounded_tools',all(c['tool'] in allowed for c in evidence['calls']))
        check('knowledge_scope',all(knowledge_scope(c) for c in evidence['calls'] if c['tool'] in KNOWLEDGE_TOOLS))
        requests=[e['request'] for e in events if e.get('phase')=='node_apply_prepared'];check('eleven_operations',len(requests)==11)
        if len(requests)!=11:return report(checks)
        def result(r):
            xs=[e['result'] for e in events if e.get('operation_id')==r['operation_id'] and e.get('phase')=='node_checkpoint']
            if len(xs)!=1 or xs[0]['status']!='SUCCEEDED':raise ValueError('unique_successful_checkpoint')
            return xs[0]
        results={r['operation_id']:result(r) for r in requests};seed=requests[2];initial=requests[:2]+requests[3:6];again=requests[6:]
        by_label={r['target']['label']:r for r in initial[:2]};check('import_labels',set(by_label)==set(IMPORTS));imports=[by_label[n] for n in IMPORTS]
        files=[(WORK/'fixtures/union-review'/f).read_bytes() for f in FIXTURES]
        for i,r in enumerate(imports):
            settings=r['parameters']['settings'];cols=[dict(name=n,label=n,type='string',data_kind='Дискретный',used=True) for n in NAMES[i]]
            check('import_declaration_'+str(i),r['target']['kind']=='new' and r['target']['type']=='imports.text' and r['mode']=='delimited' and [{k:v for k,v in c.items() if k!='source_name'} for c in settings['columns']]==cols and all(c.get('source_name',c['name'])==c['name'] for c in settings['columns']) and settings['format']==dict(delimiter=';',decimal_separator='.',null_marker='NULL',text_qualifier='"') and all(settings['source'][k]==v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()))
            checks['import_config_'+str(i)]=verify_configuration_readback(events,r)
        check('full_execute_contract',all(r['finish']=='execute' and r['read']['ports']==[0] and r['read']['require_exact_numbers'] is True and r['mappings']==[] for r in initial+again))
        sr=results[seed['operation_id']]
        check('closed_fixture',seed['target']['kind']=='new' and seed['target']['type']=='transform.union_data' and seed['target']['label']==UNIONS[0] and seed['finish']=='close' and seed['read']['ports']==[] and seed['mappings']==[] and union_unchanged_parameters(seed['parameters'],parameters(UNIONS[0])) and sr['configuration']['status']=='discarded' and sr['execution']['status']=='not_requested' and sr['output']['status']=='not_refreshed' and sr['node']==results[initial[2]['operation_id']]['node'])
        union_requests=initial[2:];source_refs=[results[r['operation_id']]['node'] for r in imports]
        for label,r in zip(UNIONS,union_requests):
            count=8 if label==UNIONS[2] else 2
            links=[dict(source=source_refs[1 if label==UNIONS[1] and i==1 else 0],output=0,input=i) for i in range(count)]
            check(label+'_declaration',r['target']['type']=='transform.union_data' and r['mode']=='append_all' and union_unchanged_parameters(r['parameters'],parameters(label)) and (r['inputs'] in (links,links[1:]) if label==UNIONS[0] else r['inputs']==links) and r['target']['kind']==('existing' if label==UNIONS[0] else 'new') and (label==UNIONS[0] or r['target']['label']==label))
        checks['free_inputs']=free_inputs(events,union_requests[0])
        checks['fixture_ui']=fixture_ui(evidence,seed,union_requests[0])
        for label,r in zip(UNIONS[1:],union_requests[1:]):
            relevant=[e for e in events if e.get('operation_id')==r['operation_id']]
            verb='scroll' if label==UNIONS[1] else 'scroll_horizontal'
            check(label+'_real_scroll',any(e.get('phase')=='node_step_prepared' and e.get('action',{}).get('verb')==verb for e in relevant))
        later={r['target']['ref']['node_id']:r for r in again};pairs=[(r,later[results[r['operation_id']]['node']['node_id']]) for r in initial]
        for label,(a,b) in zip(UNIONS,pairs[2:]):
            columns,rows=expected(label)
            check(label+'_persisted_declaration',union_unchanged_parameters(a['parameters'],b['parameters']) and b['inputs']==[])
            check(label+'_persisted_settings',persisted_review_equal(results[a['operation_id']],results[b['operation_id']],label) and results[a['operation_id']]['execution']['execution_id']!=results[b['operation_id']]['execution']['execution_id'])
            for suffix,r in [('initial',a),('reopened',b)]:
                rb=results[r['operation_id']]['configuration']['readback']
                check(label+'_'+suffix+'_mapping_defaults',rb['prefixes']==parameters(label)['prefixes'] and all(m['autosync'] is True and all(not f.get('excluded') for f in m['fields']) for m in rb['input_mappings']+[rb['output_mapping']]))
                checks[label+'_'+suffix+'_config']=verify_union_configuration(events,r)
                checks[label+'_'+suffix+'_output']=verify_calculator_output(events,r,[dict(name=n,label=n,type='string') for n in columns],rows)
            checks[label+'_unchanged_graph']=verify_unchanged_inputs(events,b)
        deliveries=[c for c in evidence['calls'] if c['tool']==PREFIX+'dock_artifact_deliver'];check('two_deliveries',len({c['arguments']['operation_id'] for c in deliveries})==2)
        before=min(c['row'] for c in deliveries);early=dict(evidence,calls=[c for c in evidence['calls'] if c['row']<before],tools=[t for t in evidence['tools'] if t['row']<before]);prep_ids={c['arguments'].get('operation_id','prepare') for c in early['calls'] if c['tool']==PREFIX+'dock_prepare'}
        early['events']=[e for e in events if e.get('event')!='workspace_prepared' or e.get('state',{}).get('operation_id') in prep_ids]
        prepared=verified_prepare_v1(early,PREFIX,deliveries[0]['session_id'],before);check('owned_draft',prepared is not None)
        if prepared is None:return report(checks)
        check('journal_pins',all(e.get('session_id')==prepared['sessionId'] and e.get('runtime_revision')==request['runtime_source_pin']['client_revision'] and e.get('manifest_sha256')==MANIFEST_SHA for e in events))
        for i,r in enumerate(imports):
            op=r['parameters']['source']['upload_operation_id'].removesuffix(':upload');calls=[c for c in evidence['calls'] if c['tool'] not in (PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status') or c['arguments'].get('operation_id')==op];ids={(c['session_id'],c['tool_call_id']) for c in calls}
            subset=dict(evidence,calls=calls,tools=[t for t in evidence['tools'] if (t['session_id'],t['tool_call_id']) in ids]);delivery=verify_public_delivery(subset,r,prepared);checks['delivery_'+str(i)]=delivery
            if delivery['passed']:checks['source_bytes_'+str(i)]=verify_delivered_import_output(events,r,files[i],delivery['delivery'],request['runtime_source_pin']['client_revision'])
        saves=[e for e in events if e.get('phase')=='completed' and e.get('action_key') in SAVE_REVISIONS]
        generic=[e['operation_id'] for e in events if e.get('phase')=='completed' and e.get('action_key') in SAVE_REVISIONS]
        checks['public_calls']=verify_public_nodes_and_saves(evidence,{r['operation_id']:r for r in requests},generic,allow_validation_refusals=True)
        ports=[dict(node_label=n,tids=[n+';Input_Connection[0]',n+';Input_Var[0]',n+';Output_Data[0]']) for n in IMPORTS]+[dict(node_label=n,tids=sorted([n+';Input_Add']+[n+';Input_Data['+str(i)+']' for i in range(8 if n==UNIONS[2] else 2)]+[n+';Output_Data[0]'])) for n in UNIONS]
        links=[('Широкая' if n==UNIONS[1] and i==1 else 'Главная')+'|Output_Data[0]|'+n+'|Input_Data['+str(i)+']' for n in UNIONS for i in range(8 if n==UNIONS[2] else 2)]
        graph=dict(nodes=sorted(n.replace(' ','_') for n in IMPORTS+UNIONS),ports=sorted([dict(node_label=p['node_label'].replace(' ','_'),tids=sorted(t.replace(' ','_') for t in p['tids'])) for p in ports],key=lambda p:p['node_label']),links=sorted(t.replace(' ','_') for t in links))
        checks['save_chain']=verify_save_chain(events,imports[0],path,SAVE_REVISIONS,expected_graphs=[graph,graph],stages=[('package.save_checkpoint',path,False),('package.save_as',path,True)])
        if checks['save_chain']['passed']:
            save_id=checks['save_chain']['save_operation_ids'][-1]
            for i,(a,b) in enumerate(pairs):checks['reopen_binding_'+str(i)]=verify_reopen_binding(evidence,a,b,save_id,path,union=i>=2)
        for i,(a,b) in enumerate(pairs[:2]):checks['persisted_import_'+str(i)]=_verify_existing_import_output(events,a,b,files[i],reopened_package=True)
        for r in requests:checks[r['operation_id']+'_workflow']=verify_workflow_activation(events,r)
        check('all_gates_present',all(k in checks for k in ('source_bytes_0','source_bytes_1','reopen_binding_4','persisted_import_0','persisted_import_1')))
    except (KeyError,TypeError,ValueError,IndexError,AttributeError,StopIteration) as e:checks['malformed_evidence']=dict(passed=False,error=str(e))
    return report(checks)

def audit_directory(directory):
    request=json.loads((directory/'request.json').read_text());result=audit(request,json.loads((directory/'evidence.json').read_text()),(directory/'scenario.txt').read_text());hashes=request['harness_inputs']
    required={p.name for pattern in ('*.py','*.mjs') for p in WORK.glob(pattern)}|{'goals/union-review-complete.txt'}|{'fixtures/union-review/'+n for n in FIXTURES}
    result['checks']['frozen_harness']=dict(passed=required<=set(hashes) and all((WORK/name).resolve().is_relative_to(WORK) and (WORK/name).is_file() and hashlib.sha256((WORK/name).read_bytes()).hexdigest()==sha for name,sha in hashes.items()))
    result['checks']['current_runtime_pin']=dict(passed=runtime_pin(ROOT)==request['runtime_source_pin']);return report(result['checks'])
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);a=p.parse_args();r=audit_directory(a.run_dir);(a.run_dir/'union-review-audit.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(passed=r['passed'],failures=[k for k,v in r['checks'].items() if not v['passed']])));raise SystemExit(0 if r['passed'] else 1)
