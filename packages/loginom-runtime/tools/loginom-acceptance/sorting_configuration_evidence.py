"""Independent sorting configuration audit over authenticated raw observations.

It checks native records and dialog actions, not the handler's readback flag.
The enclosing acceptance audit must establish session/source/persistence identity.
"""
from node_procedure_evidence import verify_internal_sequence



def verify_sorting_configuration(events,request):
    failures=[]
    try:
        op=request['operation_id'];sequence=verify_internal_sequence(events,op,max_steps=4096)
        failures.extend(sequence['failures'])
        checkpoints=[e['result'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_checkpoint']
        if len(checkpoints)!=1 or checkpoints[0].get('status')!='SUCCEEDED':raise ValueError('sorting_checkpoint')
        result=checkpoints[0];node=result['node']
        def owned(c):
            return c.get('verified') is True and all(c.get(k)==node[k] for k in ('document_id','workflow_id','node_id'))
        observations=sequence['observations'];mutations=sequence['mutations']
        native=[(step,s['node_sorting']) for step,s in observations if s.get('node_sorting')]
        if not native or any(not owned(c.get('node_context',{})) or c.get('inventory_complete') is not True for _,c in native):raise ValueError('sorting_native_owner')
        before,after=native[0][1],native[-1][1]
        if before['input_fields']!=after['input_fields']:failures.append('sorting_input_identity')
        for key in ('chkBufferWhole','cbxMaxThreadCount'):
            if before['options'][key]!=after['options'][key]:failures.append('sorting_unrequested_option')
        p=request['parameters']
        if 'keys' in p:
            expected=[(k['field']['name'],i,k['direction']) for i,k in enumerate(p['keys'])]
            if [(k['name'],k['order'],k['direction']) for k in after['keys']]!=expected:failures.append('sorting_keys')
            for actual,wanted in zip(after['keys'],p['keys']):
                if actual['type'] in ('string','variant') and actual['case_sensitive']!=wanted.get('case_sensitive'):failures.append('sorting_case')
        elif before['keys']!=after['keys']:failures.append('sorting_preserved_keys')
        locale=p.get('compare_with_locale', True if request['target']['kind']=='new' else before['options']['chkLocaleAware']['value'])
        if after['options']['chkLocaleAware']!={'value':locale,'switch_pressed':False}:failures.append('sorting_locale')
        for step,action,outcome in mutations:
            previous=[s for n,s in observations if n<step]
            if not previous:raise ValueError('sorting_missing_before')
            state=previous[-1];control=next((e for e in state['ui']['elements'] if e['ref']==action.get('ref')), {})
            field=control.get('sorting_field')
            if field:
                native_state=state.get('node_sorting',{})
                inventory=native_state.get('keys',[]) if field['role']=='selected' else native_state.get('input_fields',[])
                matches=[f for f in inventory if f['record_id']==field['record_id'] and f['name']==field['field_key']]
                if len(matches)!=1:failures.append('sorting_action_record_binding')
        phases=[e['receipt'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_phase_completed']
        def phase(name):
            found=[e for e in phases if e.get('phase')==name]
            if len(found)!=1 or found[0].get('status')!='verified':raise ValueError('sorting_phase_'+name)
            return found[0]['value']
        c=phase('configure');m=phase('output_mapping')['native_mapping'];im=phase('input_mapping')['native_mapping']
        if c['configuration']!=after or c['validation']['status']!='accepted_by_loginom_next':failures.append('sorting_configure_receipt')
        raw_m=[s['node_mapping'] for _,s in observations if s.get('node_mapping')]
        if m not in raw_m or im not in raw_m or not owned(m['node_context']) or not owned(im['node_context']):failures.append('sorting_mapping_not_observed')
        if m.get('source_identity_verified') is not True:failures.append('sorting_output_sources')
        sources={f['record_id']:f for f in m['source_fields']};seen=set()
        for f in m['target_fields']:
            source=f.get('source') or f.get('exclusion_source')
            if not source or sources.get(source['record_id'])!=source or source['record_id'] in seen:raise ValueError('sorting_output_link')
            seen.add(source['record_id'])
        if seen!=set(sources):failures.append('sorting_output_coverage')
        for name in ('node_finish','finish'):
            f=phase(name)
            if f.get('settings_applied') is not True or not owned(f['node_context']):failures.append('sorting_finish_owner')
        if phase('node_finish')['mode']!='done':failures.append('sorting_intermediate_execution')
        for direction,native_map in [('input',im),('output',m)]:
            requested=next((x for x in request['mappings'] if x['direction']==direction),{})
            if 'autosync' in requested and native_map['autosync']!=requested['autosync']:failures.append('sorting_autosync')
        # The checkpoint projects precisely the final raw sorting/mapping values.
        rb=result['configuration']['readback']
        if rb['kind']!='sorting' or rb['node']!=node or rb['options']!=after['options']:failures.append('sorting_readback')
        if rb['keys']!=[{k:f[k] for k in ('name','label','type','order','direction','case_sensitive')} for f in after['keys']]:failures.append('sorting_readback_keys')
        if rb['comparison']!=after['comparison']:failures.append('sorting_readback_comparison')
        if rb['output_mapping']['fields']!=[dict(**{k:f[k] for k in ('index','name','label','type','data_kind','excluded')},source_name=(f.get('source') or f['exclusion_source'])['name']) for f in m['target_fields']]:failures.append('sorting_readback_output')
    except (KeyError,IndexError,TypeError,ValueError,AttributeError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'sorting_configuration_malformed:'+str(error))
    return dict(passed=not failures,failures=sorted(set(failures)),scope='sorting_raw_configuration')
