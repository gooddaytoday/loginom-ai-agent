"""Join auditor independent of the JS handler and its projected readback."""
from node_procedure_evidence import verify_internal_sequence

def verify_join_configuration(events,request):
    failures=[]
    try:
        op=request['operation_id'];sequence=verify_internal_sequence(events,op,max_steps=4096)
        failures.extend(sequence['failures'])
        checkpoints=[e['result'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_checkpoint']
        if len(checkpoints)!=1 or checkpoints[0]['status']!='SUCCEEDED':raise ValueError('join_checkpoint')
        result=checkpoints[0];node=result['node'];observations=sequence['observations']
        def owned(c):return c.get('verified') is True and all(c.get(k)==node[k] for k in ('document_id','workflow_id','node_id'))
        native=[s['node_join'] for _,s in observations if s.get('node_join')]
        if not native or any(not owned(c.get('node_context',{})) or c.get('inventory_complete') is not True for c in native):raise ValueError('join_native_owner')
        before,after=native[0],native[-1]
        if before['input_fields']!=after['input_fields']:failures.append('join_input_changed_in_wizard')
        p=request['parameters']
        if p:
            actual={(k['left'],k['right']) for k in after['keys']};expected={(k['left'],k['right']) for k in p['keys']}
            if actual!=expected or len(after['keys'])!=len(expected):failures.append('join_key_set')
            if any(after[k]!=p[k] for k in ('case_sensitive','include_joined_keys')):failures.append('join_flags')
        elif before!=after:failures.append('join_preserved_configuration')
        if after['mode']!=request['mode']:failures.append('join_mode')
        for k in after['keys']:
            left=[f for f in after['input_fields'][0] if f['record_id']==k['left_record_id'] and f['name']==k['left']]
            right=[f for f in after['input_fields'][1] if f['record_id']==k['right_record_id'] and f['name']==k['right']]
            if len(left)!=1 or len(right)!=1 or left[0]['type']!=right[0]['type'] or k['type']!=left[0]['type']:failures.append('join_key_identity')
        receipts=[e['receipt'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_phase_completed']
        def phase(name):
            xs=[r for r in receipts if r['phase']==name]
            if len(xs)!=1 or xs[0]['status']!='verified' or xs[0]['receipt_id']!=op+':'+name:raise ValueError('join_phase_'+name)
            return xs[0]['value']
        config=phase('configure');out=phase('output_mapping');inputs=phase('input_mapping')['ports']
        if config['configuration']!=after or config['validation']['status']!='accepted_by_loginom_next':failures.append('join_configuration_receipt')
        if len(inputs)!=2 or [v['port'] for v in inputs]!=[0,1]:raise ValueError('join_two_inputs')
        raw=[s['node_mapping'] for _,s in observations if s.get('node_mapping')]
        def schema(fs):return sorted((f['name'],f['label'],f['type']) for f in fs)
        maps=[('input',v['port'],v['native_mapping'],v['finish']) for v in inputs]+[('output',0,out['native_mapping'],out['finish'])]
        rb=result['configuration']['readback']
        for direction,port,m,finish in maps:
            if m not in raw or not owned(m['node_context']) or m.get('inventory_complete') is not True or m['node_context'].get(direction+'_port',{}).get('port')!=port:raise ValueError('join_mapping_owner')
            if finish.get('settings_applied') is not True or not owned(finish['node_context']):failures.append('join_mapping_finish')
            sources={f['record_id']:f for f in m['source_fields']};seen=set()
            projected=[]
            for i,f in enumerate(m['target_fields']):
                source=f.get('source') or f.get('exclusion_source')
                if not source or sources.get(source['record_id'])!=source or source['record_id'] in seen or f['index']!=i:raise ValueError('join_mapping_source')
                seen.add(source['record_id'])
                projected.append(dict(**{k:f[k] for k in ('index','name','label','type','data_kind',*(['excluded'] if direction=='output' else []))},source_name=source['name']))
            if seen!=set(sources):failures.append('join_mapping_incomplete')
            requested=next((v for v in request['mappings'] if v['direction']==direction and v['port']==port),{})
            if 'autosync' in requested and requested['autosync']!=m['autosync']:failures.append('join_autosync')
            if 'fields' in requested:
                if len(requested['fields'])!=len(projected):failures.append('join_requested_mapping_size')
                for want,actual in zip(requested['fields'],projected):
                    if want['source']['name']!=actual['source_name'] or any(k in want and want[k]!=actual.get(k,False) for k in ('name','label','excluded')):failures.append('join_requested_mapping')
            got=rb['input_mappings'][port] if direction=='input' else rb['output_mapping']
            if got['port']!=port or got['fields']!=projected or got['autosync']!=m['autosync']:failures.append('join_mapping_projection')
            if direction=='input' and schema(m['target_fields'])!=schema(after['input_fields'][port]):failures.append('join_effective_input')
        right_keys={k['right'] for k in after['keys']}
        generated=after['input_fields'][0]+[f for f in after['input_fields'][1] if after['include_joined_keys'] or f['name'] not in right_keys]
        if schema(generated)!=schema(out['native_mapping']['source_fields']):failures.append('join_output_sources')
        for name in ('node_finish','finish'):
            f=phase(name)
            if f.get('settings_applied') is not True or not owned(f['node_context']):failures.append('join_finish_owner')
        if phase('node_finish')['mode']!='done':failures.append('join_intermediate_execute')
        if rb['kind']!='join' or rb['node']!=node or any(rb[k]!=after[k] for k in ('mode','case_sensitive','include_joined_keys')):failures.append('join_readback')
        if rb['keys']!=config['keys']:failures.append('join_readback_keys')
    except (KeyError,IndexError,TypeError,ValueError,AttributeError) as e:failures.append(str(e))
    return dict(passed=not failures,failures=sorted(set(failures)),scope='join_raw_configuration')
