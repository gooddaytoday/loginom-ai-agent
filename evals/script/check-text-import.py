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


class ReportClause(str):
    """A proposition retains its source span and enclosing speech scope."""
    def __new__(cls, text, scope=None, start=0, identifiers=()):
        value = super().__new__(cls, text.strip())
        value.scope, value.start = scope, start + len(text) - len(text.lstrip())
        value.identifiers = identifiers
        return value


class ReportFact:
    """A recognized relation, with roles separate from its governing modality."""
    def __init__(self, clause, match, object, predicate, role=None, value=None):
        self.clause, self.span = clause, match.span()
        self.source_span = tuple(clause.start + offset for offset in self.span)
        self.object, self.predicate, self.role, self.value = object, predicate, role, value
        self.polarity = claim_status(clause, *self.span)


def report_normalize(text):
    # Single quotes delimit noun/speech objects, except apostrophes in words.
    text = re.sub(r"(?<!\w)'([^']+)'(?!\w)", r'«\1»', text)
    return re.sub(r'[`*]', '', text).replace('ё', 'е').replace('Ё', 'Е')


def warning_arguments(text, identifiers=()):
    """Read every code object before clause cuts or predicate polarity checks."""
    identifier = r'\w[\w-]*'
    concrete = lambda token: token in identifiers or bool(re.search(r'[_0-9-]', token))
    opening = r'[\s\[(:«»"“”]*'
    def head(cursor, labelled=False):
        wrapped = bool(re.match(r'[\s:]*[\[(«"“]', text[cursor:]))
        cursor += re.match(opening, text[cursor:]).end()
        negative = re.match(r'(?:not|не)\s+', text[cursor:])
        if negative and (child := head(cursor + negative.end(), labelled or wrapped)):
            return child[0], child[1], True
        label = re.match(r'(?:code|с\s+кодом|код(?:ом)?)\b[\s:=]*', text[cursor:])
        if label and (child := head(cursor + label.end(), True)):
            return child
        item = re.match(identifier, text[cursor:])
        separator = re.match(r'(?:and|и)\b', text[cursor:])
        if item and not (separator and not wrapped) and (wrapped or labelled or concrete(item.group())):
            return item.group(), cursor + item.end(), False
        return None
    rows, cursor = [], 0
    while True:
        start = cursor
        item = head(cursor)
        if not item: break
        code, cursor, negative = item
        rows.append({'code':code, 'negative':negative, 'start':start, 'end':cursor})
        sibling = re.match(r'[\s)\]»"”]*(?:,\s*(?:(?:and|и)\s+)?|\b(?:and|и)\b\s*)', text[cursor:])
        if not sibling: break
        cursor += sibling.end()
    return rows


def report_complements(sentence, atoms=()):
    """Speech dependencies precede line cuts and subordinate time frames."""
    quoted = r'«[^»]*»|“[^”]*”|"[^"]*"|\[[^\]]*\]'
    literals = [r'\s+'.join(re.escape(part) for part in atom.split()) for atom in atoms if atom]
    protected = '|'.join([r'[«“"]\s*' + atom + r'\s*[»”"]' for atom in literals] + [quoted] + literals)
    spans = [m.span() for m in re.finditer(protected, sentence)]
    outside = lambda n: not any(left < n < right for left, right in spans)
    governor = (r'(?:я\s+)?не\s+(?:утвержда\w*|подтвержд\w*)'
        r'|(?:нельзя|невозможно)\s+утвержда\w*'
        r'|(?:i\s+)?(?:cannot|can\s+not|do\s+not|don.t)\s+(?:confirm|claim|assert)'
        r'|not\s+confirmed|no\s+evidence|(?:it\s+is\s+)?possible|perhaps|possibly|maybe'
        r'|возможн\w*|вероятн\w*|(?:please\s+)?check|проверь(?:те)?')
    independent = (r'(?:the\s+)?(?:data|text|engine|warnings?|loginom)\b'
        r'|(?:(?:can|cannot|might|could)\s+(?:not\s+)?confirm|confirm|(?:не\s+)?подтвержд\w*|(?:не\s+)?могу\s+подтверд\w*)\b'
        r'|(?:данн\w*|текст\w*|движ\w*|предупрежд\w*|фактически|actually|now|сейчас)\b'
        r'|(?:запрош\w*|получ\w*|requested|observed|found)\b'
        r'|(?:в|на|in|on)\s+(?:\w+\s+){1,4}(?:обнаруж\w*|выяв\w*|наблюд\w*|зафиксир\w*|is|are|was|were|detected|observed|found)\b'
        r'|(?:i|we|я|мы)\b|\w+\s+(?:is|are|was|were|отсутств\w*|присутств\w*)\b')
    rows = []
    prefix = r'(?:^|[;,:.!?\n]\s*|\b(?:but|however|но|однако|and|и)\s+)'
    for match in re.finditer(prefix + r'(?P<governor>' + governor + r')\b', sentence):
        if not outside(match.start('governor')): continue
        link_end = None
        for link in re.finditer(r':|\b(?:that|что|whether)\b', sentence[match.end():]):
            position = match.end() + link.start()
            if position - match.end() > 80: break
            if not outside(position): continue
            boundaries = re.finditer(r'[;.!?]|\b(?:but|however|но|однако)\b', sentence[match.end():position])
            if any(outside(match.end() + boundary.start()) for boundary in boundaries): break
            link_end = match.end() + link.end()
            break
        if link_end is None: continue
        end = len(sentence)
        for boundary in re.finditer(r';|[.!?](?=\s|$)|\b(?:но|однако|but|however)\b', sentence[link_end:]):
            position = link_end + boundary.start()
            if not outside(position): continue
            if boundary.group() in ('но', 'однако', 'but', 'however') and not re.match(independent, sentence[link_end + boundary.end():].lstrip(' ,')):
                continue
            end = position
            break
        rows.append((match.start('governor'), end))
    return rows


def report_regions(sentence, inherited=None, atoms=()):
    """Resolve enclosing scope on the intact utterance before any clause cut."""
    regions = [(0, len(sentence), inherited)]
    protected = r'«[^»]*»|“[^”]*”|"[^"]*"'
    wrapped = ''.join(r'[«“"]\s*' + r'\s+'.join(re.escape(part) for part in atom.split()) + r'\s*[»”"]|' for atom in atoms if atom)
    protected = wrapped + protected
    protected += ''.join('|' + r'\s+'.join(re.escape(part) for part in atom.split()) for atom in atoms if atom)
    quoted = [(m.start(), m.end()) for m in re.finditer(protected, sentence)]
    outside = lambda n: not any(start < n < end for start, end in quoted)
    complements = report_complements(sentence, atoms)
    example = r'(?:в\s+|in\s+(?:(?:the|an?)\s+)?)?(?:пример\w*|образ(?:ец|це)\w*|example|template)\b'
    governing = (example + r'|(?:я\s+)?не\s+(?:утвержда\w*|подтвержд\w*)\b'
        r'|(?:нельзя|невозможно)\s+утвержда\w*\b'
        r'|(?:i\s+)?(?:cannot|can\s+not|do\s+not|don.t)\s+(?:confirm|claim|assert)\b'
        r'|not\s+confirmed\b|no\s+evidence\b')
    for match in re.finditer(r'(?:^|[;,:]\s*)(?P<governor>' + governing + r')[^;:!?]*:', sentence):
        if outside(match.start('governor')):
            end = next((right for left, right in complements if left == match.start('governor')), len(sentence))
            regions.append((match.start('governor'), end, 0))
    regions += [(left, right, 0) for left, right in complements]
    history = (r'(?:ранее|прежде|раньше|исторически|previously|historically'
        r'|в\s+(?:прошл\w*|предыдущ\w*|предшеств\w*)\s+(?:запуск\w*|попытк\w*)'
        r'|in\s+(?:the\s+)?(?:previous|last|prior|earlier)\s+(?:attempt|run))\b')
    for match in re.finditer(r'(?:^|[;]\s*)(?P<history>' + history + ')', sentence):
        if outside(match.start('history')):
            regions.append((match.start('history'), len(sentence), 0))
    # A clearly factual sibling exits a speech/example/attempt scope. A colon
    # complement alone never does. Quoted occurrences cannot exit their scope.
    current = (r'в\s+текущ\w*\s+(?:запуск\w*|попытк\w*|запрос\w*|источник\w*)'
        r'|in\s+(?:the\s+current|this)\s+(?:run|attempt|request|source)')
    for match in re.finditer(r'[,;]\s*(?P<actual>фактически|actually|in\s+fact|сейчас|now|(?:the\s+)?actual\s+(?:result|reason)|фактическ\w*\s+(?:результат|причин\w*)|' + current + r')\b', sentence):
        if outside(match.start('actual')) and not any(left <= match.start('actual') < right for left, right in complements):
            regions.append((match.start('actual'), len(sentence), None))
    return sorted(regions, key=lambda row: row[0])


def report_sentences(text, atoms=(), identifiers=None):
    """Split predicate siblings, never the objects of one predicate.

    Atomic native literals retain surrounding attribution. A colon introducing
    an example governs its next line; independent questions have local scope.
    """
    text = report_normalize(text)
    if identifiers is None:
        identifiers = {token.casefold() for token in re.findall(r'\b\w[\w-]*\b', text) if token.isupper()}
    text = text.casefold()
    text = re.sub(r',\s*(?:однако|however)\s*,', ' ', text)
    # A physical newline is whitespace within a resolved complement. Elsewhere
    # it still separates reports, including a literal reason and a new question.
    complements = report_complements(text, atoms)
    warning_lists = []
    for match in re.finditer(r'\b(?:warn(?:s|ed|ing|ings)?|предупрежд\w*|предупред\w*)\b', text):
        arguments = warning_arguments(text[match.end():], identifiers)
        if len(arguments) > 1: warning_lists.append((match.start(), match.end() + arguments[-1]['end']))
    text = ''.join(' ' if char == '\n' and any(left <= i < right for left, right in complements + warning_lists) else char for i, char in enumerate(text))
    quote = r'«[^»]*»|“[^”]*”|"[^"]*"|\[[^\]]*\]'
    speaker = r'(?:the\s+)?(?:пользователь|оператор|user|operator|someone)'
    saying = r'(?:сказ\w*|сообщ\w*|утвержда\w*|said|claims?|reported)'
    # Resolve the quote plus its attribution as one lexical span before even a
    # physical-line cut. Native literals may contain their own quote characters.
    native_quotes = ''.join(r'|[«“"]\s*' + r'\s+'.join(re.escape(part) for part in atom.split()) + r'\s*[»”"]' for atom in atoms if atom)
    speech_pattern = r'(?:' + quote + native_quotes + r')[\s,;—-]{0,30}(?:' + saying + r'\s+' + speaker + '|' + speaker + r'\s+' + saying + r')\b'
    quoted = speech_pattern + native_quotes + '|' + quote
    quoted += ''.join('|' + r'\s+'.join(re.escape(part) for part in atom.split()) for atom in atoms if atom)
    # Numerical alternatives share an argument unit and must survive comma cuts.
    quoted += r'|\b(?:\d+|два|две|три|четыре|пять|one|two|three|four|five)\b\s*,\s*(?:а|but|and)?\s*(?:не|not)\s+(?:\d+|два|две|три|четыре|пять|one|two|three|four|five)\s+(?:пол\w*|fields?|columns?)\b'
    # A relative emission shares its antecedent warning object. Keep both
    # predicates together; warning_facts resolves their independent polarity.
    quoted += (r'|\b(?:warnings?|предупрежд\w*)\b[^;.!?]{0,100}?\b(?:that|which|котор\w*)\s+'
        r'(?:(?:the\s+)?(?:engine|движ\w*|loginom)\b[^;.!?]{0,45}?\b(?:issu\w*|emit\w*|rais\w*|выда\w*|выдал\w*)\b'
        r'|(?:\w+\s+){0,8}?(?:issu\w*|emit\w*|rais\w*|выда\w*|выдал\w*)\b\s+(?:(?:by|from)\s+(?:the\s+)?(?:engine|loginom)|движ\w*))')
    sentences, start, carry = [], 0, None
    for match in re.finditer(quoted + r'|(?P<cut>(?<=[.!?])\s+|\n+)', text):
        if match.group('cut') is not None:
            part = ReportClause(text[start:match.start()], carry, start)
            if part:
                sentences.append((part, part.start, carry))
                carry = report_regions(part, atoms=atoms)[-1][2] if part.endswith(':') else None
            start = match.end()
    if text[start:].strip():
        part = ReportClause(text[start:], carry, start)
        sentences.append((part, part.start, carry))
    rows = []
    for sentence, origin, scope in sentences:
        if re.match(r'^(?:пример|образец|example|template|предполож\w*|допустим|task)\b'
            r'|^(?:оператор|пользователь|someone|operator|user)\b.{0,20}'
            r'\b(?:утвержда\w*|сказ\w*|предполож\w*|claims?|said|suggest\w*)\b', sentence):
            if not re.match(r'^task\s+(?:(?:does|do)\s+not\s+)?(?:specifi\w*|requir\w*|contain\w*)\b', sentence):
                scope = 0
        if re.match(r'^(?:ранее|прежде|раньше|исторически|previously|historically|в\s+(?:прошл\w*|предыдущ\w*)\s+(?:запуск\w*|попытк\w*))\b', sentence):
            scope = 0
        if re.match(r'^(?:ложн\w*|неверно|false)\s+(?:is\s+)?(?:the\s+)?(?:утвержден\w*|claim)\b', sentence):
            scope = -1
        if re.match(r'^не\s+соответств\w*\s+действительности\s+утвержден\w*\b', sentence):
            scope = -1
        # A following speaker governs the quoted object, not another current
        # proposition beside it. Split outside spans before local predicates.
        speech = list(re.finditer(speech_pattern, sentence))
        if scope is None and speech:
            cursor = 0
            for match in speech:
                for part in report_sentences(sentence[cursor:match.start()], atoms, identifiers):
                    rows.append(ReportClause(part, part.scope, origin + cursor + part.start, identifiers))
                rows.append(ReportClause(match.group(), 0, origin + match.start(), identifiers))
                cursor = match.end()
            for part in report_sentences(sentence[cursor:], atoms, identifiers):
                rows.append(ReportClause(part, part.scope, origin + cursor + part.start, identifiers))
            continue
        regions = report_regions(sentence, scope, atoms)
        def scope_at(position):
            return next(value for start, end, value in reversed(regions) if start <= position <= end)
        independent = (r'(?:данн\w*|текст\w*|причин\w*|предупрежд\w*|нужн\w*|data|text|cause|warnings?'
            r'|движ\w*|engine|it\s+(?:did|does|has|was)|the\s+engine|фактически|actually|now|сейчас)\b')
        count_number = r'\d+|one|single|two|both|three|four|five|одно|один|одна|два|две|оба|двух|три|трех|четыре|пять'
        count_verbs = r'specifi\w*|requir\w*|contain\w*|has|have|exist\w*|present|указа\w*|зада\w*|задан\w*|содерж\w*|име\w*|присутств\w*|есть'
        count_head = (rf'(?:(?:not|не)\s+)?(?:{count_number})\b|(?:the\s+)?(?:task|source|задани\w*|источник\w*)\b'
            rf'|(?:in|в)\s+(?:the\s+)?(?:task|source|задани\w*|источник\w*)\b'
            rf'|(?:(?:does|do)\s+not\s+|не\s+)?(?:{count_verbs}|requested|required|observed|found|запрош\w*|получ\w*)\b\s+(?:(?:not|не)\s+)?(?:{count_number})\b')
        cuts = quoted + (r'|(?P<cut>;\s*|\s*[,—]?\s*\b(?:но|однако|but|however|although|хотя)\b[\s,]+'
            r'|\s+\b(?:and|и)\b\s+(?=' + count_head + ')'
            r'|,\s*(?:а|и|and)\s+|\s+(?:that|что)\s+(?=(?:the\s+)?(?:engine|движ\w*)\b)|[,?:]\s+(?=' + independent + r')'
            r'|\s+\b(?:и|and)\b\s+(?=(?:не\b|нет\b|no\b|not\b|did\b|does\b|never\b)'
            r'|[^;,.!?]{0,50}\b(?:поврежд\w*|искаж\w*|подтвержд\w*|неизвест\w*|отсутств\w*|повторя\w*'
            r'|выда\w*|выдал\w*|предупрежд\w*|warned|issued|emitted|raised|corrupt\w*|damag\w*|unconfirmed|unknown|absent)\b))')
        # Scope boundaries were resolved on the intact utterance. They drive
        # cuts even when a factual sibling uses a different introductory noun.
        protected = [(match.start(), match.end()) for match in re.finditer(quoted, sentence)]
        warning_lists = []
        for match in re.finditer(r'\b(?:warn(?:s|ed|ing|ings)?|предупрежд\w*|предупред\w*)\b', sentence):
            arguments = warning_arguments(sentence[match.end():], identifiers)
            if len(arguments) > 1: warning_lists.append((match.start(), match.end() + arguments[-1]['end']))
        boundaries = [(match.start(), match.end()) for match in re.finditer(cuts, sentence) if match.group('cut') is not None
            and not any(left < match.start() < right for left, right in warning_lists)]
        boundaries += [(position, position) for position, _, _ in regions if position and not any(left < position < right for left, right in protected)]
        start, role, field_role, inherited_role = 0, None, False, False
        def append(left, right):
            nonlocal role, field_role
            part = sentence[left:right]
            position = left + len(part) - len(part.lstrip())
            clause = ReportClause(part, scope_at(position), origin + left, identifiers)
            markers = list(re.finditer(r'\b(?P<marker>запрош\w*|ожида\w*|requested|required|expected|получ\w*|обнаруж\w*|наблюда\w*|observed|found)\b[^;,.!?]{0,40}?\b(?:пол\w*|колон\w*|столб\w*|fields?|columns?)\b', clause))
            explicit = markers[-1] if markers else None
            relation = report_count_relation(clause, field_role)
            if relation:
                clause.count_context = field_role
                role, field_role = relation[0], True
            elif explicit:
                role = 'requested' if re.match(r'запрош|ожида|requested|required|expected', explicit['marker']) else 'observed'
                field_role = True
            elif foreign := re.match(rf'(?P<marker>запрош\w*|ожида\w*|requested|required|expected|получ\w*|обнаруж\w*|наблюда\w*|observed|found)\s+(?:{count_number})\b\s+(?:строк\w*|rows?|файл\w*|files?)\b', clause):
                role = 'requested' if re.match(r'запрош|ожида|requested|required|expected', foreign['marker']) else 'observed'
                field_role = False
            elif inherited_role and role and (shared := re.match(rf'(?:(?:does|do)\s+not\s+|не\s+)?(?P<marker>{count_verbs})\b\s+(?:(?:not|не)\s+)?(?:{count_number})\b', clause)):
                clause.count_role, clause.count_marker = role, shared.span('marker')
                clause.count_field_context = field_role
            elif inherited_role and role and re.match(r'(?:(?:не|not)\s+)?(?:\d+|one|two|three|four|five|одно|один|два|две|три|четыре|пять)\b', clause):
                clause.count_role = role
                clause.count_field_context = field_role
            else:
                role, field_role = None, False
            if role and (quantity_unit := re.search(rf'\b(?:{count_number})\b\s+(?P<unit>пол\w*|колон\w*|столб\w*|fields?|columns?|строк\w*|rows?|файл\w*|files?)\b', clause)):
                field_role = bool(re.fullmatch(r'пол\w*|колон\w*|столб\w*|fields?|columns?', quantity_unit['unit']))
            rows.append(clause)
        for left, right in sorted(set(boundaries)):
            if left < start: continue
            if re.fullmatch(r'(?:возможно|вероятно|может быть|perhaps|possibly|probably|maybe)\s*', sentence[start:left].strip()):
                continue
            if sentence[start:left].strip():
                append(start, left)
            inherited_role = bool(re.search(r'\b(?:но|однако|but|however|and|и)\b', sentence[left:right]))
            start = right
        if sentence[start:].strip():
            append(start, len(sentence))
    return rows


def claim_status(clause, start, end):
    """+1 asserted, -1 negated, 0 directive/example/question/hypothesis.

    A candidate span already identifies its predicate: e.g. absent(columns) and
    not-supplied(columns) are both absence facts. Only operators governing that
    span negate it; negation inside a negative presence predicate is not applied
    twice. Contrast siblings have independent scope in report_sentences.
    """
    if getattr(clause, 'scope', None) is not None:
        return clause.scope
    prefixes, suffixes = report_sentences(clause[:start]), report_sentences(clause[end:])
    prefix = prefixes[-1] if prefixes else ''
    suffix = suffixes[0] if suffixes else ''
    # Full native-error witnesses may span multiple clauses. Their original
    # report prefix has the same retained governor as a parsed proposition.
    if getattr(prefix, 'scope', None) is not None:
        return prefix.scope
    tail = re.sub(r'^[\s,«»"“”():—-]+', '', suffix)
    warning_topic = re.search(r'\b(?:warn(?:s|ed|ing|ings)?|предупрежд\w*|предупред\w*)\b', clause[start:end])
    if warning_topic and re.search(r'\b(?:не\s+обязател\w*|not\s+required)\b', tail):
        return 0
    if clause.rstrip(' «»"“”').endswith('?'):
        return 0
    if re.search(r'\b(?:пример|примере|образец|образце|example|template|предполож\w*|допустим|task|whether)\b'
        r'|\b(?:проверь(?:те)?|проверяй(?:те)?|сообщ(?:и(?:те)?|ай(?:те)?)|утверждай(?:те)?|напиши(?:те)?|замените)\b'
        r'|\b(?:please\s+)?(?:report|check|write|say|replace|invent|fabricate)\b(?=\s+(?:that|whether|the|it|data|an?|native|engine))'
        r'|\b(?:не\s+)?выдум\w*\b'
        r'|\b(?:оператор|пользователь|someone|operator|user)\b.{0,20}\b(?:утвержда\w*|сказ\w*|предполож\w*|claims?|said|suggest\w*)\b', prefix):
        return 0
    if re.search(r'\b(?:нельзя|невозможно|неверно|ложн\w*|false|отрица\w*)\b'
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


def bound_report_facts(sentence, objects, predicates):
    """A predicate and its subject/object must be in the same noun relation.

    The intervening grammar may qualify that noun or carry its auxiliary. It
    cannot introduce a different noun/predicate, so a nearby connection error
    cannot become an absent column or a duplicated source name.
    """
    gap = (r'(?:[\s,:—«»"“”-]+(?:исходн\w*|входн\w*|первоначальн\w*|исходник\w*|source|original|the'
        r'|намеренно|intentionally|deliberately|обязательн\w*|required'
        r'|был\w*|явля\w*|are|is|was|were|been|have|has|still|также|уже|пока|еще'
        r'|в\s+(?:(?:первоначальн\w*|исходн\w*)\s+)?(?:запрос\w*|источник\w*|настройк\w*)'
        r'|источника|among\s+(?:the\s+)?source\s+fields?))*[\s,:—«»"“”-]*')
    for pattern in [rf'(?:{objects}){gap}(?:{predicates})', rf'(?:{predicates}){gap}(?:{objects})']:
        for match in re.finditer(pattern, sentence):
            if claim_asserted(sentence, match.start(), match.end()):
                yield match


def report_name_role(clause, match):
    """Only this naming noun's own modifiers can determine its object role."""
    phrase = re.sub(r'«[^»]*»|“[^”]*”|"[^"]*"', '', match.group())
    if re.search(r'\b(?:источник\w*|исходн\w*|входн\w*|source|original)\b', phrase): return 'source'
    if re.search(r'\b(?:выходн\w*|output)\b', phrase): return 'output'
    adjacent = re.search(r'\b(?P<modifiers>(?:(?:выходн\w*|output|запрошенн\w*|requested|исходн\w*|входн\w*|source|original)\s+)+)$', clause[:match.start()])
    modifiers = adjacent['modifiers'].split() if adjacent else []
    return 'output' if modifiers and re.match(r'выход|output|запрошенн|requested', modifiers[-1]) else 'source'


def refusal_witness(sentences, reason, spec):
    """Ground the observed reason in object-, role- and unit-bound facts."""
    columns = spec.get('columns', []) if spec else []
    fields = r'\b(?:columns?|fields?|пол\w*|колон\w*|столб\w*)\b'
    names_topic = (r'\b(?:имена(?:\s+исходн\w*)?(?:\s+пол\w*)?(?:\s+источника)?|заголов\w*|(?<![\w.])(?:source\.)?headers?'
        r'|(?:source\s+)?(?:column|field)\s+names?|names?\s+of\s+(?:the\s+)?(?:source\s+)?(?:columns?|fields?))\b')
    absence = (r'\b(?:отсутств\w*|пропущ\w*|опущ\w*|нет|без|missing|absent|omitted|lacks?|without)\b'
        r'|\bне\s+(?:переда\w*|зада\w*|указа\w*|определ\w*)\b'
        r'|\b(?:not|never)\s+(?:supplied|provided|defined|specified|given)\b|\bno\b')
    if 'duplicate source column names' in reason:
        duplicate = r'\b(?:дублир\w*|дубл\w*|повторя\w*|одинаков\w*|совпада\w*|duplicat\w*|identical|same)\b'
        for sentence in sentences:
            if any(report_name_role(sentence, match) == 'source' for match in bound_report_facts(sentence, names_topic + r'(?:\s+[«\"“][^»\"”]+[»\"”](?:\s+(?:и|and)\s+[«\"“][^»\"”]+[»\"”])*)?', duplicate)):
                return True
            # Quantification is bound to actual source columns and their native
            # name, rather than to a repeated error elsewhere in the sentence.
            for name in {str(c.get('source_name', c.get('name', ''))).casefold() for c in columns} - {''}:
                for pattern in [
                    r'\b(?:both|two|2|оба|обе|два|две)\s+(?:source\s+|исходн\w*\s+)?' + fields + r'.{0,20}(?:named|имен\w*|заголов\w*).{0,10}\b' + re.escape(name) + r'\b',
                    r'\b(?:одн\w*|общ\w*|same)\s+(?:имен\w*|name)\b\s*' + re.escape(name) + r'\b',
                    re.escape(name) + r'\s+(?:дважды|twice)\b',
                ]:
                    for match in re.finditer(pattern, sentence):
                        if claim_asserted(sentence, match.start(), match.end()):
                            return True
        return False
    if ('initial' in reason or 'require' in reason) and 'columns' in reason:
        objects = r'(?<![\w.])(?:(?:(?:parameters\.)?settings\.)?columns?|колон\w*|определен\w*(?:\s+колон\w*)?|(?:column\s+)?definitions?)\b'
        return any(any(bound_report_facts(sentence, objects, absence)) for sentence in sentences)
    if 'missing or ambiguous' in reason:
        names = re.findall(r'"([^"]+)"', reason)
        return bool(names) and any(any(bound_report_facts(sentence, r'(?<![\w.])(?:source\.)?' + re.escape(names[0]) + r'\b',
            absence + r'|\b(?:неоднознач\w*|ambiguous)\b')) for sentence in sentences)
    counts = re.search(r'requested (\d+), observed (\d+)', reason)
    if not counts:
        return False
    requested, observed = map(int, counts.groups())
    numerals = {1: r'од(?:ин|на|но|ного|ному|ной)|единственн\w*|one|single',
                2: r'дв[ае]|двух|двум\w*|об[ае]|обоих|two|both',
                3: r'три|трех|three', 4: r'четыре|четырех|four', 5: r'пять|пяти|five'}
    number = lambda n: rf'\b(?:{n}|{numerals.get(n, str(n))})\b'
    required, actual = number(requested), number(observed)
    field_unit = r'(?:исходн\w*\s+|source\s+)?' + fields
    # A number followed by another explicit noun is not an elliptical field
    # count. A missing unit can inherit a field topic only within this relation.
    quantity = lambda n: n + rf'(?:\s+{field_unit}|(?=\s*[,.;:!?—-]|\s+(?:вместо|instead|rather|поэтому)\b|\s*$))'
    requested_seen, observed_seen, field_context = False, False, False
    for sentence in sentences:
        topic = bool(re.search(fields, sentence))
        for match in re.finditer(quantity(actual) + r'\s+\b(?:вместо|instead\s+of|rather\s+than)\b\s+' + quantity(required), sentence):
            if (topic or field_context) and claim_asserted(sentence, match.start(), match.end()):
                return True
        req = re.search(r'\b(?:запрош\w*|ожида\w*|requested|required|expected)\b', sentence)
        if req and claim_asserted(sentence, req.start(), req.end()):
            names = [str(column.get('name', '')).casefold() for column in columns]
            named = len(names) == requested and bool(names) and all(re.search(r'\b' + re.escape(name) + r'\b', sentence) for name in names)
            # Named-column ellipsis is useful only without an explicit numeric
            # quantity. A contradictory number/unit cannot be overruled by names.
            explicit = re.search(r'\b(?:\d+|' + '|'.join(numerals.values()) + r')\b', sentence)
            requested_seen |= bool(re.search(required + r'\s+' + field_unit, sentence) or named and not explicit)
            field_context |= requested_seen
        obs = re.search(r'\b(?:обнаруж\w*|наблюда\w*|получ\w*|оказал\w*|есть|только|observed|found|only|single|единственн\w*)\b', sentence)
        if obs and claim_asserted(sentence, obs.start(), obs.end()):
            observed_seen |= bool(re.search(actual + r'\s+' + field_unit, sentence)
                or (topic or field_context) and re.search(quantity(actual), sentence))
    return requested_seen and observed_seen


def report_count_relation(clause, field_context=False):
    """An explicit finite TASK/source predicate outranks quantitative ellipsis."""
    number = r'\d+|one|single|two|both|three|four|five|одно|один|одна|два|две|оба|двух|три|трех|четыре|пять'
    unit = r'(?:исходн\w*\s+|source\s+)?(?:пол\w*|колон\w*|столб\w*|fields?|columns?)'
    if not field_context and not re.search(r'\b' + unit + r'\b', clause): return None
    quantity = rf'(?P<neg_before>(?:not|не)\s+)?(?P<n>{number})\b(?:\s+(?P<unit>{unit})\b)'
    for role, object, verb in [
        ('requested', r'(?:(?:the\s+)?task|задани\w*)', r'specifi\w*|requir\w*|указа\w*|зада\w*|задан\w*|содерж\w*'),
        ('observed', r'(?:(?:the\s+)?source|источник\w*)', r'exist\w*|present|contain\w*|has|have|име\w*|присутств\w*|содерж\w*|есть'),
    ]:
        # The unit may be omitted only in a field-count continuation. It cannot
        # consume a different explicit noun such as files/rows.
        active_quantity = quantity + (r'?' if field_context else '')
        patterns = [
            rf'\b{active_quantity}\s+(?:(?:is|are|was|were)\s+)?(?P<neg_after>(?:not|не)\s+)?(?:{verb})\b\s+(?:in|by|в)\s+{object}\b',
            rf'\b{object}\s+(?P<neg_after>(?:does\s+not|do\s+not|не)\s+)?(?:{verb})\b\s+{active_quantity}(?=\s*[.!?]*\s*$)',
            rf'\b(?:in|в)\s+{object}\s+(?P<neg_after>(?:not|не)\s+)?(?:{verb})\b\s+{active_quantity}(?=\s*[.!?]*\s*$)',
        ]
        for pattern in patterns:
            match = re.search(pattern, clause)
            if match: return role, match
    return None


def refusal_explained(sentences, reason, spec):
    """All recognized current relevant facts must agree with the native reason.

    Existential witnesses are insufficient in the presence of a contradictory
    total, object presence or duplicate relation. Scope/polarity belong to each
    proposition, while total/subset and source/output are object roles.
    """
    facts = []
    columns = spec.get('columns', []) if spec else []
    duplicate = 'duplicate source column names' in reason
    initial = ('initial' in reason or 'require' in reason) and 'columns' in reason
    missing = re.findall(r'"([^"]+)"', reason) if 'missing or ambiguous' in reason else []
    counts = re.search(r'requested (\d+), observed (\d+)', reason)
    absent = r'не\s+(?:присутств\w*|найден\w*)|not\s+(?:present|found)|отсутств\w*|пропущ\w*|опущ\w*|нет|missing|absent|omitted|not\s+(?:supplied|provided|defined|specified)|не\s+(?:переда\w*|зада\w*|указа\w*|определ\w*)'
    present = r'присутств\w*|есть|найден\w*|переда\w*|зад[ао]\w*|указа\w*|present|exists?|found|supplied|provided'
    gap = r'[\s,:—«»"“”-]*(?:(?:исходн\w*|входн\w*|источника|обязательн\w*|намеренно|пол\w*|свойств\w*|the|source|field|is|was|were|are|been|был\w*)[\s,:—«»"“”-]+)*'
    for clause in sentences:
        if duplicate:
            topic = r'\b(?:имена(?:\s+исходн\w*)?(?:\s+пол\w*)?(?:\s+источника)?|заголов\w*|(?<![\w.])(?:source\.)?headers?|(?:source\s+)?(?:field|column)\s+names?)\b'
            objects = topic + r'(?:\s+[«"“][^»"”]+[»"”](?:\s+(?:и|and)\s+[«"“][^»"”]+[»"”])*)?'
            for predicate, value in [(r'повторя\w*|дублир\w*|дубл\w*|одинаков\w*|совпада\w*|duplicat\w*|identical|same', True),
                                     (r'различ\w*|разн\w*|different|distinct|unique|уникальн\w*', False)]:
                for match in re.finditer(rf'(?:{objects}){gap}(?:не\s+|not\s+)?(?:{predicate})', clause):
                    role = report_name_role(clause, match)
                    actual_names = [str(column.get('name', '') if role == 'output' else column.get('source_name', column.get('name', ''))).casefold() for column in columns]
                    expected_duplicate = len(set(actual_names)) < len(actual_names)
                    fact = ReportFact(clause, match, role + '.headers', 'duplicate', value=value == expected_duplicate)
                    named = re.findall(r'[«"“]([^»"”]+)[»"”]', match.group())
                    if named and not all(name in actual_names for name in named):
                        facts.append(ReportFact(clause, match, role + '.headers', 'named_members', value=False))
                    # The predicate span includes a local negative auxiliary.
                    negative = bool(re.search(r'\b(?:не|not)\s+(?:' + predicate + ')', match.group()))
                    if negative: fact.value = not fact.value
                    facts.append(fact)
        if initial or missing:
            obj = r'(?<![\w.])(?:(?:(?:parameters\.)?settings\.)?columns?|определен\w*(?:\s+колон\w*)?|колон\w*|(?:column\s+)?definitions?)\b' if initial else r'(?<![\w.])(?:source\.)?' + re.escape(missing[0]) + r'\b'
            # Absence is one predicate, including its intrinsic negation. Do not
            # reinterpret its internal "provided" as a second presence claim.
            occupied = []
            for predicate, value in [(absent, True), (present, False)]:
                for pattern in [rf'(?:{obj}){gap}(?:{predicate})\b', rf'\b(?:{predicate}){gap}(?:{obj})']:
                    for match in re.finditer(pattern, clause):
                        if any(match.start() < end and match.end() > start for start, end in occupied):
                            continue
                        occupied.append(match.span())
                        facts.append(ReportFact(clause, match, 'settings.columns' if initial else 'source.' + missing[0], 'absent', value=value))
        if counts:
            expected = dict(zip(['requested', 'observed'], map(int, counts.groups())))
            numbers = {'one':1,'single':1,'одно':1,'один':1,'одна':1,'единственное':1,'two':2,'both':2,'два':2,'две':2,'оба':2,'двух':2,'three':3,'три':3,'трех':3,'four':4,'четыре':4,'five':5,'пять':5}
            number = r'\d+|' + '|'.join(numbers)
            unit = r'пол\w*|колон\w*|столб\w*|columns?|fields?|строк\w*|rows?|файл\w*|files?'
            markers = r'запрош\w*|ожида\w*|requested|required|expected|получ\w*|обнаруж\w*|наблюда\w*|observed|found'
            marker_rows = list(re.finditer(rf'\b(?P<marker>{markers})\b', clause))
            if not marker_rows and hasattr(clause, 'count_marker'):
                marker_rows = [match for match in re.finditer(r'(?P<marker>\w+)', clause) if match.span() == clause.count_marker]
            relation = report_count_relation(clause, getattr(clause, 'count_context', False))
            if relation: marker_rows = [relation[1]]
            elided = not marker_rows and getattr(clause, 'count_role', None)
            if elided: marker_rows = [re.match(r'(?P<marker>)', clause)]
            for marker in marker_rows:
                tail = clause[marker.end():]
                quantity = relation[1] if relation else re.match(rf'\s*(?:(?:всего|только|only|total)\s+)?(?P<neg>не\s+|not\s+)?(?P<n>{number})\b(?P<alternative>\s*,\s*(?:а|but|and)?\s*(?:не|not)\s+(?P<other>{number})\b)?\s+(?:исходн\w*\s+|source\s+)?(?P<unit>{unit})\b', tail)
                if not quantity and elided and getattr(clause, 'count_field_context', True):
                    quantity = re.match(rf'\s*(?P<neg>не\s+|not\s+)?(?P<n>{number})\b(?P<alternative>)(?P<other>)(?P<unit>)(?=\s*[.!?]*\s*$)', tail)
                if not quantity: continue
                if (elided or relation) and not quantity['unit']:
                    field_unit = True
                else:
                    field_unit = bool(re.fullmatch(r'(?:исходн\w*\s+|source\s+)?(?:пол\w*|колон\w*|столб\w*|columns?|fields?)', quantity['unit']))
                if not field_unit: continue
                role = relation[0] if relation else (getattr(clause, 'count_role', None) or ('requested' if re.match(r'запрош|ожида|requested|required|expected', marker['marker']) else 'observed'))
                raw = quantity['n'];n = int(raw) if raw.isdigit() else numbers[raw]
                negative = bool(quantity['neg_before'] or quantity['neg_after']) if relation else bool(quantity['neg'])
                fact = ReportFact(clause, quantity if elided else marker, 'source.fields', 'excluded_total' if negative else 'total', role=role, value=(n != expected[role] if negative else n == expected[role]))
                fact.quantity, fact.unit = n, 'fields'
                facts.append(fact)
                if not relation and quantity['other']:
                    raw = quantity['other'];n = int(raw) if raw.isdigit() else numbers[raw]
                    facts.append(ReportFact(clause, marker, 'source.fields', 'alternative_total', role=role, value=n != expected[role]))
    literal = r'\s+'.join(re.escape(part) for part in reason.split())
    relevant = [fact for fact in facts if fact.polarity and not any(
        match.start() <= fact.span[0] and fact.span[1] <= match.end()
        for match in re.finditer(literal, fact.clause))]
    require(all(fact.value if fact.polarity == 1 else not fact.value for fact in relevant),
        'diagnostic: report contradicts observed refusal facts')
    if counts:
        roles = {fact.role for fact in relevant if fact.polarity == 1 and fact.value and fact.predicate == 'total'}
        if roles == {'requested', 'observed'}: return True
        safe = []
        for clause in sentences:
            # A quantity argument and a prepositional source context can carry
            # field counts. A different direct noun argument cannot donate its
            # child's field count to the observed-total predicate.
            foreign = False
            for marker in re.finditer(r'\b(?:получ\w*|observed|found|received)\b', clause):
                tail = clause[marker.end():]
                if not re.match(rf'\s*(?:(?:всего|только|only|total)\s+)?(?:не\s+|not\s+)?(?:{number})\b|\s*(?:в|из|после|in|after|from)\b', tail):
                    foreign = True
            if not foreign: safe.append(clause)
        return refusal_witness(safe, reason, spec)
    return any(fact.value and fact.polarity == 1 and fact.object != 'output.headers' for fact in relevant) if (initial or missing or duplicate) and relevant else refusal_witness(sentences, reason, spec)


def warning_facts(clause):
    """Resolve emitter and concrete code arguments before looking at evidence."""
    identifier = r'\w[\w-]*'
    lexical_ids = getattr(clause, 'identifiers', ())
    concrete = lambda token: token in lexical_ids or bool(re.search(r'[_0-9-]', token))
    topic = r'warn(?:s|ed|ing|ings)?|предупрежд\w*|предупред\w*'
    markers = list(re.finditer(rf'\b(?:{topic})\b', clause))
    if not markers:
        emitted = re.search(r'\b(?:issu\w*|emit\w*|rais\w*|выда\w*|выдал\w*)\b', clause)
        if emitted:
            markers = [match for match in re.compile(rf'\b{identifier}\b').finditer(clause, emitted.end()) if concrete(match.group())][:1]
    for index, match in enumerate(markers):
        left = clause[:match.start()]
        right = clause[match.end():markers[index+1].start() if index+1 < len(markers) else len(clause)]
        own = re.search(r'\b(?:я|мы|i|we)\b', left)
        engine = r'(?:the\s+)?(?:engine|движ\w*|loginom)\b'
        native = re.search(r'\b' + engine + r'[^;,.!?]{0,60}\b(?:issu\w*|emit\w*|rais\w*|выда\w*|выдал\w*|warn\w*|предупред\w*)\b', clause)
        native = native or re.search(r'\b(?:by|from|от|выдан\w*)\s+' + engine, clause)
        receiving = re.search(r'\b(?:receiv\w*|вижу|получ\w*|наблюдаю)\b', left)
        relative = re.search(r'\b(?:that|which|котор\w*)\s+(?P<emission>' + engine + r'[^;.!?]*?\b(?:issu\w*|emit\w*|rais\w*|выда\w*|выдал\w*)\b)', right)
        relative = relative or re.search(r'\b(?:that|which|котор\w*)\s+(?P<emission>(?:\w+\s+){0,8}?(?:issu\w*|emit\w*|rais\w*|выда\w*|выдал\w*)\b\s+(?:(?:by|from)\s+' + engine + r'|движ\w*\b))', right)
        if own and not native and not relative: continue
        if receiving and re.search(r'\b(?:not|never|не)\b', left) and not relative: continue
        fact = ReportFact(clause, match, 'warning', 'emitted', role='engine' if native or relative else 'unspecified')
        if relative:
            # Negating reception does not negate this engine predicate. The
            # enclosing speech scope still governs the whole relative claim.
            emission = ReportClause(relative['emission'], clause.scope, clause.start + match.end() + relative.start('emission'), lexical_ids)
            verb = re.search(r'\b(?:issu\w*|emit\w*|rais\w*|выда\w*|выдал\w*)\b', emission)
            fact.polarity = claim_status(emission, verb.start(), verb.end())
            right = right[:relative.start()]
        # Prenominal code: "the CODE warning" binds the same warning object.
        previous = re.search(rf'\b({identifier})\s*$', left)
        implicit = not re.fullmatch(topic, match.group())
        arguments = warning_arguments(match.group() + right if implicit else right, lexical_ids)
        if arguments:
            offset = match.start() if implicit else match.end()
            start, end = offset + arguments[0]['start'], offset + arguments[-1]['end']
            context = ReportClause(clause[:start] + ' ' * (end-start) + clause[end:], clause.scope, clause.start, lexical_ids)
            polarity = fact.polarity if relative else claim_status(context, match.start(), match.end())
            for argument in arguments:
                own_fact = ReportFact(context, match, 'warning', 'emitted', role=fact.role, value=[argument['code']])
                own_fact.clause = clause
                own_fact.polarity = 0 if not polarity else (-1 if argument['negative'] else polarity)
                yield own_fact
            continue
        # An explicit postnominal object resolves the code; a preceding uppercase
        # format/channel adjective is then a modifier, not a second identity.
        fact.value = [previous[1]] if previous and concrete(previous[1]) else []
        yield fact


def report_truth(text, result, events, refusal=False, spec=None):
    """Ground local report propositions in the already verified operation."""
    reason = report_normalize((result.get('error') or {}).get('message', '')).casefold()
    sentences = report_sentences(text, [reason] if refusal else [])
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
    # Only structured code identity proves emission of that ID. Message text is
    # descriptive content and cannot mint another emitted warning.
    warning_codes = {str(warning['code']).casefold() for warning in warnings
        if isinstance(warning, dict) and isinstance(warning.get('code'), str)}
    for sentence in sentences:
        for fact in warning_facts(sentence):
            if not fact.polarity:
                continue
            present = [code in warning_codes for code in fact.value]
            if fact.polarity == -1:
                require(not any(present) if fact.value else not warnings, 'diagnostic: report denies verified native warning')
            else:
                require(all(present) if fact.value else bool(warnings), 'diagnostic: report warning lacks native evidence')
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
    literal = re.sub(r'\s+', ' ', re.sub(r'[`*]', '', reason))
    grounded = bool(literal) and any(claim_asserted(sentence, match.start(), match.end())
        for sentence in sentences for match in re.finditer(r'\s+'.join(re.escape(part) for part in literal.split()), sentence))
    # Validate contradictions even when a complete literal already witnesses
    # the true reason. It cannot excuse another false current assertion.
    explained = refusal_explained(sentences, reason, spec)
    require(grounded or explained, 'diagnostic: report must explain the observed refusal reason')


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
        sentence = ReportClause(re.sub(r'\b(?:но|однако|but|however|although|хотя)\b', ' ', sentence), sentence.scope)
        # Do not discard introductory speech acts at a comma/colon. Assertion
        # classification needs both sides of its candidate span.
        clauses = [sentence]
        for clause in clauses:
            clause = ReportClause(re.sub(r'\s+', ' ', re.sub(r'[,«»"“”]', ' ', clause)), clause.scope)
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
