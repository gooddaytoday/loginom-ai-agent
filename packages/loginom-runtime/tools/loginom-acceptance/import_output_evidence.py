"""Independent CSV/source, execution and Table audit; no persistence/Hermes proof."""
from import_limits import import_operation_step_budget

import csv
import io
import math
import struct
from datetime import datetime
from import_done_evidence import _verify_text_import
from import_execution_evidence import verify_execution_observations
from node_procedure_evidence import verify_internal_sequence
from import_source_binding import source_ordered_settings


def verify_table_return(observations, mutations, table, after_step, proof):
    """Only a final, owner-bound breadcrumb click may follow table data reads."""
    later = [(n, a) for n, a, _ in mutations if n > after_step]
    if len(later) != 1 or later[0][1].get('verb') != 'click':
        return ['table_return_one_navigation_required']
    step, action = later[0]
    before = next((s for n, s in reversed(observations) if n < step), {})
    nav = before.get('workflow_navigation', {})
    node = before.get('prepared_node_context', {})
    path = nav.get('path')
    outputs = before.get('node_outputs', {})
    keys = ('document_id', 'workflow_id', 'node_id')
    def same_node(candidate):
        return candidate.get('verified') is True and all(node.get(k) and node[k] == candidate.get(k) for k in keys)
    controls = [e for e in before.get('ui', {}).get('elements', []) if e.get('ref') == action.get('ref')]
    if (nav.get('status') != 'observed' or not path or nav.get('current_path', [])[:len(path)] != path
            or action.get('ref') != nav.get('control_ref') or nav.get('control_tid') != path[-1].get('tid')
            or len(controls) != 1 or controls[0].get('tid') != nav.get('control_tid')
            or 'click' not in controls[0].get('allowed_actions', [])
            or node.get('verified') is not True or node.get('surface') != 'views'
            or outputs.get('verified') is not True or outputs.get('surface') != 'views'
            or not same_node(outputs.get('node_context', {}))
            or len([t for t in outputs.get('tables', []) if t.get('active') is True and all(t.get(k) == table.get(k) for k in ('view_guid','port_guid','table_tid'))]) != 1):
        return ['table_return_source_or_navigation']
    final = [s for n, s in observations if n > step and s.get('prepared_node_context', {}).get('surface') == 'graph'
             and same_node(s.get('prepared_node_context', {}))
             and s.get('navigation_context', {}).get('status') == 'observed' and s['navigation_context'].get('path') == path
             and s.get('node_outputs', {}).get('verified') is True and s['node_outputs'].get('surface') == 'graph'
             and same_node(s['node_outputs'].get('node_context', {}))
             and len([p for p in s['node_outputs'].get('ports', []) if p.get('port_guid') == table.get('port_guid') and p.get('active') is True]) == 1]
    if not final:
        return ['table_return_final_graph']
    if (proof.get('verified') is not True or proof.get('source_table') != {k:table[k] for k in ('view_guid','port_guid','table_tid')}
            or proof.get('workflow_path') != path or not same_node(proof.get('node_context', {}))
            or proof.get('node_context', {}).get('surface') != 'graph'
            or proof.get('execution_started') is not False or proof.get('reopen_performed') is not False):
        return ['table_return_checkpoint']
    return []


def equal_number(a, b):
    try:
        a, b = float(a), float(b)
        return math.isfinite(a) and math.isfinite(b) and struct.pack('>d', a) == struct.pack('>d', b)
    except (ValueError, TypeError, OverflowError):
        return False


def verify_table_format_restoration(observations, mutations, table, expected, first_apply, last_page, restore_apply, proof):
    """Admit a second Apply only from raw, owner-bound restoration readbacks."""
    before = lambda step: next((s for n, s in reversed(observations) if n < step), {})
    ref = {k: table[k] for k in ('view_guid', 'port_guid', 'table_tid')}
    modal = table['table_tid'] + ';ModalWindow_BrowseFormat'
    def control(step, action):
        es = [e for e in before(step).get('ui', {}).get('elements', []) if e.get('ref') == action.get('ref')]
        return es[0] if len(es) == 1 else {}
    opens = [n for n, a, _ in mutations if last_page < n < restore_apply and a.get('verb') == 'click'
             and control(n, a).get('tid') == table['table_tid'] + ';btnDataGridFormat']
    if len(opens) != 1 or not first_apply < last_page < opens[0] < restore_apply:
        return ['table_format_restoration_order'], set()
    start = opens[0]
    segment = [(n, a) for n, a, _ in mutations if start <= n <= restore_apply]
    original_node = before(first_apply).get('prepared_node_context', {})
    def owned(s):
        node, outputs = s.get('prepared_node_context', {}), s.get('node_outputs', {})
        other = outputs.get('node_context', {})
        return (node.get('verified') is True and node.get('surface') == 'views' and outputs.get('verified') is True
                and other.get('verified') is True and all(node.get(k) and node[k] == other.get(k) == original_node.get(k)
                    for k in ('document_id', 'workflow_id', 'node_id'))
                and len([t for t in outputs.get('tables', []) if t.get('active') is True
                         and all(t.get(k) == v for k, v in ref.items())]) == 1)
    def dialog(s):
        return (owned(s) and s.get('node_table_dialog') == dict(table=ref, kind='format')
                and s.get('table_settings', {}).get('status') == 'observed'
                and s['table_settings'].get('kind') == 'format')
    failures = []
    for n, action in segment:
        s, e = before(n), control(n, action)
        anchor = e.get('tid') or e.get('identity', {}).get('anchor_tid', '')
        allowed = action.get('verb') in e.get('allowed_actions', [])
        if n == start:
            valid = owned(s) and allowed
        elif n == restore_apply:
            valid = dialog(s) and allowed and action.get('verb') == 'click' and anchor == modal + ';btnApply'
        else:
            valid = (dialog(s) and allowed and isinstance(anchor, str) and anchor.startswith(modal + ';BrowseFormat;')
                     and action.get('verb') in ('click', 'fill', 'press', 'set_checked', 'scroll')
                     and (action.get('verb') != 'press' or action.get('key') == 'Tab'))
        if not valid:
            failures.append('table_format_restoration_mutation')
    original = [(n, s) for n, s in observations if n < first_apply and dialog(s)]
    restored = [(n, s) for n, s in observations if start < n < restore_apply and dialog(s)]
    def definitions(states, latest):
        fields, schemas = {}, set()
        for _, s in states:
            fmt = s['table_settings']['format']; page = fmt.get('page', {}); items = fmt.get('metadata_fields')
            offset, count = page.get('offset'), page.get('total_columns')
            if (page.get('status') not in ('complete_definition_page', 'rendered_definition_window')
                    or type(offset) is not int or offset < 0 or count != len(expected) or page.get('limit') != 8
                    or not isinstance(page.get('schema_id'), str) or not page['schema_id']
                    or not isinstance(items, list) or len(items) != min(8, count-offset)
                    or page.get('next_offset') != (None if offset + len(items) == count else offset + len(items))):
                raise ValueError('table_format_restoration_definition')
            schemas.add(page['schema_id'])
            for i, f in enumerate(items):
                keys = ('index', 'source_index', 'name_key', 'label', 'type', 'format_string')
                if (any(k not in f for k in keys) or type(f['index']) is not int or f['index'] != offset+i
                        or type(f['source_index']) is not int or not 0 <= f['source_index'] < count
                        or not isinstance(f['format_string'], str)):
                    raise ValueError('table_format_restoration_definition')
                value = {k:f[k] for k in keys}
                if latest or f['index'] not in fields: fields[f['index']] = value
        if len(schemas) != 1 or set(fields) != set(range(len(expected))):
            raise ValueError('table_format_restoration_coverage')
        result = [fields[i] for i in range(len(expected))]
        if len({f['source_index'] for f in result}) != len(result):
            raise ValueError('table_format_restoration_definition')
        for f in result:
            column = expected[f['source_index']]
            if (f['name_key'], f['label'], f['type']) != (column['name'], column['label'], column['type']):
                raise ValueError('table_format_restoration_definition')
        return result
    try:
        initial_fields, final_fields = definitions(original, False), definitions(restored, True)
        setting_names = ('formatting', 'custom', 'format_string', 'thousands', 'scientific', 'decimal_digits', 'currency')
        def selected(states, field):
            found = []
            for n, s in states:
                fmt = s['table_settings']['format']
                item = fmt.get('selected_datetime' if field['type'] == 'datetime' else 'selected_numeric', {})
                if item.get('source_index') == field['source_index'] and item.get('name_key') == field['name_key']:
                    values = {k:item[k]['value'] for k in setting_names if item.get(k, {}).get('status') == 'observed' and 'value' in item[k]}
                    if (type(values.get('formatting')) is not bool or type(values.get('custom')) is not bool
                            or not isinstance(values.get('format_string'), str)):
                        raise ValueError('table_format_restoration_settings')
                    found.append((n, values))
            return found
        defaults = []
        for field in initial_fields:
            if field['type'] not in ('integer', 'real', 'datetime'): continue
            old, final = selected(original, field), selected(restored, field)
            if old and field['type'] == 'datetime' and all(old[0][1].get(k) == v for k, v in [('format_string',''),('custom',False),('formatting',True)]):
                defaults.append((field, old[0][1])); continue
            if not old or not final or old[0][1] != final[-1][1] or old[0][1]['format_string'] != field['format_string']:
                failures.append('table_format_restoration_settings'); continue
            for n, action, _ in mutations:
                if action.get('verb') not in ('fill', 'press', 'set_checked'): continue
                prior = selected([(n, before(n))], field) if dialog(before(n)) else []
                if prior and (n < first_apply and old[0][0] >= n or start < n < restore_apply and final[-1][0] <= n):
                    failures.append('table_format_restoration_settings_order')
        deferred = {f['source_index'] for f, _ in defaults}
        single_applied = None
        if len(initial_fields)==1 and initial_fields[0]['type'] in ('integer','real','datetime'):
            target=initial_fields[0]
            expected_applied=dict(verified=True,table=ref,source='applied_table_format_ui_cache',
                modal_tid=modal,result='ok',fields=[dict(index=target['source_index'],key=target['name_key'],
                type=target['type'],mask=target['format_string'])])
            later=[(n,s) for n,s in observations if n>restore_apply and owned(s) and s.get('ui',{}).get('dialogs')==[]
                and s.get('node_table',{}).get('verified') is True
                and s.get('node_table_request',{}).get('page')==dict(row_offset=0,row_limit=0,column_offset=0,column_limit=1)]
            if proof.get('applied_format') is not None:
                if proof['applied_format']!=expected_applied or not any(s['node_table'].get('applied_format')==expected_applied for _,s in later):
                    raise ValueError('table_single_restoration_applied')
                single_applied=expected_applied
        for initial, final in zip(initial_fields, final_fields):
            expected_final = dict(initial, format_string='yyyy-mm-dd hh:nn:ss.zzz') if initial['source_index'] in deferred else initial
            if final != expected_final and not (single_applied and {k:v for k,v in final.items() if k!='format_string'}=={k:v for k,v in expected_final.items() if k!='format_string'}): failures.append('table_format_restoration_fields')
        if single_applied:final_fields=[dict(final_fields[0],format_string=initial_fields[0]['format_string'])]
        projected = [dict(index=f['source_index'], definition_index=f['index'], key=f['name_key'], type=f['type'], label=f['label'],
                          **({'mask':f['format_string']} if f['type'] in ('integer','real','datetime') and f['source_index'] not in deferred else {})) for f in final_fields]
        if (not isinstance(proof, dict) or proof.get('table') != ref or proof.get('restored') is not True
                or proof.get('fields') != projected or any(type(f.get('index')) is not int or type(f.get('definition_index')) is not int for f in proof.get('fields', []))):
            failures.append('table_format_restoration_checkpoint')
        from table_datetime_restoration_evidence import verify_default_datetime_restoration
        tail_failures, tail_steps = verify_default_datetime_restoration(observations, mutations, table, restore_apply,
            initial_fields, defaults, proof.get('default_datetime_restoration'), before=before, control=control,
            owned=owned, dialog=dialog, definitions=definitions, selected=selected)
        failures += tail_failures
    except (KeyError, TypeError, ValueError) as error:
        tail_steps = set()
        failures.append(str(error) if isinstance(error, ValueError) else 'table_format_restoration_malformed')
    closed = [s for n, s in observations if n > restore_apply and owned(s) and s.get('ui', {}).get('dialogs') == []]
    if not closed:
        failures.append('table_format_restoration_not_closed')
    return sorted(set(failures)), ({n for n, _ in segment} | tail_steps) if not failures else set()


def verify_table_output_observations(observations, mutations, request, source_bytes, checkpoint, execution_id, *, output_port_index=0):
    failures = []
    if not execution_id or checkpoint.get('execution', {}).get('execution_id') != execution_id:
        failures.append('output_checkpoint_execution_identity')
    settings = request['parameters']['settings']
    if request.get('target', {}).get('kind') == 'new':
        try:
            settings = source_ordered_settings(settings, source_bytes)
        except (ValueError, KeyError, TypeError, UnicodeError, IndexError):
            return ['source_field_binding']
    expected = [c for c in settings['columns'] if c['used']]
    if request.get('mappings'):
        from port_mapping_evidence import configured_mapping_goal
        try:
            if len(request['mappings'])!=1:raise ValueError('one_output_mapping_required')
            expected=configured_mapping_goal(request['mappings'][0],settings['columns'])
        except (ValueError,KeyError,TypeError) as error:return ['unsupported_table_mapping:'+str(error)]
    before = lambda step: next((s for n, s in reversed(observations) if n < step), {})
    def controls(step, action):
        return [e for e in before(step).get('ui', {}).get('elements', []) if e.get('ref') == action.get('ref')]
    adds, enters = [], []
    for step, action, _ in mutations:
        es = controls(step, action)
        if len(es) == 1 and es[0].get('viewer_card', {}).get('kind') == 'add':
            adds.append((step, es[0]['viewer_card']))
        if action.get('verb') == 'enter_table' and len(es) == 1:
            enters.append((step, es[0].get('viewer_card', {})))
    if len(adds) != 1 or len(enters) != 1 or enters[0][0] <= adds[0][0]:
        return ['one_new_output_table_required']
    add_step, add = adds[0]; enter_step, enter = enters[0]
    owners = [step for step, action, _ in mutations if action.get('verb') == 'show_process_node']
    graph_ports = [(step, s.get('node_outputs', {})) for step, s in observations if step < add_step
                   and s.get('node_outputs', {}).get('verified') is True and s['node_outputs'].get('surface') == 'graph']
    if (len(owners) != 1 or not graph_ports or not owners[0] < graph_ports[-1][0] < add_step
            or [p.get('port_guid') for p in graph_ports[-1][1].get('ports', []) if p.get('index') == output_port_index and p.get('active') is True] != [add.get('port_guid')]):
        failures.append('table_not_bound_to_executed_output_zero' if output_port_index == 0 else 'table_not_bound_to_executed_output_'+str(output_port_index))
    prior = before(add_step).get('node_outputs', {})
    if (not enter.get('view_guid') or enter.get('port_guid') != add.get('port_guid')
            or any(t.get('view_guid') == enter.get('view_guid') for t in prior.get('tables', []))
            or not any(e.get('viewer_vendor', {}).get('kind') == 'table' and e['viewer_vendor'].get('selected') is True
                       for e in before(add_step).get('ui', {}).get('elements', []))):
        failures.append('new_table_owner_or_vendor')
    bound = [(n, s) for n, s in observations if n > enter_step and s.get('node_outputs', {}).get('verified') is True
             and any(t.get('active') is True and t.get('view_guid') == enter.get('view_guid')
                     and t.get('port_guid') == enter.get('port_guid') for t in s['node_outputs'].get('tables', []))]
    if not bound:
        return failures + ['active_table_missing']
    def same_node(s, n):
        owner = s.get('prepared_node_context', {})
        return owner.get('verified') is True and n.get('verified') is True and all(owner.get(k) == n.get(k) and owner.get(k)
                      for k in ('document_id', 'workflow_id', 'node_id'))
    if any(not same_node(s, s['node_outputs'].get('node_context', {})) for _, s in bound):
        failures.append('native_table_node_owner')
    table = next(t for t in bound[0][1]['node_outputs']['tables'] if t.get('active') is True and t.get('view_guid') == enter['view_guid'])
    key = table['table_tid']
    apply_steps = {}
    for step, action, _ in mutations:
        es = controls(step, action)
        if len(es) == 1:
            for kind in ('Format', 'Filter'):
                if es[0].get('tid') == key+';ModalWindow_Browse'+kind+';btnApply':
                    apply_steps.setdefault(kind, []).append(step)
    if not 1 <= len(apply_steps.get('Format', [])) <= 2 + sum(c['type'] == 'datetime' for c in expected) or len(apply_steps.get('Filter', [])) != 1:
        return failures + ['one_format_and_filter_apply_required']
    fmt_step, filter_step = apply_steps['Format'][0], apply_steps['Filter'][0]
    filter_state = before(filter_step).get('table_settings', {}).get('filter', {}).get('enabled', {})
    if filter_state.get('status') != 'observed' or filter_state.get('value') is not False:
        failures.append('table_filter_not_disabled')
    numeric = [(i, c) for i, c in enumerate(expected) if c['type'] in ('integer', 'real')]
    fills = [step for step, action, _ in mutations if enter_step < step < fmt_step and action.get('verb') == 'fill']
    last_fill = max(fills, default=enter_step)
    restore_boundary = apply_steps['Format'][1] if len(apply_steps['Format'])>1 else float('inf')
    def applied_single_format(column, mask):
        if len(expected) != 1:
            return False
        pages = [state['node_table'] for step, state in bound if max(fmt_step, filter_step)<step<restore_boundary
                 and state.get('node_table', {}).get('verified') is True]
        return bool(pages) and all(
            page.get('column_total') == 1 and page.get('applied_format', {}).get('verified') is True
            and page['applied_format'].get('table') == {k:table[k] for k in ('view_guid','port_guid','table_tid')}
            and page['applied_format'].get('source') == 'applied_table_format_ui_cache'
            and page['applied_format'].get('result') == 'ok'
            and page['applied_format'].get('modal_tid') == key+';ModalWindow_BrowseFormat'
            and page['applied_format'].get('fields') == [dict(index=0,key=column['name'],type=column['type'],mask=mask)] for page in pages)
    for i, column in numeric:
        mask = '0' if column['type'] == 'integer' else '0.################E+00'
        candidates = []
        for step, s in bound:
            f = s.get('table_settings', {}).get('format', {}); selected = f.get('selected_numeric', {})
            if (last_fill < step < fmt_step and selected.get('source_index') == i and selected.get('name_key') == column['name']
                    and (applied_single_format(column, mask) or any(c.get('source_index') == i and c.get('name_key') == column['name'] and c.get('format_string') == mask
                            for c in f.get('metadata_fields', [])))):
                candidates.append(selected)
        def value(s, k, v):
            return s.get(k, {}).get('status') == 'observed' and s[k].get('value') == v
        if not any(value(s, 'format_string', mask) and value(s, 'formatting', True) and
                   (value(s, 'custom', True) or column['type'] == 'integer' and value(s, 'custom', False)
                    and value(s, 'decimal_digits', '0') and value(s, 'thousands', False)
                    and value(s, 'scientific', False) and value(s, 'currency', '')) for s in candidates):
            failures.append('numeric_format_readback_'+str(i))
    for i, column in [(i, c) for i, c in enumerate(expected) if c['type'] == 'datetime']:
        mask = 'yyyy-mm-dd hh:nn:ss.zzz'
        candidates = []
        for step, state in bound:
            f = state.get('table_settings', {}).get('format', {}); selected = f.get('selected_datetime', {})
            if (last_fill < step < fmt_step and selected.get('source_index') == i and selected.get('name_key') == column['name']
                    and (applied_single_format(column, mask) or any(c.get('source_index') == i and c.get('name_key') == column['name'] and c.get('format_string') == mask
                            for c in f.get('metadata_fields', [])))):
                candidates.append(selected)
        if not any(all(candidate.get(k, {}).get('status') == 'observed' and candidate[k].get('value') == value
                       for k, value in [('formatting', True), ('custom', True), ('format_string', mask)]) for candidate in candidates):
            failures.append('datetime_format_readback_'+str(i))
    # A zero-row post-restoration read verifies the committed single-field mask;
    # it cannot be used as fresh, precision-formatted output data.
    restore_boundary = apply_steps['Format'][1] if len(apply_steps['Format'])>1 else float('inf')
    pages = [(n, s['node_table']) for n, s in bound if max(fmt_step, filter_step)<n<restore_boundary and s.get('node_table', {}).get('verified') is True]
    late_pages=[s for n,s in bound if n>restore_boundary and s.get('node_table',{}).get('verified') is True]
    restored_applied=checkpoint.get('output',{}).get('format_restoration',{}).get('applied_format')
    if any(not restored_applied or s.get('node_table_request',{}).get('page')!=dict(row_offset=0,row_limit=0,column_offset=0,column_limit=1)
           or s['node_table'].get('applied_format')!=restored_applied or s['node_table'].get('rows')!=[] for s in late_pages):
        failures.append('table_data_after_format_restoration')
    if not pages:
        return failures + ['verified_table_pages_missing']
    if any(not same_node(s, s['node_table'].get('node_context', {})) for n, s in bound if s.get('node_table', {}).get('verified') is True):
        failures.append('native_data_node_owner')
    restoration_steps = set(); return_after = max(n for n, _ in pages)
    if len(apply_steps['Format']) >= 2:
        restore_step = apply_steps['Format'][1]
        restoration_failures, restoration_steps = verify_table_format_restoration(observations, mutations, table, expected,
            fmt_step, return_after, restore_step, checkpoint.get('output', {}).get('format_restoration'))
        failures += restoration_failures
        if not restoration_failures: return_after = max(restoration_steps)
    extra = [(n, a, r) for n, a, r in mutations if n > filter_step and n not in restoration_steps and a.get('verb') not in ('scroll', 'scroll_horizontal')]
    proof = checkpoint.get('output', {}).get('workflow_return')
    if extra or proof is not None:
        return_failures = verify_table_return(observations, mutations, table, return_after, proof or {})
        failures += return_failures
        if return_failures or any(n <= return_after for n, _, _ in extra):
            failures.append('unexpected_mutation_after_filter')
    try:
        encoding = settings['source'].get('encoding', 'UTF-8')
        groups = [('utf-8-sig', ['UTF-8','65001','UTF-8 (65001)']),
                  ('cp1251', ['Windows-1251','CP1251','1251','Кириллическая (1251)']),
                  ('cp1252', ['Windows-1252','CP1252','1252','Западноевропейская (1252)']),
                  ('utf-16-le', ['UTF-16 LE','UTF-16LE','1200','UTF-16 LE (1200)']),
                  ('utf-16-be', ['UTF-16 BE','UTF-16BE','1201','UTF-16 BE (1201)'])]
        codec = next((codec for codec, aliases in groups if encoding in aliases), None)
        if codec is None:
            raise ValueError('unsupported audit codec')
        text = source_bytes.decode(codec).removeprefix('\ufeff')
        fmt = settings['format']; qualifier = fmt['text_qualifier']
        records = list(csv.reader(io.StringIO(text, newline=''), delimiter=fmt['delimiter'],
                                 quotechar=qualifier or None, quoting=csv.QUOTE_MINIMAL if qualifier else csv.QUOTE_NONE))
        records = records[settings['source']['rows_to_skip']:]
        names = records.pop(0) if settings['source']['first_line_as_title'] else [c.get('source_name', c['name']) for c in settings['columns']]
        if len(set(names)) != len(names):
            raise ValueError('duplicate source header')
        indexes = [names.index(c.get('source_name', c['name'])) for c in expected]
        if any(len(r) != len(names) for r in records):
            raise ValueError('ragged source')
    except (ValueError, UnicodeError, KeyError, IndexError, TypeError):
        return failures + ['source_fixture_parse']
    values, columns, row_ids, schema_ids = {}, {}, {}, set()
    count = min(request['read']['sample_rows'], len(records))
    for _, p in pages:
        schema_ids.add(p.get('schema_id'))
        if (any(p.get('table', {}).get(k) != table[k] for k in ('view_guid', 'port_guid', 'table_tid'))
                or p.get('row_total') != len(records) or p.get('column_total') != len(expected) or p.get('null_display') is not True):
            failures.append('page_owner_or_counts')
        for c in p.get('columns', []):
            j = c['index']
            if not 0 <= j < len(expected) or any(c.get(k) != expected[j][k] for k in ('name', 'label', 'type')):
                failures.append('page_schema_values')
            if j in columns and columns[j] != c:
                failures.append('page_schema_changed')
            columns[j] = c
        for row in p.get('rows', []):
            i = row['index']
            if i in row_ids and row_ids[i] != row.get('record_id'):
                failures.append('page_row_changed')
            row_ids[i] = row.get('record_id')
            for c in row.get('cells', []):
                at = (i, c['column'])
                if at in values and values[at] != c:
                    failures.append('page_cell_changed')
                values[at] = c
    if len(schema_ids) != 1 or None in schema_ids or set(columns) != set(range(len(expected))) or set(values) != {(i,j) for i in range(count) for j in range(len(expected))}:
        failures.append('table_page_coverage')
    ports = checkpoint.get('output', {}).get('ports', [])
    if len(ports) != 1:
        return failures + ['typed_port_missing']
    port = ports[0]
    if (port.get('port') != output_port_index or port.get('port_guid') != enter['port_guid'] or port.get('execution_id') != execution_id
            or port.get('row_count') != len(records) or port.get('sample_rows') != count
            or port.get('sample_complete') is not (count == len(records)) or len(port.get('sample', [])) != count):
        failures.append('typed_output_identity')
    for i in range(count):
        for j, column in enumerate(expected):
            raw = records[i][indexes[j]]; cell = values.get((i,j), {})
            try:
                typed = port['sample'][i][j]
                if typed.get('type') != column['type']:
                    raise ValueError('type')
                if raw == fmt['null_marker'] or raw == '' and column['type'] in {'integer', 'real'}:
                    ok = cell.get('is_null') is True and cell.get('text') is None and typed.get('is_null') is True and typed.get('value') is None
                else:
                    ok = cell.get('is_null') is False and typed.get('is_null') is False
                    if column['type'] == 'integer':
                        ok &= int(raw) == int(cell['text']) and str(int(raw)) == typed.get('value')
                    elif column['type'] == 'real':
                        number = raw.replace(fmt['decimal_separator'], '.')
                        ok &= equal_number(number, cell['text'].replace(',', '.')) and equal_number(number, typed.get('value'))
                    elif column['type'] == 'boolean':
                        expected_bool = {'true': True, 'истина': True, 'да': True, 'false': False, 'ложь': False, 'нет': False}.get(raw.casefold())
                        ok &= (expected_bool is not None and typed.get('value') is expected_bool
                               and cell.get('text') == ('Истина' if expected_bool else 'Ложь')
                               and typed.get('precision') == 'exact_boolean')
                    elif column['type'] == 'datetime':
                        parsed = None
                        for source_format in ['%d.%m.%Y %H:%M:%S.%f', '%d.%m.%Y %H:%M:%S', '%d.%m.%Y',
                                              '%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d']:
                            try:
                                parsed = datetime.strptime(raw, source_format); break
                            except ValueError:
                                pass
                        text = parsed.isoformat(timespec='milliseconds') if parsed else None
                        ok &= (text is not None and parsed.microsecond % 1000 == 0 and typed.get('value') == text
                               and cell.get('text') == text.replace('T', ' ') and typed.get('precision') == 'millisecond'
                               and typed.get('timezone') == 'unspecified')
                    elif column['type'] == 'string':
                        ok &= raw == cell.get('text') == typed.get('value')
                    else:
                        ok = False
                if not ok:
                    failures.append('source_output_value_'+str(i)+'_'+str(j))
            except (KeyError, IndexError, ValueError, TypeError):
                failures.append('typed_value_shape_'+str(i)+'_'+str(j))
    return sorted(set(failures))


def _verify_text_import_output(events, request, source_bytes, *, settings_override=None, output_columns_override=None, target_label_override=None):
    base = _verify_text_import(events, request, source_bytes, 'execute', settings_override=settings_override, output_columns_override=output_columns_override, target_label_override=target_label_override)
    seq = verify_internal_sequence(events, request['operation_id'], max_steps=import_operation_step_budget(events, request['operation_id']))
    failures = list(base['failures'])
    if request.get('read', {}).get('ports') != [0] or not seq['observations']:
        return dict(base, passed=False, failures=failures+['output_audit_request'])
    node = seq['observations'][0][1].get('prepared_node_context', {})
    execution = verify_execution_observations(seq['observations'], seq['mutations'], node)
    failures += execution['failures']
    checkpoints = [e['result'] for e in events if e.get('operation_id') == request['operation_id'] and e.get('phase') == 'node_checkpoint']
    if len(checkpoints) != 1:
        failures.append('output_checkpoint_missing')
    else:
        table_request = request if settings_override is None else {**request, 'parameters': {**request['parameters'], 'settings': settings_override}}
        if output_columns_override is not None:
            table_request = {**table_request, 'parameters': {**table_request['parameters'], 'settings': {**table_request['parameters']['settings'], 'columns': output_columns_override}}}
        failures += verify_table_output_observations(seq['observations'], seq['mutations'], table_request, source_bytes, checkpoints[0], execution['execution_id'])
    return dict(base, scope='verified_upload_execution_and_output', passed=not failures, failures=sorted(set(failures)), execution_id=execution['execution_id'], execution_verified=not execution['failures'],
                output_data_verified=not failures, package_persistence_verified=False)


def verify_text_import_output(events, request, source_bytes):
    return _verify_text_import_output(events, request, source_bytes)
