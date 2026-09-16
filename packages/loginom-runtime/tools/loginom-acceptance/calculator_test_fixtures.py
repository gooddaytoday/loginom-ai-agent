import copy


import sys


import unittest


from pathlib import Path


import calculator_receipts as ce


import test_settings_evidence as old


SCHEMA = [{'name':'Quantity','label':'Количество','type':'integer'}, {'name':'UnitPrice','label':'Цена','type':'real'}]


def calculator():
    s = copy.deepcopy(old.fixture()[0]); s['authenticated'] = True
    s['wizard']['expression_selection']['row_ref'] = 'row'
    editor = s['ui']['elements'][0]['calculator_editor']; editor['selected_expression']['ref'] = 'name'
    s['wizard']['calculator_expressions'] = {'status':'rendered_expression_definitions', 'settings_applied':False,
        'source_identity_verified':False, 'fields':[{'index':0,'name':'Amount','label':'Amount','type':'real','selected':True,
            'row_ref':'row','name_ref':'name','label_ref':'label'}],
        'definition_coverage':{'status':'complete_configured_rows','count':1,'grid_ref':'grid','container_ref':'container','first_row_ref':'row','last_row_ref':'row'},
        'selected_replacement':{'status':'observed','value':False,'row_ref':'row','button_ref':'replace'}}
    return s


def mapping(root='map1', schema=None):
    schema = schema or SCHEMA
    s = calculator(); s['wizard']['stage'] = 'input_mapping'; s['wizard']['root_ref'] = root; s['wizard']['root_tid'] = 'MF;TF-1;WizrdMCF'
    rows = [[{'index':i,'key':f['name'],'label':f['label'],'type_marker':f['type'],'type_verified':True,'cell_ref':side+str(i)}
             for i, f in enumerate(schema)] for side in ('source','target')]
    s['wizard']['input_mapping'] = {'status':'rendered_mapping_links','source_identity_verified':False,'settings_applied':False,
        'root_ref':root,'source_rows':rows[0],'target_rows':rows[1],
        'links':[{'source_key':f['name'],'target_key':f['name'],'source_ref':'source'+str(i),'target_ref':'target'+str(i),'path_ref':'path'+str(i)} for i,f in enumerate(schema)],
        'rendered_coverage':{'status':'complete_visible_rows','source_count':len(schema),'target_count':len(schema),'link_count':len(schema)}}
    return s


def graph():
    s = calculator(); calc = ce.semantic_owner(s)
    upstream = copy.deepcopy(calc); upstream['graph_key'] = 'up'; upstream['node'] = {'tid':'root>w>up','label':'Import'}
    upstream['path'][-2] = upstream['node']; upstream['path'][-1] = {'tid':'root>w>up>s','label':'Settings'}
    s['wizard'] = {'status':'absent'}
    s['navigation_context'] = {'status':'observed','path':calc['path'][:-2]}
    native = 'MF;TF-1;Graph;'
    s['graph_identity'] = {'status':'observed','container_ref':'diagram','container_tid':'MF;TF-1;ModelForm;cmpDiagram','native_prefix':native}
    s['ui']['elements'] = []
    s['ui']['truncated'] = {'links':False,'ports':False}
    for owner in (upstream,calc):
        key = owner['graph_key']
        s['ui']['elements'] += [{'scope':'graph','tid':native+key,'ref':key,'graph_node':{'node_label':key,'part':'body'}},
            {'scope':'graph','tid':native+key+';Label;Label','ref':key+'label','label':owner['node']['label'],
             'graph_node':{'node_label':key,'part':'label','label_text':owner['node']['label']}}]
    source, target = native+'up;Output_Data-0', native+'n;Input_Data-0'
    s['nodes'] = [{'ports':[{'tid':source}]},{'ports':[{'tid':target}]}]
    s['links'] = [native+'up|Output_Data-0|n|Input_Data-0']
    s['ui']['elements'].append({'scope':'graph','kind':'port','tid':target,'ref':'port','allowed_actions':['right_click']})
    return s, upstream, calc, target


def port_fixture(native_finish=True):
    g, up, calc, target = graph(); e = {'calls':[], 'tools':[], 'events':[]}
    def emit(s, verb=None, ref=None, extra=()):
        n = len(e['calls']); tool = 'dock_ui_action' if verb else 'dock_workspace_observe'
        call = {'row':2*n+1,'session_id':'s','tool_call_id':str(n),'tool':tool,'arguments':{}}
        if verb: call['arguments'] = {'observation_id':'obs'+str(n-1),'action':{'verb':verb,'ref':ref}}
        out = {'status':'SUCCEEDED','operation_id':'op'+str(n),'cleanup_complete':True,'output':copy.deepcopy(s),'trace':[]}
        out['output']['observation_id'] = 'obs'+str(n)
        if verb: out['trace'] = [{'event':'ui_preconditions_verified','refs':[ref],'verb':verb},{'event':'ui_gesture_applied','verb':verb}] + list(extra)
        e['calls'].append(call); e['tools'].append({**call,'row':2*n+2,'result':out})
        e['events'].append({'phase':'completed' if verb else 'observation_completed','operation_id':out['operation_id'],'outcome':copy.deepcopy(out)})
        return out['operation_id']
    def open_(root):
        ops = [emit(g)]
        menu = copy.deepcopy(g); menu['ui']['elements'].append({'ref':'configure','tid':'mn;mniConfigurePort','role':'menuitem','allowed_actions':['click']})
        ops.append(emit(menu,'right_click','port'))
        m = mapping(root); nodepath = calc['path'][:-1]
        portpath = nodepath + [{'tid':calc['node']['tid']+'>Входные_порты','label':'Входные порты'},
            {'tid':calc['node']['tid']+'>Входные_порты>Источник','label':'Источник'}]
        m['wizard']['input_port_context'] = {'status':'observed','direction':'input','source_identity_verified':False,'opening_verified':False,
            'node_path':nodepath,'node':{**calc['node'],'ref':'nodecrumb'},'port_ref':'portcrumb','port_path':portpath,
            'path':portpath + [{'tid':portpath[-1]['tid']+'>Настройка','label':'Настройка'}]}
        m['ui']['elements'] = [{'ref':'done','tid':'MF;TF-1;WizrdMCF;btnDone','allowed_actions':['finish_wizard'], 'wizard_finish':{'mode':'input_port','root_ref':root,'node_ref':'nodecrumb','port_ref':'portcrumb'}}]
        ops.append(emit(m,'click','configure')); ops.append(emit(m))
        return ops, m
    a, m = open_('map1')
    trace = [{'event':'input_port_finish_verified','wizard_root_ref':'map1','port_path':m['wizard']['input_port_context']['port_path'],
              'control_ref':'done','reopen_required':True,'workflow_path':calc['path'][:-2],
              'settings_readback_verified':False,'settings_applied':False,'source_identity_verified':False,'package_saved':False,'node':{'node_label':calc['graph_key'],'part':'body'},'node_ref':calc['graph_key']},
              {'event':'input_port_finish_settled','quiet_samples':3,'interval_ms':200,'dom_epoch':g['dom_epoch'],'node_ref':calc['graph_key']}] if native_finish else []
    finish = emit(g,'finish_wizard','done',trace)
    b, _ = open_('map2')
    return e, {'before':a,'finish':finish,'after':b}, up, calc


def expression_fixture():
    base=calculator(); base['wizard']['root_tid']='MF;TF-1;WizrdMCF'
    base['ui']['elements'] += [{'ref':'name','tid':'MF;TF-1;WizrdMCF;CalcDataWizard;colExpressionName_Amount','allowed_actions':['press']},
                              {'ref':'next','allowed_actions':['wizard_step']}]
    g,_,owner,_=graph()
    g['ui']['elements'].append({'ref':'setting','scope':'graph','tid':'MF;TF-1;Graph;n;Setting','graph_node':{'node_label':'n','part':'settings'},'allowed_actions':['open_wizard']})
    def params(s):
        p=copy.deepcopy(s)
        p['wizard']['expression_parameters']={'status':'observed','root_ref':'params','selected_expression':{'label':'Amount'},
            'fields':{k:{'status':'observed','value':v,'truncated':False,'input_ref':k} for k,v in {'name':'Amount','label':'Amount','type_label':'Вещественный'}.items()},
            'options':{k:{'status':'observed','value':False,'source':'loginom_ext_checkbox','owner_ref':k+'owner','input_ref':k+'input','display_ref':k+'display'} for k in ('intermediate','cached')}}
        p['ui']['elements']=[{'ref':'apply','allowed_actions':['apply_expression_parameters']},{'ref':'cancel','allowed_actions':['cancel_expression_parameters']}]
        return p
    def output(s):
        o=copy.deepcopy(s);o['wizard']['stage']='output_mapping';fs=SCHEMA+[{'name':'Amount','label':'Amount','type':'real'}]
        o['wizard']['output_columns']={'status':'rendered_rows','settings_applied':False,
            'fields':[{'status':'observed',**f,'row_ref':'row'+str(i),'source':{'status':'rendered_source','identity_verified':False,'label':f['label'],'type':f['type'],'cell_ref':'source'+str(i)}} for i,f in enumerate(fs)],
            'definition_coverage':{'status':'complete_configured_rows','count':len(fs),'body_ref':'body','container_ref':'container','filter_ref':'filter','table_mode_ref':'table','first_row_ref':'row0','last_row_ref':'row'+str(len(fs)-1)},
            'auto_sync':{'status':'observed','value':True,'ref':'sync'}}
        return o
    e={'calls':[],'tools':[],'events':[]};ops={};seq=[]
    def emit(s,key,verb=None,ref=None,event=None):
        n=len(e['calls']);op='expr'+str(n);seq.append(op);ops[key]=op
        call={'session_id':'s','tool_call_id':'expr'+str(n),'tool':'dock_ui_action' if verb else 'dock_workspace_observe','row':2*n+1,'arguments':{}}
        out={'status':'SUCCEEDED','operation_id':op,'cleanup_complete':True,'output':copy.deepcopy(s),'trace':[]};out['output']['observation_id']='obs'+str(n)
        if verb:
            call['arguments']={'observation_id':'obs'+str(n-1),'action':{'verb':verb,'ref':ref}}
            out['trace']=[{'event':'ui_preconditions_verified','refs':[ref],'verb':verb},{'event':'ui_gesture_applied','verb':verb}]
            if verb=='press':call['arguments']['action']['key']='F2'
            if verb=='wizard_step':
                call['arguments']['action']['expected_stage']=s['wizard']['stage']
                out['trace'].append({'event':'wizard_step_verified','from_stage':e['tools'][-1]['result']['output']['wizard']['stage'],'to_stage':s['wizard']['stage'],'root_ref':s['wizard']['root_ref'],'settings_applied':False})
            if event:out['trace'].append(event)
        e['calls'].append(call);e['tools'].append({**call,'row':2*n+2,'result':out});e['events'].append({'phase':'completed' if verb else 'observation_completed','operation_id':op,'outcome':copy.deepcopy(out)})
    emit(base,'definition_before')
    emit(params(base),'options_before','press','name')
    parameter_event={'event':'expression_parameters_row_verified','name':'Amount','label':'Amount','type_label':'Вещественный'}
    emit(base,'options_apply','apply_expression_parameters','apply',parameter_event)
    emit(output(base),'output_before','wizard_step','next')
    done=copy.deepcopy(base);done['wizard']['stage']='done';done['wizard']['completion']={'fields':{'label':{'value':'Node'}}}
    done['ui']['elements']=[{'ref':'finish','allowed_actions':['finish_wizard']}]
    emit(done,'done','wizard_step','next')
    finish_event={'event':'wizard_finish_graph_verified','previous_owner':base['wizard']['owner_context']['node'],'label':'Node','node':{'node_label':'n','part':'body'},'node_ref':'n','reopen_required':True,'settings_readback_verified':False,'package_saved':False}
    emit(g,'finish','finish_wizard','finish',finish_event)
    after=copy.deepcopy(base);after['wizard']['root_ref']='wizard2';after['ui']['elements'][0]['calculator_editor']['document']['document_ref']='editor2'
    opened={'event':'wizard_open_verified','node':{'node_label':'n','part':'settings'},'workflow_path':owner['path'][:-2],'wizard_root_ref':'wizard2','owner_node':after['wizard']['owner_context']['node'],'settings_applied':False}
    emit(after,'open','open_wizard','setting',opened);emit(after,'definition_after')
    emit(params(after),'options_after','press','name')
    emit(after,'options_cancel','cancel_expression_parameters','cancel',{**parameter_event,'event':'expression_parameters_cancel_verified'})
    emit(output(after),'output_after','wizard_step','next')
    ops['sequence']=seq
    return e,ops


def aggregate_fixture():
    import test_import_roundtrip_evidence as it
    import test_import_settings_evidence as ist
    global SCHEMA
    imported = it.fixture(); settings=ist.ImportSettingsEvidenceTests()
    for idx in (1,7):
        for o in (imported['tools'][idx]['result'],imported['events'][idx]['outcome']):
            o['output']['wizard']['import_columns']=copy.deepcopy(settings.configured_snapshot()['wizard']['import_columns'])
    for idx in (2,8):
        for o in (imported['tools'][idx]['result'],imported['events'][idx]['outcome']):
            o['output']['wizard']['output_columns']=copy.deepcopy(settings.configured_mapping_snapshot()['wizard']['output_columns'])
    proof=ce.ir.diagnose(imported,ist.EXPECTED,'',expected_source_path=it.PATH)['roundtrips'][0]
    upstream=ce.semantic_owner(imported['tools'][-1]['result']['output']);parent=upstream['path'][-3]['tid']
    original_schema=SCHEMA
    SCHEMA=[{**f,'label':f['name']} for f in ist.EXPECTED['schema']]
    try:
        pe,pops,_,_=port_fixture();xe,xops=expression_fixture()
    finally:SCHEMA=original_schema
    tidmap={'root':upstream['path'][0]['tid'],'root>w':parent,
            'root>w>up':upstream['node']['tid'],'root>w>up>s':upstream['path'][-1]['tid'],
            'root>w>n':parent+'>calc','root>w>n>s':parent+'>calc>s'}
    def remap(v):
        if isinstance(v,list):return [remap(x) for x in v]
        if isinstance(v,dict):return {k:remap(x) for k,x in v.items()}
        if isinstance(v,str):
            for key in sorted(tidmap,key=len,reverse=True):
                if v==key or v.startswith(key+'>'):return tidmap[key]+v[len(key):]
            if v.startswith('MF;TF-1;Graph;'):
                tail=v[len('MF;TF-1;Graph;'):]
                return 'MF;TF-1;Graph;'+__import__('re').sub(r'(?<![A-Za-z])(up|n)(?=[;|]|$)',lambda m:{'up':'n','n':'calc'}[m[0]],tail)
            return {'n':'calc','up':'n','Node':'Calc'}.get(v,v)
        return v
    pe,xe=remap(pe),remap(xe)
    e=copy.deepcopy(imported)
    def append_part(part, namespace):
        # Rewrite only receipt correlation fields, leaving the native data intact.
        offset=max(t['row'] for t in e['tools'])
        opmap={t['result']['operation_id']:namespace+t['result']['operation_id'] for t in part['tools']}
        obsmap={t['result']['output']['observation_id']:namespace+t['result']['output']['observation_id'] for t in part['tools']}
        for c in part['calls']:
            c['row']+=offset;c['tool_call_id']=namespace+c['tool_call_id']
            if 'observation_id' in c['arguments']:c['arguments']['observation_id']=obsmap[c['arguments']['observation_id']]
        for t in part['tools']:
            t['row']+=offset;t['tool_call_id']=namespace+t['tool_call_id']
            if 'observation_id' in t['arguments']:t['arguments']['observation_id']=obsmap.get(t['arguments']['observation_id'],t['arguments']['observation_id'])
            t['result']['operation_id']=opmap[t['result']['operation_id']]
            t['result']['output']['observation_id']=obsmap[t['result']['output']['observation_id']]
        for event,t in zip(part['events'],part['tools']):
            event['operation_id']=t['result']['operation_id'];event['outcome']=copy.deepcopy(t['result'])
        for key in e:e[key].extend(part[key])
        return opmap
    def emit(s, verb, ref, trace):
        n=max(t['row'] for t in e['tools'])+1;op='bridge'+str(n)
        call={'row':n,'session_id':'s','tool_call_id':op,'tool':'dock_ui_action',
              'arguments':{'observation_id':e['tools'][-1]['result']['output']['observation_id'],'action':{'verb':verb,'ref':ref}}}
        if verb=='wizard_step':call['arguments']['action']['expected_stage']=s['wizard']['stage']
        out={'status':'SUCCEEDED','cleanup_complete':True,'operation_id':op,'output':copy.deepcopy(s),
             'trace':[{'event':'ui_preconditions_verified','refs':[ref],'verb':verb},{'event':'ui_gesture_applied','verb':verb},trace]}
        out['output']['observation_id']=op+'obs'
        e['calls'].append(call);e['tools'].append({**call,'row':n+1,'result':out});e['events'].append({'phase':'completed','operation_id':op,'outcome':copy.deepcopy(out)})
        return op
    done=copy.deepcopy(e['tools'][-1]['result']['output']);done['wizard']['stage']='done'
    done['wizard']['completion']={'fields':{'label':{'value':'Import'}}};done['ui']['elements']=[{'ref':'doneImport','allowed_actions':['finish_wizard']}]
    bridge=[emit(done,'wizard_step','next',{'event':'wizard_step_verified','from_stage':'output_mapping','to_stage':'done','root_ref':done['wizard']['root_ref'],'settings_applied':False})]
    bridge.append(emit(pe['tools'][0]['result']['output'],'finish_wizard','doneImport',{'event':'wizard_finish_graph_verified','previous_owner':done['wizard']['owner_context']['node'],'label':'Import',
        'node':{'node_label':'n','part':'body'},'node_ref':'n','reopen_required':True,'settings_readback_verified':False,'package_saved':False}))
    pm=append_part(pe,'p-')
    final_input=e['tools'][-1]['result']['output'];ctx=final_input['wizard']['input_port_context']
    g=copy.deepcopy(xe['tools'][5]['result']['output'])
    bridge.append(emit(g,'finish_wizard','done',{'event':'input_port_finish_verified','wizard_root_ref':final_input['wizard']['root_ref'],
        'control_ref':'done','port_path':ctx['port_path'],'workflow_path':g['navigation_context']['path'],'reopen_required':True,
        'settings_readback_verified':False,'settings_applied':False,'source_identity_verified':False,'package_saved':False,'node':{'node_label':'calc','part':'body'},'node_ref':'calc'}))
    e['tools'][-1]['result']['trace'].append({'event':'input_port_finish_settled','quiet_samples':3,'interval_ms':200,'dom_epoch':g['dom_epoch'],'node_ref':'calc'})
    e['events'][-1]['outcome']=copy.deepcopy(e['tools'][-1]['result'])
    opened=xe['tools'][0]['result']['output'];calcowner=ce.semantic_owner(opened)
    bridge.append(emit(opened,'open_wizard','setting',{'event':'wizard_open_verified','node':{'node_label':'calc','part':'settings'},
        'workflow_path':calcowner['path'][:-2],'wizard_root_ref':opened['wizard']['root_ref'],'owner_node':opened['wizard']['owner_context']['node'],'settings_applied':False}))
    xm=append_part(xe,'c-')
    popsmapped={k:[pm[o] for o in v] if isinstance(v,list) else pm[v] for k,v in pops.items()}
    xopsmapped={k:[xm[o] for o in v] if isinstance(v,list) else xm[v] for k,v in xops.items()}
    chain={'import_operations':proof['operations'],'port':popsmapped,'expression':xopsmapped,'bridge_operations':bridge}
    return e,copy.deepcopy(ist.EXPECTED),chain
