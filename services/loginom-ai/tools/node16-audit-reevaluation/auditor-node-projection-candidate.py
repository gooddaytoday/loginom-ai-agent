def node(e,ps,op):
    starts=[(c,r) for c,r in ps if c['tool']==PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==op]
    allocated=[(c,r) for c,r in starts if r['result'].get('state') in ('running','settled')]
    call,_=one(allocated,'Node public start')
    for c,r in starts:
        if c is not call:need(validation_refusal(c,r,e['events'],{op},ps),'Unproved extra node request')
    prepared=event(e,op,'node_apply_prepared');bind_node_request(prepared['request'],call,ps)
    replies=[r['result'] for c,r in ps if c['arguments'].get('operation_id')==op and r['result'].get('state')=='settled']
    need(bool(replies) and all(x==replies[0] for x in replies),'Node settled result absent/changed')
    body=replies[0];end=event(e,op,'completed')['outcome'];n=end['output']
    need(body['status']==end['status'] and body.get('node')==n.get('node'),'Terminal node identity/status')
    if end['status']=='SUCCEEDED':
        need(body['configuration']==n['configuration'] and body['execution']==n['execution'],'Terminal settings/execution differ')
        for a,b in zip(body['output'].get('ports',[]),n['output'].get('ports',[])):
            expected=dict(b)
            if body.get('result_version')=='user-v1':
                expected['schema']=[{k:v for k,v in column.items() if k!='header_tid'} for column in b['schema']]
                expected['sample']=[]
                for row in b['sample']:
                    cells=[]
                    for cell in row:
                        value=dict(cell)
                        if 'display_text' in value and value.get('value')==value['display_text']:del value['display_text']
                        cells.append(value)
                    expected['sample'].append(cells)
            for key in ['schema','exact_table','sample','read_coverage','binding']:
                need(json.dumps(a.get(key),sort_keys=True,ensure_ascii=False)==json.dumps(expected.get(key),sort_keys=True,ensure_ascii=False),'Public/internal '+key)
        need(len(body['output'].get('ports',[]))==len(n['output'].get('ports',[])),'Public/internal port count')
    return call['arguments'],body

