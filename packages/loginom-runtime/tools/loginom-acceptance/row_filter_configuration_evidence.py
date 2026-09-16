"""Independent filter configuration proof from raw observations and receipts.

Native codes are intentionally independent of the client handler. The enclosing
acceptance must additionally prove fixture, execution and saved package identity.
"""
from node_procedure_evidence import verify_internal_sequence

CODES = {0:'<',1:'<=',2:'>',3:'>=',4:'=',5:'<>',6:'is_null',7:'not_null',
         8:'between',9:'not_between',10:'in',11:'not_in',12:'contains',
         13:'not_contains',14:'starts_with',15:'not_starts_with',
         16:'ends_with',17:'not_ends_with',22:'is_true',23:'is_false'}


def normalize_groups(groups):
    def condition(c):
        c = dict(c)
        if c['type'] == 'datetime':
            for k in ('value','lower','upper'):
                if k in c and len(c[k]) == 19:c[k] += '.000'
            if 'values' in c:c['values']=[v+'.000' if len(v)==19 else v for v in c['values']]
        return c
    return [[condition(c) for c in g] for g in groups]


def native_groups(native):
    groups=[[]]
    for row in native['rows']:
        if row['kind']=='or':
            if not groups[-1]:raise ValueError('filter_empty_native_group')
            groups.append([]);continue
        if row['kind']!='condition':raise ValueError('filter_native_row_kind')
        code=row['operator_code']
        if code not in CODES:raise ValueError('filter_native_operator')
        c={'field':row['field'],'type':row['type'],'operator':CODES[code]}
        if row['type']=='string' and code not in (6,7):c['case_sensitive']=row['case_sensitive']
        keys=[] if code in (6,7,22,23) else ['lower','upper'] if code in (8,9) else ['values'] if code in (10,11) else ['value']
        c.update({k:row[k] for k in keys});groups[-1].append(c)
    if not groups[-1]:raise ValueError('filter_empty_native_group')
    return normalize_groups(groups)


def verify_filter_configuration(events,request):
    failures=[]
    try:
        op=request['operation_id'];sequence=verify_internal_sequence(events,op,max_steps=4096)
        failures.extend(sequence['failures'])
        checkpoints=[e['result'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_checkpoint']
        if len(checkpoints)!=1 or checkpoints[0].get('status')!='SUCCEEDED':raise ValueError('filter_checkpoint')
        result=checkpoints[0];node=result['node'];observations=sequence['observations']
        def owned(c):return c.get('verified') is True and all(c.get(k)==node[k] for k in ('document_id','workflow_id','node_id'))
        native=[s['node_filter'] for _,s in observations if s.get('node_filter')]
        if not native or any(not owned(c.get('node_context',{})) or c.get('inventory_complete') is not True for c in native):raise ValueError('filter_native_owner')
        before,after=native[0],native[-1]
        if before['input_fields']!=after['input_fields']:failures.append('filter_input_identity')
        actual=native_groups(after)
        if 'groups' in request['parameters']:
            if actual!=normalize_groups(request['parameters']['groups']):failures.append('filter_conditions')
        elif before!=after:failures.append('filter_preserved_configuration')
        for step,action,outcome in sequence['mutations']:
            previous=[s for n,s in observations if n<step]
            if not previous:raise ValueError('filter_missing_before')
            state=previous[-1]
            control=next((e for e in state['ui']['elements'] if e['ref']==action.get('ref')), {})
            cell=control.get('filter_cell')
            if cell and len([r for r in state.get('node_filter',{}).get('rows',[]) if r['record_id']==cell['record_id']])!=1:
                failures.append('filter_action_record_binding')
        phases=[e['receipt'] for e in events if e.get('operation_id')==op and e.get('phase')=='node_phase_completed']
        def phase(name):
            found=[e for e in phases if e.get('phase')==name]
            if len(found)!=1 or found[0].get('status')!='verified':raise ValueError('filter_phase_'+name)
            return found[0]['value']
        configured=phase('configure');im=phase('input_mapping')['native_mapping']
        if configured['configuration']!=after or normalize_groups(configured['groups'])!=actual or configured['validation']['status']!='accepted_by_loginom_next':failures.append('filter_configure_receipt')
        if not owned(configured['validation']['node_context']):failures.append('filter_validation_owner')
        raw=[s['node_mapping'] for _,s in observations if s.get('node_mapping')]
        if im not in raw or not owned(im['node_context']) or im['node_context']['input_port']['port']!=0:failures.append('filter_input_mapping')
        ports=phase('output_mapping')['ports']
        if len(ports)!=2:raise ValueError('filter_output_count')
        rb=result['configuration']['readback']
        if rb['kind']!='row_filter' or rb['node']!=node or normalize_groups(rb['groups'])!=actual:failures.append('filter_readback')
        input_sources={f['record_id']:f for f in im['source_fields']};input_fields=[]
        for f in im['target_fields']:
            source=f.get('source')
            if not source or input_sources.get(source['record_id'])!=source:raise ValueError('filter_input_link')
            input_fields.append(dict(**{k:f[k] for k in ('index','name','label','type','data_kind')},source_name=source['name']))
        schema=lambda fields:sorted((f['name'],f['label'],f['type']) for f in fields)
        if schema(im['target_fields'])!=schema(after['input_fields']):failures.append('filter_effective_input_schema')
        if rb['input_mapping']!={'port':0,'autosync':im['autosync'],'fields':input_fields}:failures.append('filter_readback_input')

        for port,p in enumerate(ports):
            m=p['native_mapping']
            if p['port']!=port or m not in raw or not owned(m['node_context']) or m['node_context']['output_port']['port']!=port:failures.append('filter_output_mapping')
            if m.get('source_identity_verified') is not True:failures.append('filter_output_sources')
            sources={f['record_id']:f for f in m['source_fields']};seen=set();fields=[]
            for f in m['target_fields']:
                source=f.get('source') or f.get('exclusion_source')
                if not source or sources.get(source['record_id'])!=source or source['record_id'] in seen:raise ValueError('filter_output_link')
                seen.add(source['record_id'])
                fields.append(dict(**{k:f[k] for k in ('index','name','label','type','data_kind','excluded')},source_name=source['name']))
            if seen!=set(sources):failures.append('filter_output_coverage')
            if rb['output_mappings'][port]!={'port':port,'autosync':m['autosync'],'fields':fields}:failures.append('filter_readback_output')
            requested=next((x for x in request['mappings'] if x['direction']=='output' and x['port']==port),{})
            if 'autosync' in requested and requested['autosync']!=m['autosync']:failures.append('filter_output_autosync')
        for name in ('node_finish','finish'):
            f=phase(name)
            if f.get('settings_applied') is not True or not owned(f['node_context']):failures.append('filter_finish_owner')
        if phase('node_finish')['mode']!='done':failures.append('filter_intermediate_execution')
    except (KeyError,IndexError,TypeError,ValueError,AttributeError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'filter_configuration_malformed:'+str(error))
    return dict(passed=not failures,failures=sorted(set(failures)),scope='filter_raw_configuration')
