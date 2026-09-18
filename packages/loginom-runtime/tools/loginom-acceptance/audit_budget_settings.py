"""Check reopened native settings against the separately reviewed task 47 plan."""
from audit_sales_scenario import require
from decimal import Decimal


def verify_import_columns(definition, columns):
    fields = definition['fields']
    require(definition['definition_complete'] is True and len(fields) == len(columns), 'Import definition incomplete')
    # Import requests bind by source name, not request-list position. Loginom
    # retains CSV order; compare each unique resulting field by its final name.
    expected = {c['name']: c for c in columns}
    require(len(expected) == len(columns) and len({f['name'] for f in fields}) == len(fields)
            and {f['name'] for f in fields} == set(expected), 'Import field identities differ')
    for actual in fields:
        wanted = expected[actual['name']]
        require(all(actual[k] == wanted.get(k, wanted['name'] if k == 'label' else None)
                    for k in ('name', 'label', 'type')) and actual['used'] is True,
                'Import field settings differ')


def verify_grouping(settings, parameters):
    require(settings['verified'] is True and settings['inventory_complete'] is True, 'Grouping settings incomplete')
    require([k['name'] for k in settings['keys']] == [k['name'] for k in parameters['group_by']], 'Grouping keys/order differ')
    bits = dict(sum=1, count=2, min=4, max=8, avg=16)
    masks = {}
    for measure in parameters['measures']:
        name = measure['field']['name']
        masks[name] = masks.get(name, 0) | bits[measure['function']]
    require(len(settings['measures']) == len(masks)
            and {m['name']: m['functions'] for m in settings['measures']} == masks, 'Grouping functions differ')


def verify_collapse(settings, parameters):
    require(settings['verified'] is True and settings['inventory_complete'] is True, 'Collapse settings incomplete')
    for role in ('information','transposed'):
        require([f['name'] for f in settings[role]]==[f['name'] for f in parameters[role]], 'Collapse roles/order differ')
    require(settings['skip_null']['switch_pressed'] is False and settings['skip_null']['value'] is parameters['ignore_empty'], 'Collapse empty policy differs')


def verify_sorting(settings, parameters):
    require(settings['verified'] is True and settings['inventory_complete'] is True and len(settings['keys']) == len(parameters['keys']), 'Sorting settings incomplete')
    for actual, expected in zip(settings['keys'], parameters['keys']):
        require(actual['name'] == expected['field']['name'] and actual['direction'] == expected['direction'], 'Sorting key/direction differs')
        if 'case_sensitive' in expected:
            require(actual['case_sensitive'] == expected['case_sensitive'], 'Sorting case setting differs')
    if 'compare_with_locale' in parameters:
        require(settings['options']['chkLocaleAware']['value'] is parameters['compare_with_locale'], 'Sorting locale setting differs')


def verify_saved_mapping(requested, actual, node):
    mapping=actual['mapping'];context=mapping['node_context'];definition=actual['definition']
    require(requested.get('direction')=='output' and requested.get('port')==0 and set(requested)<={'direction','port','autosync'}
            and actual['direction']=='output' and actual['port']==0
            and mapping['verified'] is True and mapping['inventory_complete'] is True
            and all(context[k]==node[k] for k in ('document_id','workflow_id','node_id'))
            and context['output_port']['port']==0
            and ('autosync' not in requested or mapping['autosync'] is requested['autosync'])
            and definition['definition_complete'] is True, 'Saved output mapping differs')
    require(len(definition['fields'])==len(mapping['target_fields']) and all(
        all(field[k]==target[k] for k in ('name','label','type','data_kind'))
        for field,target in zip(definition['fields'],mapping['target_fields'])), 'Saved mapping definition differs')


def verify_numeric_filter(settings, parameters):
    require(settings['verified'] is True and settings['inventory_complete'] is True, 'Filter settings incomplete')
    groups=parameters['groups'];require(len(groups)==1, 'Multiple saved OR groups require independent review')
    rows=settings['rows'];require(len(rows)==len(groups[0]), 'Saved filter row count differs')
    codes={'<':0,'<=':1,'>':2,'>=':3,'=':4,'<>':5}
    for actual,expected in zip(rows,groups[0]):
        require(expected['type'] in ('integer','real') and expected['operator'] in codes
                and actual['kind']=='condition' and actual['field']==expected['field'] and actual['type']==expected['type']
                and actual['operator_code']==codes[expected['operator']]
                and Decimal(str(actual['value']))==Decimal(str(expected['value'])), 'Saved filter predicate differs')


def audit_saved_tabular_settings(plan, index, delivered_destination):
    require(plan['task'] == index['task'] and plan['task'] in (19,21,34,38,47) and plan['operator_reviewed'] is True and plan['run_id'] == index['run_id'], 'Reviewed tabular task identity differs')
    nodes = {n['id']: n for n in plan['expected_graph']['nodes']}
    operations = {o['node_id']: o for o in plan['model_operations_for_review']}
    checked = {}
    for result in index['results'].values():
        node = result['node']['node_id']
        if node in checked:
            continue
        kind, p = nodes[node]['type'], operations[node]['parameters']
        s = result['savedConfiguration']
        if plan['task'] in (19,21,34,38):
            wanted=operations[node]['mappings'];observed=result.get('savedMappings',[])
            require(len(wanted)==len(observed), 'Saved mapping inspection missing')
            for requested,actual in zip(wanted,observed):
                verify_saved_mapping(requested,actual,result['node'])
        if kind == 'imports.text':
            source = s['source']['fields']
            require(source['source_path']['value'] == delivered_destination and source['encoding']['value'] == 'UTF-8 (65001)'
                    and source['rows_to_skip']['value'] == '0' and source['first_line_as_title']['value'] is True, 'Import source changed')
            expected = dict(delimiter='Запятая', decimal_separator='Точка (.)', null_marker='Пустая строка', text_qualifier='Двойная кавычка (")')
            require(all(s['format']['fields'][k]['value'] == v for k,v in expected.items()), 'Budget CSV format differs')
            columns = p['settings']['columns']
            verify_import_columns(s['columns'], columns)
        elif kind == 'transform.group_data':
            verify_grouping(s, p)
        elif kind == 'transform.collapse_columns':
            verify_collapse(s,p)
        elif kind == 'transform.calculator':
            require(s['verified'] is True and s['inventory_complete'] is True and s['mode'] == 'expression', 'Calculator settings incomplete')
            require(len(s['expressions']) == len(p['expressions']), 'Calculator expression count differs')
            for actual, expected in zip(s['expressions'], p['expressions']):
                require(all(actual[k] == expected[k] for k in ('name','label','type','formula','replace')) and actual['intermediate'] is False, 'Saved formula differs')
        elif kind == 'transform.sorting':
            verify_sorting(s, p)
        elif kind == 'transform.filter_data':
            verify_numeric_filter(s,p)
        else:
            require(kind == 'exports.text' and s['inspection_only'] is True and s['executed'] is False, 'Unsupported configuration audit')
            values = {**s['source']['values'], **s['format']['values']}
            require(s['source']['verified'] is True and s['format']['verified'] is True, 'Export settings incomplete')
            expected_format = dict(encoding='UTF-8', delimiter=',', header='names', bom=False,
                                   line_ending='LF', decimal_separator='.', null_marker='', text_qualifier='"')
            expected_format.update(p)
            for key, value in expected_format.items():
                if key == 'overwrite':
                    continue
                expected = 65001 if key == 'encoding' else {'none':0,'names':1,'labels':2}[value] if key == 'header' else {'LF':0,'CRLF':1}[value] if key == 'line_ending' else value
                require(values[key]['value'] == expected, 'Export format differs: '+key)
        checked[node] = dict(type=kind, saved_configuration_verified=True)
    require(checked.keys() == operations.keys(), 'Some saved node settings were not inspected')
    return dict(status='PASS', scope='all_saved_node_settings', nodes=checked)


def audit_budget_settings(plan, index, delivered_destination):
    require(plan['task']==47, 'Budget task required')
    return audit_saved_tabular_settings(plan,index,delivered_destination)
