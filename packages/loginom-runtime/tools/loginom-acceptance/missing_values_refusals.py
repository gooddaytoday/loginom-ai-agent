"""Scoped terminal placement-refusal proof; never a full-goal acceptance verdict.

All events/calls remain in input. Callers must still audit every successful goal
operation, native save, model identity and independent reopen.
"""
from copy import deepcopy
import math
from evidence import PREFIX, KNOWLEDGE_TOOLS
from json_digest import javascript_digest
from node_procedure_evidence import verify_internal_sequence
from node_public_acceptance_evidence import paired_public_calls


def one(xs):
    if len(xs)!=1:raise ValueError('unique refusal evidence required')
    return xs[0]


def stable(v):
    if isinstance(v,dict):return {k:stable(v[k]) for k in sorted(v)}
    if isinstance(v,list):return [stable(x) for x in v]
    return v


def digest(v):return javascript_digest(stable(v))


def semantic(r):
    v=deepcopy(r);v.pop('operation_id');v['target'].pop('position',None);return v


def bound_context(v,r,source):
    return v.get('verified') is True and all(v.get(k)==source[k] for k in ('document_id','workflow_id','node_id')) and source['document_id']==r['document_id'] and source['workflow_id']==r['workflow_ref']['workflow_id']


def source_proof(events,r):
    op=r['operation_id'];rows=[e for e in events if e.get('operation_id')==op]
    proof=one([e['proof'] for e in rows if e.get('phase')=='missing_values_preflight_completed'])
    source=r['inputs'][0]['source'];port=r['inputs'][0]['output']
    assert len(r['inputs'])==1 and r['inputs'][0]['input']==0
    assert proof['verified'] is True and proof['cleanup_complete'] is True and proof['settings_changed'] is False and proof['parameters_valid'] is True
    assert proof['effect_possible'] is True and proof['source']==source and proof['port']==port and proof['port_guid']
    assert proof['source_activity']==dict(before=True,after=False,changed=True)
    c=proof['cancellation'];assert c['verified'] is True and c['cleanup_complete'] is True and c['draft_discarded'] is True and c['settings_applied'] is False and c['execution_started'] is False and c['mode']=='close'
    assert bound_context(c['node_context'],r,source) and c['node_context']['surface']=='graph'
    seq=verify_internal_sequence(events,op,max_steps=4096);assert not seq['failures']
    observations=seq['observations'];assert observations
    for _,s in observations:assert bound_context(s['prepared_node_context'],r,source)
    ports=[];mappings=[]
    for step,s in observations:
        if s.get('node_outputs',{}).get('verified') is True and s['node_outputs'].get('surface')=='graph' and s['node_outputs'].get('ports'):
            out=s['node_outputs'];assert bound_context(out['node_context'],r,source)
            p=one([p for p in out['ports'] if p['index']==port]);assert p['port_guid']==proof['port_guid'];ports.append((step,p))
        if s.get('node_mapping',{}).get('verified') is True:
            m=s['node_mapping'];assert m['inventory_complete'] is True and m['source_identity_verified'] is True and bound_context(m['node_context'],r,source)
            assert s['wizard']['stage']=='output_mapping' and s['prepared_node_context']['output_port']['port_guid']==proof['port_guid']
            mappings.append(m)
    assert ports[0][1]['active'] is True and ports[-1][1]['active'] is False
    assert mappings and all(m==mappings[0] for m in mappings)
    fields=[{k:f[k] for k in ('name','label','type','data_kind')} for f in mappings[0]['target_fields'] if not f['excluded']]
    # A requested separate mapping is not applied during this source inspection.
    # Only the exact projected field names/labels may differ from the raw source.
    for m in r['mappings']:
        if m['direction']=='input' and 'fields' in m:
            original={f['name']:f for f in fields};assert len(m['fields'])==len(fields)
            assert len({f['source']['name'] for f in m['fields']})==len(fields)
            fields=[dict(original[f['source']['name']],name=f.get('name',f['source']['name']),label=f.get('label',original[f['source']['name']]['label'])) for f in m['fields']]
    assert proof['schema']==fields
    opened=closed=0
    for step,a,outcome in seq['mutations']:
        prior=[s for i,s in observations if i<step][-1];verb=a['verb']
        if verb=='open_output_port':assert a['port']==port;opened+=1
        elif verb=='confirm_wizard_close':closed+=1
        elif verb=='click':
            el=one([e for e in prior['ui']['elements'] if e['ref']==a['ref']]);tid=el['tid']
            allowed={prior['prepared_node_context'].get('tid'),r['workflow_ref']['prefix']+';WizrdMCF;btnClose'}
            # Source selection, changing its mapping view, and closing the
            # unchanged draft are the only permitted clicks. No settings/Done.
            allowed.add(r['workflow_ref']['prefix']+';WizrdMCF;DataSetOutputSocketWizard;btnGridView')
            assert tid in allowed
        else:raise ValueError('Unsupported source preflight mutation')
    assert opened==1 and closed==1 and observations[-1][1]['wizard']['status']=='absent'
    assert observations[-1][1]['ui']['dialogs']==[] and observations[-1][1]['ui']['masks']==[]
    return proof


def graph_proof(events,r):
    rows=[e for e in events if e.get('operation_id')==r['operation_id']]
    attempts=[e for e in rows if e.get('phase')=='node_target_effect_prepared']
    observations=[e for e in rows if e.get('phase')=='node_target_refusal_observed']
    states=[e['target_state'] for e in rows if e.get('phase')=='node_target_checkpoint']
    assert 1<=len(attempts)<=3 and len(observations)==len(attempts) and states
    graph_request={k:r[k] for k in ('document_id','workflow_ref','target','inputs')}
    baseline=states[0]['baseline'];assert baseline['complete'] is True and baseline['interaction_ready'] is True
    assert baseline['document_id']==r['document_id'] and baseline['workflow_ref']==r['workflow_ref'] and baseline['dom_epoch']
    assert len(baseline['nodes'])<=200 and len(baseline['links'])<=400 and isinstance(baseline['foreign_links'],list)
    assert len({n['ref']['node_id'] for n in baseline['nodes']})==len(baseline['nodes'])
    for n in baseline['nodes']:assert n['ref']['document_id']==r['document_id'] and n['ref']['workflow_id']==r['workflow_ref']['workflow_id']
    if r['target']['type']=='imports.text':
        assert r['mode']=='delimited' and r['target']['kind']=='new' and r['inputs']==[]
    else:
        one([n for n in baseline['nodes'] if n['ref']==r['inputs'][0]['source']])
    for i,(a,o) in enumerate(zip(attempts,observations)):
        e=a['effect'];proof=o['refusal'];receipt=proof['receipt']
        assert rows.index(a)<rows.index(o) and (i==0 or rows.index(observations[i-1])<rows.index(a))
        assert e['id']==r['operation_id']+':graph:'+str(i) and e['kind']=='create' and e['parameters']==r['target'] and e['before']==baseline
        assert proof['effect']==e and proof['after_graph']==baseline
        assert receipt['status']=='NOT_APPLIED' and receipt['effect_possible'] is False and receipt['cleanup_complete'] is True
        p=receipt['placement_refusal'];assert p['kind']=='unreachable_drop_surface' and p['reachable'] is False and p['requested_position']==r['target']['position']
        b=p['graph_rect'];v=p['viewport'];t=p['screen_point'];assert all(type(n) in (int,float) and math.isfinite(n) for n in [*b.values(),*v.values(),*t.values()])
        assert b['width']>0 and b['height']>0 and v['width']>0 and v['height']>0
        assert t==dict(x=b['x']+p['requested_position']['x'],y=b['y']+p['requested_position']['y'])
        reachable=0<=t['x']<v['width'] and 0<=t['y']<v['height'] and b['x']<=t['x']<b['x']+b['width'] and b['y']<=t['y']<b['y']+b['height'] and p['hit_inside'] is True
        assert not reachable and type(p['hit_inside']) is bool
    for s in states:assert s['signature']==digest(graph_request) and s['targetId'] is None and s['receipts']==[] and s['effect_possible'] is False and s.get('pending') is None and s['baseline']==baseline and not s.get('completed')
    assert states[-1]['refusals']==[dict(id=a['effect']['id'],kind='create',receipt=o['refusal']['receipt']) for a,o in zip(attempts,observations)]
    return len(attempts)


def classify(evidence,*,runtime_revision,manifest_sha256):
    """Return an audited partition. No unproved prepared operation is skipped."""
    try:
        events=evidence['events'];pairs,errors=paired_public_calls(evidence);assert not errors
        allowed=KNOWLEDGE_TOOLS|{PREFIX+n for n in ('dock_prepare','dock_action_describe','dock_workspace_observe','dock_diagnostics','dock_operation_inspect','dock_node_apply','dock_node_status','dock_node_wait','dock_artifact_deliver','dock_artifact_delivery_status','dock_action_run')}
        assert all(c['tool'] in allowed for c,t in pairs)
        assert all(c['arguments'].get('action_key') in ('package.save_checkpoint','package.save_as') for c,t in pairs if c['tool']==PREFIX+'dock_action_run')
        node_tools={PREFIX+n for n in ('dock_node_apply','dock_node_wait','dock_node_status')}
        assert all(t['result'].get('result_version')=='user-v1' for c,t in pairs if c['tool'] in node_tools)
        declarations=[e for e in events if e.get('phase')=='node_apply_prepared'];assert declarations
        ids=[e['operation_id'] for e in declarations];assert len(set(ids))==len(ids)
        successful={};refusals={};ends={};sid=declarations[0]['session_id']
        for d in declarations:
            r=d['request'];op=r['operation_id'];assert op==d['operation_id']
            rows=[e for e in events if e.get('operation_id')==op]
            assert all(e['session_id']==sid and e['runtime_revision']==runtime_revision and e['manifest_sha256']==manifest_sha256 for e in rows)
            end=one([e for e in rows if e.get('phase')=='completed']);ends[op]=end
            assert events.index(d)<events.index(end) and end['action_key']=='node.apply' and end['parameters']==r
            assert end['checkpoint']['document_id']==r['document_id'] and end['checkpoint']['workflow_ref']==r['workflow_ref']
            checkpoints=[e for e in rows if e.get('phase')=='node_checkpoint']
            if end['outcome']['status']=='SUCCEEDED':
                checkpoint=one(checkpoints);assert end['outcome']['output']==checkpoint['result'] and checkpoint['result']['status']=='SUCCEEDED'
                successful[op]=r;continue
            if r['target']['type']=='imports.text':
                from import_placement_refusals import prove
                assert checkpoints==[]
                refusals[op]=prove(evidence,pairs,r,d,end)
                continue
            assert checkpoints==[] and r['target']['kind']=='new' and r['target']['type']=='preprocessing.data_recovery' and r['mode']=='impute'
            permitted={'prepared','completed','node_apply_prepared','node_observation_completed','node_observation_sample','node_phase_prepared','node_phase_completed','node_phase_refused','node_step_completed','node_step_prepared','node_step_refresh_authorized','node_target_checkpoint','node_target_effect_prepared','node_target_refusal_observed','missing_values_preflight_completed','verification_delivered'}
            assert all(e.get('phase') in permitted for e in rows)
            start=one([e for e in rows if e.get('phase')=='prepared'])
            assert start['action_key']=='node.apply' and start['parameters']==r and start['checkpoint']==end['checkpoint'] and events.index(start)<events.index(d)
            sig=digest(dict(request=r,handler_revision='missing-values-v1-internal-1',output_wizard='separate'));assert d['signature']==sig
            prepared_phases=[e for e in rows if e.get('phase')=='node_phase_prepared']
            assert [e['receipt']['phase'] for e in prepared_phases]==['source','workflow','target']
            assert all(e['signature']==sig and e['receipt']['receipt_id']==op+':'+e['receipt']['phase'] for e in prepared_phases)
            out=end['outcome'];n=out['output']
            assert out['operation_id']==op and out['action_key']=='node.apply' and out['action_revision']==r['contract_revision']
            assert out['status']==n['status']=='FAILED' and out['effect_possible'] is n['effect_possible'] is True and out['cleanup_complete'] is n['cleanup_complete'] is True
            assert n['operation_id']==op and n['node'] is None and n['pending_phase'] is None and n['execution']==dict(status='not_requested',execution_id=None)
            assert n['output']==dict(status='not_refreshed',evidence_ref=None,ports=[]) and n['package_saved'] is False
            accepted=[e for e in rows if e.get('phase')=='node_phase_completed'];assert [e['receipt']['phase'] for e in accepted]==['source','workflow']
            assert all(e['signature']==sig and e['receipt']['value']['verified'] is True and e['receipt']['value']['cleanup_complete'] is True for e in accepted)
            assert n['phases']==[{k:v for k,v in e['receipt'].items() if k!='value'} for e in accepted]
            refused=one([e for e in rows if e.get('phase')=='node_phase_refused']);f=refused['receipt']
            assert refused['signature']==sig and f['phase']=='target' and f['receipt_id']==op+':target' and f['status']=='FAILED' and f['effect_possible'] is True and f['cleanup_complete'] is True and f['settings_unchanged'] is True and f['verification']=='missing_values_preflight_completed'
            assert not any(e.get('phase') in ('node_apply_resume_prepared','reconciled','recovery_unverified','node_target_reconciled') for e in rows)
            proof=source_proof(events,r);attempts=graph_proof(events,r)
            pre=one([e for e in rows if e.get('phase')=='missing_values_preflight_completed'])
            first=next(e for e in rows if e.get('phase')=='node_target_effect_prepared')
            last=[e for e in rows if e.get('phase')=='node_target_refusal_observed'][-1]
            assert events.index(pre)<events.index(first)<events.index(last)<events.index(refused)<events.index(end)
            refusals[op]=dict(request=r,outcome=out,attempts=attempts,source=proof['source'],source_port_guid=proof['port_guid'])
        used=set()
        for op,f in refusals.items():
            successor=one([other for other,r in successful.items() if semantic(r)==semantic(f['request']) and r['target']['position']!=f['request']['target']['position']])
            assert successor not in used;used.add(successor)
            start=one([e for e in declarations if e['operation_id']==successor]);assert events.index(ends[op])<events.index(start)
            public=[(c,r) for c,r in pairs if c['arguments'].get('operation_id')==op and c['tool'] in {PREFIX+'dock_node_apply',PREFIX+'dock_node_wait',PREFIX+'dock_node_status'}]
            for call,reply in public:
                v=reply['result'];assert v.get('isError') is not True and v['attempt']==1 and v['cancel_requested'] is False and v['server_stop_requested'] is False
                if v['state']=='running':
                    assert v['error'] is None
                    progress=v.get('progress')
                    if progress is not None:
                        assert set(progress)=={'node','execution','accepted_phases','pending_phase','effect_possible','cleanup_complete'}
                        assert progress['node'] is None and progress['execution']==dict(status='not_requested',execution_id=None)
                        assert progress['accepted_phases'] in ([],['source'],['source','workflow'])
                        assert progress['pending_phase'] in (None,'source','workflow','target') and type(progress['effect_possible']) is bool and type(progress['cleanup_complete']) is bool
            settled=[r['row'] for c,r in public if r['result'].get('state')=='settled'];assert settled
            starts=[c['row'] for c,r in pairs if c['tool']==PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==successor];assert starts and min(settled)<min(starts)
            f['successor']=successor
        # Recovery remains forbidden. Inspect is only admissible for a refused
        # operation, after its terminal result, and must attest exact resolution.
        for c,t in pairs:
            if c['tool'] in {PREFIX+n for n in ('dock_node_resume','dock_node_cancel','dock_node_stop','dock_operation_recover','dock_artifact_delivery_resume')}:
                raise ValueError('Unsupported recovery call')
            if c['tool']==PREFIX+'dock_operation_inspect':
                op=c['arguments']['operation_id'];assert c['arguments']==dict(operation_id=op) and op in ends
                v=t['result'];assert v['result_version']=='user-v1' and v['status']=='SUCCEEDED' and v['action_key']=='operation.inspect' and v['operation_id']==op and v['effect_possible'] is False and v['error'] is None
                from user_result_evidence import project_action
                raw=dict(status='SUCCEEDED',action_key='operation.inspect',action_revision='1',operation_id=op,phase='observed',effect_possible=False,error=None,trace=[],output=v['output'])
                assert project_action(raw)==v
                receipts=[x for x in events if x.get('operation_id')==op and x.get('phase')=='verification_delivered' and x['verification'].get('action_key')=='operation.inspect']
                inspections=[a for a,t in pairs if a['tool']==PREFIX+'dock_operation_inspect' and a['arguments'].get('operation_id')==op]
                assert len(receipts)==len(inspections) and all(x['verification']['receipt_sha256']==javascript_digest(raw) and events.index(x)>events.index(ends[op]) for x in receipts)
                s=v['output'];assert s['operation_id']==op and s['state']=='resolved' and s['cleanup_confirmed'] is True and s['effect_state']=='verified' and s['outcome']==ends[op]['outcome'] and s['recovery_options']==[]
                delivered=[t['row'] for a,t in pairs if a['tool'] in {PREFIX+'dock_node_apply',PREFIX+'dock_node_wait',PREFIX+'dock_node_status'} and a['arguments'].get('operation_id')==op and t['result'].get('state')=='settled'];assert delivered and min(delivered)<c['row']
        return dict(passed=True,successful=successful,refusals=refusals,total_prepared=len(declarations),successful_count=len(successful),refusal_count=len(refusals),scope='missing_values_terminal_placement_refusals',full_goal_accepted=False)
    except (KeyError,TypeError,ValueError,AssertionError,IndexError,AttributeError) as e:
        return dict(passed=False,failures=[str(e) or 'terminal_refusal_proof_mismatch'],scope='missing_values_terminal_placement_refusals',full_goal_accepted=False)


def audit_accounting(evidence,*,runtime_revision,manifest_sha256,save_ids):
    """Compose scoped proof and exact public checks without removing any input."""
    from user_result_evidence import normalize_user_evidence
    from node_public_acceptance_evidence import verify_public_nodes_and_saves
    partition=classify(evidence,runtime_revision=runtime_revision,manifest_sha256=manifest_sha256)
    if not partition['passed']:return partition
    terminal={op:f['outcome'] for op,f in partition['refusals'].items()}
    normalized,projection=normalize_user_evidence(evidence,terminal_outcomes=terminal)
    requests={e['operation_id']:e['request'] for e in evidence['events'] if e.get('phase')=='node_apply_prepared'}
    public=verify_public_nodes_and_saves(normalized,requests,save_ids,terminal_outcomes=terminal)
    return dict(partition,passed=projection['passed'] and public['passed'],projection=projection,public=public)
