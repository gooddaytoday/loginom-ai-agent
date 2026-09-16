"""Prove a committed in-place UI rename, independently of the domain goal."""
import copy
import re


def element_anchor(element):
    # A compact exact data-tid identity may be absent; contradictory identity
    # must never be overridden by the visible tid.
    if 'identity' not in element:return element.get('tid')
    identity=element.get('identity')
    return identity.get('anchor_tid') if isinstance(identity,dict) else None


def compact_receipt_equal(record, reply):
    """Bind every delivered value to the immutable receipt, without erasing data.

    This verifies all/graph page projections of a UI receipt. Revision is
    an opaque correlation token here, not an independently proven DOM epoch.
    Unknown projection versions/fields fail closed.
    """
    source=record.get('output',{}); actual=reply.get('output',{})
    page=actual.get('page',{})
    if (set(page)!={'schema_version','scope','offset','returned','total_records','next_cursor',
                    'captured_snapshot_complete','full_dom_complete'}
        or page.get('schema_version')!=1 or page.get('scope') not in ('all','graph')
        or page.get('full_dom_complete') is not False
        or not re.fullmatch(r'[a-f0-9]{64}',actual.get('observation_revision',''))):return False
    if {k:v for k,v in record.items() if k!='output'}!={k:v for k,v in reply.items() if k!='output'}:return False
    metadata=('origin','authenticated','loginom_build','workflow_ref','active_identity','active_tab_ref','navigation_context','wizard_pending_owner','workflow_navigation','node_context','graph_identity','package_identity',
              'workarea','verification_required','gesture_applied','scan','dom_epoch', 'observation_root', 'observation_kind', 'file_storage', 'observation_filter', 'wizard', 'table_settings', 'table_coverage', 'process_console')
    if set(source)-set(metadata)-{'nodes','links','ui'}:return False
    expected={k:copy.deepcopy(source[k]) for k in metadata if k in source}
    ui=source.get('ui',{});rows=[]
    for node in source.get('nodes',[]):
        ports=node.get('ports',[])
        for offset in range(0,max(len(ports),1),8):
            value={**node,'ports':ports[offset:offset+8]}
            if len(ports)>8:value['ports_page']={'offset':offset,'total':len(ports),'complete':False}
            rows.append(('nodes',value))
    rows.extend(('links',link) for link in source.get('links',[]))
    elements=list(ui.get('elements',[]))
    if page['scope']=='graph':
        elements=[item for item in elements if item.get('scope') in ('graph','graph_editor')]
    # Mirror the pinned pager's stable wizard ordering before projection.
    # This verifier admits all-scope pages only; other scopes remain rejected
    # above even though the runtime also applies this rank to dialogs.
    if source.get('wizard',{}).get('status')=='observed' and page['scope'] in ('all','dialogs'):
        def rank(item):
            actions=item.get('allowed_actions',[])
            if item.get('signature',{}).get('dialog_ref') or item.get('role')=='menuitem':return -2
            combo=item.get('wizard_combo',{})
            if combo.get('kind')=='picker' and combo.get('field',{}).get('scope')=='import_column':return -1
            if 'select_wizard_option' in actions:return 0
            if 'finish_wizard' in actions or item.get('wizard_step',{}).get('direction')=='next' and 'wizard_step' in actions:return 0.5
            if (bool(item.get('wizard_field')) or isinstance(item.get('wizard_field'),(dict,list))) and 'set_wizard_field' in actions:return 1
            if any(action in ('wizard_step','finish_wizard') for action in actions):return 2
            return 3
        elements.sort(key=rank)
    for item in elements:
        value={k:v for k,v in item.items() if k not in ('signature','bounding_box')}
        identity=item.get('identity')
        if (isinstance(item.get('tid'),str) and item['tid'] and isinstance(identity,dict)
            and identity.get('anchor_tid')==item['tid'] and identity.get('path')==[]
            and set(identity)<= {'anchor_tid','path'}):value.pop('identity')
        if item.get('signature') is not None:value['signature']={k:v for k,v in item['signature'].items() if k=='tag'}
        rows.append(('elements',value))
    collections=('elements','dialogs','masks','messages','table_cells')
    if page['scope']=='all':
        for key in collections[1:]:rows.extend((key,item) for item in ui.get(key,[]))
    count=page.get('returned');offset=page.get('offset')
    if type(offset) is not int or not 0<=offset<=len(rows):return False
    if type(count) is not int or not 0<=count<=min(len(rows)-offset,32) or (rows and not count):return False
    end=offset+count
    if page.get('total_records')!=len(rows) or page['captured_snapshot_complete'] is not (offset==0 and end==len(rows)):return False
    cursor=page['next_cursor']
    if end<len(rows):
        if not isinstance(cursor,str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',cursor):return False
    elif cursor is not None:return False
    expected.update(nodes=[],links=[],ui={key:[] for key in collections})
    expected['ui']['truncated']=copy.deepcopy(ui.get('truncated',{}))
    if page['scope']=='graph':
        if len(elements)<len(ui.get('elements',[])):expected['ui']['truncated']['elements']=True
        for key in collections[1:]:expected['ui']['truncated'][key]=True
    for key,item in rows[offset:end]:
        (expected[key] if key in ('nodes','links') else expected['ui'][key]).append(item)
    for key,_ in rows[:offset]+rows[end:]:expected['ui']['truncated'][key]=True
    if any('ports_page' in node for node in expected['nodes']):expected['ui']['truncated']['ports']=True
    return expected=={k:v for k,v in actual.items() if k not in ('page','observation_revision')}


def journal_equal(record, reply):
    # retainObservation adds an opaque observation ID and canonicalizes origin
    # after the immutable UI receipt is journaled. No graph/effect is rewritten.
    def normalized(value):
        value=copy.deepcopy(value)
        output=value.get('output',{})
        output.pop('observation_id',None)
        origin=output.get('origin')
        if isinstance(origin,str) and re.fullmatch(r'https?://[^/?#]+/?',origin):
            output['origin']=origin.rstrip('/')
        return value
    left,right=normalized(record),normalized(reply)
    if 'page' in right.get('output',{}):return compact_receipt_equal(left,right)
    return left==right


def prove(tools, calls, events, after_row, expected):
    observations=[t for t in tools if isinstance(t.get('result'),dict)]
    replies={t['tool_call_id']:t for t in tools}
    def bound(call):
        reply=replies.get(call['tool_call_id'],{});r=reply.get('result',{})
        args=call.get('arguments',{});action=args.get('action',{})
        candidates=[t for t in observations if t.get('row',10**12)<call['row']
                    and t['result'].get('output',{}).get('observation_id')==args.get('observation_id')
                    and any(e.get('ref')==action.get('ref') for e in t['result'].get('output',{}).get('ui',{}).get('elements',[]))]
        observed=max(candidates,key=lambda t:t['row'],default={});s=observed.get('result',{}).get('output',{})
        elements=[e for e in s.get('ui',{}).get('elements',[]) if e.get('ref')==action.get('ref')]
        if (len(elements)!=1 or observed.get('row',10**12)>=call['row'] or r.get('status')!='SUCCEEDED'
            or r.get('cleanup_complete') is not True
            or not any(e.get('event')=='ui_preconditions_verified' and e.get('refs')==[action.get('ref')]
                       and e.get('verb')==action.get('verb') for e in r.get('trace',[]))
            or not any(e.get('event')=='ui_gesture_applied' and e.get('verb')==action.get('verb') for e in r.get('trace',[]))
            or not any(e.get('phase')=='completed' and e.get('operation_id')==r.get('operation_id')
                       and journal_equal(e.get('outcome',{}),r) for e in events)):
            return None
        element=elements[0]
        return reply,s,element
    def structure(s):
        if len(s.get('nodes',[]))!=1 or s.get('links')!=[]:return None
        if any(s.get('ui',{}).get('truncated',{}).get(k) is not False for k in ('nodes','ports','links')):return None
        n=s['nodes'][0];label=n['node_ref']['node_label']
        tids=[p['tid'].split(';')[-1] for p in n['ports']]
        if not tids or len(tids)!=len(set(tids)):return None
        return label,sorted(tids),s.get('workflow_ref')
    fills=[]
    for call in sorted(calls,key=lambda c:c['row']):
        if call['row']<=after_row or not call['tool'].endswith('dock_ui_action'):continue
        action=call.get('arguments',{}).get('action',{});match=bound(call)
        if not match:continue
        reply,before,element=match
        prefix=(before.get('workflow_ref') or {}).get('prefix')
        if not prefix or element.get('signature',{}).get('tag')!='textarea' or element_anchor(element)!=prefix+';ModelForm;cmpDiagram':continue
        if action.get('verb')=='fill' and action.get('text')==expected:
            fills.append((call,reply,before));continue
        if action.get('verb')!='press' or action.get('key')!='Enter' or element.get('value')!=expected:continue
        after=reply['result'].get('output',{})
        for fill,filled,initial in reversed(fills):
            if filled['row']>=call['row'] or fill['arguments']['action']['ref']!=action.get('ref'):continue
            intervening=[c for c in calls if filled['row']<c['row']<call['row'] and c['tool'].endswith(('dock_action_run','dock_ui_action','dock_operation_recover'))]
            if any(not (replies.get(c['tool_call_id'],{}).get('result',{}).get('request_rejected') is True
                        and replies[c['tool_call_id']]['result'].get('effect_possible') is False) for c in intervening):continue
            baselines=[t for t in tools if after_row<t.get('row',0)<fill['row']
                       and isinstance(t.get('result'),dict) and structure(t['result'].get('output',{}))]
            for baseline in sorted(baselines,key=lambda t:t['row'],reverse=True):
                old=structure(baseline['result']['output']);new=structure(after)
                if not old or not new or old[0]==expected or new[0]!=expected or old[1:]!=new[1:]:continue
                if initial.get('workflow_ref')!=old[2] or before.get('workflow_ref')!=old[2]:continue
                safe=True
                for c in calls:
                    if not baseline['row']<c['row']<fill['row'] or not c['tool'].endswith(('dock_action_run','dock_ui_action','dock_operation_recover')):continue
                    r=replies.get(c['tool_call_id'],{}).get('result',{})
                    if r.get('request_rejected') is True and r.get('effect_possible') is False:continue
                    checked=bound(c) if c['tool'].endswith('dock_ui_action') else None
                    if not checked:safe=False;break
                    a=c['arguments']['action'];el=checked[2]
                    anchor=element_anchor(el)
                    node=old[2]['prefix']+';Graph;'+old[0]
                    if anchor not in (node,node+';Label;Label') or not (a.get('verb') in ('click','double_click') or a.get('verb')=='press' and a.get('key')=='F2'):
                        safe=False;break
                if safe:return {'fill_call_row':fill['row'],'commit_call_row':call['row'],'after_row':reply['row']}

    return None
