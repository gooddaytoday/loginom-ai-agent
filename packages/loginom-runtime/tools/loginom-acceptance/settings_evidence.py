"""Independent node-settings roundtrip evidence; package persistence stays separate."""
import copy
import rename_effect


def _calculator_state(snapshot, expected):
    """Require one selected expression and its complete, bound editor document."""
    wizard=snapshot.get('wizard',{})
    owner=wizard.get('owner_context',{})
    row=wizard.get('expression_selection',{})
    if wizard.get('status')!='observed' or wizard.get('stage')!='calculator' or owner.get('status')!='observed':
        return None
    editors=[e.get('calculator_editor') for e in snapshot.get('ui',{}).get('elements',[]) if e.get('calculator_editor')]
    if len(editors)!=1:return None
    editor=editors[0];document=editor.get('document',{});selected=editor.get('selected_expression',{})
    if (row.get('status')!='observed' or row.get('name')!=expected['output_field'] or row.get('type_label')!='Вещественный'
        or editor.get('status')!='observed' or editor.get('mode')!='expression'
        or selected.get('label')!=row['name'] or not selected.get('ref')
        or document.get('full_text_verified') is not True or document.get('status')!='observed'
        or document.get('text')!=expected['operation'] or not document.get('document_ref')):return None
    if snapshot.get('ui',{}).get('dialogs') or snapshot.get('ui',{}).get('masks'):return None
    path=[{'tid':p['tid'],'label':p['label']} for p in owner.get('path',[])]
    node=owner.get('node',{})
    if (len(path)<3 or not node.get('label') or not node.get('tid')
        or node['tid']!=path[-2]['tid'] or node['label']!=path[-2]['label']):return None
    return {'row':{k:row[k] for k in ('name','label','type_label')},'path':path,
            'node':owner['node']['label'],'document_ref':document['document_ref']}


def calculator_state(snapshot,expected):
    try:
        if expected.get('type')!='real':return None
        return _calculator_state(snapshot,expected)
    except (KeyError,TypeError,AttributeError,ValueError):return None


def roundtrip(before, finish, opened, after, expected):
    """Snapshots must be journal-bound by the caller; never consume model prose."""
    result={'calculator_node_settings_verified':False,'package_persistence_verified':False}
    try:
        a=calculator_state(before,expected);b=calculator_state(after,expected)
        if not a or not b:return {**result,'reason':'calculator_readback_missing'}
        snapshots=[before,finish,opened,after]
        for key in ('origin','loginom_build','workflow_ref','package_identity','active_tab_ref'):
            if before.get(key) is None or any(s.get(key)!=before[key] for s in snapshots):
                return {**result,'reason':'context_changed_or_missing'}
        if before.get('dom_epoch',{}).get('document') is None or any(s.get('dom_epoch',{}).get('document')!=before['dom_epoch']['document'] for s in snapshots):
            return {**result,'reason':'document_changed'}
        if a['node']!=b['node'] or a['path'][-2]!=b['path'][-2]:
            return {**result,'reason':'node_owner_changed'}
        if a['row']!=b['row'] or a['document_ref']==b['document_ref']:
            return {**result,'reason':'settings_changed_or_editor_not_reopened'}
        opened_owner=opened.get('wizard',{}).get('owner_context',{})
        if opened_owner.get('status')!='observed' or opened['wizard'].get('root_ref')!=after['wizard'].get('root_ref'):
            return {**result,'reason':'reopened_wizard_mismatch'}
        if opened_owner.get('node')!=after['wizard']['owner_context'].get('node'):
            return {**result,'reason':'reopened_owner_mismatch'}
        if a['path'][:-2]!=b['path'][:-2] or finish.get('navigation_context',{}).get('path')!=a['path'][:-2]:
            return {**result,'reason':'workflow_path_changed'}
        if finish.get('wizard',{}).get('status')!='absent' or finish.get('ui',{}).get('dialogs') or finish.get('ui',{}).get('masks'):
            return {**result,'reason':'wizard_not_finished'}
        labels=[e for e in finish.get('ui',{}).get('elements',[]) if e.get('graph_node',{}).get('part')=='label' and e.get('label')==b['node']]
        if len(labels)!=1:return {**result,'reason':'finished_node_missing_or_ambiguous'}
        return {**result,'calculator_node_settings_verified':True,'reason':'node_roundtrip_matched',
                'expression':a['row']['name'],'node':b['node']}
    except (KeyError,TypeError,AttributeError,ValueError):
        return {**result,'reason':'malformed_evidence'}


def bound_receipts(evidence,prefix):
    """Only unique call/reply/immutable-outcome triples; no detached proof objects."""
    found=[]
    for reply in evidence.get('tools',[]):
        if reply.get('tool') not in (prefix+'dock_ui_action',prefix+'dock_workspace_observe'):continue
        calls=[c for c in evidence.get('calls',[]) if (c.get('session_id'),c.get('tool_call_id'),c.get('tool'))==(reply.get('session_id'),reply.get('tool_call_id'),reply.get('tool'))]
        twins=[t for t in evidence.get('tools',[]) if (t.get('session_id'),t.get('tool_call_id'))==(reply.get('session_id'),reply.get('tool_call_id'))]
        if len(calls)!=1 or len(twins)!=1:continue
        call=calls[0];out=reply.get('result',{})
        if not isinstance(out,dict) or out.get('status')!='SUCCEEDED' or type(call.get('row')) is not int or type(reply.get('row')) is not int or call['row']>=reply['row']:continue
        op=out.get('operation_id')
        if not op:continue
        phase='completed' if reply['tool'].endswith('dock_ui_action') else 'observation_completed'
        records=[e for e in evidence.get('events',[]) if e.get('phase')==phase and e.get('operation_id')==op]
        if len(records)!=1:continue
        delivered=copy.deepcopy(out);delivered.get('output',{}).pop('operation',None)
        raw=records[0].get('outcome',{})
        if not rename_effect.journal_equal(raw,delivered):continue
        if phase=='completed' and out.get('cleanup_complete') is not True:continue
        found.append({'call':call,'reply_row':reply['row'],'outcome':raw,'delivered':out})
    return sorted(found,key=lambda r:r['call']['row'])


def diagnose(evidence,expected,prefix):
    receipts=bound_receipts(evidence,prefix)
    def verb(r):return r['call'].get('arguments',{}).get('action',{}).get('verb')
    def mutation(c):return c.get('tool','').endswith(('dock_ui_action','dock_action_run','dock_operation_recover','dock_artifact_upload')) or 'browser_' in c.get('tool','')
    def issued(r):
        args=r['call'].get('arguments',{});action=args.get('action',{});ref=action.get('ref')
        prior=[p for p in receipts if p['reply_row']<r['call']['row'] and p['call'].get('session_id')==r['call'].get('session_id')
               and p['delivered'].get('output',{}).get('observation_id')==args.get('observation_id') and args.get('observation_id')]
        elements=[e for p in prior for e in p['delivered'].get('output',{}).get('ui',{}).get('elements',[]) if e.get('ref')==ref and verb(r) in e.get('allowed_actions',[])]
        trace=r['outcome'].get('trace',[])
        return bool(elements) and sum(t.get('event')=='ui_preconditions_verified' and t.get('refs')==[ref] and t.get('verb')==verb(r) for t in trace)==1 and sum(t.get('event')=='ui_gesture_applied' and t.get('verb')==verb(r) for t in trace)==1
    results=[]
    for f in receipts:
        if verb(f)!='finish_wizard' or not issued(f):continue
        session=f['call'].get('session_id')
        candidates=[r for r in receipts if r['reply_row']<f['call']['row'] and r['call'].get('session_id')==session and calculator_state(r['outcome'].get('output',{}),expected)]
        if not candidates:continue
        baseline=candidates[-1]
        middle=[c for c in evidence.get('calls',[]) if baseline['reply_row']<c.get('row',-1)<f['call']['row'] and mutation(c)]
        if any(not any(r['call']==c and verb(r)=='wizard_step' and issued(r) for r in receipts) for c in middle):continue
        for opened in receipts:
            if verb(opened)!='open_wizard' or opened['call'].get('session_id')!=session or opened['call']['row']<=f['reply_row'] or not issued(opened):continue
            middle=[c for c in evidence.get('calls',[]) if f['call']['row']<c.get('row',-1)<opened['call']['row'] and mutation(c)]
            if any(not any(r['call']==c and verb(r)=='click' and issued(r) for r in receipts) for c in middle):continue
            # Permit only selection of the exact body returned by finish.
            node_refs={e.get('ref') for e in f['outcome'].get('output',{}).get('ui',{}).get('elements',[]) if e.get('graph_node',{}).get('part')=='body'}
            if any(c['row']<=f['reply_row'] for c in middle):continue
            if len(middle)>1 or any(c.get('arguments',{}).get('action',{}).get('ref') not in node_refs for c in middle):continue
            for after in receipts:
                if after['call'].get('session_id')!=session or after['call']['row']<=opened['reply_row']:continue
                if any(opened['call']['row']<c.get('row',-1)<=after['call']['row'] and mutation(c) for c in evidence.get('calls',[])):break
                if not calculator_state(after['outcome'].get('output',{}),expected):continue
                proof=roundtrip(*(r['outcome']['output'] for r in (baseline,f,opened,after)),expected)
                results.append({**proof,'operations':[r['outcome'].get('operation_id') for r in (baseline,f,opened,after)]})
                break
            break
        if len(results)>=20:break
    return {'roundtrips':results,'scope':'calculator_node_only','package_persistence_verified':False}
