"""Journal-bound rendered import roundtrip; not schema or persistence admission."""
import import_settings_evidence as settings
import copy
import re
from urllib.parse import urlsplit
import rename_effect
from settings_evidence import bound_receipts


def _mutation(call):
    name = call.get('tool', '')
    return name.endswith(('dock_ui_action', 'dock_action_run', 'dock_operation_recover',
                          'dock_artifact_upload')) or 'browser_' in name


def _verb(receipt):
    return receipt['call'].get('arguments', {}).get('action', {}).get('verb')


def _delivered_element(receipt, receipts):
    call = receipt['call']; args = call.get('arguments', {}); action = args.get('action', {})
    ref = action.get('ref'); verb = action.get('verb'); observation = args.get('observation_id')
    prior = [r for r in receipts if r['reply_row'] < call['row']
             and r['call'].get('session_id') == call.get('session_id') and observation
             and r['delivered'].get('output', {}).get('observation_id') == observation]
    elements = [e for r in prior for e in r['delivered'].get('output', {}).get('ui', {}).get('elements', [])
                if e.get('ref') == ref and verb in e.get('allowed_actions', [])]
    if any(sum(e.get('ref') == ref for e in r['delivered'].get('output', {}).get('ui', {}).get('elements', [])) > 1 for r in prior):
        return None
    # Multiple delivered copies must agree, and a ref cannot identify two
    # different elements. Paging repeats are not silently used as new proof.
    if not elements or any(e != elements[0] for e in elements):
        return None
    return elements[0]


def _issued(receipt, receipts):
    element = _delivered_element(receipt, receipts)
    if element is None:return None
    action=receipt['call'].get('arguments',{}).get('action',{});ref=action.get('ref');verb=action.get('verb')
    trace = receipt['outcome'].get('trace', [])
    if (sum(t.get('event') == 'ui_preconditions_verified' and t.get('refs') == [ref]
            and t.get('verb') == verb for t in trace) != 1
            or sum(t.get('event') == 'ui_gesture_applied' and t.get('verb') == verb for t in trace) != 1):
        return None
    return element


def _semantic_owner(snapshot):
    owner = snapshot['wizard']['owner_context']
    if owner.get('status') != 'observed':
        return None
    parent=owner['path'][-3]['tid']+'>'
    tid=owner['node']['tid']
    if not tid.startswith(parent):return None
    graph_key=tid[len(parent):]
    if not graph_key or '>' in graph_key or ';' in graph_key:return None
    return {'graph_key':graph_key,'node': {k: owner['node'][k] for k in ('tid', 'label')},
            'path': [{k: p[k] for k in ('tid', 'label')} for p in owner['path']]}


def _same_origin(left, right):
    """Allow only the observed origin/root-URL slash projection, not URL paths."""
    def origin(value):
        if not isinstance(value, str):return None
        try:
            parsed=urlsplit(value)
            if (parsed.scheme in ('http','https') and parsed.hostname
                    and not parsed.username and not parsed.password
                    and parsed.path in ('','/') and not parsed.query and not parsed.fragment
                    and not any(c.isspace() for c in value)):
                return value[:-1] if value.endswith('/') else value
        except ValueError:pass
        return None
    normalized=origin(left)
    return normalized is not None and normalized==origin(right)


def _same_context(snapshot, baseline):
    return (snapshot.get('authenticated') is True
            and _same_origin(snapshot.get('origin'), baseline.get('origin'))
            and all(baseline.get(key) is not None and snapshot.get(key) == baseline[key] for key in
                ('loginom_build', 'workflow_ref', 'package_identity', 'active_tab_ref'))
            and baseline.get('dom_epoch', {}).get('document') is not None
            and snapshot.get('dom_epoch', {}).get('document') == baseline['dom_epoch']['document']
            and snapshot.get('ui', {}).get('dialogs') == [] and snapshot.get('ui', {}).get('masks') == [])


def _graph(snapshot, owner):
    if not isinstance(snapshot,dict):return False
    workflow=snapshot.get('workflow_ref')
    if not isinstance(workflow,dict) or not isinstance(workflow.get('prefix'),str):return False
    if (snapshot.get('wizard', {}).get('status') != 'absent'
            or snapshot.get('navigation_context', {}).get('status') != 'observed'
            or snapshot['navigation_context'].get('path') != owner['path'][:-2]):
        return False
    identity=snapshot.get('graph_identity',{})
    prefix=identity.get('native_prefix')
    if (identity.get('status')!='observed' or not isinstance(identity.get('container_ref'),str)
            or not identity['container_ref'] or identity.get('container_tid')!=workflow['prefix']+';ModelForm;cmpDiagram'
            or not isinstance(prefix,str) or not re.fullmatch(r'MF;TF(?:-\d+)?;Graph;',prefix)):
        return False
    bodies = [e for e in snapshot['ui'].get('elements', [])
              if e.get('graph_node') == {'node_label': owner['graph_key'], 'part': 'body'}]
    labels=[e for e in snapshot['ui'].get('elements',[]) if e.get('graph_node',{}).get('part')=='label'
            and (e['graph_node'].get('node_label')==owner['graph_key'] or e['graph_node'].get('label_text')==owner['node']['label'])]
    return (len(bodies)==len(labels)==1 and bodies[0].get('scope')==labels[0].get('scope')=='graph'
            and bodies[0].get('tid')==prefix+owner['graph_key']
            and labels[0].get('tid')==prefix+owner['graph_key']+';Label;Label'
            and labels[0]['graph_node'].get('node_label')==owner['graph_key']
            and labels[0]['graph_node'].get('label_text')==owner['node']['label'])


def _issued_graph_binding(receipt,receipts,owner,baseline,identity):
    """Bind issued graph elements to their actual delivered container snapshot."""
    args=receipt['call'].get('arguments',{});ref=args.get('action',{}).get('ref')
    candidates=[r['delivered']['output'] for r in receipts if r['reply_row']<receipt['call']['row']
                and r['call'].get('session_id')==receipt['call'].get('session_id')
                and r['delivered'].get('output',{}).get('observation_id')==args.get('observation_id')
                and any(e.get('ref')==ref for e in r['delivered'].get('output',{}).get('ui',{}).get('elements',[]))]
    if not candidates:return False
    for snapshot in candidates:
        if not _same_context(snapshot,baseline) or not _graph(snapshot,owner) or snapshot.get('graph_identity')!=identity:return False
        element=next(e for e in snapshot['ui']['elements'] if e.get('ref')==ref)
        part=element.get('graph_node',{}).get('part')
        suffix='' if part=='body' else ';Setting' if part=='settings' else None
        if suffix is None or element.get('scope')!='graph' or element.get('tid')!=identity['native_prefix']+owner['graph_key']+suffix:return False
    return True


def _page(snapshot, expected, source_path, stage):
    if stage == 'text_import_file':
        return settings.source_compare(snapshot, expected, source_path).get('rendered_import_source_match') is True
    if stage == 'text_import_format':
        return settings.compare(snapshot, expected).get('rendered_import_settings_match') is True
    return settings.mapping_compare(snapshot, expected).get('rendered_import_mapping_match') is True


def _finished_owner(receipt, before, after, owner, receipts):
    """Only the issued ready automatic label can bridge the finish identity."""
    completion=before.get('wizard',{}).get('completion',{})
    label=completion.get('fields',{}).get('label',{})
    if label.get('value')==owner['node']['label']:
        return owner
    mode=completion.get('fields',{}).get('label_mode',{})
    value=label.get('value')
    if (completion.get('ready') is not True or label.get('status')!='observed'
            or label.get('truncated') is not False or not isinstance(value,str) or not value.strip()
            or mode.get('status')!='observed' or mode.get('truncated') is not False
            or mode.get('value')!='Автоматическая метка'):
        return None
    wizard=before['wizard'];element=_issued(receipt,receipts)
    if (not element or element.get('wizard_finish')!={'root_ref':wizard.get('root_ref'),
            'owner':wizard.get('owner_context'),'completion':completion}
            or not wizard.get('root_tid') or element.get('tid')!=wizard['root_tid']+';btnDone'
            or element.get('enabled') is not True or element.get('visible') is not True):return None
    key=re.sub(r'\s','_',value).replace(',','')
    if not key or any(c in key for c in '>;'):return None
    result=copy.deepcopy(owner);result['graph_key']=key
    old_tid=owner['node']['tid'];new_tid=old_tid.rsplit('>',1)[0]+'>'+key
    result['node']={'tid':new_tid,'label':value}
    result['path'][-2]={'tid':new_tid,'label':value}
    if not result['path'][-1]['tid'].startswith(old_tid+'>'):return None
    result['path'][-1]['tid']=new_tid+result['path'][-1]['tid'][len(old_tid):]
    return result if _graph(after,result) else None


def _transition_trace(receipt, before, after, owner, finished_owner=None):
    verb = _verb(receipt)
    event = {'wizard_step':'wizard_step_verified', 'finish_wizard':'wizard_finish_graph_verified',
             'open_wizard':'wizard_open_verified'}.get(verb)
    if event is None:
        return True
    records = [t for t in receipt['outcome'].get('trace', []) if t.get('event') == event]
    if len(records) != 1:
        return False
    record = records[0]
    if verb == 'wizard_step':
        return (record.get('from_stage') == before['wizard']['stage']
                and record.get('to_stage') == after['wizard']['stage']
                and record.get('root_ref') == after['wizard']['root_ref']
                and before['wizard']['root_ref'] == after['wizard']['root_ref']
                and receipt['call']['arguments']['action'].get('expected_stage') == after['wizard']['stage']
                and record.get('settings_applied') is False)
    if verb == 'finish_wizard':
        target=finished_owner or owner
        bodies = [e for e in after['ui'].get('elements', []) if e.get('graph_node') == record.get('node')
                  and e.get('ref') == record.get('node_ref')]
        return (record.get('previous_owner') == before['wizard']['owner_context']['node']
                and record.get('label')==before['wizard'].get('completion',{}).get('fields',{}).get('label',{}).get('value')==target['node']['label']
                and record.get('node') == {'node_label':target['graph_key'], 'part':'body'}
                and len(bodies) == 1 and record.get('reopen_required') is True
                and record.get('settings_readback_verified') is False and record.get('package_saved') is False)
    return (record.get('node') == {'node_label':owner['graph_key'], 'part':'settings'}
            and record.get('workflow_path') == owner['path'][:-2]
            and record.get('wizard_root_ref') == after['wizard']['root_ref']
            and record.get('owner_node') == after['wizard']['owner_context']['node']
            and record.get('settings_applied') is False)


def _no_effect_reply(call,evidence):
    """Unique native no-effect outcome or an idle validation refusal only."""
    key=(call.get('session_id'),call.get('tool_call_id'))
    calls=[c for c in evidence.get('calls',[]) if (c.get('session_id'),c.get('tool_call_id'))==key]
    replies=[t for t in evidence.get('tools',[]) if (t.get('session_id'),t.get('tool_call_id'))==key]
    if len(calls)!=1 or len(replies)!=1 or replies[0].get('tool')!=call.get('tool') or replies[0].get('row',-1)<=call['row']:return None
    reply=replies[0];result=reply.get('result',{})
    if not isinstance(result,dict) or result.get('effect_possible') is not False:return None
    op=call.get('arguments',{}).get('operation_id')
    if not isinstance(op,str) or not op:return None
    if result.get('status')=='NOT_APPLIED' and result.get('phase')=='preconditions' and result.get('cleanup_complete') is True:
        if result.get('operation_id')!=op or result.get('action_key')!='ui.act':return None
        trace=result.get('trace',[])
        if result.get('error',{}).get('code')!='UI_EPOCH_CHANGED':return None
        if any(t.get('event') not in ('ui_observation_started','ui_action_failed') for t in trace):return None
        if sum(t.get('event')=='ui_action_failed' and t.get('code')=='UI_EPOCH_CHANGED' for t in trace)!=1:return None
        events=[e for e in evidence.get('events',[]) if e.get('operation_id')==op and e.get('phase')=='completed']
        raw=copy.deepcopy(result);raw.get('output',{}).pop('operation',None)
        if len(events)!=1 or not rename_effect.journal_equal(events[0].get('outcome',{}),raw):return None
        peers=[c for c in evidence.get('calls',[]) if c.get('arguments',{}).get('operation_id')==op
               and c.get('tool','').endswith('dock_ui_action') and c!=call]
        # Later validation refusals can reference this immutable operation;
        # no second dispatched action may share its identity.
        for peer in peers:
            if peer.get('session_id')!=call.get('session_id') or peer.get('row',-1)<=reply['row']:return None
            twins=[t for t in evidence.get('tools',[]) if (t.get('session_id'),t.get('tool_call_id'))==(peer.get('session_id'),peer.get('tool_call_id'))]
            if len(twins)!=1 or not _idle_refusal(twins[0].get('result',{})):return None
        return reply
    if _idle_refusal(result):
        events=[e for e in evidence.get('events',[]) if e.get('operation_id')==op]
        if not events:return reply
        previous=[c for c in evidence.get('calls',[]) if c.get('tool')==call.get('tool')
                  and c.get('session_id')==call.get('session_id') and c.get('arguments',{}).get('operation_id')==op and c['row']<call['row']]
        # Recursion only into an earlier NOT_APPLIED receipt, never refusals.
        for prev in previous:
            rr=[t for t in evidence.get('tools',[]) if (t.get('session_id'),t.get('tool_call_id'))==(prev.get('session_id'),prev.get('tool_call_id'))]
            if len(rr)==1 and rr[0].get('result',{}).get('status')=='NOT_APPLIED' and rr[0]['row']<call['row'] and _no_effect_reply(prev,evidence):return reply
    return None


def _idle_refusal(result):
    if not isinstance(result,dict):return False
    operation=result.get('output',{}).get('operation',{})
    return (result.get('status')=='FAILED' and result.get('phase')=='request_rejected'
            and result.get('action_key')=='request.validate' and result.get('request_rejected') is True
            and result.get('operation_id') is None and result.get('effect_possible') is False
            and result.get('trace')==[] and result.get('error',{}).get('code')=='REQUEST_REJECTED'
            and operation.get('state')=='idle' and operation.get('operation_id') is None
            and operation.get('cleanup_confirmed') is True and operation.get('effect_state')=='none')


def _wizard_refusal(call, receipts, evidence, baseline, owner, last, transition, expected, source_path):
    """Account only for an issued next/done control rejected before its gesture."""
    action=call.get('arguments',{}).get('action',{});verb=action.get('verb')
    before=last['outcome']['output']
    stage=before.get('wizard',{}).get('stage');root=before.get('wizard',{}).get('root_ref')
    if verb not in ('wizard_step','finish_wizard') or verb!=transition[0]:return None
    if set(action)-{'verb','ref','expected_stage'}:return None
    if verb=='wizard_step' and action.get('expected_stage')!=transition[1]:return None
    if verb=='finish_wizard' and (stage!='done' or action.get('expected_stage','done')!='done'):return None
    element=_delivered_element({'call':call},receipts)
    if not element or element.get('enabled') is not True or element.get('visible') is not True:return None
    args=call['arguments']
    sources=[r['outcome']['output'] for r in receipts if last['reply_row']<=r['reply_row']<call['row']
             and r['call'].get('session_id')==call.get('session_id')
             and r['delivered'].get('output',{}).get('observation_id')==args.get('observation_id')
             and any(e.get('ref')==action.get('ref') for e in r['delivered'].get('output',{}).get('ui',{}).get('elements',[]))]
    if not sources or not root:return None
    for state in sources:
        wizard=state.get('wizard',{})
        if (not _same_context(state,baseline) or _semantic_owner(state)!=owner
                or wizard.get('root_ref')!=root or wizard.get('stage')!=stage):return None
        suffix=';btnNext' if verb=='wizard_step' else ';btnDone'
        if not wizard.get('root_tid') or element.get('tid')!=wizard['root_tid']+suffix:return None
        if verb=='wizard_step':
            if element.get('wizard_step')!={'direction':'next','root_ref':root,'stage':stage}:return None
        else:
            finish=element.get('wizard_finish',{})
            if (finish.get('root_ref')!=root or finish.get('owner')!=wizard.get('owner_context')
                    or finish.get('completion')!=wizard.get('completion') or not finish.get('completion',{}).get('ready')):return None
    rejected=_no_effect_reply(call,evidence)
    if rejected:
        result=rejected['result']
        if result.get('status')=='NOT_APPLIED':
            state=result.get('output',{});wizard=state.get('wizard',{})
            if (not _same_context(state,baseline) or _semantic_owner(state)!=owner
                    or wizard.get('root_ref')!=root or wizard.get('stage')!=stage):return None
            if stage=='done':
                if wizard.get('completion')!=before['wizard'].get('completion'):return None
            elif not _page(state,expected,source_path,stage):return None
        return rejected
    # A schema refusal may reuse its ID for the one later successful dispatch.
    # Its idle reply is separate from that later immutable browser receipt.
    key=(call.get('session_id'),call.get('tool_call_id'))
    peers=[c for c in evidence.get('calls',[]) if (c.get('session_id'),c.get('tool_call_id'))==key]
    replies=[t for t in evidence.get('tools',[]) if (t.get('session_id'),t.get('tool_call_id'))==key]
    if len(peers)!=1 or len(replies)!=1:return None
    reply=replies[0];op=args.get('operation_id')
    if (reply.get('tool')!=call.get('tool') or reply['row']<=call['row'] or not op
            or not _idle_refusal(reply.get('result',{}))):return None
    later=[r for r in receipts if r['call'].get('arguments',{}).get('operation_id')==op]
    operations=[c for c in evidence.get('calls',[]) if c.get('arguments',{}).get('operation_id')==op and _mutation(c)]
    if len(later)!=1 or len(operations)!=2 or call not in operations:return None
    success=later[0];other=success['call'];other_action=other.get('arguments',{}).get('action',{})
    if (other not in operations or other.get('session_id')!=call.get('session_id')
            or other.get('tool')!=call.get('tool') or other['row']<=reply['row']
            or other_action!={k:v for k,v in action.items() if k!='expected_stage'}):return None
    records=[e for e in evidence.get('events',[]) if e.get('operation_id')==op]
    completed=[e for e in records if e.get('phase')=='completed']
    if len(completed)!=1:return None
    for event in records:
        phase=event.get('phase')
        if (phase not in ('prepared','completed','verification_delivered')
                or sum(e.get('phase')==phase for e in records)!=1
                or event.get('session_id')!=completed[0].get('session_id')):return None
        if 'parameters' in event and event['parameters']!={
                'action':other_action,'observation_id':other['arguments'].get('observation_id'),
                'recovery_operation_id':other['arguments'].get('recovery_operation_id')}:return None
    fresh=[r for r in receipts if reply['row']<r['call']['row']<r['reply_row']<other['row']
           and r['call'].get('session_id')==call.get('session_id')
           and r['delivered'].get('output',{}).get('observation_id')==other['arguments'].get('observation_id')]
    if not fresh or not _delivered_element(success, fresh):return None
    for read in fresh:
        state=read['outcome']['output'];wizard=state.get('wizard',{})
        if (not _same_context(state,baseline) or _semantic_owner(state)!=owner
                or wizard.get('root_ref')!=root or wizard.get('stage')!=stage
                or wizard.get('completion')!=before['wizard'].get('completion')):return None
    return reply


def _attempt(start, receipts, evidence, expected, source_path):
    baseline = start['outcome']['output']; session = start['call'].get('session_id')
    owner = _semantic_owner(baseline)
    if not owner or not _page(baseline, expected, source_path, 'text_import_file'):
        return None
    # A no-effect action may still deliver a fresh observed page. Such a page
    # can issue refs, but is never a successful transition in this state machine.
    issued_receipts=list(receipts)
    for call in evidence.get('calls',[]):
        if call.get('session_id')!=session or not call.get('tool','').endswith('dock_ui_action'):continue
        reply=_no_effect_reply(call,evidence)
        if not reply or reply.get('result',{}).get('status')!='NOT_APPLIED':continue
        outcome=reply['result']
        if not outcome.get('output',{}).get('observation_id'):continue
        issued_receipts.append({'call':call,'reply_row':reply['row'],'outcome':outcome,'delivered':outcome})
    transitions = [('wizard_step', 'text_import_format'), ('wizard_step', 'output_mapping'),
                   ('wizard_step', 'done'), ('finish_wizard', 'graph'),
                   ('open_wizard', 'text_import_file'), ('wizard_step', 'text_import_format'),
                   ('wizard_step', 'output_mapping')]
    current = 'text_import_file'; cursor = 0; selected = False
    accepted = [start]; last = start; rejected_calls=[]; configured_formats={}; configured_mappings={}; graph_identity=None
    for receipt in receipts:
        if receipt['call']['row'] <= start['call']['row']:
            continue
        # Every intervening mutation must be exactly the next bound receipt,
        # including calls overlapping an unfinished response.
        intervening = [c for c in evidence.get('calls', []) if _mutation(c)
                       and last['call']['row'] < c.get('row', -1) <= receipt['reply_row']]
        fence=last['reply_row']
        for call in sorted(intervening,key=lambda c:c.get('row',-1)):
            if call==receipt['call']:
                if call['row']<=fence:return None
                continue
            if call.get('session_id')!=session or not call.get('tool','').endswith('dock_ui_action'):return None
            if current!='graph':
                rejected=_wizard_refusal(call,receipts,evidence,baseline,owner,last,transitions[cursor],expected,source_path)
                if not rejected or not fence<call['row']<rejected['row']<receipt['call']['row']:return None
                fence=rejected['row'];rejected_calls.append(call['tool_call_id'])
                continue
            if call.get('arguments',{}).get('action',{}).get('verb')!='click':return None
            rejected=_no_effect_reply(call,evidence)
            if not rejected or not fence<call['row']<rejected['row']<receipt['call']['row']:return None
            element=_delivered_element({'call':call},receipts)
            if not element or element.get('graph_node')!={'node_label':owner['graph_key'],'part':'body'}:return None
            if not _issued_graph_binding({'call':call},receipts,owner,baseline,graph_identity):return None
            fence=rejected['row'];rejected_calls.append(call['tool_call_id'])
        if receipt['call'].get('session_id') != session:
            continue
        snapshot = receipt['outcome'].get('output', {})
        if not _same_context(snapshot, baseline):
            return None
        verb = _verb(receipt)
        stage = 'graph' if snapshot.get('wizard', {}).get('status') == 'absent' else snapshot.get('wizard', {}).get('stage')
        if verb is None:
            if stage != current:
                return None
        else:
            element = _issued(receipt, issued_receipts)
            finished_owner=(_finished_owner(receipt,last['outcome']['output'],snapshot,owner,issued_receipts)
                            if verb=='finish_wizard' else owner)
            if not element or finished_owner is None or not _transition_trace(receipt, last['outcome']['output'], snapshot, owner,finished_owner):
                return None
            if current=='graph' and not _issued_graph_binding(receipt,issued_receipts,owner,baseline,graph_identity):return None
            if current == 'graph' and verb == 'click' and not selected:
                target = element.get('graph_node', {})
                prior=last['outcome']['output']
                fresh_bodies=[e.get('ref') for e in prior['ui'].get('elements',[]) if e.get('graph_node')=={'node_label':owner['graph_key'],'part':'body'}]
                if target != {'node_label': owner['graph_key'], 'part': 'body'} or element.get('ref') not in fresh_bodies or not _graph(prior,owner):
                    return None
                selected = True
                if stage != 'graph':
                    return None
            else:
                if (verb, stage) != transitions[cursor]:
                    return None
                if verb == 'open_wizard' and element.get('graph_node') != {'node_label': owner['graph_key'], 'part': 'settings'}:
                    return None
                cursor += 1; current = stage
                if verb=='finish_wizard':owner=finished_owner
        if stage == 'graph':
            if not _graph(snapshot, owner):
                return None
            if graph_identity is None:graph_identity=copy.deepcopy(snapshot['graph_identity'])
            elif snapshot['graph_identity']!=graph_identity:return None
        else:
            if _semantic_owner(snapshot) != owner:
                return None
            if stage != 'done' and not _page(snapshot, expected, source_path, stage):
                return None
            if stage=='text_import_format':
                # Use the last read of each format stage. Later partial or
                # inconsistent bounds must not inherit an earlier true flag.
                configured_formats['after' if cursor>=5 else 'before']=settings.configured_schema_compare(snapshot,expected).get('configured_import_schema_match') is True
            if stage=='output_mapping':
                mapping=settings.configured_mapping_compare(snapshot,expected)
                configured_mappings['after' if cursor>=5 else 'before']=(
                    {'count':mapping['configured_row_count'],'auto_sync':mapping['auto_sync']}
                    if mapping.get('configured_import_mapping_match') is True else None)
        if verb == 'open_wizard':
            before = baseline['wizard']['import_source']['fields']
            after = snapshot['wizard']['import_source']['fields']
            if any(before[key]['input_ref'] == after[key]['input_ref'] for key in
                   ('source_path', 'connection', 'encoding', 'rows_to_skip')):
                return None
        accepted.append(receipt); last = receipt
        if cursor == len(transitions):
            return {'rendered_import_settings_roundtrip_match': True, 'complete': False,
                    'configured_schema_roundtrip_match':configured_formats=={'before':True,'after':True},
                    'configured_mapping_roundtrip_match':bool(configured_mappings.get('before')) and configured_mappings.get('before')==configured_mappings.get('after'),
                    'node_persistence_verified': False, 'package_persistence_verified': False,
                    'source_identity_verified': False, 'session_id': session,
                    'operations': [r['outcome']['operation_id'] for r in accepted],
                    'pre_effect_rejections':rejected_calls,
                    'reason': 'journal_bound_rendered_import_roundtrip',
                    'missing_proofs': ['complete_source_schema', 'source_field_identity',
                                       'package_save_close_reopen', 'execution_results']}
    return None


def diagnose(evidence, expected, prefix, *, expected_source_path=None):
    results = []; receipts = bound_receipts(evidence, prefix)
    for start in receipts:
        snapshot = start['outcome'].get('output', {})
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get('wizard'), dict) or snapshot['wizard'].get('stage') != 'text_import_file':
            continue
        try:
            proof = _attempt(start, receipts, evidence, expected, expected_source_path)
        except (KeyError, TypeError, AttributeError, ValueError, IndexError):
            proof = None
        if proof:
            results.append(proof)
        if len(results) >= 20:
            break
    return {'roundtrips': results, 'complete': False, 'package_persistence_verified': False,
            'scope': 'rendered_import_node_settings_only'}
