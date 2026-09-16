"""Business-task binding for node-apply-complete, not a runtime acceptance verdict.

The source/output verifiers must run separately: a self-consistent request and
result can still implement the wrong task. Expected values here come from the
declared sales goal, never from the model's result or its chosen settings.
"""
import hashlib
from upload_probe import FIXTURE_SHA, descriptor
from port_mapping_evidence import configured_mapping_goal


def verify_sales_goal_request(request, run_id, directory, source_bytes):
    failures = []
    expected = descriptor(run_id, directory)
    destination = directory + '/' + expected['name']
    if len(source_bytes) != 230 or hashlib.sha256(source_bytes).hexdigest() != FIXTURE_SHA:
        failures.append('goal_fixture_bytes')
    target = request.get('target', {})
    if (target.get('kind'), target.get('type'), target.get('label')) != ('new', 'imports.text', 'Продажи'):
        failures.append('goal_single_sales_import')
    if request.get('mode') != 'delimited' or request.get('inputs') != [] or request.get('finish') != 'execute':
        failures.append('goal_import_execution')
    parameters = request.get('parameters', {})
    settings = parameters.get('settings', {})
    if settings.get('source') != dict(source_path=destination, encoding='UTF-8', rows_to_skip=0, first_line_as_title=True):
        failures.append('goal_source_settings')
    if settings.get('format') != dict(delimiter=';', decimal_separator='.', text_qualifier='"', null_marker='\\N'):
        failures.append('goal_format_settings')
    names = ['Id', 'Region', 'Quantity', 'UnitPrice', 'Comment']
    types = ['integer', 'string', 'integer', 'real', 'string']
    columns = [dict(name=n, label=n, type=t, used=True,
                    data_kind='Дискретный' if t == 'string' else 'Непрерывный')
               for n, t in zip(names, types)]
    actual = settings.get('columns')
    # Explicitly repeating an unchanged source name is semantically identical.
    if isinstance(actual, list) and all(isinstance(c, dict) for c in actual):
        actual = [dict(c) for c in actual]
        for column in actual:
            if column.get('source_name') == column.get('name'):
                column.pop('source_name')
    if (not isinstance(actual,list) or not all(isinstance(c,dict) and isinstance(c.get('name'),str) for c in actual)
            or sorted(actual,key=lambda c:c.get('name','')) != sorted(columns,key=lambda c:c['name'])):
        failures.append('goal_all_five_source_fields')
    mappings = request.get('mappings')
    expected_fields = [(n, 'Price' if n == 'UnitPrice' else n, 'Цена' if n == 'UnitPrice' else n)
                       for n in ['UnitPrice', 'Id', 'Region', 'Quantity', 'Comment']]
    try:
        if not isinstance(mappings, list) or len(mappings) != 1 or mappings[0].get('autosync') is not False:
            raise ValueError('mapping_required')
        mapped = configured_mapping_goal(mappings[0], columns)
        valid_mapping = [(f['mapping_source_name'], f['name'], f['label']) for f in mapped] == expected_fields
    except (ValueError, KeyError, TypeError, AttributeError):
        valid_mapping = False
    if not valid_mapping:
        failures.append('goal_output_mapping')
    # Byte/hash fields are optional in current node requests. The outer audit
    # must bind the artifact grant and delivered bytes independently.
    source = parameters.get('source', {})
    if (('bytes' in source and source['bytes'] != 230) or ('sha256' in source and source['sha256'] != FIXTURE_SHA)
            or not all(isinstance(source.get(k), str) and source[k] for k in ('artifact_id', 'upload_operation_id'))):
        failures.append('goal_source_identity')
    read = request.get('read', {})
    sample = read.get('sample_rows')
    if (read.get('ports') != [0] or type(sample) is not int or not 6 <= sample <= 10
            or read.get('require_exact_numbers') is not True):
        failures.append('goal_all_six_rows_requested')
    return dict(passed=not failures, failures=failures, scope='declared_sales_task_only',
                runtime_verified=False, package_persistence_verified=False,
                hermes_acceptance_verified=False)
