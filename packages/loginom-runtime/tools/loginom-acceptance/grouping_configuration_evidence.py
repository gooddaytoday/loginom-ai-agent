"""Independent grouping configuration audit over authenticated raw observations.

It checks native records and dialog actions, not the handler's readback flag.
The enclosing acceptance audit must establish session/source/persistence identity.
"""
from node_procedure_evidence import verify_internal_sequence, bound_grouping_factor

BITS={'sum':1,'count':2,'min':4,'max':8,'avg':16}

def verify_grouping_configuration(events,request):
    failures=[]
    try:
        op=request['operation_id'];sequence=verify_internal_sequence(events,op,max_steps=4096)
        failures.extend(sequence['failures'])
        checkpoints=[e['result'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_checkpoint']
        if len(checkpoints)!=1 or checkpoints[0].get('status')!='SUCCEEDED':raise ValueError('grouping_checkpoint')
        result=checkpoints[0];node=result['node']
        def owned(c):
            return c.get('verified') is True and all(c.get(k)==node[k] for k in ('document_id','workflow_id','node_id'))
        observations=sequence['observations'];mutations=sequence['mutations']
        native=[(step,s['node_grouping']) for step,s in observations if s.get('node_grouping')]
        if not native or any(not owned(c.get('node_context',{})) or c.get('inventory_complete') is not True for _,c in native):raise ValueError('grouping_native_owner')
        before,after=native[0][1],native[-1][1]
        def fields(c):return [{k:f[k] for k in ('record_id','name','label','type','concat')} for f in c['input_fields']]
        if fields(before)!=fields(after) or before['options']!=after['options']:failures.append('grouping_unrequested_settings')
        p=request['parameters']
        if p:
            keys=[f['name'] for f in p['group_by']];names=list(dict.fromkeys(m['field']['name'] for m in p['measures']))
            masks={n:sum(BITS[m['function']] for m in p['measures'] if m['field']['name']==n) for n in names}
            if [(f['name'],f['order'],f['disposition']) for f in after['keys']]!=[(n,i,6) for i,n in enumerate(keys)]:failures.append('grouping_keys')
            if [(f['name'],f['order'],f['disposition'],f['functions']) for f in after['measures']]!=[(n,i,7,masks[n]) for i,n in enumerate(names)]:failures.append('grouping_measures')
        elif before!=after:failures.append('grouping_preserved_configuration')
        for step,action,outcome in mutations:
            previous=[s for n,s in observations if n<step]
            s=previous[-1];control=next((e for e in s['ui']['elements'] if e['ref']==action.get('ref')), {})
            if (control.get('tid') or '').endswith(';FactorEditDialog;btnApply'):
                if not bound_grouping_factor(s):failures.append('grouping_factor_owner');continue
                factor=s['wizard']['factor_editor'];field=factor['selected_field']['field_key']
                mask=sum(1<<i for i,o in enumerate(factor['options']) if o['checked'])
                following=[c for n,c in native if n>step]
                if not following or next((f['functions'] for f in following[0]['measures'] if f['name']==field),None)!=mask:failures.append('grouping_factor_not_applied')
        phases=[e['receipt'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_phase_completed']
        def phase(name):
            found=[e for e in phases if e.get('phase')==name]
            if len(found)!=1 or found[0].get('status')!='verified':raise ValueError('grouping_phase_'+name)
            return found[0]['value']
        c=phase('configure');m=phase('output_mapping')['native_mapping'];im=phase('input_mapping')['native_mapping']
        if c['configuration']!=after or c['validation']['status']!='accepted_by_loginom_next':failures.append('grouping_configure_receipt')
        raw_m=[s['node_mapping'] for _,s in observations if s.get('node_mapping')]
        if m not in raw_m or im not in raw_m or not owned(m['node_context']) or not owned(im['node_context']):failures.append('grouping_mapping_not_observed')
        if m.get('source_identity_verified') is not True:failures.append('grouping_output_sources')
        sources={f['record_id']:f for f in m['source_fields']};seen=set()
        for f in m['target_fields']:
            source=f.get('source') or f.get('exclusion_source')
            if not source or sources.get(source['record_id'])!=source or source['record_id'] in seen:raise ValueError('grouping_output_link')
            seen.add(source['record_id'])
        if seen!=set(sources):failures.append('grouping_output_coverage')
        for name in ('node_finish','finish'):
            f=phase(name)
            if f.get('settings_applied') is not True or not owned(f['node_context']):failures.append('grouping_finish_owner')
        if phase('node_finish')['mode']!='done':failures.append('grouping_intermediate_execution')
        for direction,native_map in [('input',im),('output',m)]:
            requested=next((x for x in request['mappings'] if x['direction']==direction),{})
            if 'autosync' in requested and native_map['autosync']!=requested['autosync']:failures.append('grouping_autosync')
        # The checkpoint projects precisely the final raw grouping/mapping values.
        rb=result['configuration']['readback']
        if rb['kind']!='grouping' or rb['node']!=node or rb['options']!=after['options']:failures.append('grouping_readback')
        for key,columns in [('group_by',after['keys']),('measures',after['measures'])]:
            if rb[key]!=[{k:f[k] for k in ('name','label','type','order',*(['functions'] if key=='measures' else []))} for f in columns]:failures.append('grouping_readback_'+key)
        if rb['output_mapping']['fields']!=[dict(**{k:f[k] for k in ('index','name','label','type','data_kind','excluded')},source_name=(f.get('source') or f['exclusion_source'])['name']) for f in m['target_fields']]:failures.append('grouping_readback_output')
    except (KeyError,IndexError,TypeError,ValueError,AttributeError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'grouping_configuration_malformed:'+str(error))
    return dict(passed=not failures,failures=sorted(set(failures)),scope='grouping_raw_configuration')
