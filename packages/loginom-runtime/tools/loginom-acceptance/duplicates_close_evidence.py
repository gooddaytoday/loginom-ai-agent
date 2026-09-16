"""Prove draft disposal and read unchanged roles before the following operation."""
from node_procedure_evidence import verify_internal_sequence
from duplicates_configuration_evidence import verify_duplicates_configuration


def verify_duplicates_close(events, baseline_request, close_request, restored_request):
    failures=[]
    try:
        for request in (baseline_request, restored_request):
            failures.extend(verify_duplicates_configuration(events, request)['failures'])
        def result(request):
            matches=[e['result'] for e in events if e.get('operation_id')==request['operation_id'] and e.get('phase')=='node_checkpoint']
            if len(matches)!=1 or matches[0]['status']!='SUCCEEDED':raise ValueError('duplicates_close_checkpoint')
            return matches[0]
        baseline,closed,restored=map(result,(baseline_request,close_request,restored_request))
        if (close_request['finish']!='close' or close_request['parameters']==baseline_request['parameters']
                or close_request['mappings'] or close_request['inputs'] or not baseline['node']==closed['node']==restored['node']):
            raise ValueError('duplicates_close_contract')
        if (closed['execution']!=dict(status='not_requested',execution_id=None) or closed['output']['status']!='not_refreshed'
                or closed['configuration']!={'status':'discarded'}):raise ValueError('duplicates_close_freshness')
        seq=verify_internal_sequence(events,close_request['operation_id'],max_steps=4096);failures.extend(seq['failures'])
        phases=[e['receipt'] for e in events if e.get('operation_id')==close_request['operation_id'] and e.get('phase')=='node_phase_completed']
        if [p['phase'] for p in phases]!=['source','workflow','target','input_mapping','open','configure','finish']:
            raise ValueError('duplicates_close_phases')
        config,finish=phases[-2]['value'],phases[-1]['value']
        if config.get('draft_edits_skipped') is not True or config.get('effect_possible') is not False:
            raise ValueError('duplicates_close_no_edits')
        if any(finish.get(k)!=v for k,v in dict(mode='close',settings_applied=False,draft_discarded=True,execution_started=False,reopen_performed=False).items()):
            raise ValueError('duplicates_close_finish')
        for n,action,_ in seq['mutations']:
            s=next(s for step,s in reversed(seq['observations']) if step<n)
            if s.get('prepared_node_context',{}).get('surface')!='wizard':continue
            es=[e for e in s['ui']['elements'] if e['ref']==action.get('ref')]
            if len(es)!=1 or not ((action['verb']=='click' and es[0].get('tid')==s['wizard']['root_tid']+';btnClose')
                    or (action['verb']=='confirm_wizard_close' and es[0].get('tid')=='msgbox;tlb;yes')):
                raise ValueError('duplicates_close_unexpected_edit')
        later=verify_internal_sequence(events,restored_request['operation_id'],max_steps=4096)
        first=next(s['node_duplicates'] for _,s in later['observations'] if s.get('node_duplicates'))
        def roles(fields):return sorted(tuple(f[k] for k in ('name','label','type','data_kind','usage_type')) for f in fields)
        if roles(first['fields'])!=roles(baseline['configuration']['readback']['fields']):
            raise ValueError('duplicates_close_changed_saved_roles')
    except (KeyError,IndexError,TypeError,ValueError,StopIteration) as error:
        failures.append(str(error) or 'duplicates_close_missing_evidence')
    return dict(passed=not failures,failures=sorted(set(failures)),scope='duplicates_close_and_unchanged_roles',package_persistence_verified=False)
