"""Independent reform configuration and preservation audit from raw observations.

Execution, saved-package persistence and journal authentication are separate gates.
"""
from node_procedure_evidence import verify_internal_sequence
from reform_mapped_preflight_evidence import verify_reform_mapped_preflight

USAGE={'Не задано':0,'Активное':3,'Выходное':4,'Группа':6,'Показатель':7,'Транзакция':8,'Элемент':9}
FIELD_KEYS=('index','field_id','name','label','type','data_kind','usage_type','caching_method','excluded')


def verify_reform_configuration(events,request):
    failures=[]
    def need(value,reason):
        if not value:raise ValueError(reason)
    def pick(value,keys):return {k:value[k] for k in keys}
    try:
        operation=request['operation_id'];rows=[e for e in events if e.get('operation_id')==operation]
        sequence=verify_internal_sequence(events,operation,max_steps=4096)
        need(sequence['passed'],'reform_internal_sequence:'+','.join(sequence['failures']))
        checkpoints=[e['result'] for e in rows if e.get('phase')=='node_checkpoint']
        need(len(checkpoints)==1 and checkpoints[0].get('status')=='SUCCEEDED','reform_unique_success')
        result=checkpoints[0];node=result['node']
        def owned(context):return context.get('verified') is True and all(context.get(k)==node.get(k) and node.get(k) for k in ('document_id','workflow_id','node_id'))
        def phase(name):
            starts=[i for i,e in enumerate(rows) if e.get('phase')=='node_phase_prepared' and e.get('receipt',{}).get('phase')==name]
            ends=[(i,e['receipt']) for i,e in enumerate(rows) if e.get('phase')=='node_phase_completed' and e.get('receipt',{}).get('phase')==name]
            need(len(starts)==len(ends)==1 and starts[0]<ends[0][0],'reform_phase_order:'+name)
            end,receipt=ends[0]
            need(receipt.get('status')=='verified' and receipt.get('receipt_id')==operation+':'+name and receipt.get('value',{}).get('verified') is True
                 and receipt['value'].get('cleanup_complete') is True,'reform_phase_receipt:'+name)
            steps={e.get('step') for e in rows[starts[0]+1:end]}
            observations=[(n,s) for n,s in sequence['observations'] if n in steps]
            need(all(owned(s.get('prepared_node_context',{})) for _,s in observations),'reform_phase_owner:'+name)
            return receipt,observations,[(n,a,o) for n,a,o in sequence['mutations'] if n in steps]
        incoming,input_reads,_=phase('input_mapping');configured,reads,edits=phase('configure')
        saved,_,save_edits=phase('node_finish');mapped,map_reads,_=phase('output_mapping');finished,_,_=phase('finish')
        nexts=[(n,a,o) for n,a,o in edits if a.get('verb')=='wizard_step']
        need(len(nexts) in (1,2) and nexts[0][1].get('expected_stage')==['output_mapping','done']
             and (len(nexts)==1 or nexts[1][1].get('expected_stage')=='done')
             and not any(n>nexts[-1][0] for n,_,_ in edits),'reform_validation_transition')
        states=[s['node_reform'] for n,s in reads if n<nexts[0][0] and s.get('node_reform',{}).get('verified') is True]
        accepted=[s for n,s in reads if n>nexts[-1][0] and s.get('wizard',{}).get('stage')=='done']
        need(states and accepted,'reform_native_configuration_and_validation')
        baseline,actual=states[0],states[-1]
        mixed=request['target']['kind']=='existing' and request['parameters']['changes'] and any(m['direction']=='input' for m in request['mappings'])
        if mixed:
            preflight=verify_reform_mapped_preflight(events,request,sequence)
            need(preflight['passed'],'reform_mixed_preflight:'+','.join(preflight['failures']))
            need([pick(f,FIELD_KEYS) for f in baseline['fields']]==preflight['projected_fields']
                 and baseline['caching']==preflight['caching'],'reform_mixed_projection')
        need(all(c.get('inventory_complete') is True and owned(c.get('node_context',{})) for c in states),'reform_native_inventory')
        im=[s['node_mapping'] for _,s in input_reads if s.get('node_mapping',{}).get('verified') is True][-1]
        om=[s['node_mapping'] for _,s in map_reads if s.get('node_mapping',{}).get('verified') is True][-1]
        for m,wizard,port_key in [(im,'TuneDataSourceMappingWizard','input_port'),(om,'DerivedDataSourceOutputSocketWizard','output_port')]:
            need(m.get('mapping_wizard')==wizard and all(m.get(k) is True for k in ('verified','inventory_complete','source_identity_verified'))
                 and owned(m.get('node_context',{})) and m['node_context'].get(port_key,{}).get('port')==0,'reform_port_inventory')
            linked=[]
            for i,f in enumerate(m['target_fields']):
                source=f.get('source') or f.get('exclusion_source')
                need(source and f['index']==i and len([s for s in m['source_fields'] if s.get('record_id')==source.get('record_id') and s==source])==1,'reform_port_source_link')
                linked.append(source['record_id'])
            need(len(set(linked))==len(linked)==len(m['source_fields']),'reform_port_source_coverage')
        need(incoming['value'].get('native_mapping')==im and mapped['value'].get('native_mapping')==om
             and all(p['value'].get('finish',{}).get('settings_applied') is True for p in (incoming,mapped)),'reform_port_receipts')
        inputs=im['target_fields'];need(len(inputs)==len(actual['fields'])==len(baseline['fields']),'reform_input_count')
        def binding(field):
            found=[f for f in inputs if f.get('field_id')==field['field_id']]
            need(len(found)==1 and found[0]['index']==field['index'],'reform_input_field_id')
            f=found[0];return {**pick(f,('field_id','name','label','type','index')),'source_name':f['source']['name'],'source_field_id':f['source']['field_id']}
        patches=request['parameters']['changes'];need(len({p['field']['name'] for p in patches})==len(patches),'reform_duplicate_patch')
        expected_fields=[];changed=0;matched=set()
        for original in baseline['fields']:
            source=binding(original);found=[p for p in patches if p['field']==dict(kind='input_field',name=source['name'])]
            patch=found[0] if found else {};matched.update(p['field']['name'] for p in found)
            wanted=pick(original,FIELD_KEYS)
            for key in ('name','label','type','data_kind','excluded'):
                if key in patch:wanted[key]=patch[key]
            if 'usage' in patch:wanted['usage_type']=USAGE[patch['usage']]
            found_actual=[f for f in actual['fields'] if f['record_id']==original['record_id']]
            need(len(found_actual)==1 and pick(found_actual[0],FIELD_KEYS)==wanted,'reform_requested_patch_or_preservation')
            changed+=wanted!=pick(original,FIELD_KEYS)
            expected_fields.append({**wanted,'input_field':binding(found_actual[0])})
        need(matched=={p['field']['name'] for p in patches},'reform_unknown_patch')
        need(len([a for _,a,_ in edits if a.get('verb')=='apply_reform_column'])==changed,'reform_one_apply_per_changed_field')
        need(actual['caching']==baseline['caching'],'reform_cache_preservation')
        wanted_sources=[pick(f,('name','label','type')) for f in actual['fields'] if not f['excluded']]
        need(len(wanted_sources)==len(om['source_fields']) and all(pick(s,('name','label','type')) in wanted_sources for s in om['source_fields']),'reform_converted_output_sources')
        output_fields=[{**pick(f,('index','name','label','type','data_kind','excluded')),'source_name':(f.get('source') or f['exclusion_source'])['name']} for f in om['target_fields']]
        expected=dict(kind='field_parameters',scope='observed_before_verified_finish',values_are='observed_ui_values',node=node,
            receipt_ids=[p['receipt_id'] for p in (incoming,configured,saved,mapped,finished)],fields=expected_fields,caching=actual['caching'],
            preservation=dict(unrequested_fields=True,unrequested_properties=True,caching=True),
            input_mapping=dict(port=0,autosync=im['autosync'],fields=[{**pick(f,('index','field_id','name','label','type','data_kind')),'source_name':f['source']['name']} for f in inputs]),
            output_mapping=dict(port=0,autosync=om['autosync'],fields=output_fields),package_persistence_verified=False)
        need(result.get('configuration')==dict(status='applied',readback=expected),'reform_public_readback_differs')
        need(configured['value'].get('validation',{}).get('status')=='accepted_by_loginom_next'
             and owned(configured['value']['validation'].get('node_context',{})),'reform_validation_receipt')
        for p in (saved,finished):need(p['value'].get('settings_applied') is True and owned(p['value'].get('node_context',{})),'reform_finish_receipt')
        need(saved['value'].get('mode')=='done' and finished['value'].get('mode')==request['finish'],'reform_finish_mode')
        need(len([a for _,a,_ in save_edits if a.get('verb')=='finish_wizard'])==1,'reform_intermediate_done')
        need(not any(a.get('verb')=='open_wizard' for _,a,_ in sequence['mutations'])
             and len([a for _,a,_ in sequence['mutations'] if a.get('verb')=='begin_wizard'])==1+bool(mixed),'reform_normal_reopen')
        if request['finish']=='done':need(result['execution']['status']=='not_requested' and result['execution']['execution_id'] is None
            and result['output']['status']=='not_refreshed' and not any(a.get('verb') in ('execute_wizard','execute_graph_node') for _,a,_ in sequence['mutations']),'reform_done_execution')
        for requested in request['mappings']:
            m=im if requested['direction']=='input' else om
            if 'autosync' in requested:need(m['autosync']==requested['autosync'],'reform_mapping_autosync')
            if 'fields' in requested:
                need(len(requested['fields'])==len(m['target_fields']),'reform_mapping_count')
                for wanted,got in zip(requested['fields'],m['target_fields']):
                    source=got.get('source') or got.get('exclusion_source')
                    need(wanted['source']==dict(kind='configured_field',name=source['name'])
                         and all(got[k]==wanted[k] for k in ('name','label','excluded') if k in wanted),'reform_requested_mapping')
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'reform_malformed_evidence')
    return dict(passed=not failures,failures=failures,scope='reform_raw_configuration_and_preservation',
                journal_authentication_verified=False,hermes_acceptance_verified=False,package_persistence_verified=False,execution_values_verified=False)


def verify_reform_close(events,baseline_request,close_request,restored_request):
    """Verify explicit draft disposal and unchanged later configuration."""
    failures=[]
    try:
        def result(request):
            matches=[e['result'] for e in events if e.get('operation_id')==request['operation_id'] and e.get('phase')=='node_checkpoint']
            if len(matches)!=1 or matches[0].get('status')!='SUCCEEDED':raise ValueError('close_unique_checkpoint')
            return matches[0]
        baseline,closed,restored=map(result,(baseline_request,close_request,restored_request))
        if (close_request['finish']!='close' or not close_request['parameters']['changes'] or close_request['mappings']
                or restored_request['parameters']!={'changes':[]} or restored_request['mappings']
                or not baseline['node']==closed['node']==restored['node']):raise ValueError('close_contract')
        if (closed['execution']!=dict(status='not_requested',execution_id=None) or closed['output'].get('status')!='not_refreshed'
                or closed.get('configuration')!={'status':'discarded'}):raise ValueError('close_output')
        def semantics(r):return {k:v for k,v in r['configuration']['readback'].items() if k!='receipt_ids'}
        if semantics(baseline)!=semantics(restored):raise ValueError('close_preservation')
        sequence=verify_internal_sequence(events,close_request['operation_id'],max_steps=4096)
        if not sequence['passed']:raise ValueError('close_internal_sequence')
        rows=[e for e in events if e.get('operation_id')==close_request['operation_id']]
        phases=[e['receipt'] for e in rows if e.get('phase')=='node_phase_completed']
        if [p['phase'] for p in phases]!=['source','workflow','target','input_mapping','open','configure','finish']:raise ValueError('close_phases')
        config,finish=phases[-2]['value'],phases[-1]['value']
        if config.get('draft_edits_skipped') is not True or config.get('effect_possible') is not False:raise ValueError('close_no_draft_edits')
        if not all(finish.get(k)==v for k,v in dict(mode='close',settings_applied=False,draft_discarded=True,execution_started=False,reopen_performed=False).items()):raise ValueError('close_finish')
        mutations=sequence['mutations'];observations=sequence['observations']
        before=lambda n:next(s for step,s in reversed(observations) if step<n)
        close_steps=[]
        for n,a,_ in mutations:
            s=before(n)
            if s.get('prepared_node_context',{}).get('surface')!='wizard':continue
            es=[e for e in s['ui']['elements'] if e.get('ref')==a.get('ref')]
            if len(es)!=1:raise ValueError('close_control')
            tid=es[0].get('tid')
            if not ((a.get('verb')=='click' and tid==s['wizard']['root_tid']+';btnClose')
                    or (a.get('verb')=='confirm_wizard_close' and tid=='msgbox;tlb;yes')):raise ValueError('close_unexpected_draft_mutation')
            close_steps.append(a['verb'])
        if close_steps not in (['click'],['click','confirm_wizard_close']):raise ValueError('close_gestures')
    except (KeyError,TypeError,ValueError,IndexError,StopIteration) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'close_malformed')
    return dict(passed=not failures,failures=failures,scope='reform_close_and_unchanged_configuration',execution_values_verified=False)
