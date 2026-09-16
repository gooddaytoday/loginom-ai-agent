"""Business evidence components, separate from model/admission and fault gates."""
from date_time_goal_oracle import frozen, projection, source_rows, FIXTURES, IMPORT_SCHEMA
from date_time_audit import audit as audit_date
from calculator_output_evidence import verify_calculator_output
from grouping_configuration_evidence import verify_grouping_configuration
from grouping_output_evidence import verify_grouping_output
from row_filter_configuration_evidence import verify_filter_configuration
from row_filter_output_evidence import verify_filter_output
from node_configuration_evidence import verify_configuration_readback
from date_time_excluded_evidence import verify_excluded

LABELS = ('Продажи', 'Календарь', 'Месяцы', 'Кварталы', 'Нет продаж', 'Пустой календарь')
TYPES = dict(zip(LABELS, ('imports.text', 'transform.date_time', 'transform.group_data',
                        'transform.group_data', 'transform.filter_data', 'transform.date_time')))
PARENTS = {'Календарь': 'Продажи', 'Месяцы': 'Календарь', 'Кварталы': 'Календарь',
           'Нет продаж': 'Продажи', 'Пустой календарь': 'Нет продаж'}


def one(items, error):
    if len(items) != 1:
        raise ValueError(error)
    return items[0]


def checkpoint(events, request):
    result = one([e['result'] for e in events if e.get('phase') == 'node_checkpoint'
                  and e.get('operation_id') == request['operation_id']], 'unique_checkpoint')
    if result['status'] != 'SUCCEEDED':
        raise ValueError('successful_checkpoint')
    return result


def full_port(port, expected, execution_id):
    """No fixed requested sample size; returned count must equal total and oracle."""
    n = len(expected['rows'])
    return (0 <= n <= 10 and port.get('fresh') is True and bool(execution_id)
            and port.get('execution_id') == execution_id and port.get('row_count') == n and port.get('sample_rows') == n
            and len(port.get('sample', [])) == n and port.get('sample_complete') is True
            and not port.get('truncated', False)
            and [{k: c.get(k) for k in ('name', 'label', 'type')} for c in port.get('schema', [])] == expected['schema'])


def csv_dates(table):
    return [[v.replace('T', ' ') if v is not None and c['type'] == 'datetime' else v
             for c, v in zip(table['schema'], row)] for row in table['rows']]


def graph():
    tids = {name: name.replace(' ', '_') for name in LABELS}
    ports = []
    for label in LABELS:
        suffixes = (['Input_Connection[0]', 'Input_Var[0]', 'Output_Data[0]'] if label == 'Продажи'
                    else ['Input_Data[0]', 'Output_Data[0]'] + (['Output_Data[1]'] if label == 'Нет продаж' else []))
        ports.append(dict(node_label=tids[label], tids=sorted(tids[label]+';'+s for s in suffixes)))
    return dict(nodes=sorted(tids.values()), ports=sorted(ports, key=lambda x: x['node_label']),
                links=sorted(tids[parent]+'|Output_Data[0]|'+tids[child]+'|Input_Data[0]' for child, parent in PARENTS.items()))


def output_checks(events, request, label, initial=False, configuration=True):
    result = checkpoint(events, request)
    expected = frozen()
    key = {'Продажи': 'source', 'Календарь': 'initial' if initial else 'calendar',
           'Пустой календарь': 'empty', 'Месяцы': 'month', 'Кварталы': 'quarter', 'Нет продаж': 'source'}[label]
    table = expected[key]
    checks = {}
    if request['finish'] != 'execute' or request['read']['require_exact_numbers'] is not True:
        raise ValueError('complete_exact_execution_required')
    ports = result['output']['ports']
    wanted = [0, 1] if label == 'Нет продаж' else [0]
    checks['ports'] = dict(passed=[p['port'] for p in ports] == wanted and request['read']['ports'] == wanted)
    if label == 'Нет продаж':
        tables = [dict(schema=table['schema'], rows=[]), table]
        checks['full'] = dict(passed=len(ports) == 2 and all(full_port(p, t, result['execution']['execution_id']) for p, t in zip(ports, tables)))
        checks['raw'] = verify_filter_output(events, request, table['schema'], [[], csv_dates(table)])
        if configuration:
            checks['configuration'] = verify_filter_configuration(events, request)
    else:
        checks['full'] = dict(passed=len(ports) == 1 and full_port(ports[0], table, result['execution']['execution_id']))
        if label in ('Календарь', 'Пустой календарь'):
            if configuration:
                config = audit_date(events, request, fixture_rows=[] if label == 'Пустой календарь' else source_rows((FIXTURES/'sales.csv').read_bytes()))
                checks['date_configuration_and_values'] = config
                checks['frozen_projection'] = dict(passed=config.get('checks', {}).get('configuration', {}).get('projection') == projection(not initial))
                rb = result['configuration']['readback']
                excluded = [{k: f[k] for k in ('name', 'label', 'type', 'excluded')} for f in rb['output_mapping']['fields'] if f['excluded']]
                im = rb['input_mapping']
                checks['excluded_source_and_target'] = verify_excluded(events, request, expected)
                checks['date_mapping'] = dict(passed=excluded == expected['excluded'] and rb['output_mapping']['autosync'] is False
                    and im['autosync'] is False and [(f['name'], f['label']) for f in im['fields']] ==
                    [('Id', 'Id'), ('DateA', 'Дата'), ('DateB', 'Дата'), ('Amount', 'Amount')])
            checks['raw'] = verify_calculator_output(events, request, table['schema'], csv_dates(table))
        elif label in ('Месяцы', 'Кварталы'):
            if configuration:
                checks['configuration'] = verify_grouping_configuration(events, request)
                rb = result['configuration']['readback']
                period = 'A_month' if label == 'Месяцы' else 'A_quarter'
                checks['grouping_contract'] = dict(passed=[f['name'] for f in rb['group_by']] == ['SavedYearA', period]
                    and [(f['name'], f['functions']) for f in rb['measures']] == [('SalesAmount', 1)]
                    and rb['output_mapping']['autosync'] is False)
            checks['raw'] = verify_grouping_output(events, request, table['schema'], table['rows'])
        else:
            # Text import starts via the native wizard finish; transformed nodes
            # start via the graph toolbar. Both retain native execution proof.
            checks['raw'] = verify_calculator_output(events, request, table['schema'], csv_dates(table), launch_mode='wizard')
            if configuration:
                checks['configuration'] = verify_configuration_readback(events, request)
    return dict(passed=all(c.get('passed') is True for c in checks.values()), checks=checks)


def save_checkpoint(events, requests, path, revision):
    """One final normal save; no implicit save_as/reopen or intermediate save."""
    starts = [(i, e) for i, e in enumerate(events) if e.get('phase') == 'prepared' and e.get('action_key', '').startswith('package.save')]
    ends = [(i, e) for i, e in enumerate(events) if e.get('phase') == 'completed' and e.get('action_key', '').startswith('package.save')]
    si, start = one(starts, 'one_final_save_start'); ei, end = one(ends, 'one_final_save_end')
    last = max(i for i, e in enumerate(events) if e.get('phase') == 'node_checkpoint')
    seed = one([e for e in events if e.get('phase') == 'node_checkpoint' and e.get('operation_id') == requests[0]['operation_id']], 'save_seed')
    key = 'package.save_checkpoint'
    if not last < si < ei or start['action_key'] != key or end['action_key'] != key:
        raise ValueError('final_checkpoint_order')
    for attr in ('operation_id', 'parameters', 'checkpoint', 'action_revision', 'session_id', 'runtime_revision', 'target'):
        if start.get(attr) != end.get(attr):
            raise ValueError('save_bound_'+attr)
    if any(start.get(k) != seed.get(k) or not start.get(k) for k in ('session_id', 'runtime_revision', 'target')):
        raise ValueError('save_owner')
    if start['action_revision'] != revision or start['parameters'] != dict(path=path, conflict_policy='fail'):
        raise ValueError('save_contract')
    cp = start['checkpoint']; out = end['outcome']; data = out['output']
    if cp['graph'] != graph() or cp['path'] != path or cp['package_identity']['path'] != '':
        raise ValueError('new_package_graph')
    if (out['status'] != 'SUCCEEDED' or out['cleanup_complete'] is not True or out['error'] is not None
            or out['operation_id'] != start['operation_id'] or data['save_completed'] is not True
            or data['workflow_preserved'] is not True or data['reopened'] is not False
            or data['package_ref'] != dict(kind='package', path=path, active_identity=path)):
        raise ValueError('awaited_checkpoint')
    trace = out['trace']; names = ['save_requested', 'save_flow_completed', 'open_saved_package_observed', 'postcondition_verified']
    selected = [one([(i, t) for i, t in enumerate(trace) if t.get('event') == n], 'save_trace_'+n) for n in names]
    if [i for i, _ in selected] != sorted(i for i, _ in selected):
        raise ValueError('save_trace_order')
    observed, post = selected[-2][1], selected[-1][1]
    if (selected[0][1]['path'] != path or observed['actual_path'] != path or observed['requested_path'] != path
            or observed['path_matches'] is not True or observed['graph_matches'] is not True
            or observed['graph'] != graph() or post['graph'] != graph() or post['package_path'] != path
            or post['proof'] != 'awaited_save_flow_same_open_workflow'
            or any(t.get('event') in ('saved_package_closed', 'reopened_package_observed', 'overwrite_confirmed') for t in trace)):
        raise ValueError('save_trace_binding')
    return dict(passed=True, operation_id=start['operation_id'], package_persistence_verified=False)


def done_checks(events, request, label):
    """Configuration-only success is separate from the seven complete outputs."""
    result = checkpoint(events, request)
    config = audit_date(events, request)
    rb = result['configuration']['readback']
    expected = frozen()
    excluded = [{k: f[k] for k in ('name', 'label', 'type', 'excluded')}
                for f in rb['output_mapping']['fields'] if f['excluded']]
    checks = dict(raw_configuration=config, excluded_source_and_target=verify_excluded(events, request, expected),
        done_contract=dict(passed=label in ('Календарь', 'Пустой календарь')
            and request['target']['kind'] == 'new' and request['finish'] == 'done'
            and request['read']['ports'] == [] and result['cleanup_complete'] is True
            and result['output']['ports'] == []
            and result['execution'] == dict(status='not_requested', execution_id=None)),
        frozen_projection=dict(passed=config.get('checks', {}).get('configuration', {}).get('projection')
            == projection(label == 'Пустой календарь')),
        mappings=dict(passed=excluded == expected['excluded'] and rb['output_mapping']['autosync'] is False
            and rb['input_mapping']['autosync'] is False
            and [(f['name'],f['label']) for f in rb['input_mapping']['fields']]
            == [('Id','Id'),('DateA','Дата'),('DateB','Дата'),('Amount','Amount')]))
    return dict(passed=all(c['passed'] for c in checks.values()), checks=checks)


def split_retention(events, configured, executed):
    """Same owned GUID and all settings; existing Execute may inspect but not repair."""
    from date_time_persistence import semantic_configuration
    from date_time_saved_import_evidence import readonly_wizard_mutations
    from node_procedure_evidence import verify_internal_sequence
    checks = {}
    try:
        before, after = checkpoint(events, configured), checkpoint(events, executed)
        checks['request'] = dict(passed=configured['finish'] == 'done' and configured['target']['kind'] == 'new'
            and executed['finish'] == 'execute' and executed['target']['kind'] == 'existing'
            and executed['parameters'] == {} and executed['mappings'] == [] and executed['inputs'] == []
            and executed['target']['ref'] == before['node'] == after['node'])
        positions = {(e.get('phase'),e.get('operation_id')):i for i,e in enumerate(events)}
        checks['order'] = dict(passed=positions[('node_checkpoint',configured['operation_id'])]
            < positions[('node_apply_prepared',executed['operation_id'])])
        checks['retained_configuration'] = dict(passed=semantic_configuration({'result':before})
            == semantic_configuration({'result':after}))
        sequence = verify_internal_sequence(events, executed['operation_id'], max_steps=4096)
        failures = sequence['failures'] + readonly_wizard_mutations(sequence, allow_finish=True)
        checks['no_settings_repairs'] = dict(passed=not failures, failures=failures)
    except (KeyError, ValueError, TypeError, IndexError) as error:
        checks['complete_contract'] = dict(passed=False, reason=str(error))
    return dict(passed=bool(checks) and all(c['passed'] for c in checks.values()), checks=checks)
