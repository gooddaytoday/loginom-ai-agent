"""Independent calculator configuration audit from observed node journal states.

Does not authenticate its input or establish Hermes/package acceptance. Numerical
results are checked separately against fixture data, never against handler schema.
"""
from node_procedure_evidence import verify_internal_sequence


def verify_calculator_configuration(events, request):
    failures=[]
    try:
        operation=request['operation_id']
        rows=[r for r in events if r.get('operation_id')==operation]
        sequence=verify_internal_sequence(events,operation,max_steps=4096)
        if not sequence['passed']:
            raise ValueError('calculator_internal_sequence:' + ','.join(sequence['failures']))
        checkpoints=[r['result'] for r in rows if r.get('phase')=='node_checkpoint']
        if len(checkpoints)!=1 or checkpoints[0].get('status')!='SUCCEEDED':
            raise ValueError('calculator_unique_success')
        result=checkpoints[0];node=result['node']
        def owned(context):
            return context.get('verified') is True and all(context.get(k)==node.get(k) and node.get(k)
                for k in ('document_id','workflow_id','node_id'))
        if any(not owned(s.get('prepared_node_context',{})) for _,s in sequence['observations']):
            raise ValueError('calculator_observed_owner')
        def phase(name):
            starts=[i for i,r in enumerate(rows) if r.get('phase')=='node_phase_prepared' and r.get('receipt',{}).get('phase')==name]
            ends=[(i,r['receipt']) for i,r in enumerate(rows) if r.get('phase')=='node_phase_completed' and r.get('receipt',{}).get('phase')==name]
            if len(starts)!=1 or len(ends)!=1 or starts[0]>=ends[0][0]:
                raise ValueError('calculator_phase_order:'+name)
            end,receipt=ends[0]
            if receipt.get('status')!='verified' or receipt.get('receipt_id')!=operation+':'+name:
                raise ValueError('calculator_phase_receipt:'+name)
            steps={r.get('step') for r in rows[starts[0]+1:end]}
            return receipt,[(n,s) for n,s in sequence['observations'] if n in steps],[(n,a,o) for n,a,o in sequence['mutations'] if n in steps]
        incoming,input_reads,input_edits=phase('input_mapping')
        configured,reads,edits=phase('configure')
        saved,_,save_edits=phase('node_finish')
        mapped,map_reads,map_edits=phase('output_mapping')
        finished,_,finish_edits=phase('finish')
        nexts=[(n,a,o) for n,a,o in edits if a.get('verb')=='wizard_step']
        conditional=['output_mapping','done']
        if (len(nexts) not in (1,2) or nexts[0][1].get('expected_stage') not in ('done',conditional)
                or len(nexts)==2 and nexts[1][1].get('expected_stage')!='done'
                or any(n>nexts[-1][0] for n,_,_ in edits)):
            raise ValueError('calculator_syntax_transition')
        before=[s['node_calculator'] for n,s in reads if n<nexts[0][0] and s.get('node_calculator',{}).get('verified') is True]
        after=[s for n,s in reads if n>nexts[-1][0] and s.get('wizard',{}).get('stage')=='done']
        if not before or not after:raise ValueError('calculator_syntax_not_observed')
        if len(nexts)==2:
            inline=[s['node_mapping'] for n,s in reads if nexts[0][0]<n<nexts[1][0] and s.get('node_mapping',{}).get('verified') is True]
            if not inline or any(m.get('mapping_wizard')!='DerivedDataSourceMappingEngineOutputPortWizard' or not owned(m.get('node_context',{})) for m in inline):
                raise ValueError('calculator_inline_mapping_owner')
            first,last=inline[0],inline[-1]
            if first['source_fields']!=last['source_fields'] or first['autosync']!=last['autosync']:
                raise ValueError('calculator_inline_source_changed')
            source_of=lambda f:f.get('source') or f.get('exclusion_source')
            retained=lambda f:{k:v for k,v in f.items() if k not in ('record_id','field_id','index')}
            prior=[source_of(f)['record_id'] for f in first['target_fields']]
            final=[source_of(f)['record_id'] for f in last['target_fields']]
            if [x for x in final if x in prior]!=prior:raise ValueError('calculator_inline_order')
            for f in first['target_fields']:
                found=[g for g in last['target_fields'] if source_of(g)['record_id']==source_of(f)['record_id']]
                if len(found)!=1 or retained(found[0])!=retained(f):raise ValueError('calculator_inline_preservation')
            wanted={e['name'] for e in request['parameters']['expressions'] if e['target']['kind']=='new'}
            for f in last['target_fields']:
                if source_of(f)['record_id'] not in prior and (f['name'] not in wanted or f['excluded'] or any(f[k]!=source_of(f)[k] for k in ('name','label','type'))):
                    raise ValueError('calculator_inline_additions')
        actual=before[-1]
        if (actual.get('inventory_complete') is not True or actual.get('mode')!='expression'
                or not owned(actual.get('node_context',{}))):raise ValueError('calculator_inventory')
        if len([a for _,a,_ in save_edits if a.get('verb')=='finish_wizard'])!=1:
            raise ValueError('calculator_intermediate_done')
        if (any(a.get('verb')=='open_wizard' for _,a,_ in sequence['mutations'])
                or len([a for _,a,_ in sequence['mutations'] if a.get('verb')=='begin_wizard'])!=1):
            # Normal opening uses its own bound opener; reopening via ui.act is forbidden.
            raise ValueError('calculator_normal_reopen')
        native=[s['node_mapping'] for _,s in map_reads if s.get('node_mapping',{}).get('verified') is True][-1]
        if (not all(native.get(k) is True for k in ('verified','inventory_complete','source_identity_verified'))
                or not owned(native.get('node_context',{}))):raise ValueError('calculator_mapping_inventory')
        fields=[]
        for i,f in enumerate(native['target_fields']):
            source=f.get('source') or f.get('exclusion_source')
            matches=[s for s in native['source_fields'] if s.get('record_id')==source.get('record_id')]
            if len(matches)!=1 or matches[0]!=source or f['index']!=i:raise ValueError('calculator_mapping_source')
            fields.append({**{k:f[k] for k in ('index','name','label','type','data_kind','excluded')},'source_name':source['name']})
        pick=lambda v,ks:{k:v[k] for k in ks}
        expressions=[pick(e,('index','name','label','type','formula','replace','intermediate','cached','description')) for e in actual['expressions']]
        input_native=[s['node_mapping'] for _,s in input_reads if s.get('node_mapping',{}).get('verified') is True][-1]
        if (input_native.get('mapping_wizard')!='TuneDataSourceMappingWizard'
                or not all(input_native.get(k) is True for k in ('verified','inventory_complete','source_identity_verified'))
                or not owned(input_native.get('node_context',{}))
                or input_native.get('node_context',{}).get('input_port',{}).get('direction')!='input'
                or type(input_native.get('autosync')) is not bool):raise ValueError('calculator_input_mapping_owner')
        input_fields=[]
        for i,f in enumerate(input_native['target_fields']):
            source=f['source']
            matches=[s for s in input_native['source_fields'] if s.get('record_id')==source.get('record_id')]
            if len(matches)!=1 or matches[0]!=source or f['index']!=i or f.get('excluded',False):
                raise ValueError('calculator_input_mapping_source')
            input_fields.append({**pick(f,('index','name','label','type','data_kind')),'excluded':False,'source_name':source['name']})
        if (len(input_fields)!=len(input_native['source_fields'])
                or len({f['source_name'] for f in input_fields})!=len(input_fields)
                or [pick(f,('name','label','type')) for f in input_fields]!=[pick(f,('name','label','type')) for f in actual['input_fields']]):
            raise ValueError('calculator_input_schema_differs')
        if incoming['value'].get('native_mapping')!=input_native or incoming['value'].get('finish',{}).get('settings_applied') is not True:
            raise ValueError('calculator_input_mapping_receipt')
        expected=dict(kind='calculator' ,scope='observed_before_verified_finish',node=node,
            receipt_ids=[r['receipt_id'] for r in (incoming,configured,saved,mapped,finished)],values_are='observed_ui_values',
            package_persistence_verified=False,mode='expression',syntax_validation='accepted_by_loginom_next',
            expressions=expressions,input_fields=[pick(f,('name','label','type')) for f in actual['input_fields']],
            input_mapping=dict(port=0,autosync=input_native['autosync'],fields=input_fields),
            output_mapping=dict(port=0,autosync=native['autosync'],fields=fields))
        if result.get('configuration')!=dict(status='applied',readback=expected):raise ValueError('calculator_public_readback_differs')
        for p in (saved,finished):
            if p['value'].get('settings_applied') is not True or not owned(p['value'].get('node_context',{})):
                raise ValueError('calculator_finish_not_applied')
        if request['finish']=='done':
            if result['execution']['status']!='not_requested' or result['output']['status']!='not_refreshed':
                raise ValueError('calculator_done_executed')
        # Compare requested settings with independently observed native records.
        for patch in request['parameters']['expressions']:
            if patch['target']['kind']=='new':
                matches=[e for e in expressions if e['name']==patch['name']]
                if len(matches)!=1 or any(matches[0][k]!=patch[k] for k in ('name','label','type','formula','replace')):
                    raise ValueError('calculator_new_expression_differs')
        if request['target']['kind']=='new' and len(expressions)!=len(request['parameters']['expressions']):
            raise ValueError('calculator_new_expression_inventory')
        for requested in request['mappings']:
            direction=requested['direction']
            if direction=='input':
                _,input_reads,_=phase('input_mapping')
                observed=[s['node_mapping'] for _,s in input_reads if s.get('node_mapping',{}).get('verified') is True][-1]
                if not owned(observed.get('node_context',{})) or observed.get('source_identity_verified') is not True:
                    raise ValueError('calculator_input_mapping_owner')
                if [pick(f,('name','label','type')) for f in observed['target_fields']]!=expected['input_fields']:
                    raise ValueError('calculator_input_schema_differs')
            else:
                observed=native
            if 'autosync' in requested and observed['autosync']!=requested['autosync']:
                raise ValueError('calculator_mapping_autosync')
            if 'fields' in requested:
                actual_fields=observed['target_fields']
                if len(actual_fields)!=len(requested['fields']):raise ValueError('calculator_mapping_count')
                for want,got in zip(requested['fields'],actual_fields):
                    source=got.get('source') or got.get('exclusion_source')
                    if want['source'].get('kind')!='configured_field' or source['name']!=want['source']['name']:
                        raise ValueError('calculator_mapping_requested_source')
                    if any(got[k]!=want[k] for k in ('name','label','type','excluded') if k in want):
                        raise ValueError('calculator_mapping_requested_settings')
        # Preserve untouched expression records and all unrequested properties.
        baseline=before[0]['expressions'];patches=request['parameters']['expressions']
        if request['target']['kind']=='existing':
            for original in baseline:
                patches_for=[p for p in patches if p['target'].get('kind')=='existing' and p['target'].get('name')==original['name']]
                patch=patches_for[0] if patches_for else {}
                matches=[e for e in actual['expressions'] if e['record_id']==original['record_id']]
                if len(matches)!=1:raise ValueError('calculator_existing_record_lost')
                for key in ('name','label','type','formula','replace','intermediate','cached','description'):
                    if matches[0][key]!=patch.get(key,original[key]):raise ValueError('calculator_patch_or_preservation:'+key)
        if request['parameters'].get('order') is not None and [e['name'] for e in expressions]!=request['parameters']['order']:
            raise ValueError('calculator_requested_order')
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'calculator_malformed_evidence')
    return dict(passed=not failures,failures=failures,scope='calculator_raw_configuration_and_preservation',
        journal_authentication_verified=False,hermes_acceptance_verified=False,package_persistence_verified=False,execution_values_verified=False)
