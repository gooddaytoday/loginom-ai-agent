"""Read-only proof of goal recovery after a save closed the package but failed reopening.

This does not change the original domain outcome. Every accepted UI action is
bound to an earlier real observation and its actual tool reply/gesture trace.
"""
def prove(tools,calls,events,path,normalize):
    by_call={t.get('tool_call_id'):t for t in tools}
    observations={t['result']['output']['observation_id']:t for t in tools
                  if isinstance(t.get('result'),dict) and isinstance(t['result'].get('output'),dict)
                  and t['result']['output'].get('observation_id')}
    snapshots=[t for t in tools if t['tool'].endswith('dock_workspace_observe')
               and isinstance(t.get('result'),dict) and t['result'].get('status')=='SUCCEEDED']
    saves=[t for t in tools if isinstance(t.get('result'),dict) and t['result'].get('action_key')=='package.save_as'
           and t['result'].get('status')=='AMBIGUOUS' and t['result'].get('cleanup_complete') is True]
    for save in reversed(saves):
        result=save['result'];old_id=result.get('operation_id');trace=result.get('trace',[])
        requested=[i for i,e in enumerate(trace) if e.get('event')=='save_requested' and e.get('path')==path]
        closed=[i for i,e in enumerate(trace) if e.get('event')=='saved_package_closed']
        if len(requested)!=1 or len(closed)!=1 or requested[0]>=closed[0]:continue
        prepared=[e for e in events if e.get('operation_id')==old_id and e.get('phase')=='prepared'
                  and e.get('checkpoint',{}).get('path')==path]
        if len(prepared)!=1:continue
        checkpoint=prepared[0]['checkpoint']
        if not checkpoint.get('graph') or not checkpoint.get('workflow_ref'):continue
        abandon=None
        for call in calls:
            args=call.get('arguments',{});reply=by_call.get(call.get('tool_call_id'),{});answer=reply.get('result',{})
            if not isinstance(answer,dict):continue
            out=answer.get('output',{});original=out.get('original_outcome',{})
            observed=observations.get(args.get('observation_id'),{});state=observed.get('result',{}).get('output',{})
            matching=[e for e in events if e.get('phase')=='operation_abandoned' and e.get('operation_id')==old_id
                      and e.get('outcome',{}).get('status')=='AMBIGUOUS' and e.get('outcome',{}).get('goal_verified') is False
                      and e.get('outcome',{}).get('recovery_operation_id')==args.get('recovery_operation_id')]
            if (call['tool'].endswith('dock_operation_recover') and args.get('strategy')=='abandon_operation'
                and args.get('operation_id')==old_id and args.get('recovery_operation_id') not in [None,'',old_id]
                and save['row']<observed.get('row',-1)<call['row'] and state.get('package_identity') is None
                and state.get('nodes')==[] and state.get('links')==[]
                and state.get('operation',{}).get('operation_id')==old_id
                and state.get('operation',{}).get('cleanup_confirmed') is True
                and answer.get('status')=='SUCCEEDED' and out.get('resolution')=='abandoned_after_observation'
                and out.get('goal_verified') is False and original.get('status')=='AMBIGUOUS'
                and original.get('goal_verified') is False and original.get('cleanup_complete') is True and len(matching)==1):
                abandon=(call,reply,observed)
        if not abandon:continue
        allowed=[];gestures=[];rejected=[];invalid=False
        for call in calls:
            if call['row']<=abandon[1]['row'] or not call['tool'].endswith(('dock_ui_action','dock_action_run','dock_operation_recover')):continue
            args=call.get('arguments',{});reply=by_call.get(call.get('tool_call_id'),{});answer=reply.get('result',{})
            if not isinstance(answer,dict):invalid=True;break
            # Proven rejections and stale observations caused no physical action.
            if (answer.get('effect_possible') is False and not any(e.get('event')=='ui_gesture_applied' for e in answer.get('trace',[]))
                and (answer.get('request_rejected') is True or answer.get('status')=='NOT_APPLIED' and answer.get('cleanup_complete') is True)):
                allowed.append(call['row']);rejected.append({'call_row':call['row'],'reply_row':reply['row'],'status':answer.get('status'),'error':answer.get('error')});continue
            if not call['tool'].endswith('dock_ui_action'):invalid=True;break
            observation=observations.get(args.get('observation_id'),{});state=observation.get('result',{}).get('output',{})
            action=args.get('action',{});elements=state.get('ui',{}).get('elements',[])
            candidates=[e for e in elements if e.get('ref')==action.get('ref')]
            if len(candidates)!=1:invalid=True;break
            el=candidates[0];anchor=el.get('identity',{}).get('anchor_tid');verb=action.get('verb')
            semantic=(anchor,verb)
            allowed_semantics={('MF;cntMain;tlbMainToolbar;btnPackagesMenu','click'),('MF;MainMenuForm;btnOpenPackage','click'),
                               ('MF;TF;HomePage;btnOpenPackage','click'),
                               ('OpenDialogForm;edtFileName','fill'),('OpenDialogForm;btnOpen','click')}
            trace=answer.get('trace',[])
            preflight=any(e.get('event')=='ui_preconditions_verified' and e.get('verb')==verb and e.get('refs')==[action.get('ref')] for e in trace)
            applied=any(e.get('event')=='ui_gesture_applied' and e.get('verb')==verb for e in trace)
            if (semantic not in allowed_semantics or observation.get('row',10**12)>=call['row'] or answer.get('status')!='SUCCEEDED'
                or answer.get('cleanup_complete') is not True or not preflight or not applied):invalid=True;break
            if anchor=='OpenDialogForm;edtFileName' and action.get('text')!=path:invalid=True;break
            if anchor.startswith('OpenDialogForm;'):
                dialog=el.get('signature',{}).get('dialog_ref')
                if not any(d.get('ref')==dialog and d.get('identity',{}).get('anchor_tid')=='OpenDialogForm' for d in state.get('ui',{}).get('dialogs',[])):invalid=True;break
                if anchor.endswith(';btnOpen') and not any(e.get('identity',{}).get('anchor_tid')=='OpenDialogForm;edtFileName'
                                                         and e.get('value')==path for e in elements):invalid=True;break
            gestures.append({'call_row':call['row'],'reply_row':reply['row'],'observation_row':observation['row'],
                             'anchor_tid':anchor,'verb':verb,'text':action.get('text')})
            allowed.append(call['row'])
        if invalid:continue
        sequence=[(g['anchor_tid'],g['verb']) for g in gestures]
        if sequence not in [
            [('MF;cntMain;tlbMainToolbar;btnPackagesMenu','click'),('MF;MainMenuForm;btnOpenPackage','click'),
             ('OpenDialogForm;edtFileName','fill'),('OpenDialogForm;btnOpen','click')],
            [('MF;TF;HomePage;btnOpenPackage','click'),('OpenDialogForm;edtFileName','fill'),
             ('OpenDialogForm;btnOpen','click')]]:continue
        finals=[t for t in snapshots if t['row']>gestures[-1]['reply_row']
                and (t['result']['output'].get('package_identity') or {}).get('path')==path
                and t['result']['output'].get('workflow_ref')
                and t['result']['output']['workflow_ref']!=checkpoint['workflow_ref']]
        if not finals:continue
        final=finals[-1]
        return {'save_row':save['row'],'save_operation_id':old_id,'domain_save_status':'AMBIGUOUS',
                'original_outcome_preserved':True,'abandon_call_row':abandon[0]['row'],'closed_observation_row':abandon[2]['row'],
                'final_observation_row':final['row'],'goal_recovered_via':'manual_ui_reopen',
                'ui_gestures':gestures,'proven_no_effect_requests':rejected,
                'allowed_non_graph_call_rows':[abandon[0]['row'],*allowed],
                'checkpoint_graph':checkpoint['graph'],'final_snapshot':final['result']['output']}
    return None
