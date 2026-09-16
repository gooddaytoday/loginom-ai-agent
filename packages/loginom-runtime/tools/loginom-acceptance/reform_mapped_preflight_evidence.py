"""Independently bind mixed-request validation to raw, cancelled UI drafts."""
from node_procedure_evidence import verify_internal_sequence

KEYS=('index','field_id','name','label','type','data_kind','usage_type','caching_method','excluded')

def verify_reform_mapped_preflight(events,request,sequence=None):
    try:
        def need(v,m):
            if not v:raise ValueError(m)
        node=request['target']['ref'];op=request['operation_id']
        rows=[e for e in events if e.get('operation_id')==op]
        ends=[i for i,e in enumerate(rows) if e.get('phase')=='reform_mapped_preflight_completed']
        need(len(ends)==1,'mixed_unique_preflight');end=ends[0];proof=rows[end]['proof']
        need(all(proof.get(k) is True for k in ('verified','settings_unchanged','cleanup_complete')),'mixed_completion')
        starts=[i for i,e in enumerate(rows[:end]) if e.get('phase')=='node_phase_prepared' and e.get('receipt',{}).get('phase')=='target']
        need(len(starts)==1,'mixed_target_phase')
        segment=rows[starts[0]+1:end];steps={e['step'] for e in segment if 'step' in e}
        need(not any(e.get('phase')=='node_phase_completed' for e in segment),'mixed_before_settings_commit')
        seq=sequence or verify_internal_sequence(events,op,max_steps=4096)
        need(seq['passed'],'mixed_sequence:'+','.join(seq['failures']))
        reads=[(n,s) for n,s in seq['observations'] if n in steps];acts=[(n,a,o) for n,a,o in seq['mutations'] if n in steps]
        def owned(c):return c.get('verified') is True and all(c.get(k)==node[k] for k in ('document_id','workflow_id','node_id'))
        need(reads and all(owned(s.get('prepared_node_context',{})) for _,s in reads),'mixed_owner')
        need(any(s.get('node_mapping')==proof['input'] for _,s in reads)
             and any(s.get('node_reform')==proof['configuration'] for _,s in reads),'mixed_raw_inventory')
        closed=[];opened=[]
        for n,a,_ in acts:
            s=next(s for step,s in reversed(reads) if step<n);w=s.get('wizard',{})
            if a.get('verb')=='open_input_port':need(a.get('port')==0,'mixed_port');opened.append('input');continue
            if a.get('verb')=='begin_wizard':opened.append('node');continue
            if a.get('verb')=='confirm_wizard_deactivation':continue
            es=[e for e in s['ui']['elements'] if e.get('ref')==a.get('ref')];need(len(es)==1,'mixed_control');e=es[0]
            if s['prepared_node_context'].get('surface')=='graph':
                need(a.get('verb')=='click' and e.get('graph_node',{}).get('part') in ('body','label')
                     and e.get('tid') in (s['prepared_node_context']['tid'],s['prepared_node_context']['tid']+';Label;Label'),'mixed_graph_selection');continue
            need((a.get('verb')=='click' and e.get('tid')==w['root_tid']+';btnClose')
                 or (a.get('verb')=='confirm_wizard_close' and e.get('tid')=='msgbox;tlb;yes'),'mixed_draft_mutation')
            if a['verb']=='click':closed.append(w['stage'])
        need(opened==['input','node'] and closed==['input_mapping','field_parameters'],'mixed_cancel_both_drafts')
        last=reads[-1][1];need(last['wizard']['status']=='absent' and last['prepared_node_context'].get('locked') is False
            and last['ui']['dialogs']==[] and last['ui']['masks']==[] and proof['closed']['node_context']==last['prepared_node_context'],'mixed_cleanup')
        im=proof['input'];cfg=proof['configuration']
        need(all(m.get('verified') is True and m.get('inventory_complete') is True and owned(m.get('node_context',{})) for m in (im,cfg)),'mixed_complete_inventory')
        mapping=next(m for m in request['mappings'] if m['direction']=='input')
        targets=im['target_fields'];layout=mapping.get('fields') or [dict(source=dict(name=f['source']['name'])) for f in targets]
        projected=[]
        for index,f in enumerate(layout):
            incoming=[t for t in targets if t['source']['name']==f['source']['name']];need(len(incoming)==1,'mixed_source');incoming=incoming[0]
            old=[v for v in cfg['fields'] if v['field_id']==incoming['field_id']];need(len(old)==1,'mixed_field_id');old=old[0]
            name,label=f.get('name',incoming['name']),f.get('label',incoming['label'])
            projected.append({**{k:old[k] for k in KEYS},'index':index,
                'name':name if old['name']==incoming['name'] else old['name'],
                'label':label if old['label']==incoming['label'] else old['label']})
        need(len(projected)==len(targets)==len(cfg['fields']),'mixed_full_projection')
        return dict(passed=True,failures=[],projected_fields=projected,caching=cfg['caching'])
    except (KeyError,TypeError,ValueError,IndexError,StopIteration) as e:
        return dict(passed=False,failures=[str(e) if isinstance(e,ValueError) else 'mixed_malformed_evidence'])
