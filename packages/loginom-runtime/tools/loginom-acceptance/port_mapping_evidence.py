"""Independent audit of a prepared output-field edit; not node/package persistence."""
from import_limits import import_operation_step_budget

from copy import deepcopy
from node_procedure_evidence import verify_internal_sequence


def verify_mapping_scroll(state, action, outcome):
    """Accept only a bounded reveal in the same prepared output-mapping grid."""
    owner=state.get('prepared_node_context',{})
    after=outcome.get('output',{})
    wizard=state.get('wizard',{})
    tid=wizard.get('root_tid','')+';ColumnsMappingEngineOutputPortWizard;grdTargetColumns;tbl'
    controls=[e for e in state.get('ui',{}).get('elements',[]) if e.get('ref')==action.get('ref')]
    following=[e for e in after.get('ui',{}).get('elements',[]) if e.get('ref')==action.get('ref')]
    delta=action.get('delta_y')
    if (owner.get('verified') is not True or owner.get('surface')!='wizard'
            or after.get('prepared_node_context')!=owner or wizard.get('stage')!='output_mapping'
            or after.get('wizard',{}).get('root_tid')!=wizard.get('root_tid')
            or after.get('wizard',{}).get('stage')!='output_mapping'
            or outcome.get('status')!='SUCCEEDED' or len(controls)!=1 or len(following)!=1
            or type(delta) not in (int,float) or not 0<abs(delta)<=500):
        return ['mapping_scroll_owner_or_budget']
    control,end=controls[0],following[0]
    start_top=control.get('scroll',{}).get('top');end_top=end.get('scroll',{}).get('top')
    if (control.get('tid')!=tid or end.get('tid')!=tid or 'scroll' not in control.get('allowed_actions',[])
            or type(start_top) not in (int,float) or type(end_top) not in (int,float)
            or not 0<(end_top-start_top)*delta or abs(end_top-start_top)>abs(delta)+2):
        return ['mapping_scroll_control_or_effect']
    return []


def verify_output_field_edit(events,operation_id,source_name,target_name,target_label):
    sequence=verify_internal_sequence(events,operation_id,max_steps=256)
    failures=list(sequence['failures'])
    observations=sequence['observations'];mutations=sequence['mutations']
    native=[o for o in observations if o[1].get('node_mapping',{}).get('verified') is True]
    if len(native)<2:return dict(passed=False,failures=failures+['native_before_after_missing'])
    before,after=[o[1]['node_mapping'] for o in (native[0],native[-1])]
    targets=[t for t in before.get('target_fields',[]) if t.get('source',{}).get('name')==source_name]
    if len(targets)!=1:return dict(passed=False,failures=failures+['unique_source_target'])
    original=targets[0]
    for mapping in (before,after):
        source=mapping.get('source_fields',[]);target=mapping.get('target_fields',[])
        if (mapping.get('source_identity_verified') is not True or mapping.get('inventory_complete') is not True
            or any(len({f.get(k) for f in fields})!=len(fields) for fields in (source,target) for k in ('record_id','field_id','name'))
            or any(t.get('source') not in source for t in target)
            or mapping.get('node_context',{}).get('verified') is not True):failures.append('native_schema_binding')
    expected=deepcopy(before)
    for t in expected['target_fields']:
        if t['record_id']==original['record_id']:t.update(name=target_name,label=target_label)
    semantic=lambda m:{k:v for k,v in m.items() if k!='rendered_indices'}
    if semantic(after)!=semantic(expected):failures.append('unrequested_native_change')
    expected_edits=[(k,v) for k,v in [('name',target_name),('label',target_label)] if original.get(k)!=v]
    edits=[m for m in mutations if m[1].get('verb')!='scroll']
    for step,action,outcome in mutations:
        if action.get('verb')!='scroll':continue
        state=next((s for n,s in reversed(observations) if n<step),{})
        failures+=verify_mapping_scroll(state,action,outcome)
        if edits and step>=edits[0][0]:failures.append('mapping_scroll_after_editor_open')
    verbs=['double_click']+['set_wizard_field']*len(expected_edits)+['apply_output_column']
    if [m[1].get('verb') for m in edits]!=verbs:failures.append('edit_gesture_sequence')
    for index,(step,action,outcome) in enumerate(edits):
        prior=[state for observed_step,state in observations if observed_step<step]
        state=prior[-1] if prior else {}
        controls=[e for e in state.get('ui',{}).get('elements',[]) if e.get('ref')==action.get('ref')]
        if len(controls)!=1:failures.append('unique_action_control');continue
        control=controls[0]
        if action.get('verb')=='double_click':
            row=control.get('output_column',{})
            if row.get('name')!=original['name'] or row.get('label')!=original['label']:failures.append('selected_output_field')
        if action.get('verb')=='set_wizard_field':
            if not 0<=index-1<len(expected_edits):failures.append('unexpected_property');continue
            key,value=expected_edits[index-1]
            meta=control.get('wizard_field',{})
            if meta.get('scope')!='output_column' or meta.get('name')!=key or action.get('text')!=value:
                failures.append('requested_property_binding')
        if action.get('verb')=='apply_output_column':
            traces=[t for t in outcome.get('trace',[]) if t.get('event')=='output_column_row_verified']
            if len(traces)!=1:failures.append('applied_row_receipt');continue
            receipt=traces[0];row=receipt.get('row',{})
            if (receipt.get('mode')!='apply' or any(row.get(k)!=v for k,v in dict(name=target_name,label=target_label,
                type=original['type'],data_kind=original['data_kind']).items())
                or row.get('source',{}).get('label')!=original['source']['label']
                or row.get('source',{}).get('type')!=original['source']['type']):failures.append('applied_row_values')
    if native[-1][0]<=max((m[0] for m in mutations),default=0):failures.append('native_post_apply_missing')
    return dict(passed=not failures,failures=sorted(set(failures)),scope='prepared_output_field_draft',
        source_identity_verified=not failures,settings_persistence_verified=False,package_persistence_verified=False,
        fixed_runtime_verified=False,hermes_acceptance_verified=False)


def verify_output_order(events,operation_id,source_names):
    sequence=verify_internal_sequence(events, operation_id, max_steps=import_operation_step_budget(events, operation_id))
    failures=list(sequence['failures']);observations=sequence['observations'];mutations=sequence['mutations']
    native=[(step,s['node_mapping']) for step,s in observations if s.get('node_mapping',{}).get('verified') is True]
    if not native:return dict(passed=False,failures=failures+['native_mapping_missing'])
    baseline=deepcopy(native[0][1]);expected=deepcopy(baseline)
    names=[f.get('source',{}).get('name') for f in baseline.get('target_fields',[])]
    if len(source_names)!=len(names) or len(set(source_names))!=len(names) or set(source_names)!=set(names):
        return dict(passed=False,failures=failures+['complete_source_order_required'])
    positions=[source_names.index(name) for name in names]
    move_count=sum(a>b for i,a in enumerate(positions) for b in positions[i+1:])
    if len(mutations)!=2*move_count:failures.append('minimal_adjacent_moves_required')
    semantic=lambda n:{k:v for k,v in n.items() if k!='rendered_indices'}
    for start in range(0,len(mutations)-1,2):
        select,move=mutations[start:start+2]
        if select[1].get('verb')!='click' or move[1].get('verb')!='click':failures.append('reorder_gestures');continue
        before=[s for step,s in observations if step<select[0]]
        state=before[-1] if before else {};controls=[e for e in state.get('ui',{}).get('elements',[]) if e.get('ref')==select[1].get('ref')]
        row=controls[0].get('output_column',{}) if len(controls)==1 else {}
        matches=[f for f in expected['target_fields'] if f.get('name')==row.get('name') and f.get('index')==row.get('index')]
        if len(matches)!=1 or matches[0]['index']<=0:failures.append('selected_move_field');continue
        target=matches[0];index=target['index']
        before_move=[s for step,s in observations if step<move[0]];state=before_move[-1] if before_move else {}
        controls=[e for e in state.get('ui',{}).get('elements',[]) if e.get('ref')==move[1].get('ref')]
        if len(controls)!=1 or controls[0].get('tid')!=state.get('wizard',{}).get('root_tid','')+';ColumnsMappingEngineOutputPortWizard;btnMoveMappingColumnUp':
            failures.append('bound_move_up_control')
        selected=[f for f in state.get('wizard',{}).get('output_columns',{}).get('fields',[]) if f.get('selected') is True]
        if len(selected)!=1 or selected[0].get('name')!=target['name']:failures.append('move_selection')
        expected['target_fields'][index-1],expected['target_fields'][index]=expected['target_fields'][index],expected['target_fields'][index-1]
        for i,f in enumerate(expected['target_fields']):f['index']=i
        after=[n for step,n in native if step>move[0]]
        if not after or semantic(after[0])!=semantic(expected):failures.append('native_after_adjacent_move')
    if [f['source']['name'] for f in native[-1][1]['target_fields']]!=source_names:failures.append('requested_final_order')
    return dict(passed=not failures,failures=sorted(set(failures)),scope='prepared_output_order_draft',moves=move_count,
        source_identity_verified=not failures,settings_persistence_verified=False,package_persistence_verified=False,
        fixed_runtime_verified=False,hermes_acceptance_verified=False)


def verify_output_field_batch(events,operation_id,requested):
    """Replay editor receipts independently; temporary names never define the goal."""
    sequence=verify_internal_sequence(events, operation_id, max_steps=import_operation_step_budget(events, operation_id))
    failures=list(sequence['failures']);observations=sequence['observations'];mutations=sequence['mutations']
    native=[(step,s['node_mapping']) for step,s in observations if s.get('node_mapping',{}).get('verified') is True]
    if not native:return dict(passed=False,failures=failures+['native_mapping_missing'])
    baseline=deepcopy(native[0][1]);expected=deepcopy(baseline)
    source=baseline.get('source_fields',[]);target=baseline.get('target_fields',[])
    if (baseline.get('source_identity_verified') is not True or baseline.get('inventory_complete') is not True
        or baseline.get('node_context',{}).get('verified') is not True
        or any(len({f.get(k) for f in fs})!=len(fs) for fs in (source,target) for k in ('record_id','field_id','name'))
        or any(t.get('source') not in source for t in target)):
        return dict(passed=False,failures=failures+['native_schema_binding'])
    source_names=[t['source']['name'] for t in target]
    if (not isinstance(requested,dict) or set(requested)!=set(source_names) or len(source_names)!=len(set(source_names))
        or any(not isinstance(v,dict) or set(v)!={'name','label'} or any(not isinstance(x,str) for x in v.values()) for v in requested.values())):
        return dict(passed=False,failures=failures+['complete_source_goal_required'])
    semantic=lambda n:{k:v for k,v in n.items() if k!='rendered_indices'}
    selected=None;draft=None;edits=0
    for step,action,outcome in mutations:
        prior=[s for observed_step,s in observations if observed_step<step]
        state=prior[-1] if prior else {};controls=[e for e in state.get('ui',{}).get('elements',[]) if e.get('ref')==action.get('ref')]
        if len(controls)!=1:failures.append('unique_editor_control');continue
        control=controls[0];verb=action.get('verb')
        if verb=='double_click':
            if selected is not None:failures.append('overlapping_edits')
            row=control.get('output_column',{});matches=[f for f in expected['target_fields'] if f['name']==row.get('name') and f['label']==row.get('label')]
            if len(matches)!=1:failures.append('selected_native_field');continue
            selected=matches[0];draft={k:selected[k] for k in ('name','label')}
        elif verb=='set_wizard_field':
            meta=control.get('wizard_field',{});key=meta.get('name');params=state.get('wizard',{}).get('column_parameters',{})
            if selected is None or meta.get('scope')!='output_column' or key not in ('name','label'):
                failures.append('bound_property');continue
            if params.get('selected_column',{}).get('name')!=selected['name']:failures.append('editor_owner')
            before_fields=params.get('fields',{})
            if any(before_fields.get(k,{}).get('value')!=draft[k] for k in ('name','label')):failures.append('unexpected_editor_change')
            after_fields=outcome.get('output',{}).get('wizard',{}).get('column_parameters',{}).get('fields',{})
            value=action.get('text')
            if key=='name' and draft['label']==draft['name'] and after_fields.get('label',{}).get('value')==value:draft['label']=value
            draft[key]=value
            if any(after_fields.get(k,{}).get('value')!=draft[k] for k in ('name','label')):failures.append('property_readback')
            if not any(t.get('event')=='wizard_draft_value_verified' and t.get('scope')=='output_column' and t.get('field')==key for t in outcome.get('trace',[])):
                failures.append('property_receipt')
        elif verb=='apply_output_column':
            if selected is None:failures.append('apply_without_editor');continue
            traces=[t for t in outcome.get('trace',[]) if t.get('event')=='output_column_row_verified' and t.get('mode')=='apply']
            values={**draft,'type':selected['type'],'data_kind':selected['data_kind']}
            if (len(traces)!=1 or any(traces[0].get('row',{}).get(k)!=v for k,v in values.items())
                or any(traces[0].get('row',{}).get('source',{}).get(k)!=selected['source'][k] for k in ('label','type'))):failures.append('apply_receipt')
            expected['target_fields']=[{**f,**draft} if f['record_id']==selected['record_id'] else f for f in expected['target_fields']]
            after=[n for observed_step,n in native if observed_step>step]
            if not after or semantic(after[0])!=semantic(expected):failures.append('native_after_apply')
            selected=None;draft=None;edits+=1
        else:failures.append('unexpected_mutation')
    if selected is not None:failures.append('unfinished_editor')
    final=deepcopy(baseline)
    for field in final['target_fields']:field.update(requested[field['source']['name']])
    if semantic(native[-1][1])!=semantic(final):failures.append('requested_final_mapping')
    if native[-1][0]<=max((m[0] for m in mutations),default=0):failures.append('final_native_read_missing')
    return dict(passed=not failures,failures=sorted(set(failures)),scope='prepared_output_field_batch_draft',edits=edits,
        source_identity_verified=not failures,settings_persistence_verified=False,package_persistence_verified=False,
        fixed_runtime_verified=False,hermes_acceptance_verified=False)


def configured_mapping_goal(mapping,columns):
    """Expected output derived from the request and input schema, never the result."""
    sources={c['name']:c for c in columns if c['used']}
    fields=mapping.get('fields',[dict(source=dict(kind='configured_field',name=name)) for name in sources]) if isinstance(mapping,dict) else None
    if (not isinstance(mapping,dict) or mapping.get('direction')!='output' or mapping.get('port')!=0
        or not isinstance(fields,list) or len(fields)!=len(sources)):
        raise ValueError('complete_configured_output_mapping_required')
    seen=set();names=set();result=[]
    for field in fields:
        ref=field.get('source',{});name=ref.get('name')
        if ref.get('kind')!='configured_field' or name not in sources or name in seen or field.get('excluded') is True:
            raise ValueError('unique_supported_configured_source_required')
        source=sources[name];target_name=field.get('name',name);label=field.get('label',source['label'])
        if not isinstance(target_name,str) or not target_name or target_name.casefold() in names or not isinstance(label,str):
            raise ValueError('unique_output_names_required')
        seen.add(name);names.add(target_name.casefold())
        result.append({**source,'name':target_name,'label':label,'source_name':source.get('source_name',name),
                       'mapping_source_name':name,'mapping_source_label':source['label']})
    return result


def verify_configured_mapping_final(observations,mutations,mapping,configured,expected):
    failures=[]
    native=[(step,s['node_mapping']) for step,s in observations if s.get('node_mapping',{}).get('verified') is True]
    if not native:return ['configured_native_mapping_missing']
    first,last=native[0][1],native[-1][1]
    sources=first.get('source_fields',[]);used=[c for c in configured if c['used']]
    if (len(sources)!=len(used) or len({f.get('record_id') for f in sources})!=len(sources)
        or any(len([c for c in used if all(c[k]==s.get(k) for k in ('name','label','type'))])!=1 for s in sources)):
        failures.append('configured_native_sources')
    for _,n in native:
        if (n.get('inventory_complete') is not True or n.get('source_identity_verified') is not True
            or n.get('source_fields')!=sources or n.get('node_context')!=first.get('node_context')
            or n.get('node_context',{}).get('verified') is not True):failures.append('configured_native_context')
    if last.get('autosync')!=mapping.get('autosync',first.get('autosync')):failures.append('configured_autosync')
    targets=last.get('target_fields',[])
    if len(targets)!=len(expected):return failures+['configured_output_count']
    for index,(field,wanted) in enumerate(zip(targets,expected)):
        source=next((s for s in sources if s.get('name')==wanted['mapping_source_name']),None)
        original=[f for f in first.get('target_fields',[]) if f.get('source')==source]
        if (len(original)!=1 or field.get('source')!=source or field.get('index')!=index
            or any(field.get(k)!=original[0].get(k) for k in ('record_id','field_id','required','type','data_kind'))
            or any(field.get(k)!=wanted[k] for k in ('name','label','type','data_kind'))):failures.append('configured_output_binding')
    edits=[step for step,a,_ in mutations if a.get('verb')!='wizard_step']
    if edits and native[-1][0]<=max(edits):failures.append('configured_native_post_edit')
    return failures
