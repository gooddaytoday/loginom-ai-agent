#!/usr/bin/env python3
"""Code-only public/native receipt audit. Never executes Loginom or a model."""
import hashlib
import json
import pathlib
import sys
import importlib.util
import decimal

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[1]
from text_import_oracle import compare
IDS = [case for group in json.loads((ROOT / 'src/text-import-cases.json').read_text())['groups'] for case in group['ids']]
CHECKS = {'input', 'import', 'graph', 'sequence', 'result', 'diagnostic'}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def calls_from(source):
    calls, seen = [], {}
    for index, line in enumerate(source.splitlines()):
        if not line.strip():
            continue
        event = json.loads(line)
        part = event.get('part', {})
        state = part.get('state', {})
        if event.get('type') != 'tool_use' or not part.get('tool', '').startswith('loginom_') or state.get('status') not in ('completed', 'error'):
            continue
        key = part.get('id', part.get('callID'))
        require(key, 'events: missing tool identity')
        signature = json.dumps(part, sort_keys=True)
        if key in seen:
            require(seen[key] == signature, 'events: contradictory tool part')
            continue
        seen[key] = signature
        timing = state.get('time', {})
        require(type(timing.get('start')) in (int, float) and type(timing.get('end')) in (int, float)
            and timing['end'] >= timing['start'], 'events: missing timing')
        output = state.get('output', state.get('error'))
        if isinstance(output, str):
            output = json.JSONDecoder().raw_decode(output[output.index('{'):])[0]
        require(isinstance(output, dict), 'events: structured receipt required')
        calls.append({'tool': part['tool'], 'input': state.get('input', {}), 'result': output,
            'index': index, 'start': timing['start'], 'end': timing['end']})
    return calls


def after(later, earlier):
    return later['index'] > earlier['index'] and later['start'] >= earlier['end']


def source_bindings(spec, calls):
    prepared = [call for call in calls if call['tool'].endswith('_prepare')]
    require(len(prepared) == 1, 'source: one prepare required')
    workspace = prepared[0]['result'].get('workspace', {})
    require(workspace.get('status') == 'READY' and workspace.get('ownership_verified') is True
        and workspace.get('loginom_account') and workspace.get('document_id')
        and workspace.get('workflow_ref', {}).get('workflow_id'), 'source: owned workspace required')
    delivered = [call for call in calls if call['tool'].endswith('artifact_deliver')]
    require(len(delivered) == len(spec['inputs']), 'source: exact delivery count required')
    admitted = prepared[0]['result'].get('input_artifacts', [])
    transfers = []
    for item in spec['inputs']:
        matches = [artifact for artifact in admitted if artifact.get('bytes') == item['bytes']
            and artifact.get('sha256') == item['sha256'] and pathlib.PurePosixPath(artifact.get('name', '')).name == pathlib.PurePosixPath(item['path']).name]
        require(len(matches) == 1, 'source: exact admitted bytes required')
        artifact = matches[0]
        matches = [call for call in delivered if call['input'].get('artifact_id') == artifact['artifact_id']]
        require(len(matches) == 1, 'source: unique admitted delivery required')
        call = matches[0]
        out = call['result'].get('output', {})
        require(after(call, prepared[0]) and call['result'].get('status') == 'SUCCEEDED'
            and call['result'].get('cleanup_complete') is True and out.get('cleanup_complete') is True
            and out.get('upload_completion_verified') is True and out.get('upload_operation_id')
            and call['input'].get('upload_grant_id') == artifact.get('upload', {}).get('grant_id')
            and out.get('destination') == artifact.get('upload', {}).get('destination')
            and out.get('destination', '').startswith('/' + workspace['loginom_account'] + '/')
            and out.get('bytes') == item['bytes'] and out.get('sha256') == item['sha256'], 'source: server bytes/grant unconfirmed')
        transfers.append({'call': call, 'artifact': artifact, 'output': out, 'input': item})
    require(len({transfer['output']['destination'] for transfer in transfers}) == len(transfers), 'source: destinations collide')
    return workspace, transfers


def request_owner(call, workspace, transfer):
    request = call['input']
    source = request.get('parameters', {}).get('source', {})
    require(request.get('document_id') == workspace['document_id']
        and request.get('workflow_ref', {}).get('workflow_id') == workspace['workflow_ref']['workflow_id']
        and request.get('mode') == 'delimited' and request.get('inputs') == [] and request.get('mappings', []) == [],
        'import: request workspace/mode differs')
    require(source.get('artifact_id') == transfer['artifact']['artifact_id']
        and source.get('upload_operation_id') == transfer['output']['upload_operation_id']
        and after(call, transfer['call']), 'source: request delivery lineage differs')


def rejection(spec, calls, workspace, transfers):
    applies = [call for call in calls if call['tool'].endswith('node_apply')]
    require(len(applies) == 1, 'sequence: one uncorrected apply required')
    call = applies[0]
    request_owner(call, workspace, transfers[0])
    request, result = call['input'], call['result']
    wanted = {**spec['settings'], 'source': {**spec['settings']['source'], 'source_path': transfers[0]['output']['destination']}, 'columns': spec['columns']}
    require(request.get('target') == {'kind': 'new', 'type': 'imports.text'} or
        request.get('target', {}).get('kind') == 'new' and request.get('target', {}).get('type') == 'imports.text', 'import: new text import request required')
    require(request.get('finish') == 'execute' and request.get('parameters', {}).get('settings') == wanted, 'import: exact duplicate source references required')
    error = result.get('error', {})
    require(result.get('operation_id') == request.get('operation_id') and result.get('state') == 'settled'
        and result.get('status') == 'NOT_APPLIED' and result.get('action_key') == 'request.validate'
        and result.get('phase') == 'request_rejected' and result.get('request_rejected') is True
        and result.get('effect_possible') is False and result.get('cleanup_complete') is True
        and error.get('code') == 'REQUEST_REJECTED' and error.get('message') == 'Duplicate source column names',
        'diagnostic: exact request validation refusal required')
    require(not any(call['tool'].endswith(('_node_resume', '_node_target', '_run', '_ui_act'))
        and not (call['tool'].endswith('_action_run') and call['input'].get('action_key') == 'package.save_checkpoint')
        for call in calls), 'sequence: alternative browser mutation forbidden')
    require(not any(call['result'].get('operation_id') == request['operation_id']
        and call['result'].get('action_key') != 'request.validate' for call in calls), 'sequence: import must not start')


def native_events(attempt_dir):
    proof = json.loads((attempt_dir / 'native-import.json').read_text())
    cleanup = json.loads((attempt_dir / 'cleanup.json').read_text())
    stage = [item for item in cleanup.get('stages', []) if item.get('stage') == 'profile_history' and item.get('status') == 'confirmed']
    require(cleanup.get('result', {}).get('status') == 'confirmed' and len(stage) == 1
        and proof.get('version') == 1 and proof.get('archive') == stage[0].get('path'), 'native: archive cleanup binding differs')
    archive = pathlib.Path(proof['archive'])
    require(archive.is_absolute() and archive.resolve() == archive, 'native: real archive required')
    events, names = [], set()
    for item in proof['files']:
        relative = pathlib.PurePosixPath(item['source'])
        require(not relative.is_absolute() and '..' not in relative.parts and relative.name == 'execution-events.jsonl'
            and 'browser-profile' not in relative.parts and item['source'] not in names, 'native: unsafe/duplicate source')
        names.add(item['source'])
        file = archive / item['source']
        require(file.resolve() == file, 'native: symlink source forbidden')
        raw = file.read_bytes()
        require(hashlib.sha256(raw).hexdigest() == item['sha256'], 'native: source hash differs')
        original = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
        require(original == item['events'], 'native: projected events differ')
        events.extend(original)
    actual = {str(file.relative_to(archive)) for file in archive.rglob('execution-events.jsonl') if 'browser-profile' not in file.relative_to(archive).parts}
    require(names == actual, 'native: journal inventory incomplete')
    return events


def configuration_matches(spec, actual, source_path):
    source = actual.get('source', {})
    wanted = spec['settings']['source']
    require(source.get('source_path') == source_path, 'source: native source path differs')
    require(source.get('encoding') == wanted['encoding'] or '(' + wanted['encoding'] + ')' in str(source.get('encoding')),
        'import: native encoding differs')
    require(int(source.get('rows_to_skip', -1)) == wanted['rows_to_skip']
        and source.get('first_line_as_title') is wanted['first_line_as_title'], 'import: source settings differ')
    aliases = {'delimiter': {',': 'Запятая', ';': 'Точка с запятой', '\t': 'Символ табуляции', ' ': 'Пробел'},
        'text_qualifier': {'"': 'Двойная кавычка (\")', "'": "Одинарная кавычка (')", '`': 'Обратная кавычка (`)', '': 'Нет'},
        'decimal_separator': {'.': 'Точка (.)', ',': 'Запятая (,)'},
        'date_separator': {'.': 'Точка (.)', '/': 'Слэш (/)', '\\': 'Обратный слэш (\\)', '-': 'Дефис (-)'}}
    for key, value in spec['settings']['format'].items():
        observed = actual.get('format', {}).get(key)
        require(type(observed) == type(value) and (observed == value or observed == aliases.get(key, {}).get(value)), 'import: native format differs: ' + key)
    keys = ('name', 'label', 'type', 'data_kind', 'used')
    require([{key: item.get(key) for key in keys} for item in actual.get('columns', [])]
        == [{key: item[key] for key in keys} for item in spec['columns']], 'import: complete native columns differ')


def native_application(events, call, receipt):
    rows = [event for event in events if event.get('operation_id') == call['input']['operation_id']]
    checkpoints = [event['result'] for event in rows if event.get('phase') == 'node_checkpoint']
    require(len(checkpoints) == 1 and all(checkpoints[0].get(key) == receipt.get(key)
        for key in ('status', 'node', 'configuration', 'execution', 'output', 'cleanup_complete')), 'native: settled checkpoint differs')
    phases = [event['receipt'] for event in rows if event.get('phase') == 'node_phase_completed'
        and event.get('receipt', {}).get('phase') == 'configure']
    require(len(phases) == 1 and phases[0].get('status') == 'verified', 'native: one verified configure phase required')
    value = phases[0].get('value', {})
    require(value.get('verified') is True and value.get('cleanup_complete') is True, 'native: configuration not verified')
    observed = {}
    for name in ('source', 'format'):
        observed[name] = {}
        for key, field in value.get(name, {}).get('fields', {}).items():
            require(field.get('status') == 'observed' and field.get('truncated') is not True, 'native: complete fields required')
            observed[name][key] = field.get('value')
    columns = value.get('columns', [])
    require(all(field.get('status') == 'observed' and field.get('index') == i for i, field in enumerate(columns)), 'native: column coverage differs')
    observed['columns'] = columns
    return observed, rows


def typed_table(receipt):
    execution = receipt.get('execution', {})
    output = receipt.get('output', {})
    require(execution.get('status') == 'completed' and execution.get('execution_id')
        and output.get('status') == 'complete' and output.get('execution_id') == execution['execution_id'], 'result: complete fresh execution required')
    ports = output.get('ports', [])
    require(len(ports) == 1, 'result: one port required')
    port = ports[0]
    require(port.get('port') == 0 and port.get('fresh') is True and port.get('execution_id') == execution['execution_id']
        and port.get('port_guid') and port.get('sample_complete') is True and port.get('sample_rows') == port.get('row_count')
        and len(port.get('sample', [])) == port.get('row_count') and port.get('precision', {}).get('numbers_verified') is True
        and not port.get('precision', {}).get('limitations') and not port.get('limitations'), 'result: full precise port required')
    schema = [{key: col[key] for key in ('name', 'label', 'type', 'data_kind')} for col in port['schema']]
    rows = []
    for row in port['sample']:
        cells = []
        for cell in row:
            require(type(cell.get('is_null')) is bool, 'result: explicit NULL required')
            value = cell.get('value')
            if cell['is_null']:
                require(value is None, 'result: NULL text differs')
            else:
                require(value is not None, 'result: missing cell value')
                if cell['type'] == 'real':
                    value = cell.get('decimal')
                    require(isinstance(value, str) and decimal.Decimal(value).is_finite(), 'result: exact Decimal representation required')
                require(isinstance(value, str), 'result: canonical typed string required')
            cells.append({'type': cell['type'], 'value': value})
        rows.append(cells)
    return {'schema': schema, 'comparison': 'ordered', 'row_count': port['row_count'], 'rows': rows}


def package_graph(attempt_dir, node_id=None, source_path=None, empty=False):
    artifact = attempt_dir / 'artifact'
    if empty and not (artifact / 'package.lgp').exists():
        return
    module = importlib.util.spec_from_file_location('inspect_package', ROOT / 'script/inspect-node-package.py')
    inspector = importlib.util.module_from_spec(module)
    module.loader.exec_module(inspector)
    xml = inspector.inspect(artifact / 'package.lgp', artifact / 'unpacked')
    imports = [node for node in xml['nodes'] if node['type'] == 'TBGImportTextFile']
    allowed = {'TBGImportTextFile', 'TBGVariables'} if not empty else {'TBGVariables'}
    require(all(node['type'] in allowed for node in xml['nodes']) and not xml['links'], 'graph: unexpected nodes/links')
    require(len(imports) == (0 if empty else 1), 'graph: exact import count required')
    if not empty:
        require(imports[0]['id'] == node_id and imports[0]['engine'].get('FileName') == source_path
            and not imports[0]['inputs'] and len(imports[0]['outputs']) == 1, 'graph: persisted import owner/source differs')


def settled_receipt(calls, call):
    receipts = [row for row in calls if row['result'].get('operation_id') == call['input']['operation_id']]
    require(receipts and receipts[-1]['result'].get('state') == 'settled'
        and (receipts[-1] == call or after(receipts[-1], call)), 'sequence: settled receipt required')
    require(all(row['result'].get('status') not in ('AMBIGUOUS', 'TIMED_OUT') for row in receipts), 'sequence: unknown effect preserved')
    return receipts[-1]


def known_refusal(call, calls, events, workspace):
    result = settled_receipt(calls, call)['result']
    require(result.get('status') in ('FAILED', 'NOT_APPLIED') and result.get('cleanup_complete') is True
        and result.get('execution', {}).get('status') == 'not_requested'
        and result.get('execution', {}).get('execution_id') is None
        and result.get('error', {}).get('code') == 'NODE_APPLY_STOPPED'
        and result.get('error', {}).get('message'), 'diagnostic: known refusal before Execute required')
    node = result.get('node', {})
    require(node.get('document_id') == workspace['document_id'] and node.get('workflow_id') == workspace['workflow_ref']['workflow_id']
        and node.get('node_id'), 'diagnostic: owned refusal node required')
    rows = [event for event in events if event.get('operation_id') == call['input']['operation_id']]
    refused = [event.get('receipt', {}) for event in rows if event.get('phase') == 'node_phase_refused']
    require(len(refused) == 1 and refused[0].get('phase') == 'configure' and refused[0].get('status') == 'FAILED'
        and refused[0].get('verification') in ('text_import_binding_draft_discarded', 'text_import_readiness_draft_discarded', 'text_import_initial_settings_draft_discarded')
        and refused[0].get('settings_unchanged') is True and refused[0].get('cleanup_complete') is True, 'diagnostic: native draft refusal required')
    closed = refused[0].get('proof', {}).get('closed', {})
    context = closed.get('node_context', {})
    require(closed.get('verified') is True and closed.get('cleanup_complete') is True and closed.get('draft_discarded') is True
        and closed.get('settings_applied') is False and closed.get('execution_started') is False
        and context.get('verified') is True and context.get('surface') == 'graph'
        and all(context.get(key) == node.get(key) for key in ('document_id', 'workflow_id', 'node_id')), 'diagnostic: owned draft cleanup required')
    require(not any(event.get('receipt', {}).get('phase') == 'execute' or
        event.get('action', {}).get('verb') in ('execute_wizard', 'execute_node', 'launch_graph') for event in rows), 'diagnostic: Execute forbidden')
    return result


def positive(spec, task_dir, attempt_dir, calls, events, workspace, transfers, package_path):
    applies = [call for call in calls if call['tool'].endswith('node_apply')]
    correction = spec['id'] in ('missing-source-path-correction', 'txt-six-to-five-correction', 'csv-delimiter-correction')
    require(len(applies) == (2 if correction else 1), 'sequence: exact import apply count required')
    call = applies[-1]
    request_owner(call, workspace, transfers[0])
    request = call['input']
    require(request.get('target', {}).get('kind') == ('existing' if correction else 'new') and request['target'].get('type') == 'imports.text'
        and request.get('finish') == 'execute', 'import: new executing import required')
    settled = settled_receipt(calls, call)
    result = settled['result']
    require(result.get('status') == 'SUCCEEDED' and result.get('cleanup_complete') is True, 'import: known success/cleanup required')
    node = result.get('node', {})
    require(node.get('document_id') == workspace['document_id'] and node.get('workflow_id') == workspace['workflow_ref']['workflow_id']
        and node.get('node_id'), 'import: returned node owner differs')
    observed, rows = native_application(events, call, result)
    path = transfers[0]['output']['destination']
    configuration_matches(spec, observed, path)
    readback = result.get('configuration', {}).get('readback', {})
    require(result.get('configuration', {}).get('status') == 'applied' and readback.get('kind') == 'text_import'
        and readback.get('node') == node and readback.get('values_are') == 'observed_ui_values', 'import: observed readback required')
    configuration_matches(spec, readback, path)
    configurations = request.get('parameters', {}).get('settings', {})
    configuration_matches(spec, configurations, path)
    if correction:
        first = applies[0]
        request_owner(first, workspace, transfers[0])
        require(first['input'].get('target', {}).get('kind') == 'new' and first['input']['target'].get('type') == 'imports.text'
            and first['input'].get('finish') == 'execute', 'sequence: first new import required')
        refused = known_refusal(first, calls, events, workspace)
        require(refused.get('node') == node and request['target'].get('ref') == node
            and first['input']['operation_id'] != request['operation_id'] and after(call, settled_receipt(calls, first)),
            'sequence: same GUID after known refusal required')
        initial = first['input'].get('parameters', {}).get('settings', {})
        if spec['id'] == 'missing-source-path-correction':
            require('source_path' not in initial.get('source', {}) and initial.get('columns') == spec['columns'], 'sequence: first source_path omission required')
        if spec['id'] == 'txt-six-to-five-correction':
            require(len(initial.get('columns', [])) == 6 and initial['columns'][-1].get('name') == 'Extra', 'sequence: initial sixth Extra field required')
        if spec['id'] == 'csv-delimiter-correction':
            require(initial.get('format', {}).get('delimiter') == ',' and len(initial.get('columns', [])) == 5, 'sequence: first comma/5 fields required')
        rows = [event for event in events if event.get('operation_id') == first['input']['operation_id']]
    graphs = [row.get('target_state', {}) for row in rows if row.get('phase') == 'node_target_checkpoint'
        and row.get('target_state', {}).get('completed') is True]
    require(graphs and graphs[-1].get('result', {}).get('created') is True, 'sequence: original creation proof required')
    graph = graphs[-1].get('final_graph', {})
    require(graph.get('complete') is True and len([n for n in graph.get('nodes', []) if n.get('type') == 'imports.text']) == 1
        and not graph.get('links') and all(n.get('type') in ('imports.text', 'bg-vendor-icon-modelvariables') for n in graph.get('nodes', [])), 'graph: native import-only graph required')
    expected = json.loads((task_dir / spec['oracle_recipe'][0]['expected']).read_text())
    compare(expected, typed_table(result))
    saves = [row for row in calls if row['tool'].endswith('action_run') and row['input'].get('action_key') == 'package.save_checkpoint'
        and after(row, settled) and row['result'].get('status') == 'SUCCEEDED' and row['result'].get('cleanup_complete') is True]
    require(saves and saves[-1]['result'].get('output', {}).get('save_completed') is True
        and saves[-1]['result']['output'].get('workflow_preserved') is True
        and saves[-1]['input'].get('parameters', {}).get('path') == saves[-1]['result']['output'].get('package_ref', {}).get('path')
        and (not package_path or saves[-1]['result']['output']['package_ref']['path'] == package_path), 'graph: final package save required')
    package_graph(attempt_dir, node['node_id'], path)


def audit(task_dir, attempt_dir, package_path):
    task = json.loads((task_dir / 'task.json').read_text())
    if task.get('id') not in IDS:
        return {'errors': ['unsupported node case: ' + str(task.get('id'))], 'failures': []}
    unknown = [item['id'] for item in task['checklist'] if item.get('required') and item['id'] not in CHECKS]
    if unknown:
        return {'errors': ['unknown required ID: ' + item for item in unknown], 'failures': []}
    spec = json.loads((task_dir / 'SPEC.json').read_text())
    require(spec['id'] == task['id'], 'case identity differs')
    for item in spec['inputs']:
        raw = (task_dir / item['path']).read_bytes()
        require(len(raw) == item['bytes'] and hashlib.sha256(raw).hexdigest() == item['sha256'], 'source: local bytes differ')
    calls = calls_from((attempt_dir / 'events.jsonl').read_text())
    workspace, transfers = source_bindings(spec, calls)
    if task['id'].endswith('ambiguous-headers'):
        rejection(spec, calls, workspace, transfers)
        package_graph(attempt_dir, empty=True)
    else:
        positive(spec, task_dir, attempt_dir, calls, native_events(attempt_dir), workspace, transfers, package_path)
    return {'errors': [], 'failures': []}


if __name__ == '__main__':
    try:
        result = audit(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3])
    except (ValueError, KeyError, IndexError, TypeError, OSError, decimal.InvalidOperation) as error:
        result = {'errors': [], 'failures': [str(error)]}
    print(json.dumps(result))
    sys.exit(2 if result['errors'] else 1 if result['failures'] else 0)
