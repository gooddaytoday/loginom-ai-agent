"""Union auditor independent of the JS handler and its projected readback."""
from node_procedure_evidence import verify_internal_sequence

def verify_union_configuration(events,request):
    failures=[]
    try:
        op=request['operation_id']
        if request['mode']!='append_all' or request['target']['type']!='transform.union_data':raise ValueError('union_request_type_mode')
        sequence=verify_internal_sequence(events,op,max_steps=4096)
        failures.extend(sequence['failures'])
        checkpoints=[e['result'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_checkpoint']
        if len(checkpoints)!=1 or checkpoints[0]['status']!='SUCCEEDED':raise ValueError('union_checkpoint')
        result=checkpoints[0];node=result['node'];observations=sequence['observations']
        def owned(c):return c.get('verified') is True and all(c.get(k)==node[k] for k in ('document_id','workflow_id','node_id'))
        native=[s['node_union'] for _,s in observations if s.get('node_union')]
        if not native or any(not owned(c.get('node_context',{})) or c.get('inventory_complete') is not True for c in native):raise ValueError('union_native_owner')
        before,after=native[0],native[-1]
        if before['input_fields']!=after['input_fields']:failures.append('union_input_changed_in_wizard')
        p=request['parameters'];count=len(p['tables'])+1
        if len(after['input_fields'])!=count or len(after['mappings'])!=count-1:raise ValueError('union_input_count')
        if after['prefixes']['enabled']!=p['prefixes']['enabled']:failures.append('union_prefix_flag')
        if p['prefixes']['enabled'] and after['prefixes']!=p['prefixes']:failures.append('union_prefix_values')
        tables=[]
        for port,m in enumerate(after['mappings'],1):
            if m['port']!=port:raise ValueError('union_ordered_port')
            main=after['input_fields'][0];joined=after['input_fields'][port]
            source_names={f['name'] for f in joined};paired=set();targets=set()
            for pair in m['pairs']:
                left=[f for f in main if f['index']==pair['main_index'] and f['name']==pair['main']]
                right=[f for f in joined if f['index']==pair['source_index'] and f['name']==pair['source']]
                if len(left)!=1 or len(right)!=1 or left[0]['type']!=right[0]['type']:raise ValueError('union_pair_identity')
                if pair['source'] in paired or pair['main'] in targets:raise ValueError('union_pair_duplicate')
                paired.add(pair['source']);targets.add(pair['main'])
            if paired&set(m['unmatched']) or len(set(m['unmatched']))!=len(m['unmatched']) or paired|set(m['unmatched'])!=source_names:raise ValueError('union_unaccounted_field')
            actual={f['name']:next((v['main'] for v in m['pairs'] if v['source']==f['name']),None) for f in joined}
            wanted=p['tables'][port-1]
            if wanted['port']!=port or len(wanted['fields'])!=len(actual) or {f['source']:f['main'] for f in wanted['fields']}!=actual:failures.append('union_requested_mapping')
            tables.append(dict(port=port,fields=[dict(source=f['name'],main=actual[f['name']]) for f in joined]))
        receipts=[e['receipt'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_phase_completed']
        def phase(name):
            xs=[r for r in receipts if r['phase']==name]
            if len(xs)!=1 or xs[0]['status']!='verified' or xs[0]['receipt_id']!=op+':'+name:raise ValueError('union_phase_'+name)
            return xs[0]['value']
        config=phase('configure');out=phase('output_mapping');inputs=phase('input_mapping')['ports']
        if config['configuration']!=after or config['validation']['status']!='accepted_by_loginom_next':failures.append('union_configuration_receipt')
        if len(inputs)!=count or [v['port'] for v in inputs]!=list(range(count)):raise ValueError('union_all_inputs')
        raw=[s['node_mapping'] for _,s in observations if s.get('node_mapping')]
        def schema(fs):return sorted((f['name'],f['label'],f['type']) for f in fs)
        maps=[('input',v['port'],v['native_mapping'],v['finish']) for v in inputs]+[('output',0,out['native_mapping'],out['finish'])]
        rb=result['configuration']['readback']
        for direction,port,m,finish in maps:
            if m not in raw or not owned(m['node_context']) or m.get('inventory_complete') is not True or m['node_context'].get(direction+'_port',{}).get('port')!=port:raise ValueError('union_mapping_owner')
            if finish.get('settings_applied') is not True or not owned(finish['node_context']):failures.append('union_mapping_finish')
            sources={f['record_id']:f for f in m['source_fields']};seen=set()
            projected=[]
            for i,f in enumerate(m['target_fields']):
                source=f.get('source') or f.get('exclusion_source')
                if not source or sources.get(source['record_id'])!=source or source['record_id'] in seen or f['index']!=i:raise ValueError('union_mapping_source')
                seen.add(source['record_id'])
                projected.append(dict(**{k:f[k] for k in ('index','name','label','type','data_kind',*(['excluded'] if direction=='output' else []))},source_name=source['name']))
            if seen!=set(sources):failures.append('union_mapping_incomplete')
            requested=next((v for v in request['mappings'] if v['direction']==direction and v['port']==port),{})
            if 'autosync' in requested and requested['autosync']!=m['autosync']:failures.append('union_autosync')
            if 'fields' in requested:
                if len(requested['fields'])!=len(projected):failures.append('union_requested_mapping_size')
                for want,actual in zip(requested['fields'],projected):
                    if want['source']['name']!=actual['source_name'] or any(k in want and want[k]!=actual.get(k,False) for k in ('name','label','excluded')):failures.append('union_requested_mapping')
            got=rb['input_mappings'][port] if direction=='input' else rb['output_mapping']
            if got['port']!=port or got['fields']!=projected or got['autosync']!=m['autosync']:failures.append('union_mapping_projection')
            if direction=='input' and schema(m['target_fields'])!=schema(after['input_fields'][port]):failures.append('union_effective_input')
        generated=list(after['input_fields'][0])
        for mapping in after['mappings']:
            for name in mapping['unmatched']:
                field=next(f for f in after['input_fields'][mapping['port']] if f['name']==name)
                prefix=after['prefixes']
                generated.append(dict(field,name=(prefix['name'] if prefix['enabled'] else '')+name,label=(prefix['label'] if prefix['enabled'] else '')+field['label']))
        if schema(generated)!=schema(out['native_mapping']['source_fields']):failures.append('union_output_sources')
        for name in ('node_finish','finish'):
            f=phase(name)
            if f.get('settings_applied') is not True or not owned(f['node_context']):failures.append('union_finish_owner')
        if phase('node_finish')['mode']!='done':failures.append('union_intermediate_execute')
        if phase('finish')['mode']!=request['finish']:failures.append('union_requested_finish')
        if rb['kind']!='union' or rb['node']!=node or rb['mode']!='append_all' or rb['prefixes']!=after['prefixes']:failures.append('union_readback')
        if rb['tables']!=tables:failures.append('union_readback_tables')
    except (KeyError,IndexError,TypeError,ValueError,AttributeError) as e:failures.append(str(e))
    return dict(passed=not failures,failures=sorted(set(failures)),scope='union_raw_configuration')
