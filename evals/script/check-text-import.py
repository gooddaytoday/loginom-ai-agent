#!/usr/bin/env python3
"""Code-only public/native receipt audit. Never executes Loginom or a model."""
import hashlib
import json
import pathlib
import sys
import importlib.util
import decimal
import re
import csv
import io
import zipfile
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[1]
from text_import_oracle import compare, parse_source, validate_table
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
    for index, item in enumerate(spec['inputs']):
        name = pathlib.PurePosixPath(item['path']).name
        matches = [artifact for artifact in admitted if artifact.get('bytes') == item['bytes']
            and artifact.get('sha256') == item['sha256'] and (pathlib.PurePosixPath(artifact.get('name', '')).name == name
                or re.fullmatch(r'[0-9a-f]{64}-' + str(index) + '-' + re.escape(name[-120:]), artifact.get('name', '')))]
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
        for key in ('status', 'node', 'configuration', 'execution', 'cleanup_complete')), 'native: settled checkpoint differs')
    output = checkpoints[0].get('output')
    if output and output.get('status') == 'complete':
        typed_table(checkpoints[0])
        require(all(output[key] is True for key in ('verified', 'cleanup_complete') if key in output), 'native: output not verified')
    require(public_output(output) == receipt.get('output'), 'native: settled checkpoint differs')
    native_execution(rows, call, checkpoints[0])
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


def native_execution(rows, call, checkpoint):
    """Bind the exact producer's terminal owner proof to its target and launch."""
    def phase(name):
        matches = [(index, row) for index, row in enumerate(rows) if row.get('phase') == 'node_phase_completed'
            and row.get('receipt', {}).get('phase') == name]
        require(len(matches) == 1, 'native: ' + name + ' phase must be unique')
        index, event = matches[0]
        receipt = event['receipt']
        value = receipt.get('value', {})
        require(receipt.get('status') == 'verified' and receipt.get('receipt_id') == call['input']['operation_id'] + ':' + name
            and value.get('verified') is True and value.get('cleanup_complete') is True,
            'native: ' + name + ' phase not verified')
        return index, event, value

    execute_index, execute_event, execution = phase('execute')
    require(execution.get('owner_verified') is True, 'native: execute owner not verified')
    target_index, target_event, target = phase('target')
    finish_index, finish_event, finish = phase('finish')
    checkpoints = [(index, row) for index, row in enumerate(rows) if row.get('phase') == 'node_checkpoint']
    require(len(checkpoints) == 1 and target_index < finish_index < execute_index < checkpoints[0][0],
        'native: target/finish/execute order differs')
    checkpoint_event = checkpoints[0][1]
    for key in ('session_id', 'runtime_revision', 'manifest_sha256'):
        require(isinstance(checkpoint_event.get(key), str) and checkpoint_event[key]
            and all(event.get(key) == checkpoint_event[key] for event in (target_event, finish_event, execute_event)),
            'native: execution journal lineage differs: ' + key)
    node = checkpoint.get('node', {})
    require(all(isinstance(node.get(key), str) and node[key] for key in ('document_id', 'workflow_id', 'node_id'))
        and target.get('node') == node, 'native: target owner differs')
    group = finish.get('execution_group', {})
    terminal = checkpoint.get('execution', {})
    require(finish.get('mode') == 'execute' and finish.get('execution_started') is True
        and group.get('node') == node and isinstance(group.get('root_id'), str) and group['root_id']
        and isinstance(group.get('group_id'), str) and re.fullmatch(r'[1-9][0-9]*', group['group_id'])
        and isinstance(group.get('group_record_id'), str) and group['group_record_id']
        and terminal.get('execution_id') == node['document_id'] + ':' + group['root_id'] + ':' + group['group_id']
        and finish.get('execution_id') == group.get('execution_id') == execution.get('execution_id') == terminal.get('execution_id')
        and execution.get('status') == terminal.get('status') and execution.get('group_id') == group['group_id'],
        'native: execute launch lineage differs')
    if execution.get('status') == 'completed':
        require(isinstance(execution.get('process_id'), str)
            and re.fullmatch(re.escape(group['group_id']) + r'(?:\.[1-9][0-9]*)+', execution['process_id'])
            and isinstance(execution.get('process_record_id'), str) and execution['process_record_id']
            and execution['process_record_id'] != group['group_record_id'], 'native: execute child lineage differs')
    if call['input'].get('target', {}).get('kind') == 'new':
        targets = [row.get('target_state', {}) for row in rows if row.get('phase') == 'node_target_checkpoint'
            and row.get('target_state', {}).get('completed') is True]
        require(len(targets) == 1 and targets[0].get('targetId') == node['node_id']
            and targets[0].get('result', {}).get('status') == 'SUCCEEDED'
            and targets[0].get('result', {}).get('node', {}).get('ref') == node,
            'native: target checkpoint lineage differs')


def public_output(output):
    """Unbudgeted compactNodeResult projection from the pinned user-v1 producer."""
    if output is None:
        return None
    def pick(value, keys):
        return {key: value[key] for key in keys if key in value}
    result = pick(output, ('status', 'evidence_ref', 'execution_id', 'no_output_requested'))
    if 'ports' in output:
        result['ports'] = []
        for port in output['ports']:
            value = pick(port, ('port', 'port_guid', 'fresh', 'execution_id', 'category_fields', 'schema', 'row_count',
                'sample', 'sample_rows', 'sample_complete', 'precision', 'table', 'exact_table', 'read_coverage',
                'read_consistency', 'cell_precision', 'binding', 'limitations'))
            value['schema'] = [pick(column, ('index', 'name', 'label', 'type', 'data_kind')) for column in port['schema']]
            value['sample'] = []
            for row in port['sample']:
                cells = [pick(cell, ('type', 'value', 'decimal', 'representation', 'display_text', 'precision',
                    'is_null', 'timezone', 'cell_type', 'native')) for cell in row]
                for cell in cells:
                    if 'display_text' in cell and 'value' in cell and type(cell['value']) == type(cell['display_text']) and cell['value'] == cell['display_text']:
                        del cell['display_text']
                value['sample'].append(cells)
            value['sample_rows'] = len(value['sample'])
            value['sample_complete'] = port.get('sample_complete') and len(value['sample']) == len(port['sample'])
            result['ports'].append(value)
    if 'file_artifacts' in output:
        result['file_artifacts'] = [pick(file, ('artifact_id', 'destination', 'bytes', 'sha256', 'execution_id',
            'verification_id', 'freshness_basis')) for file in output['file_artifacts']]
    if 'format_restoration' in output:
        result['format_restoration'] = pick(output['format_restoration'], ('restored', 'table'))
    if 'workflow_return' in output:
        result['workflow_returned'] = output['workflow_return'].get('verified') is True
    return result


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
    table = {'schema': schema, 'comparison': 'ordered', 'row_count': port['row_count'], 'rows': rows}
    validate_table(table)
    return table


def unused_structural_ports(attempt_dir, node, output_guid):
    unit, workflow = node['scope'].rsplit(':', 1)
    with zipfile.ZipFile(attempt_dir / 'artifact/package.lgp') as archive:
        root = ET.fromstring(archive.read(unit))
    workflow = list(root.iter('WorkFlow'))[int(workflow)]
    item = next(item for item in workflow.findall('./Nodes/Item') if item.get('Guid') == node['id'])
    inputs = item.findall('./InputPorts/Item')
    sockets = item.findall('./Component/InputSockets/Item')
    outputs = item.findall('./OutputPorts/Item')
    services = item.findall('./ServiceInputPorts/Item')
    if len(outputs) != 1 or not outputs[0].get('Guid') or (output_guid and outputs[0].get('Guid') != output_guid):
        return False
    if outputs[0].get('Name') not in (('DataSet',) if inputs else ('DataSet', 'DataSource')):
        return False
    if services and (len(services) != 1 or services[0].get('Name') != 'SynchronizationInputPort' or not services[0].get('Guid')):
        return False
    if not inputs:
        return not sockets
    names = {'Connection': 'TBGConnectionInputSocket', 'ControlVariables': 'TBGTuneVariablesSocket'}
    if len(inputs) != 2 or len(sockets) != 2 or {port.get('Name') for port in inputs} != set(names):
        return False
    guids = [port.get('Guid') for port in inputs + outputs + services]
    if not all(guids) or len(set(guids)) != len(guids) or node['variables'] or node['property_bindings']:
        return False
    for port in inputs:
        matching = [socket for socket in sockets if socket.get('Name') == port.get('Name') and socket.get('Guid') == port.get('Guid')]
        if len(matching) != 1:
            return False
        socket = matching[0].find('./Socket')
        if socket is None or socket.get('{http://www.w3.org/2001/XMLSchema-instance}type') != names[port.get('Name')] or socket.get('Virgin') != 'true':
            return False
        constraints = socket.find('./Constraints')
        if constraints is None or len(constraints):
            return False
        if port.get('Name') == 'Connection':
            if [child.tag for child in socket] != ['Constraints']:
                return False
        else:
            elements = socket.find('./Variables/Elements')
            if elements is None or len(elements) or [child.tag for child in socket] != ['Constraints', 'Variables']:
                return False
    return True


def package_graph(attempt_dir, node_id=None, source_path=None, empty=False, output_guid=None):
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
        require(imports[0]['id'] == node_id and (source_path is None or imports[0]['engine'].get('FileName') == source_path)
            and unused_structural_ports(attempt_dir, imports[0], output_guid), 'graph: persisted import owner/source differs')


def settled_receipt(calls, call):
    receipts = [row for row in calls if row['result'].get('operation_id') == call['input']['operation_id']
        or row['tool'].endswith('operation_inspect') and row['input'].get('operation_id') == call['input']['operation_id']]
    require(all(row['result'].get('status') not in ('AMBIGUOUS', 'TIMED_OUT') for row in receipts), 'sequence: unknown effect preserved')
    inspections = [row for row in receipts if row['tool'].endswith('operation_inspect')]
    for row in inspections:
        result, output = row['result'], row['result'].get('output', {})
        require(after(row, call) and row['input'].get('operation_id') == call['input']['operation_id']
            and result.get('operation_id') == call['input']['operation_id']
            and result.get('action_key') == 'operation.inspect' and result.get('status') == 'SUCCEEDED'
            and result.get('effect_possible') is False and output.get('effect_state') == 'verified'
            and output.get('cleanup_confirmed') is True
            and output.get('operation_id') == call['input']['operation_id']
            and output.get('state') == 'resolved', 'sequence: unknown inspect effect/cleanup preserved')
    receipts = [row for row in receipts if row not in inspections]
    require(receipts and receipts[-1]['result'].get('state') == 'settled'
        and (receipts[-1] == call or after(receipts[-1], call)), 'sequence: settled receipt required')
    for row in inspections:
        outcome = row['result']['output'].get('outcome')
        if outcome is not None:
            require(isinstance(outcome, dict), 'sequence: inspect outcome required')
            require(outcome.get('operation_id') == call['input']['operation_id']
                and outcome.get('status') == receipts[-1]['result'].get('status'), 'sequence: inspect outcome differs')
            # inspect contains the stored action envelope; operation polling exposes
            # its node payload flattened. Check both levels, including redundant
            # assertions, against the genuine terminal receipt. Historical node
            # effects may be true; they must agree, not be changed to read-only.
            wrapped = isinstance(outcome.get('output'), dict) and 'node' in outcome['output']
            for part in [outcome, outcome['output']] if wrapped else [outcome]:
                for key in ('operation_id', 'state', 'status', 'action_key', 'phase', 'effect_possible',
                    'cleanup_complete', 'node', 'execution', 'configuration', 'output', 'error', 'package_saved'):
                    if key in part and not (wrapped and part is outcome and key == 'output'):
                        require(key in receipts[-1]['result'] and part[key] == receipts[-1]['result'][key],
                            'sequence: contradictory inspect ' + key)
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


def report_text(attempt_dir, terminal):
    return '\n'.join(event.get('part', {}).get('text', '')
        for index, line in enumerate((attempt_dir / 'events.jsonl').read_text().splitlines()) if line.strip()
        for event in [json.loads(line)] if index > terminal['index'] and event.get('type') == 'text')


def report_sentences(text):
    """Independent clauses retain quote/attribution scope and local cause polarity."""
    text = re.sub(r'[`*]', '', text.casefold().replace('ё', 'е'))
    text = re.sub(r',\s*(?:однако|however)\s*,', ' ', text)
    # A quoted proposition is atomic: an internal connector must not detach it
    # from an enclosing "example", "claim is false" or speech act. Identifiers
    # such as settings.columns are also preserved.
    boundary = (r'«[^»]*»|“[^”]*”|"[^"\n]{1,300}"|(?P<cut>'
        r'(?<=[.!?;])\s+|\n+|\s*[,—]?\s*\b(?:но|однако|but|however|although|хотя)\b[\s,]+'
        r'|,\s*а\s+)')
    rows, start = [], 0
    for match in re.finditer(boundary, text):
        if match.group('cut') is not None:
            if text[start:match.start()].strip():
                rows.append(text[start:match.start()].strip())
            start = match.end()
    if text[start:].strip():
        rows.append(text[start:].strip())
    return rows


def claim_status(clause, start, end):
    """+1 asserted, -1 negated, 0 directive/example/question/hypothesis.

    A candidate span already identifies its predicate: e.g. absent(columns) and
    not-supplied(columns) are both absence facts. Only operators governing that
    span negate it; negation inside a negative presence predicate is not applied
    twice. Contrast siblings have independent scope in report_sentences.
    """
    prefixes, suffixes = report_sentences(clause[:start]), report_sentences(clause[end:])
    prefix = prefixes[-1] if prefixes else ''
    suffix = suffixes[0] if suffixes else ''
    tail = re.sub(r'^[\s,«»"“”():—-]+', '', suffix)
    warning_topic = re.search(r'\b(?:warn(?:s|ed|ing|ings)?|предупрежд\w*|предупред\w*)\b', clause[start:end])
    if warning_topic and re.search(r'\b(?:не\s+обязател\w*|not\s+required)\b', tail):
        return 0
    if clause.rstrip(' «»"“”').endswith('?'):
        return 0
    if re.search(r'\b(?:пример|образец|example|template|предполож\w*|допустим|task|whether)\b'
        r'|\b(?:проверь(?:те)?|проверяй(?:те)?|сообщ(?:и(?:те)?|ай(?:те)?)|утверждай(?:те)?|напиши(?:те)?|замените)\b'
        r'|\b(?:please\s+)?(?:report|check|write|say|replace|invent|fabricate)\b(?=\s+(?:that|whether|the|it|data|an?|native|engine))'
        r'|\b(?:не\s+)?выдум\w*\b'
        r'|\b(?:оператор|пользователь|someone|operator|user)\b.{0,20}\b(?:утвержда\w*|сказ\w*|предполож\w*|claims?|said|suggest\w*)\b', prefix):
        return 0
    if re.search(r'\b(?:нельзя|невозможно|неверно|отрица\w*)\b'
        r'|\bне\s+(?:утвержда\w*|подтвержда\w*|могу\s+подтверд\w*|связан\w*)\b'
        r'|\b(?:cannot|can\s+not|do\s+not|don.t)\s+(?:confirm|claim|assert)\b'
        r'|\b(?:not\s+(?:due|because)|не\s+из-за)\b', prefix):
        return -1
    if re.search(r'\b(?:ложн\w*|ложь|неверно|false|incorrect\s+conclusion)\b'
        r'|\bне\s+соответств\w*\s+действительности\b'
        r'|\b(?:так\s+)?(?:утверждать|считать|заключить)\s+(?:нельзя|невозможно)\b'
        r'|\bwould\s+be\s+(?:an?\s+)?incorrect\b', tail):
        return -1
    # Only an explicit causal object licenses uncertainty after an affirmed
    # observation. "damaged, possibly" without that object is still unasserted.
    causal_tail = re.search(r'\b(?:причин\w*|cause\w*|из-за|because|due\s+to)\b', tail)
    uncertain = r'\b(?:если|нужно|следует|надо|возможн\w*|вероятн\w*|может|якобы|if|should|might|could|possible|possibly|probably|perhaps|maybe|hypothetical)\b'
    unknown = r'\b(?:не\s+(?:исключен\w*|установлен\w*|доказан\w*|подтвержден\w*)|no\s+evidence|without\s+evidence|unproven|unconfirmed)\b'
    if re.search(uncertain + '|' + unknown, prefix):
        return 0
    if not causal_tail and (re.search(uncertain + '|' + unknown, tail)
        or re.search(r'\b(?:только|лишь|only)\s+(?:гипотез\w*|предполож\w*|hypothes\w*)\b', tail)):
        return 0
    # Local negative operators cover auxiliaries and quantifiers on either side
    # of a predicate, including "never issued a warning" and "success was not
    # achieved". There is no separate success/warning polarity vocabulary.
    neg = r'(?:не|нет|без|ни|никак\w*|not|never|no|without|zero)'
    if re.search(rf'\b{neg}\b(?:\W+\w+){{0,4}}\W*$', prefix):
        return -1
    # Explanations introduced by a colon, causal child or another coordinated
    # predicate cannot negate the completed parent predicate. Truth-qualified
    # quotations/modal suffixes were handled above before this boundary.
    operator_tail = re.split(r':|\b(?:и|and|причин\w*|cause\w*|because)\b', suffix, maxsplit=1)[0]
    operator_tail = re.sub(r'^[\s,«»"“”():—-]+', '', operator_tail)
    negative_tail = re.match(rf'(?:\w+\W+){{0,3}}\b{neg}\b(?:\W+\w+){{0,3}}', operator_tail)
    # A negative auxiliary/truth/aspect predicate governs the completed claim.
    # Another finite relation ("equal names do not allow import") states a
    # consequence of that fact. A warning noun instead denotes existence and
    # keeps the polarity of its own emission/observation verb, whatever the verb.
    governing = re.search(r'\b(?:нет|был\w*|стал\w*|явля\w*|верно|наблюда\w*|подтвержд\w*|доказ\w*|установл\w*|достиг\w*|произош\w*|been|true|achieved|confirmed|observed|established|occurred)\b', operator_tail)
    if negative_tail and (warning_topic or governing or re.match(r'(?:нет|no|never)\b', operator_tail)):
        return -1
    if re.match(r'(?:\w+\W+){0,3}(?:отсутств\w*|absent|missing)\b', operator_tail):
        return -1
    return 1


def claim_asserted(clause, start, end):
    return claim_status(clause, start, end) == 1


def refusal_explained(sentences, reason, spec):
    """Match the observed refusal's facts, without a required report phrase."""
    columns = spec.get('columns', []) if spec else []
    topic = r'\b(?:columns?|fields?|names?|headers?|пол\w*|колон\w*|столб\w*|имен\w*|заголов\w*|определен\w*)\b'
    absence = (r'\b(?:отсутств\w*|пропущ\w*|опущ\w*|нет|без|missing|absent|omitted|lacks?|without)\b'
        r'|\bне\s+(?:переда\w*|зада\w*|указа\w*|определ\w*)\b'
        r'|\b(?:not|never)\s+(?:supplied|provided|defined|specified|given)\b'
        r'|\bno\s+(?:columns?|fields?|definitions?)\b')
    if 'duplicate source column names' in reason:
        patterns = [r'\b(?:дублир\w*|дубл\w*|повторя\w*|одинаков\w*|совпада\w*|duplicat\w*|identical)\b',
                    r'\bsame\s+(?:name|header)\b',
                    r'\b(?:одн\w*|общ\w*)\s+имен\w*\b']
        names = set(column.get('source_name', column.get('name', '')).casefold() for column in columns)
        for name in names:
            if name:
                patterns.extend([r'\b(?:both|two|2|оба|обе|два|две)\b.{0,50}(?:named|имен\w*|заголов\w*).{0,15}\b' + re.escape(name) + r'\b',
                    re.escape(name) + r'.{0,15}\b(?:дважды|twice)\b'])
        return any(re.search(topic, sentence) and claim_asserted(sentence, match.start(), match.end())
            for sentence in sentences for pattern in patterns for match in re.finditer(pattern, sentence))
    if ('initial' in reason or 'require' in reason) and 'columns' in reason:
        return any(re.search(r'\b(?:columns?|колон\w*|определен\w*)\b', sentence)
            and claim_asserted(sentence, match.start(), match.end())
            for sentence in sentences for match in re.finditer(absence, sentence))
    if 'missing or ambiguous' in reason:
        names = re.findall(r'"([^"]+)"', reason)
        if not names:
            return False
        return any(re.search(r'\b' + re.escape(names[0]) + r'\b', sentence)
            and claim_asserted(sentence, match.start(), match.end())
            for sentence in sentences for match in re.finditer(absence + r'|\b(?:неоднознач\w*|ambiguous)\b', sentence))
    counts = re.search(r'requested (\d+), observed (\d+)', reason)
    if not counts:
        return False
    requested, observed = map(int, counts.groups())
    numerals = {1: r'од(?:ин|на|но|ного|ному|ной)|единственн\w*|one|single',
                2: r'дв[ае]|двух|двум\w*|об[ае]|обоих|two|both',
                3: r'три|трех|three', 4: r'четыре|четырех|four', 5: r'пять|пяти|five'}
    number = lambda n: rf'\b(?:{n}|{numerals.get(n, str(n))})\b'
    required, actual = number(requested), number(observed)
    requested_seen, observed_seen = False, False
    for sentence in sentences:
        # Relative count explicitly binds observed -> requested. Do not lose a
        # negated causal relation such as "refusal is not due to [this count]".
        for match in re.finditer(actual + r'.{0,40}\b(?:вместо|instead\s+of|rather\s+than)\b.{0,20}' + required, sentence):
            if re.search(topic, sentence) and claim_asserted(sentence, match.start(), match.end()):
                return True
        req = re.search(r'\b(?:запрош\w*|ожида\w*|requested|required|expected)\b', sentence)
        if req and claim_asserted(sentence, req.start(), req.end()):
            names = [str(column.get('name', '')).casefold() for column in columns]
            requested_seen |= bool(re.search(required, sentence) or len(names) == requested and names
                and all(re.search(r'\b' + re.escape(name) + r'\b', sentence) for name in names))
        obs = re.search(r'\b(?:обнаруж\w*|наблюда\w*|получ\w*|оказал\w*|есть|только|observed|found|only|single|единственн\w*)\b', sentence)
        if obs and claim_asserted(sentence, obs.start(), obs.end()) and re.search(actual, sentence) and re.search(topic, sentence):
            observed_seen = True
    return requested_seen and observed_seen


def report_truth(text, result, events, refusal=False, spec=None):
    """Ground local report propositions in the already verified operation."""
    sentences = report_sentences(text)
    operation_id = result.get('operation_id')
    warnings = []
    def collect(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in ('warning', 'warnings') and item:
                    warnings.extend(item if isinstance(item, list) else [item])
                elif isinstance(item, (dict, list)):
                    collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)
    for event in events:
        if event.get('operation_id') != operation_id:
            continue
        receipt = event.get('receipt', {})
        if receipt.get('status') == 'verified':
            collect(receipt.get('value', {}))
        terminal = event.get('result', {})
        if event.get('phase') == 'node_checkpoint' and terminal.get('status') in ('SUCCEEDED', 'FAILED') and terminal.get('cleanup_complete') is True:
            collect(terminal)
    warning_evidence = json.dumps(warnings, ensure_ascii=False).casefold()
    for sentence in sentences:
        # A declarative warning noun/verb is a proposition independently of the
        # emission verb. This cannot silently ignore "emitted", "raised", etc.
        for match in re.finditer(r'\b(?:warn(?:s|ed|ing|ings)?|предупрежд\w*|предупред\w*)\b', sentence):
            status = claim_status(sentence, match.start(), match.end())
            if status == 0:
                continue
            if status == -1:
                require(not warnings, 'diagnostic: report denies verified native warning')
                continue
            codes = re.findall(r'\b(?:w|warn|warning)[_-][\w-]+\b', sentence)
            require(warnings and all(re.search(r'\b' + re.escape(code) + r'\b', warning_evidence) for code in codes),
                'diagnostic: report warning lacks native evidence')
    if not refusal:
        return
    for sentence in sentences:
        imported = re.search(r'\b(?:импорт\w*|import)\b', sentence)
        read = re.search(r'\b(?:данн\w*|data|records?|строк\w*)\b', sentence) and re.search(r'\b(?:прочитан\w*|импортирован\w*|read|imported)\b', sentence)
        if imported or read:
            for match in re.finditer(r'\b(?:успеш\w*|success\w*|succeed\w*)\b', sentence):
                require(not claim_asserted(sentence, match.start(), match.end()), 'diagnostic: report contradicts proven refusal')
        if read:
            for match in re.finditer(r'\b(?:правильно|корректно|correctly)\b', sentence):
                require(not claim_asserted(sentence, match.start(), match.end()), 'diagnostic: report contradicts proven refusal')
        for match in re.finditer(r'\b(?:отказ\w*\s+(?:нет|не\s+был\w*|отсутств\w*)|(?:нет|без)\s+отказ\w*|(?:no|without)\s+(?:refusals?|rejections?))\b', sentence):
            require(not claim_asserted(sentence, match.start(), match.end()), 'diagnostic: report contradicts proven refusal')
    reason = result.get('error', {}).get('message', '').casefold().replace('ё', 'е')
    normalized = re.sub(r'\s+', ' ', re.sub(r'[`*]', '', text.casefold().replace('ё', 'е')))
    literal = re.sub(r'\s+', ' ', re.sub(r'[`*]', '', reason))
    # Full native error is a witness even with multiple sentences or semicolons.
    # Its own instructions are quoted native content, not report directives.
    grounded = bool(literal) and any(claim_asserted(normalized, match.start(), match.end())
        for match in re.finditer(re.escape(literal), normalized))
    require(grounded or refusal_explained(sentences, reason, spec), 'diagnostic: report must explain the observed refusal reason')


def damage_diagnosed(text, kind, replacements, affected_fields):
    """Separate assertion scope/polarity from the independently verified consequence.

    Keep the whole sentence while resolving speech acts and quotation/modal scope;
    only then inspect coordinated propositions. An absent engine warning is a
    different proposition from damaged data. Accept factual descriptions of the
    observed field/record transformation as well as a general damage diagnosis.
    """
    text = re.sub(r'[`*_]', '', text.casefold().replace('ё', 'е'))
    sentences = report_sentences(text)
    damage = r'(?:поврежд\w*|искаж\w*|испорч\w*|утрат\w*|потер\w*|неполн\w*|corrupt\w*|damag\w*|loss|lost|incomplete\w*)'
    names = '|'.join(re.escape(name.casefold()) for name in affected_fields)
    field = rf'(?:пол\w*|значени\w*|field|value)\s+(?:of\s+)?(?:{names})|(?:{names})' if names else r'(?!)'
    subject = rf'(?:данн\w*|текст\w*|импорт\w*|вход\w*|результат\w*|unicode|выборк\w*|запис\w*|строк\w*|data|text|input|import|result|records?|rows?|{field})'
    movement = r'(?:поглот\w*|поглощ\w*|объедин\w*|скле\w*|попал\w*|оказал\w*|стал\w*|преврат\w*|замен\w*|swallow\w*|consum\w*|absorb\w*|merged|became|turned|replaced)'
    assertions = []
    for sentence in sentences:
        # Remove discourse punctuation without detaching subject from predicate.
        sentence = re.sub(r'\b(?:но|однако|but|however|although|хотя)\b', ' ', sentence)
        # Do not discard introductory speech acts at a comma/colon. Assertion
        # classification needs both sides of its candidate span.
        clauses = [sentence]
        for clause in clauses:
            clause = re.sub(r'[,«»"“”]', ' ', clause)
            clause = re.sub(r'\s+', ' ', clause)
            denial = re.search(
                rf'{damage}(?:\s+\w+){{0,4}}\s+(?:нет\b|отсутств\w*|не\s+(?:был\w*|стал\w*|произош\w*|выяв\w*|обнаруж\w*|наблюда\w*))'
                rf'|\b(?:нет|никаких|без|no|without)\s+(?:{subject}\s+)?{damage}'
                rf'|\b(?:не|not)\s+(?:(?:был\w*|стал\w*|been|being)\s+)?(?:{damage}|неверно|некорректно)'
                rf'|\bне\s+(?:выяв\w*|обнаруж\w*|наблюда\w*).{{0,30}}{damage}'
                r'|\b(?:импорт|данные|текст)\s+(?:полностью\s+)?коррект(?:ен|ны)\b'
                r'|\bevery source record was read correctly\b', clause)
            if denial and claim_asserted(clause, denial.start(), denial.end()):
                return False
            generic = re.search(
                rf'(?:обнаруж\w*|наблюда\w*|выяв\w*|зафиксир\w*|detected|observed|found)\s+(?:{subject}\s+)?{damage}'
                rf'|{subject}\s+(?:(?:был\w*|стал\w*|оказал\w*|выгляд\w*|отобража\w*|is|was|were|are|has been|looks|appears)\s+)?{damage}'
                rf'|{damage}\s+{subject}', clause)
            bad_read = re.search(
                rf'{subject}.{{0,35}}(?:прочитан\w*|декодирован\w*|раскодирован\w*|read|decoded)\s+(?:неверно|некорректно|ошибочно|incorrectly|wrongly)'
                r'|(?:неверн\w*|неправильн\w*|wrong|incorrect)\s+(?:декодирован\w*|декодир\w*|decoding)', clause)
            swallowed = re.search(
                r'(?:кавыч\w*|quote).{0,50}(?:поглот\w*|поглощ\w*|объедин\w*|скле\w*|swallow\w*|consum\w*|absorb\w*)'
                rf'|(?:запис\w*|строк\w*|record|row).{{0,60}}(?:{movement}|внутри|частью|part of|inside).{{0,40}}(?:{field}|пол\w*|field)', clause)
            substitutions = [match for expected, actual in replacements for pattern in (
                re.escape(expected.casefold()) + rf'.{{0,80}}(?:{movement}|получ\w*|→|->).{{0,40}}' + re.escape(actual.casefold()),
                r'\bвместо\s+' + re.escape(expected.casefold()) + r'.{0,80}' + re.escape(actual.casefold()),
                re.escape(actual.casefold()) + r'.{0,80}\b(?:instead of|rather than)\s+' + re.escape(expected.casefold()))
                for match in [re.search(pattern, clause)] if match]
            # Negating absorption/substitution denies that consequence. Negating
            # a separate-record predicate instead describes the observed loss;
            # it must not veto an affirmative diagnosis elsewhere in the report.
            consequences = ([swallowed] if kind == 'unclosed-quote' and swallowed else []) + (substitutions if kind == 'wrong-encoding' else [])
            consequences = [match for match in consequences if claim_asserted(clause, match.start(), match.end())]
            for consequence in consequences:
                if re.search(rf'\b(?:не|not)\s+(?:{movement}|прочитан\w*|read|decoded)', consequence.group()):
                    return False
            missing_record = re.search(r'(?:строк\w*|запис\w*|row|record).{0,50}\b(?:не\s+стал\w*|did not become).{0,15}(?:отдельн\w*|самостоятельн\w*|separate)\s+(?:строк\w*|запис\w*|row|record)', clause)
            candidates = [match for match in [generic, bad_read, missing_record if kind == 'unclosed-quote' else None] if match] + consequences
            if any(claim_status(clause, match.start(), match.end()) == -1 for match in candidates):
                return False
            assertions.append(any(claim_asserted(clause, match.start(), match.end()) for match in candidates))
    return any(assertions)


def diagnostic(spec, task_dir, attempt_dir, calls, events, workspace, transfers):
    applies = [call for call in calls if call['tool'].endswith('node_apply')]
    require(len(applies) == 1, 'diagnostic: one uncorrected apply required')
    call = applies[0]
    request_owner(call, workspace, transfers[0])
    request = call['input']
    require(request.get('target', {}).get('kind') == 'new' and request['target'].get('type') == 'imports.text', 'diagnostic: new import required')
    settings = request.get('parameters', {}).get('settings', {})
    wanted = {**spec['settings'], 'source': {**spec['settings']['source'], 'source_path': transfers[0]['output']['destination']}}
    if spec['id'] == 'initial-incomplete-settings':
        require('columns' not in settings and settings == wanted, 'diagnostic: omitted columns required')
    else:
        # The product selects source_name ?? name. Only the redundant exact name
        # is equivalent here; preserve every other key, value and column order.
        normalized = {**settings, 'columns': [{key: value for key, value in column.items()
            if key != 'source_name' or value != column.get('name')} for column in settings.get('columns', [])]}
        require(normalized == {**wanted, 'columns': spec['columns']}, 'diagnostic: exact assigned settings required')
    result = settled_receipt(calls, call)['result']
    damaged = spec['id'].endswith(('wrong-encoding', 'unclosed-quote'))
    if damaged and result.get('execution', {}).get('status') == 'failed':
        execution = result['execution']
        require(result.get('status') == 'FAILED' and result.get('cleanup_complete') is True
            and result.get('error', {}).get('code') == 'NODE_EXECUTION_FAILED'
            and execution.get('failure_verified') is True and execution.get('root_id') and execution.get('group_id')
            and execution.get('group_record_id') and execution.get('execution_id') == workspace['document_id'] + ':' + execution['root_id'] + ':' + execution['group_id']
            and result.get('output', {}).get('status') == 'not_refreshed', 'diagnostic: verified terminal engine failure required')
        observed, rows = native_application(events, call, result)
        configuration_matches(spec, observed, transfers[0]['output']['destination'])
        proofs = [row['receipt'].get('value', {}) for row in rows if row.get('phase') == 'node_phase_completed'
            and row.get('receipt', {}).get('phase') == 'execute' and row['receipt'].get('status') == 'verified']
        node = result.get('node', {})
        require(node.get('document_id') == workspace['document_id'] and node.get('workflow_id') == workspace['workflow_ref']['workflow_id']
            and len(proofs) == 1 and proofs[0].get('node') == node and proofs[0].get('owner_verified') is True
            and proofs[0].get('failure_verified') is True and proofs[0].get('output_refreshed') is False
            and proofs[0].get('execution_id') == execution['execution_id'], 'diagnostic: native terminal owner proof required')
        report_truth(report_text(attempt_dir, settled_receipt(calls, call)), result, events, refusal=True, spec=spec)
        if (attempt_dir / 'artifact/package.lgp').exists():
            package_graph(attempt_dir, node['node_id'], transfers[0]['output']['destination'])
        return
    if damaged and result.get('status') == 'SUCCEEDED':
        require(result.get('cleanup_complete') is True and result.get('node', {}).get('document_id') == workspace['document_id']
            and result.get('node', {}).get('workflow_id') == workspace['workflow_ref']['workflow_id'], 'diagnostic: owned full read required')
        observed, _ = native_application(events, call, result)
        configuration_matches(spec, observed, transfers[0]['output']['destination'])
        actual = typed_table(result)
        require(actual['schema'] == [{key: column[key] for key in ('name', 'label', 'type', 'data_kind')}
            for column in spec['columns']], 'result: assigned output schema differs')
        raw = (task_dir / spec['inputs'][0]['path']).read_bytes()
        recipe = {'source': {'encoding': 'cp1251' if spec['id'].endswith('wrong-encoding') else 'utf-8'},
            'settings': spec['settings'], 'columns': spec['columns'], 'source_headers': spec.get('source_headers')}
        replacements = []
        affected_fields = set()
        if spec['id'].endswith('wrong-encoding'):
            original = parse_source(raw, recipe)
            replacements = [(expected['value'], observed['value'])
                for before, current in zip(original['rows'], actual['rows']) for expected, observed in zip(before, current)
                if isinstance(expected['value'], str) and isinstance(observed['value'], str) and expected['value'] != observed['value']]
            affected_fields = {column['name'] for before, current in zip(original['rows'], actual['rows'])
                for column, expected, observed in zip(actual['schema'], before, current) if expected != observed}
            differs = False
            try:
                compare(original, actual)
            except ValueError:
                differs = True
            require(differs, 'diagnostic: Unicode damage must be observed')
        else:
            invalid = False
            try:
                parse_source(raw, recipe)
            except (ValueError, csv.Error):
                invalid = True
            require(invalid, 'diagnostic: malformed source must be independently established')
            affected_fields = {column['name'] for row in actual['rows'] for column, cell in zip(actual['schema'], row)
                if isinstance(cell['value'], str) and '\n' in cell['value']}
        terminal = settled_receipt(calls, call)
        text = report_text(attempt_dir, terminal)
        report_truth(text, result, events)
        kind = 'wrong-encoding' if spec['id'].endswith('wrong-encoding') else 'unclosed-quote'
        require(damage_diagnosed(text, kind, replacements, affected_fields), 'diagnostic: damage must be diagnosed in the report')
        if (attempt_dir / 'artifact/package.lgp').exists():
            package_graph(attempt_dir, result['node']['node_id'], transfers[0]['output']['destination'])
        return
    result = known_refusal(call, calls, events, workspace)
    if spec['id'] == 'initial-incomplete-settings':
        require(any(event.get('receipt', {}).get('verification') == 'text_import_initial_settings_draft_discarded'
            for event in events if event.get('operation_id') == request['operation_id']), 'diagnostic: initial settings refusal required')
    if spec['id'] == 'missing-source-column':
        require('OtherName' in result['error']['message'], 'diagnostic: missing OtherName refusal required')
    if spec['id'].endswith('wrong-delimiter'):
        message = result['error']['message'].lower()
        raw = (task_dir / spec['inputs'][0]['path']).read_bytes()
        headers = next(csv.reader(io.StringIO(raw.decode('utf-8-sig'), newline=''),
            delimiter=spec['settings']['format']['delimiter'], quotechar=spec['settings']['format']['text_qualifier']), [])
        count_refusal = result['error']['message'] == (
            f"Import definition count differs: requested {len(spec['columns'])}, observed {len(headers)}")
        require('column' in message or 'field' in message or 'пол' in message or count_refusal,
            'diagnostic: typed binding/count refusal required')
    report_truth(report_text(attempt_dir, settled_receipt(calls, call)), result, events, refusal=True, spec=spec)
    if (attempt_dir / 'artifact/package.lgp').exists():
        package_graph(attempt_dir, result['node']['node_id'])


def positive(spec, task_dir, attempt_dir, calls, events, workspace, transfers, package_path):
    applies = [call for call in calls if call['tool'].endswith('node_apply')]
    correction = spec['id'] in ('missing-source-path-correction', 'txt-six-to-five-correction', 'csv-delimiter-correction')
    refresh = spec['id'] == 'csv-to-tsv-source-refresh'
    require(len(applies) == (2 if correction or refresh else 1), 'sequence: exact import apply count required')
    call = applies[-1]
    transfer = transfers[-1] if refresh else transfers[0]
    request_owner(call, workspace, transfer)
    request = call['input']
    require(request.get('target', {}).get('kind') == ('existing' if correction or refresh else 'new') and request['target'].get('type') == 'imports.text'
        and request.get('finish') == 'execute', 'import: new executing import required')
    settled = settled_receipt(calls, call)
    result = settled['result']
    require(result.get('status') == 'SUCCEEDED' and result.get('cleanup_complete') is True, 'import: known success/cleanup required')
    node = result.get('node', {})
    require(node.get('document_id') == workspace['document_id'] and node.get('workflow_id') == workspace['workflow_ref']['workflow_id']
        and node.get('node_id'), 'import: returned node owner differs')
    observed, rows = native_application(events, call, result)
    path = transfer['output']['destination']
    goal = {**spec, 'settings': spec['oracle_recipe'][-1]['parse']['settings']} if refresh else spec
    configuration_matches(goal, observed, path)
    readback = result.get('configuration', {}).get('readback', {})
    require(result.get('configuration', {}).get('status') == 'applied' and readback.get('kind') == 'text_import'
        and readback.get('node') == node and readback.get('values_are') == 'observed_ui_values', 'import: observed readback required')
    configuration_matches(goal, readback, path)
    configurations = request.get('parameters', {}).get('settings', {})
    if refresh and configurations == {'source': {'source_path': path}, 'format': {'delimiter': '\t'}}:
        pass
    else:
        configuration_matches(goal, configurations, path)
    if refresh:
        first = applies[0]
        request_owner(first, workspace, transfers[0])
        require(first['input'].get('target', {}).get('kind') == 'new' and first['input']['target'].get('type') == 'imports.text'
            and first['input'].get('finish') == 'execute', 'sequence: first CSV import required')
        previous = settled_receipt(calls, first)
        initial = previous['result']
        require(initial.get('status') == 'SUCCEEDED' and initial.get('cleanup_complete') is True
            and initial.get('node') == node and request['target'].get('ref') == node, 'sequence: same GUID refresh required')
        require(initial.get('execution', {}).get('execution_id') != result.get('execution', {}).get('execution_id')
            and first['input']['operation_id'] != request['operation_id'] and after(transfers[1]['call'], previous)
            and after(call, transfers[1]['call']), 'sequence: fresh TSV execution after initial full read required')
        before, creation_rows = native_application(events, first, initial)
        configuration_matches(spec, before, transfers[0]['output']['destination'])
        configuration_matches(spec, first['input']['parameters']['settings'], transfers[0]['output']['destination'])
        compare(json.loads((task_dir / spec['oracle_recipe'][0]['expected']).read_text()), typed_table(initial))
        rows = creation_rows
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
    expected = json.loads((task_dir / spec['oracle_recipe'][-1]['expected']).read_text())
    compare(expected, typed_table(result))
    saves = [row for row in calls if row['tool'].endswith('action_run') and row['input'].get('action_key') == 'package.save_checkpoint'
        and after(row, settled) and row['result'].get('status') == 'SUCCEEDED' and row['result'].get('cleanup_complete') is True]
    require(saves and saves[-1]['result'].get('output', {}).get('save_completed') is True
        and saves[-1]['result']['output'].get('workflow_preserved') is True
        and saves[-1]['input'].get('parameters', {}).get('path') == saves[-1]['result']['output'].get('package_ref', {}).get('path')
        and (not package_path or saves[-1]['result']['output']['package_ref']['path'] == package_path), 'graph: final package save required')
    package_graph(attempt_dir, node['node_id'], path, output_guid=result['output']['ports'][0]['port_guid'])


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
        call = next(row for row in calls if row['tool'].endswith('node_apply'))
        terminal = settled_receipt(calls, call)
        report_truth(report_text(attempt_dir, terminal), terminal['result'], [], refusal=True, spec=spec)
        package_graph(attempt_dir, empty=True)
    elif task.get('output_mode') == 'diagnostic':
        diagnostic(spec, task_dir, attempt_dir, calls, native_events(attempt_dir), workspace, transfers)
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
