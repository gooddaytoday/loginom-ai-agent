"""Independent Calculator gate: native node and separate port lifecycles.
Candidate selection never substitutes for immutable journal-bound evidence.
"""
from calculator_receipts import *
import import_roundtrip_evidence as ir
import settings_evidence as se

def verify_node_roundtrip(evidence, prefix, operations, expected, upstream_fields):
    """An explicit operation manifest selects receipts, never substitutes proof.

    All intervening mutations must be selected and independently issued; exact
    wizard transitions retain the existing native transition verifier. Parameter
    options are applied before finish and read again after reopening.
    """
    result = {'calculator_node_roundtrip_verified': False, 'package_persistence_verified': False}
    try:
        j = Journal(evidence, prefix)
        required = ('definition_before', 'options_before', 'options_apply',
                    'done', 'finish', 'open', 'definition_after', 'options_after', 'options_cancel')
        require(set(operations) == set(required) | {'sequence'}, 'expression_chain_shape')
        sequence = operations['sequence']
        require(sequence and sequence[0] == operations['definition_before'] and ir._verb(j.get(sequence[0])) is None, 'expression_baseline_must_be_read')
        require(all(operations[k] in sequence for k in required) and len({operations[k] for k in required}) == len(required), 'required_operation_not_in_sequence_or_reused')
        rs = j.ordered(sequence); chosen = {k: j.get(operations[k]) for k in required}
        require([sequence.index(operations[k]) for k in required] == sorted(sequence.index(operations[k]) for k in required), 'expression_chain_order')
        j.fence(rs[0], rs[-1], rs)
        snapshots = {k: r['outcome']['output'] for k, r in chosen.items()}
        a = definition(snapshots['definition_before'], expected); b = definition(snapshots['definition_after'], expected)
        require({k: v for k, v in a.items() if k != 'editor_ref'} == {k: v for k, v in b.items() if k != 'editor_ref'}
                and a['editor_ref'] != b['editor_ref'], 'expression_changed_or_editor_not_reopened')
        owner = a['owner']
        require(all(semantic_owner(snapshots[k]) == owner for k in ('done',)), 'output_or_done_owner_changed')
        oa = expression_options(snapshots['options_before'], expected); ob = expression_options(snapshots['options_after'], expected)
        require(oa == ob and oa['owner'] == owner and oa['label'] == a['label'], 'options_changed_or_foreign_owner')
        # Native parameter application is a separate required receipt. A before
        # dialog with desired defaults is not proof that they were committed.
        for key, verb, event in [('options_apply', 'apply_expression_parameters', 'expression_parameters_row_verified'),
                                 ('options_cancel', 'cancel_expression_parameters', 'expression_parameters_cancel_verified')]:
            r = chosen[key]; j.action(r, verb)
            traces = [t for t in r['outcome'].get('trace', []) if t.get('event') == event]
            require(len(traces) == 1 and traces[0].get('name') == a['name']
                    and traces[0].get('label') == a['label'] and traces[0].get('type_label') == 'Вещественный'
                    and not r['outcome']['output']['wizard'].get('expression_parameters'), 'parameter_commit_or_cancel_missing')
        for before, current in zip(rs, rs[1:]):
            s0 = before['outcome']['output']; s1 = current['outcome']['output']; verb = ir._verb(current)
            if verb is None:
                require(s0.get('wizard', {}).get('stage') == s1.get('wizard', {}).get('stage'), 'unobserved_stage_transition')
                continue
            e = j.action(current, verb)
            if verb == 'wizard_step':
                require(ir._semantic_owner(s0) == owner and ir._semantic_owner(s1) == owner
                        and ir._transition_trace(current, s0, s1, owner), 'wizard_step_unbound')
            elif verb == 'finish_wizard':
                require(current == chosen['finish'] and before == chosen['done'] and ir._graph(s1, owner)
                        and ir._transition_trace(current, s0, s1, owner), 'finish_unbound')
            elif verb == 'open_wizard':
                require(current == chosen['open'] and ir._semantic_owner(s1) == owner
                        and ir._transition_trace(current, s0, s1, owner)
                        and ir._issued_graph_binding(current, j.receipts, owner, snapshots['definition_before'], snapshots['finish']['graph_identity']), 'reopen_unbound')
            elif verb in ('apply_expression_parameters', 'cancel_expression_parameters'):
                require(current in (chosen['options_apply'], chosen['options_cancel']), 'unexpected_parameter_mutation')
            elif verb == 'press':
                require(current['call']['arguments']['action'].get('key') == 'F2'
                        and e.get('tid') == s0['wizard']['root_tid'] + ';CalcDataWizard;colExpressionName_' + a['name']
                        and s1['wizard'].get('expression_parameters', {}).get('status') == 'observed', 'unexpected_key_or_parameter_owner')
            elif verb == 'click':
                if e.get('tid') == s0.get('wizard',{}).get('root_tid','')+';CalcDataWizard;btnExprEdit':
                    current_definition=definition(s0,expected)
                    require({k:v for k,v in current_definition.items() if k!='editor_ref'}=={k:v for k,v in a.items() if k!='editor_ref'}
                            and not s0['wizard'].get('expression_parameters')
                            and s0['wizard']['root_ref']==s1['wizard']['root_ref']
                            and expression_options(s1,expected)==oa, 'parameter_button_open_unbound')
                else:
                    require(chosen['finish']['reply_row'] < current['call']['row'] < chosen['open']['call']['row']
                            and e.get('graph_node') == {'node_label': owner['graph_key'], 'part': 'body'}
                            and ir._graph(s1, owner), 'unexpected_click_mutation')
            else:
                raise Unverifiable('unexpected_mutation:' + str(verb))
        require(se.roundtrip(snapshots['definition_before'], snapshots['finish'], snapshots['open'], snapshots['definition_after'], expected)['calculator_node_settings_verified'], 'existing_roundtrip_rejected')
        return {**result, 'calculator_node_roundtrip_verified': True, 'reason': 'bound_native_node_definition_options_roundtrip',
                'owner': owner, 'definition': {k:v for k,v in a.items() if k!='editor_ref'}, 'operations': operations}
    except (KeyError, TypeError, AttributeError, ValueError, IndexError) as e:
        return {**result, 'reason': str(e) if isinstance(e, Unverifiable) else 'malformed_evidence'}


def output_port_context(snapshot, owner):
    w=snapshot.get('wizard',{});c=w.get('port_context',{})
    require(w.get('status')=='observed' and w.get('stage')=='output_mapping'
            and c.get('status')=='observed' and c.get('kind')=='output_data'
            and c.get('opening_verified') is False,'output_port_context_missing')
    path=semantic_path(c.get('path'));nodepath=owner['path'][:-1]
    require(path[:-3]==nodepath and {k:c.get('node',{}).get(k) for k in ('tid','label')}==owner['node'], 'output_port_owner_changed')
    require(path[-3]['tid']==owner['node']['tid']+'>Выходные_порты'
            and path[-2]['tid'].startswith(path[-3]['tid']+'>')
            and path[-1]['tid']==path[-2]['tid']+'>Настройка'
            and {k:c.get('port',{}).get(k) for k in ('tid','label')}==path[-2], 'output_port_path_unbound')
    require(text(c['node'].get('ref')) and text(c['port'].get('ref')), 'output_port_refs_missing')
    return path


def output_port_open(j, operations, owner, upstream_fields, definition):
    graph,right,menu,reading=j.ordered(operations)
    require(ir._verb(graph) is None and ir._verb(reading) is None,'output_port_fresh_reads_missing')
    j.fence(graph,reading,[right,menu]);g=graph['outcome']['output'];r=right['outcome']['output'];m=reading['outcome']['output']
    require(ir._graph(g,owner) and g.get('ui',{}).get('truncated',{}).get('ports') is False,'output_graph_incomplete')
    target=g['graph_identity']['native_prefix']+owner['graph_key']+';Output_Data-0'
    e=j.action(right,'right_click')
    require(e.get('kind')=='port' and e.get('scope')=='graph' and e.get('tid')==target,'output_open_wrong_port')
    require(sum(p.get('tid')==target for node in g.get('nodes',[]) for p in node.get('ports',[]))==1,'output_graph_endpoint_missing')
    require(sum(x.get('ref')==e.get('ref') and x.get('tid')==target for x in graph['delivered']['output']['ui']['elements'])==1,'output_port_not_issued_by_graph')
    mi=j.action(menu,'click');require(mi.get('tid')=='mn;mniConfigurePort' and mi.get('role')=='menuitem','output_wrong_menu')
    require(r.get('wizard',{}).get('status')=='absent' and sum(x.get('ref')==mi.get('ref') for x in right['delivered']['output']['ui']['elements'])==1,'output_menu_not_bound')
    require(menu['outcome']['output'].get('wizard',{}).get('root_ref')==m.get('wizard',{}).get('root_ref'),'output_mapping_not_opened')
    path=output_port_context(m,owner)
    return {'mapping':output_mapping(m,upstream_fields,definition),'path':path[:-1],
            'root_ref':m['wizard']['root_ref'],'port_tid':target,'operations':operations}


def output_port_finish(j, before, finish, owner):
    s=before['outcome']['output'];after=finish['outcome']['output'];same_context(s,after)
    path=output_port_context(s,owner);c=s['wizard']['port_context'];e=j.action(finish,'finish_wizard')
    require(e.get('tid')==s['wizard']['root_tid']+';btnDone' and e.get('wizard_finish')=={
        'mode':'output_port','root_ref':s['wizard']['root_ref'],'node_ref':c['node']['ref'],'port_ref':c['port']['ref']},'output_finish_not_issued')
    events=[t for t in finish['outcome'].get('trace',[]) if t.get('event')=='output_port_finish_verified'];require(len(events)==1,'output_finish_trace_missing');t=events[0]
    require(t.get('wizard_root_ref')==s['wizard']['root_ref'] and t.get('control_ref')==e.get('ref')
        and semantic_path(t.get('port_path'))==path[:-1] and semantic_path(t.get('workflow_path'))==owner['path'][:-2]
        and t.get('reopen_required') is True and all(t.get(k) is False for k in ('settings_readback_verified','settings_applied','source_identity_verified','package_saved')), 'output_finish_trace_mismatch')
    require(ir._graph(after,owner),'output_finish_graph_missing');body={'node_label':owner['graph_key'],'part':'body'}
    require(t.get('node')==body and sum(x.get('ref')==t.get('node_ref') and x.get('graph_node')==body for x in after['ui']['elements'])==1,'output_finish_wrong_node')
    settles=[t for t in finish['outcome'].get('trace',[]) if t.get('event')=='output_port_finish_settled']
    require(len(settles)==1 and settles[0].get('quiet_samples')==3 and settles[0].get('interval_ms')==200
        and settles[0].get('dom_epoch')==after.get('dom_epoch') and settles[0].get('node_ref')==t['node_ref'],'output_finish_not_settled')


def verify_output_port_roundtrip(evidence,prefix,operations,owner,upstream_fields,definition):
    result={'calculator_output_roundtrip_verified':False,'package_persistence_verified':False}
    try:
        j=Journal(evidence,prefix);require(set(operations)=={'before','finish','after'},'output_roundtrip_shape')
        a=output_port_open(j,operations['before'],owner,upstream_fields,definition)
        b=output_port_open(j,operations['after'],owner,upstream_fields,definition)
        before,finish,after=j.ordered([operations['before'][-1],operations['finish'],operations['after'][0]])
        j.fence(before,after,[finish]);output_port_finish(j,before,finish,owner)
        require(a['root_ref']!=b['root_ref'] and all(a[k]==b[k] for k in ('mapping','path','port_tid')),'output_not_reopened_or_changed')
        return {**result,'calculator_output_roundtrip_verified':True,'owner':owner,'output_mapping':a['mapping'],'operations':operations}
    except (KeyError,TypeError,ValueError,AttributeError,IndexError) as e:
        return {**result,'reason':str(e) if isinstance(e,Unverifiable) else 'malformed_output_port_evidence'}


def bound_link_creation(evidence,prefix,call,before,after,upstream,owner):
    """Admit only an exact ordinary data link with native prepared/completed proof."""
    import prepare_binding
    require(call.get('tool')==prefix+'dock_action_run','bridge_not_ready_action')
    args=call.get('arguments',{});p=args.get('parameters',{})
    require(args.get('action_key')=='link.create' and text(args.get('operation_id')),'bridge_not_link_creation')
    key=(call.get('session_id'),call.get('tool_call_id'))
    require(sum((c.get('session_id'),c.get('tool_call_id'))==key for c in evidence['calls'])==1,'link_call_not_unique')
    replies=[t for t in evidence['tools'] if (t.get('session_id'),t.get('tool_call_id'))==key]
    require(len(replies)==1 and replies[0].get('tool')==call['tool'] and call['row']<replies[0]['row'],'link_reply_not_unique')
    reply=replies[0];out=reply.get('result',{});op=args['operation_id']
    prepared=prepare_binding.successful_prepare(evidence,prefix,call['session_id'],call['row']);require(prepared is not None,'link_prepare_binding_missing')
    records={phase:[e for e in evidence['events'] if e.get('phase')==phase and e.get('operation_id')==op] for phase in ('prepared','completed')}
    require(all(len(v)==1 for v in records.values()),'link_journal_not_unique');pre,done=records['prepared'][0],records['completed'][0]
    require(done.get('outcome')==out and all(e.get('session_id')==prepared['sessionId'] and e.get('action_key')=='link.create' and e.get('parameters')==p for e in (pre,done)),'link_journal_mismatch')
    require(pre.get('checkpoint')==done.get('checkpoint') and pre.get('action_revision')==done.get('action_revision')==out.get('action_revision')
            and text(pre.get('runtime_revision')) and pre['runtime_revision']==done.get('runtime_revision')
            and text(pre.get('manifest_sha256')) and pre['manifest_sha256']==done.get('manifest_sha256'),'link_pin_or_checkpoint_mismatch')
    same_context(before,after);require(before['wizard']['status']==after['wizard']['status']=='absent','link_not_on_graph')
    require(ir._graph(before,upstream) and ir._graph(before,owner) and ir._graph(after,upstream) and ir._graph(after,owner),'link_owner_graph_missing')
    workflow=before['workflow_ref'];node=lambda o:{'kind':'node','node_label':o['graph_key'],'workflow_ref':workflow}
    require(set(p)=={'source_node','target_node','source_port','target_port'} and p['source_node']==node(upstream) and p['target_node']==node(owner),'link_changed_node')
    for port in (p['source_port'],p['target_port']):require(isinstance(port,dict) and set(port)<={'kind','index'} and port.get('kind')=='data' and type(port.get('index',0)) is int and port.get('index',0)==0,'link_changed_port')
    native=before['graph_identity']['native_prefix'];target=native+owner['graph_key']+';Input_Data-0';edge=graph_edge(after,upstream,owner,target)
    require(pre['checkpoint'].get('workflow_ref')==workflow and pre['checkpoint'].get('source_tid')==edge['source_tid'] and pre['checkpoint'].get('target_tid')==edge['target_tid'],'link_checkpoint_endpoint_mismatch')
    require(out.get('operation_id')==op and out.get('action_key')=='link.create' and out.get('status')=='SUCCEEDED'
            and out.get('phase')=='verified' and out.get('cleanup_complete') is True
            and out.get('output',{}).get('link_ref')=={'kind':'link','tid':edge['link_tid']},'link_completion_missing')
    def graph_nodes(s):
        require(s.get('ui',{}).get('truncated',{}).get('nodes') is False and s.get('ui',{}).get('truncated',{}).get('ports') is False,'link_nodes_truncated')
        rows=[]
        for n in s.get('nodes',[]):
            ref=n.get('node_ref');ports=[p.get('tid') for p in n.get('ports',[])]
            require(isinstance(ref,dict) and all(text(t) for t in ports) and len(set(ports))==len(ports),'link_node_manifest_invalid')
            rows.append({'node_ref':ref,'ports':sorted(ports)})
        return rows
    require(before.get('graph_identity')==after.get('graph_identity') and graph_nodes(before)==graph_nodes(after),'link_changed_nodes')
    require(before.get('ui',{}).get('truncated',{}).get('links') is False and after.get('ui',{}).get('truncated',{}).get('links') is False,'link_inventory_truncated')
    require(set(after.get('links',[]))==set(before.get('links',[]))|{edge['link_tid']} and len(set(after['links']))==len(after['links']),'link_changed_other_edge')
    return {'call':call,'reply_row':reply['row'],'outcome':out,'delivered':out}


def bridge(j,first,last,upstream,owner,prefix):
    """Only verified native wizard/graph navigation and exact scaffold links."""
    rs=[r for r in j.receipts if first['call']['row']<=r['call']['row']<=last['call']['row']]
    require(rs and rs[0]==first and rs[-1]==last,'bridge_anchors_missing')
    j.ordered([r['outcome']['operation_id'] for r in rs]);allowed=list(rs)
    for before,after in zip(rs,rs[1:]):
        s0=before['outcome']['output'];s1=after['outcome']['output'];verb=ir._verb(after)
        extras=[c for c in j.evidence['calls'] if before['reply_row']<c.get('row',-1)<after['call']['row'] and ir._mutation(c) and c not in j.refusals]
        if extras:
            require(len(extras)==1 and verb is None,'bridge_multiple_or_overlapping_scaffold')
            allowed.append(bound_link_creation(j.evidence,prefix,extras[0],s0,s1,upstream,owner))
            require(allowed[-1]['reply_row']<after['call']['row'],'bridge_scaffold_overlaps_read')
        if verb is None:
            w0=s0.get('wizard',{});w1=s1.get('wizard',{})
            require(all(w0.get(k)==w1.get(k) for k in ('status','stage','root_ref')),'bridge_read_without_navigation')
            if w1.get('status')=='observed':
                if w1.get('stage')=='input_mapping':require(semantic_path(w0.get('input_port_context',{}).get('port_path'))==semantic_path(w1.get('input_port_context',{}).get('port_path')),'bridge_input_owner_changed')
                elif w1.get('port_context',{}).get('status')=='observed':require(output_port_context(s0,owner)==output_port_context(s1,owner),'bridge_output_owner_changed')
                else:require(semantic_owner(s0)==semantic_owner(s1),'bridge_node_owner_changed')
            continue
        e=j.action(after,verb)
        if verb=='finish_wizard' and e.get('wizard_finish',{}).get('mode')=='input_port':port_finish(j,before,after,owner)
        elif verb=='finish_wizard' and e.get('wizard_finish',{}).get('mode')=='output_port':output_port_finish(j,before,after,owner)
        elif verb in ('wizard_step','finish_wizard','open_wizard'):
            selected=next((o for o in (upstream,owner) if ir._semantic_owner(s1 if verb=='open_wizard' else s0)==o),None)
            require(selected is not None and ir._transition_trace(after,s0,s1,selected),'bridge_wizard_transition_unbound')
            if verb=='finish_wizard':require(ir._graph(s1,selected),'bridge_finish_graph_missing')
            if verb=='open_wizard':require(ir._issued_graph_binding(after,j.receipts,selected,s1,s0.get('graph_identity')),'bridge_open_unbound')
        elif verb=='click':require(any(e.get('graph_node')=={'node_label':o['graph_key'],'part':'body'} and ir._graph(s0,o) and ir._graph(s1,o) for o in (upstream,owner)),'bridge_click_not_node')
        else:require(False,'bridge_unknown_mutation:'+str(verb))
    j.fence(first,last,allowed)
    return [r['outcome']['operation_id'] for r in allowed]


def verify_native_calculator(evidence,expected,prefix,chain,*,expected_source_path):
    result={'calculator_expression_and_mappings':False,'package_persistence_verified':False}
    try:
        j=Journal(evidence,prefix);require(set(chain)=={'import_operations','input','node','output'},'calculator_chain_shape')
        imports=ir.diagnose(evidence,expected,prefix,expected_source_path=expected_source_path)['roundtrips']
        require(sum(p.get('operations')==chain['import_operations'] and all(p.get(k) is True for k in ('rendered_import_settings_roundtrip_match','configured_schema_roundtrip_match','configured_mapping_roundtrip_match')) for p in imports)==1,'verified_import_roundtrip_missing')
        source=j.get(chain['import_operations'][-1]);s=source['outcome']['output'];upstream=semantic_owner(s)
        fields=[{k:f[k] for k in ('name','label','type')} for f in s['wizard']['output_columns']['fields']]
        node=verify_node_roundtrip(evidence,prefix,chain['node'],expected['calculator'],fields);require(node['calculator_node_roundtrip_verified'],node.get('reason','node_unverified'));owner=node['owner']
        inp=verify_port_roundtrip(evidence,prefix,chain['input'],upstream,owner,fields);require(inp['input_source_mapping_verified'] and inp['settings_applied_verified'],inp.get('reason','input_unverified'))
        out=verify_output_port_roundtrip(evidence,prefix,chain['output'],owner,fields,node['definition']);require(out['calculator_output_roundtrip_verified'],out.get('reason','output_unverified'))
        anchors=[source['outcome']['operation_id'],chain['input']['before'][0],chain['input']['after'][-1],chain['node']['sequence'][0],chain['node']['sequence'][-1],chain['output']['before'][0],chain['output']['after'][-1]]
        j.ordered(anchors);bridges=[]
        for first,last in ((anchors[0],anchors[1]),(anchors[2],anchors[3]),(anchors[4],anchors[5])):
            bridges.extend(bridge(j,j.get(first),j.get(last),upstream,owner,prefix))
        return {**result,'calculator_expression_and_mappings':True,'owner':owner,'input_mapping':inp,'expression':node,'output_mapping':out,
                'import_operations':chain['import_operations'],'bridge_operations':bridges,'reason':'bound_import_input_node_and_separate_output_roundtrips'}
    except (KeyError,TypeError,ValueError,AttributeError,IndexError) as e:
        return {**result,'reason':str(e) if isinstance(e,Unverifiable) else 'malformed_native_calculator_evidence'}

class SelectionBudget:
    def __init__(self, limit):
        require(type(limit) is int and 1 <= limit <= 64, 'invalid_enumeration_limit')
        self.limit=limit;self.work=0;self.candidates=0
    def tick(self):
        self.work+=1
        require(self.work<=200000,'selection_work_bound')
    def candidate(self):
        self.candidates+=1
        require(self.candidates<=self.limit,'candidate_enumeration_bound')

def select_nodes(journal, expected, budget):
    names=('options_before','options_apply','done','finish','open','definition_after','options_after','options_cancel')
    for start in journal.receipts:
        budget.tick()
        if ir._verb(start) is not None:continue
        try:definition(start['outcome']['output'],expected)
        except (KeyError,TypeError,ValueError,AttributeError,IndexError):continue
        selected={'definition_before':start['outcome']['operation_id']};sequence=[selected['definition_before']];index=0
        for r in journal.receipts:
            budget.tick()
            if r['call']['row']<=start['call']['row'] or r['call']['session_id']!=start['call']['session_id']:continue
            op=r['outcome']['operation_id'];sequence.append(op);s=r['outcome']['output'];verb=ir._verb(r);wanted=names[index];match=False
            try:
                if wanted in ('options_before','options_after'):expression_options(s,expected);match=True
                elif wanted=='options_apply':match=verb=='apply_expression_parameters'
                elif wanted=='done':match=s.get('wizard',{}).get('stage')=='done'
                elif wanted=='finish':match=verb=='finish_wizard' and any(t.get('event')=='wizard_finish_graph_verified' for t in r['outcome'].get('trace',[]))
                elif wanted=='open':match=verb=='open_wizard'
                elif wanted=='definition_after':definition(s,expected);match=verb is None
                elif wanted=='options_cancel':match=verb=='cancel_expression_parameters'
            except (KeyError,TypeError,ValueError,AttributeError,IndexError):pass
            if not match:continue
            selected[wanted]=op;index+=1
            if index==len(names):yield {**selected,'sequence':sequence};break

def select_port_openings(journal, first, last, kind, budget):
    results=[];rs=journal.receipts
    for right in rs:
        budget.tick()
        if not first<right['call']['row']<last or ir._verb(right)!='right_click':continue
        try:e=journal.action(right,'right_click')
        except (KeyError,TypeError,ValueError,AttributeError):continue
        if e.get('kind')!='port' or not e.get('tid','').endswith(';'+kind.title()+'_Data-0'):continue
        graphs=[]
        for g in rs:
            budget.tick()
            if g['reply_row']<right['call']['row'] and ir._verb(g) is None and g['call']['session_id']==right['call']['session_id'] and g['delivered']['output'].get('observation_id')==right['call']['arguments'].get('observation_id'):graphs.append(g)
        if len(graphs)!=1:continue
        for menu in rs:
            budget.tick()
            if not right['reply_row']<menu['call']['row']<last or ir._verb(menu)!='click':continue
            try:item=journal.action(menu,'click')
            except (KeyError,TypeError,ValueError,AttributeError):continue
            if item.get('tid')!='mn;mniConfigurePort':continue
            for read in rs:
                budget.tick()
                if not menu['reply_row']<read['call']['row']<last or ir._verb(read) is not None:continue
                wizard=read['outcome']['output'].get('wizard',{})
                key,status=('input_mapping','rendered_mapping_links') if kind=='input' else ('output_columns','rendered_rows')
                if wizard.get(key,{}).get('status')!=status:continue
                selected=[r['outcome']['operation_id'] for r in (graphs[0],right,menu,read)]
                try:ordered=journal.ordered(selected);journal.fence(ordered[0],ordered[-1],[right,menu])
                except (KeyError,TypeError,ValueError,AttributeError):continue
                results.append(selected)
                require(len(results)<=budget.limit,'port_opening_enumeration_bound')
    return results

def select_port_roundtrips(journal, openings, kind, budget):
    for before in openings:
        for after in openings:
            budget.tick()
            if journal.get(before[-1])['reply_row']>=journal.get(after[0])['call']['row']:continue
            for finish in journal.receipts:
                budget.tick()
                if not journal.get(before[-1])['reply_row']<finish['call']['row']<journal.get(after[0])['call']['row'] or ir._verb(finish)!='finish_wizard':continue
                if any(t.get('event')==kind+'_port_finish_verified' for t in finish['outcome'].get('trace',[])):
                    yield {'before':before,'finish':finish['outcome']['operation_id'],'after':after}

def diagnose(evidence,expected,prefix,*,expected_source_path,limit=32,import_operations=None):
    result={'calculator_expression_and_mappings':False,'roundtrips':[],'package_persistence_verified':False,'enumeration_exhausted':False,'scope':'configured_settings_only'}
    try:
        budget=SelectionBudget(limit);j=Journal(evidence,prefix);require(len(j.receipts)<=2048,'receipt_enumeration_bound')
        imports=ir.diagnose(evidence,expected,prefix,expected_source_path=expected_source_path)['roundtrips']
        for imported in imports:
            budget.tick()
            if import_operations is not None and imported.get('operations')!=import_operations:continue
            if not all(imported.get(k) is True for k in ('rendered_import_settings_roundtrip_match','configured_schema_roundtrip_match','configured_mapping_roundtrip_match')):continue
            source=j.get(imported['operations'][-1]);fields=[{k:f[k] for k in ('name','label','type')} for f in source['outcome']['output']['wizard']['output_columns']['fields']]
            for node in select_nodes(j,expected['calculator'],budget):
                budget.candidate()
                proof=verify_node_roundtrip(evidence,prefix,node,expected['calculator'],fields)
                if not proof['calculator_node_roundtrip_verified']:continue
                start,end=j.get(node['sequence'][0]),j.get(node['sequence'][-1])
                if source['reply_row']>=start['call']['row']:continue
                inputs=select_port_openings(j,source['reply_row'],start['call']['row'],'input',budget)
                outputs=select_port_openings(j,end['reply_row'],float('inf'),'output',budget)
                for inp in select_port_roundtrips(j,inputs,'input',budget):
                    for out in select_port_roundtrips(j,outputs,'output',budget):
                        budget.candidate()
                        chain={'import_operations':imported['operations'],'input':inp,'node':node,'output':out}
                        combined=verify_native_calculator(evidence,expected,prefix,chain,expected_source_path=expected_source_path)
                        if combined['calculator_expression_and_mappings']:
                            return {**result,'calculator_expression_and_mappings':True,'roundtrips':[combined],'reason':'native_calculator_chain_verified','candidates_checked':budget.candidates}
        return {**result,'reason':'complete_bound_calculator_chain_missing','candidates_checked':budget.candidates}
    except (KeyError,TypeError,ValueError,AttributeError,IndexError) as error:
        reason=str(error) if isinstance(error,Unverifiable) else 'malformed_evidence'
        return {**result,'reason':reason,'enumeration_exhausted':reason in ('selection_work_bound','candidate_enumeration_bound','receipt_enumeration_bound','port_opening_enumeration_bound')}

def audit_gate(evidence,request,prefix,expected,*,transfer_verified):
    import data_pipeline
    result={'calculator_expression_and_mappings':False,'package_persistence_verified':False}
    if transfer_verified is not True or not data_pipeline.fixture_schema(request,expected):return {**result,'reason':'transfer_or_pinned_fixture_missing'}
    destination=data_pipeline.declared_source_path(request)
    imports=ir.diagnose(evidence,expected,prefix,expected_source_path=destination)
    wizard=data_pipeline.wizard_readback(evidence,request,prefix,expected,imports,transfer_verified)
    if wizard.get('wizard_settings_readback') is not True:return {**result,'reason':'transfer_bound_import_readback_missing'}
    return {**diagnose(evidence,expected,prefix,expected_source_path=destination,import_operations=wizard['operations']),'transfer_bound_import_operations':wizard['operations']}
