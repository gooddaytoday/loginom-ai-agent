"""Strict journal receipts for Calculator settings. No model prose or detached flags.

Operation selectors identify evidence, never attest it. The caller may search
candidate chains; every selected operation is re-bound to the immutable journal.
Native port completion and output correspondence remain fail-closed. Historical audits must not be regenerated.
"""
import re
import copy
import settings_evidence as se
import import_roundtrip_evidence as ir


class Unverifiable(ValueError):
    pass


def require(value, reason):
    if not value:
        raise Unverifiable(reason)


def text(value):
    return isinstance(value, str) and bool(value) and value == value.strip() and not any(c in value for c in '\0\r\n')


def semantic_path(path):
    require(isinstance(path, list) and 1 <= len(path) <= 16, 'path_missing')
    require(all(isinstance(p, dict) and text(p.get('tid')) and isinstance(p.get('label'), str) for p in path), 'path_invalid')
    return [{k: p[k] for k in ('tid', 'label')} for p in path]


def same_context(a, b):
    require(a.get('authenticated') is True and b.get('authenticated') is True, 'unauthenticated')
    for key in ('origin', 'loginom_build', 'workflow_ref', 'package_identity', 'active_tab_ref'):
        require(a.get(key) is not None and a[key] == b.get(key), 'context_changed:' + key)
    require(text(a.get('dom_epoch', {}).get('document')) and a['dom_epoch']['document'] == b.get('dom_epoch', {}).get('document'), 'document_changed')
    require(not a.get('ui', {}).get('masks') and not b.get('ui', {}).get('masks'), 'masked')


def semantic_owner(snapshot):
    owner = ir._semantic_owner(snapshot)
    require(owner is not None, 'owner_missing')
    return owner


def definition(snapshot, expected):
    """One complete definition, one literal editor, and explicit nonreplacement."""
    state = se.calculator_state(snapshot, expected)
    require(state is not None, 'literal_expression_missing')
    manifest = snapshot['wizard'].get('calculator_expressions', {})
    fields = manifest.get('fields', [])
    cov = manifest.get('definition_coverage', {})
    require(manifest.get('status') == 'rendered_expression_definitions'
            and manifest.get('settings_applied') is False
            and manifest.get('source_identity_verified') is False,
            'expression_manifest_missing')
    require(len(fields) == 1 and cov.get('status') == 'complete_configured_rows'
            and type(cov.get('count')) is int and cov['count'] == 1, 'expression_list_incomplete_or_extra')
    field = fields[0]
    require(field.get('index') == 0 and field.get('name') == expected['output_field']
            and field.get('type') == expected['type'] and field.get('selected') is True
            and field.get('label') == state['row']['label'], 'expression_definition_mismatch')
    refs = [field.get(k) for k in ('row_ref', 'name_ref', 'label_ref')]
    refs += [cov.get(k) for k in ('grid_ref', 'container_ref')]
    require(all(text(r) for r in refs) and len(set(refs)) == len(refs)
            and cov.get('first_row_ref') == cov.get('last_row_ref') == field['row_ref'], 'definition_bounds_invalid')
    selected = snapshot['wizard']['expression_selection']
    require(selected.get('row_ref') == field['row_ref'], 'selected_definition_changed')
    editors = [e['calculator_editor'] for e in snapshot['ui']['elements'] if e.get('calculator_editor')]
    require(editors[0]['selected_expression'].get('ref') == field['name_ref'], 'editor_definition_ref_mismatch')
    replacement = manifest.get('selected_replacement', {})
    require(replacement.get('status') == 'observed' and replacement.get('value') is False
            and replacement.get('row_ref') == field['row_ref'] and text(replacement.get('button_ref')), 'replacement_missing_or_enabled')
    return {'name': field['name'], 'label': field['label'], 'type': field['type'],
            'formula': expected['operation'], 'owner': semantic_owner(snapshot),
            'editor_ref': state['document_ref']}


def expression_options(snapshot, expected):
    p = snapshot['wizard'].get('expression_parameters', {})
    require(snapshot['wizard'].get('stage') == 'calculator' and p.get('status') == 'observed'
            and text(p.get('root_ref')), 'expression_parameters_missing')
    require(p.get('selected_expression', {}).get('label') == expected['output_field'], 'parameter_selection_mismatch')
    wanted = {'name': expected['output_field'], 'type_label': 'Вещественный'}
    for key, value in wanted.items():
        f = p.get('fields', {}).get(key, {})
        require(f.get('status') == 'observed' and f.get('value') == value
                and f.get('truncated') is False and text(f.get('input_ref')), 'parameter_value_mismatch:' + key)
    label = p.get('fields', {}).get('label', {})
    require(label.get('status') == 'observed' and text(label.get('value')) and label.get('truncated') is False, 'parameter_label_missing')
    for key in ('intermediate', 'cached'):
        option = p.get('options', {}).get(key, {})
        require(option.get('status') == 'observed' and type(option.get('value')) is bool
                and option.get('source') == 'loginom_ext_checkbox'
                and all(text(option.get(k)) for k in ('owner_ref', 'input_ref', 'display_ref')), 'parameter_option_missing:' + key)
    require(p['options']['intermediate']['value'] is False, 'intermediate_expression')
    return {'label': label['value'], 'intermediate': False, 'cached': p['options']['cached']['value'], 'owner': semantic_owner(snapshot)}


def input_mapping(snapshot, upstream_fields):
    """A rendered bijection keyed by exact names; labels are never lookup keys."""
    wizard = snapshot.get('wizard', {})
    m = wizard.get('input_mapping', {})
    require(wizard.get('status') == 'observed' and wizard.get('stage') == 'input_mapping'
            and m.get('status') == 'rendered_mapping_links'
            and m.get('source_identity_verified') is False and m.get('settings_applied') is False,
            'input_mapping_unobserved')
    require(m.get('root_ref') == wizard.get('root_ref') and text(m.get('root_ref')), 'mapping_root_mismatch')
    rows = (m.get('source_rows', []), m.get('target_rows', []))
    links = m.get('links', [])
    n = len(upstream_fields)
    cov = m.get('rendered_coverage', {})
    require(1 <= n <= 12 and cov == {'status': 'complete_visible_rows', 'source_count': n,
            'target_count': n, 'link_count': n}, 'mapping_coverage_incomplete')
    expected = {f['name']: f for f in upstream_fields}
    require(len(expected) == n and all(text(k) for k in expected), 'upstream_names_ambiguous')
    maps = []
    for side in rows:
        require(len(side) == n and sorted(r['index'] for r in side) == list(range(n)), 'mapping_row_indices')
        by_key = {r['key']: r for r in side}
        require(len(by_key) == n and set(by_key) == set(expected), 'mapping_names_changed')
        refs = [r.get('cell_ref') for r in side]
        require(all(text(r) for r in refs) and len(set(refs)) == n, 'mapping_refs_ambiguous')
        for name, r in by_key.items():
            require(r.get('label') == expected[name]['label'] and r.get('type_verified') is True
                    and r.get('type_marker') == expected[name]['type'], 'mapping_type_or_label_mismatch:' + name)
        maps.append(by_key)
    require(len(links) == n and len({x.get('path_ref') for x in links}) == n, 'mapping_paths_ambiguous')
    pairs = []
    for link in links:
        src, dst = link.get('source_key'), link.get('target_key')
        require(src in expected and dst == src and text(link.get('path_ref')), 'mapping_swapped_or_missing')
        require(link.get('source_ref') == maps[0][src]['cell_ref']
                and link.get('target_ref') == maps[1][dst]['cell_ref'], 'mapping_link_refs_mismatch')
        pairs.append((src, dst))
    require(len(set(pairs)) == n, 'mapping_duplicate_link')
    return [{'source_name': name, 'target_name': name, 'type': expected[name]['type']} for name in sorted(expected)]


def graph_edge(snapshot, upstream_owner, calculator_owner, input_tid):
    """Exact native graph endpoint identity; reject two suppliers or truncation."""
    require(ir._graph(snapshot, upstream_owner) and ir._graph(snapshot, calculator_owner), 'graph_owner_missing')
    require(snapshot.get('ui', {}).get('truncated', {}).get('links') is False
            and snapshot.get('ui', {}).get('truncated', {}).get('ports') is False, 'graph_links_or_ports_truncated')
    native = snapshot['graph_identity']['native_prefix']
    target = calculator_owner['graph_key']
    require(isinstance(input_tid, str) and re.fullmatch(re.escape(native + target) + r';Input_Data-\d+', input_tid), 'wrong_input_port')
    target_port = input_tid.rsplit(';', 1)[1]
    matches = []
    for link in snapshot.get('links', []):
        require(isinstance(link, str) and link.startswith(native), 'foreign_graph_link')
        parts = link[len(native):].split('|')
        require(len(parts) == 4, 'graph_link_shape')
        if parts[2:] == [target, target_port]: matches.append(parts)
    require(len(matches) == 1 and matches[0][0] == upstream_owner['graph_key']
            and matches[0][1] == 'Output_Data-0', 'upstream_edge_missing_or_ambiguous')
    source_tid = native + matches[0][0] + ';' + matches[0][1]
    ports = [p for node in snapshot.get('nodes', []) for p in node.get('ports', [])]
    require(sum(p.get('tid') == source_tid for p in ports) == 1
            and sum(p.get('tid') == input_tid for p in ports) == 1, 'edge_endpoint_missing')
    return {'source_tid': source_tid, 'target_tid': input_tid, 'link_tid': native + '|'.join(matches[0])}


class Journal:
    def __init__(self, evidence, prefix):
        self.evidence = evidence
        self.receipts = se.bound_receipts(evidence, prefix)
        self.refusals=[];self.issuances=list(self.receipts)
        for call in evidence.get('calls',[]):
            if call.get('tool')!=prefix+'dock_ui_action':continue
            reply=ir._no_effect_reply(call,evidence)
            if not reply:continue
            self.refusals.append(call)
            outcome=reply.get('result',{})
            if outcome.get('status')=='NOT_APPLIED' and outcome.get('output',{}).get('observation_id'):
                self.issuances.append({'call':call,'reply_row':reply['row'],
                    'outcome':copy.deepcopy(outcome),'delivered':copy.deepcopy(outcome)})

    def get(self, op):
        rows = [r for r in self.receipts if r['outcome'].get('operation_id') == op]
        require(len(rows) == 1, 'operation_not_uniquely_bound:' + str(op))
        return rows[0]

    def ordered(self, ops):
        require(len(set(ops)) == len(ops), 'duplicate_operation_selector')
        rs = [self.get(op) for op in ops]
        require(all(a['reply_row'] < b['call']['row'] for a, b in zip(rs, rs[1:])), 'overlapping_or_unordered_receipts')
        require(len({r['call']['session_id'] for r in rs}) == 1, 'session_changed')
        for r in rs: same_context(rs[0]['outcome']['output'], r['outcome']['output'])
        return rs

    def action(self, receipt, verb):
        require(ir._verb(receipt) == verb, 'unexpected_action')
        element = ir._issued(receipt, self.issuances)
        require(element is not None, 'action_ref_not_issued')
        # A later mutation invalidates the issued observation, even if a
        # malicious/detached trace claims the precondition was verified.
        args = receipt['call']['arguments']
        priors = [r for r in self.issuances if r['reply_row'] < receipt['call']['row']
                  and r['call']['session_id'] == receipt['call']['session_id']
                  and r['delivered']['output'].get('observation_id') == args['observation_id']]
        require(bool(priors), 'issued_observation_missing')
        latest = max(r['reply_row'] for r in priors)
        require(not any(ir._mutation(c) and c not in self.refusals and latest < c.get('row', -1) < receipt['call']['row']
                        for c in self.evidence.get('calls', [])), 'stale_action_reference')
        return element

    def fence(self, first, last, allowed):
        allowed_calls = [r['call'] for r in allowed]
        require(not any(ir._mutation(c) and c not in self.refusals and first['call']['row'] < c.get('row', -1) <= last['reply_row']
                        and c not in allowed_calls for c in self.evidence.get('calls', [])), 'unverified_intervening_mutation')


def port_open(journal, operations, upstream_owner, calculator_owner, upstream_fields):
    """graph read → exact input right-click → issued ConfigurePort → fresh mapping."""
    graph, right, menu, mapping = journal.ordered(operations)
    require(ir._verb(graph) is None and ir._verb(mapping) is None, 'port_chain_requires_fresh_reads')
    journal.fence(graph, mapping, [right, menu])
    gs = graph['outcome']['output']; rs = right['outcome']['output']; ms = mapping['outcome']['output']
    element = journal.action(right, 'right_click')
    require(element.get('kind') == 'port' and element.get('scope') == 'graph', 'opening_not_graph_port')
    edge = graph_edge(gs, upstream_owner, calculator_owner, element.get('tid'))
    require(any(e.get('ref') == element.get('ref') and e.get('tid') == edge['target_tid']
                for e in graph['delivered']['output']['ui']['elements']), 'port_not_issued_by_graph')
    menuitem = journal.action(menu, 'click')
    require(menuitem.get('tid') == 'mn;mniConfigurePort' and menuitem.get('role') == 'menuitem', 'wrong_port_menu')
    require(any(e.get('ref') == menuitem.get('ref') for e in right['delivered']['output']['ui']['elements']), 'menu_not_from_port')
    require(rs.get('wizard', {}).get('status') == 'absent', 'port_context_changed_before_menu')
    context = ms['wizard'].get('input_port_context', {})
    require(context.get('status') == 'observed' and context.get('direction') == 'input'
            and context.get('source_identity_verified') is False
            and context.get('opening_verified') is False, 'port_context_missing')
    require(semantic_path(context.get('node_path')) == calculator_owner['path'][:-1]
            and {k: context.get('node', {}).get(k) for k in ('tid', 'label')} == calculator_owner['node'], 'port_owner_changed')
    path = semantic_path(context.get('path', []))
    require(len(path) == len(context['node_path']) + 3
            and path[:-3] == semantic_path(context['node_path']) and semantic_path(context.get('port_path')) == path[:-1]
            and path[-3]['tid'] == context['node']['tid'] + '>Входные_порты'
            and path[-2]['tid'].startswith(path[-3]['tid'] + '>')
            and path[-1]['tid'] == path[-2]['tid'] + '>Настройка', 'port_path_unbound')
    require(menu['outcome']['output'].get('wizard', {}).get('root_ref') == ms['wizard']['root_ref'], 'mapping_not_opened_by_menu')
    return {'edge': edge, 'mapping': input_mapping(ms, upstream_fields), 'port_path': semantic_path(context['port_path']),
            'root_ref': ms['wizard']['root_ref'], 'session_id': graph['call']['session_id'],
            'operations': operations}


def port_finish(journal, before, finish, calculator_owner):
    element=journal.action(finish, 'finish_wizard')
    snapshot=before['outcome']['output'];after=finish['outcome']['output']
    same_context(snapshot,after)
    ctx=snapshot['wizard']['input_port_context'];root=snapshot['wizard']['root_ref']
    require(element.get('wizard_finish') == {'mode':'input_port','root_ref':root,
            'node_ref':ctx['node'].get('ref'),'port_ref':ctx.get('port_ref')}
            and text(ctx['node'].get('ref')) and text(ctx.get('port_ref')), 'issued_port_finish_metadata_mismatch')
    require(element.get('tid') == snapshot['wizard'].get('root_tid','')+';btnDone', 'port_finish_control_mismatch')
    traces=[t for t in finish['outcome'].get('trace',[]) if t.get('event')=='input_port_finish_verified']
    require(len(traces)==1,'native_input_port_finish_contract_unresolved')
    t=traces[0]
    require(t.get('wizard_root_ref')==root and semantic_path(t.get('port_path'))==semantic_path(ctx.get('port_path'))
            and t.get('control_ref')==element.get('ref') and t.get('reopen_required') is True
            and all(t.get(k) is False for k in ('settings_readback_verified','settings_applied','source_identity_verified','package_saved'))
            and semantic_path(t.get('workflow_path'))==calculator_owner['path'][:-2], 'port_finish_trace_mismatch')
    require(ir._graph(after,calculator_owner),'port_not_finished_to_graph')
    body={'node_label':calculator_owner['graph_key'],'part':'body'}
    require(t.get('node')==body and sum(e.get('ref')==t.get('node_ref') and e.get('graph_node')==body for e in after['ui']['elements'])==1,'port_finish_node_mismatch')
    settled=[v for v in finish['outcome'].get('trace',[]) if v.get('event')=='input_port_finish_settled']
    require(len(settled)==1 and settled[0].get('quiet_samples')==3 and settled[0].get('interval_ms')==200
            and settled[0].get('dom_epoch')==after.get('dom_epoch') and settled[0].get('node_ref')==t.get('node_ref'), 'port_finish_not_settled')
    return t


def verify_port_roundtrip(evidence, prefix, operations, upstream_owner, calculator_owner, upstream_fields):
    """Native completion trace binds the input breadcrumb and returned graph.

    Root validated the private native finish contract; it remains required here.
    Generic click success alone is not completion or autonomous acceptance.
    """
    result = {'input_source_mapping_verified': False, 'settings_applied_verified': False,
              'package_persistence_verified': False}
    try:
        j = Journal(evidence, prefix)
        require(set(operations) == {'before', 'finish', 'after'}, 'port_chain_shape')
        a = port_open(j, operations['before'], upstream_owner, calculator_owner, upstream_fields)
        b = port_open(j, operations['after'], upstream_owner, calculator_owner, upstream_fields)
        first = j.get(operations['before'][-1]); finish = j.get(operations['finish']); last = j.get(operations['after'][0])
        j.ordered([operations['before'][-1], operations['finish'], operations['after'][0]])
        j.fence(first, last, [finish]); element = j.action(finish, 'finish_wizard')
        port_finish(j, first, finish, calculator_owner)
        require(a['edge'] == b['edge'] and a['mapping'] == b['mapping'] and a['port_path'] == b['port_path']
                and a['root_ref'] != b['root_ref'], 'port_reopen_changed_or_not_new')
        return {**result, 'input_source_mapping_verified': True, 'settings_applied_verified': True,
                'reason': 'journal_bound_upstream_edge_port_mapping_roundtrip', 'bindings': a['mapping'],
                'edge': a['edge'], 'operations': operations}
    except (KeyError, TypeError, AttributeError, ValueError, IndexError) as e:
        return {**result, 'reason': str(e) if isinstance(e, Unverifiable) else 'malformed_evidence'}


def output_mapping(snapshot, upstream_fields, expression):
    """Exact, unique rendered source labels only after known source dictionary.

    This proves configured output correspondence; duplicate source labels are
    ambiguous and deliberately rejected (input mapping itself permits them).
    """
    m = snapshot.get('wizard', {}).get('output_columns', {})
    require(snapshot.get('wizard', {}).get('stage') == 'output_mapping'
            and m.get('status') == 'rendered_rows' and m.get('settings_applied') is False,
            'output_mapping_missing')
    source = upstream_fields + [{k: expression[k] for k in ('name', 'label', 'type')}]
    names = {f['name']: f for f in source}; labels = {f['label']: f for f in source}
    require(len(names) == len(labels) == len(source), 'output_source_name_or_label_ambiguous')
    fields = m.get('fields', []); coverage = m.get('definition_coverage', {})
    require(len(fields) == len(source) and coverage.get('status') == 'complete_configured_rows'
            and type(coverage.get('count')) is int and coverage['count'] == len(fields), 'output_bounds_incomplete')
    refs = [f.get('row_ref') for f in fields]
    refs += [coverage.get(k) for k in ('body_ref', 'container_ref', 'filter_ref', 'table_mode_ref')]
    sync = m.get('auto_sync', {})
    require(sync.get('status') == 'observed' and type(sync.get('value')) is bool and text(sync.get('ref')), 'output_auto_sync_missing')
    refs.append(sync['ref'])
    require(all(text(r) for r in refs) and len(set(refs)) == len(refs)
            and coverage.get('first_row_ref') == fields[0]['row_ref']
            and coverage.get('last_row_ref') == fields[-1]['row_ref'], 'output_coverage_refs_invalid')
    seen = set(); source_refs = set()
    for f in fields:
        name = f.get('name'); s = f.get('source', {})
        require(name in names and name not in seen and f.get('status') == 'observed'
                and f.get('type') == names[name]['type'] and text(f.get('label')) and f.get('truncated', False) is False,
                'output_name_type_mismatch')
        require(s.get('status') == 'rendered_source' and s.get('identity_verified') is False
                and s.get('label') == names[name]['label'] and s.get('type') == names[name]['type']
                and s.get('truncated', False) is False and s.get('redacted', False) is False
                and text(s.get('cell_ref')) and s['cell_ref'] not in source_refs,
                'output_source_mismatch')
        seen.add(name); source_refs.add(s['cell_ref'])
    return {'fields': [{'name': f['name'], 'label': f['label'], 'type': f['type'], 'source_name': f['name']} for f in sorted(fields, key=lambda f: f['name'])],
            'auto_sync': sync['value']}
