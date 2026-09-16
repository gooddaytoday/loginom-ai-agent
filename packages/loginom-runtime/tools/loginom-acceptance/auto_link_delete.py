"""Identify actual generic-UI removal of the original automatic edge.

No prescribed model call sequence is needed. The proof requires a real bound
one-edge confirmation, an applied gesture, and a subsequent actual graph delta
which removes exactly that edge while preserving every node and port.
"""
def prove(tools,calls,events,auto_row,wanted_edge,graph,stored_graph):
    replies={t.get('tool_call_id'):t for t in tools}
    observed={t['result']['output']['observation_id']:t for t in tools
              if isinstance(t.get('result'),dict) and isinstance(t['result'].get('output'),dict)
              and t['result']['output'].get('observation_id')}
    graphs=[{'row':t['row'],'kind':'tool_output','graph':graph(t['result']['output'])} for t in tools
            if isinstance(t.get('result'),dict) and isinstance(t['result'].get('output'),dict)
            and isinstance(t['result']['output'].get('nodes'),list) and isinstance(t['result']['output'].get('links'),list)]
    for event in events:
        if event.get('phase')!='prepared' or not event.get('checkpoint',{}).get('graph'):continue
        raw=event['checkpoint']['graph']
        if 'ports' in raw and all(isinstance(n,str) for n in raw['nodes']):normalized=stored_graph(raw)
        elif all(isinstance(n,dict) and isinstance(n.get('label'),str) and isinstance(n.get('ports'),list) for n in raw['nodes']):
            normalized=graph({'nodes':[{'node_ref':{'node_label':n['label']},'ports':[{'tid':tid} for tid in n['ports']]} for n in raw['nodes']],
                              'links':raw['links']})
        else:continue
        matching=[c for c in calls if c['tool'].endswith('dock_action_run') and c.get('arguments',{}).get('operation_id')==event.get('operation_id')]
        if len(matching)==1:
            graphs.append({'row':matching[0]['row']+0.25,'kind':'actual_domain_preflight','call_row':matching[0]['row'],
                           'operation_id':event.get('operation_id'),'graph':normalized})
    graphs.sort(key=lambda g:g['row'])
    def proven_no_effect(call):
        reply=replies.get(call.get('tool_call_id'),{});result=reply.get('result',{})
        if not isinstance(result,dict):return False
        return ((reply.get('transport_tool')=='tool_call' and result.get('isError') is True and 'The tool was NOT invoked.' in str(result.get('error','')))
                or result.get('effect_possible') is False and (result.get('request_rejected') is True
                or result.get('status')=='NOT_APPLIED' and result.get('cleanup_complete') is True))
    for call in calls:
        if call['row']<=auto_row or not call['tool'].endswith('dock_ui_action'):continue
        args=call.get('arguments',{});action=args.get('action',{});reply=replies.get(call.get('tool_call_id'),{})
        result=reply.get('result',{});before=observed.get(args.get('observation_id'),{});snapshot=before.get('result',{}).get('output',{})
        if not isinstance(result,dict) or not auto_row<before.get('row',-1)<call['row']:continue
        elements=[e for e in snapshot.get('ui',{}).get('elements',[]) if e.get('ref')==action.get('ref')]
        if len(elements)!=1:continue
        button=elements[0];anchor=button.get('identity',{}).get('anchor_tid','');dialog_ref=button.get('signature',{}).get('dialog_ref')
        dialogs=[d for d in snapshot.get('ui',{}).get('dialogs',[]) if d.get('ref')==dialog_ref
                 and 'Удалить выделенную связь?' in d.get('text','')]
        verb=action.get('verb');trace=result.get('trace',[])
        if (not anchor.startswith('msgbox') or not anchor.endswith(';tlb;yes') or button.get('scope')!='dialog'
            or button.get('label') not in ['Удалить','Да'] or len(dialogs)!=1
            or not (verb=='click' or verb=='press' and action.get('key') in ['Enter','Space'])
            or result.get('status')!='SUCCEEDED' or result.get('cleanup_complete') is not True
            or not any(e.get('event')=='ui_preconditions_verified' and e.get('refs')==[action.get('ref')] and e.get('verb')==verb for e in trace)
            or not any(e.get('event')=='ui_gesture_applied' and e.get('verb')==verb for e in trace)):continue
        original=graph(snapshot)
        if wanted_edge not in original['links']:continue
        for after in graphs:
            if after['row']<reply.get('row',10**12):continue
            state=after['graph']
            # A later graph-changing action cannot be credited to this UI gesture.
            intervening=[c for c in calls if reply['row']<c['row']<after['row'] and c['row']!=after.get('call_row')
                         and c['tool'].endswith(('dock_action_run','dock_ui_action','dock_operation_recover')) and not proven_no_effect(c)]
            if intervening:break
            if state==original:continue  # asynchronous repaint followed by a read-only observation is valid
            if (state['nodes']!=original['nodes'] or state['ports']!=original['ports']
                or sorted(state['links'])!=sorted(edge for edge in original['links'] if edge!=wanted_edge)):break
            return {'confirmation_call_row':call['row'],'confirmation_reply_row':reply['row'],
                    'bound_observation_row':before['row'],'confirmed_dialog_ref':dialog_ref,'confirmed_button_tid':anchor,
                    'actual_after_observation':{k:v for k,v in after.items() if k!='graph'},'removed_edge':wanted_edge,
                    'before_graph':original,'after_graph':state,'nodes_and_ports_preserved':True,
                    'evidence_basis':'Actual bound confirmation, successful generic UI gesture trace, then exact observed graph delta; no model prose.'}
    return None
