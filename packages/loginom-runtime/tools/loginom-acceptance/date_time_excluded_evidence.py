"""Frozen-v4 distinguishes excluded source identity from native target metadata."""


def verify_excluded(events, request, expected):
    failures=[]; refs=[]
    try:
        own=[(i+1,e) for i,e in enumerate(events) if e.get('operation_id')==request['operation_id']]
        phases=[(i,e['receipt']) for i,e in own if e.get('phase')=='node_phase_completed'
                and e.get('receipt',{}).get('phase')=='output_mapping']
        checkpoints=[e['result'] for _,e in own if e.get('phase')=='node_checkpoint']
        if len(phases)!=1 or len(checkpoints)!=1: raise ValueError('one_excluded_mapping_checkpoint')
        line,receipt=phases[0]; result=checkpoints[0];native=receipt['value']['native_mapping']
        raw=[(i,e['outcome']['output']['node_mapping']) for i,e in own if e.get('phase')=='node_observation_completed'
             and e.get('outcome',{}).get('output',{}).get('node_mapping')]
        matching=[i for i,m in raw if m==native]
        if (receipt['status']!='verified' or receipt['receipt_id']!=request['operation_id']+':output_mapping'
                or not matching or native.get('verified') is not True or native.get('inventory_complete') is not True
                or native.get('source_identity_verified') is not True or native['node_context'].get('verified') is not True
                or any(native['node_context'].get(k)!=v for k,v in result['node'].items())):
            raise ValueError('excluded_raw_binding')
        fields=[f for f in native['target_fields'] if f.get('excluded')]
        sources=[f.get('source') or f.get('exclusion_source') for f in fields]
        target=[{k:f[k] for k in ('name','label','type','excluded')} for f in fields]
        source=[{k:s[k] for k in ('name','label','type')} for s in sources]
        if target!=expected['excluded']: failures.append('excluded_target_metadata_changed')
        if source!=expected['excluded_sources']: failures.append('excluded_source_identity_or_label_changed')
        if any(s not in native['source_fields'] for s in sources): failures.append('excluded_source_not_in_native_inventory')
        rb=[f for f in result['configuration']['readback']['output_mapping']['fields'] if f.get('excluded')]
        if ([{k:f[k] for k in ('name','label','type','excluded')} for f in rb]!=target
                or [f['source_name'] for f in rb]!=[s['name'] for s in sources]):
            failures.append('excluded_readback_differs_from_raw')
        for mapping in request['mappings']:
            if mapping['direction']!='output':continue
            for field in mapping.get('fields',[]):
                if not field.get('excluded'):continue
                matches=[s for s in expected['excluded_sources'] if field['source']==dict(kind='configured_field',name=s['name'])]
                if (len(matches)!=1 or field.get('name',matches[0]['name'])!=matches[0]['name']
                        or field.get('label',matches[0]['label'])!=matches[0]['label']):
                    failures.append('requested_excluded_source_rename')
        refs=[dict(event_line=line,path='receipt.value.native_mapping'),
              dict(event_line=matching[-1],path='outcome.output.node_mapping')]
    except (KeyError,ValueError,TypeError,IndexError) as error:failures.append(str(error))
    return dict(passed=not failures,failures=sorted(set(failures)),raw_refs=refs,
                scope='exact_excluded_source_and_target_metadata',effective_output_column=False)
