#!/usr/bin/env python3
"""Code-only public/native receipt audit. Never executes Loginom or a model."""
import hashlib
import json
import pathlib
import sys

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[1]
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
    else:
        require(False, 'import: native outcome verification unavailable')
    return {'errors': [], 'failures': []}


if __name__ == '__main__':
    try:
        result = audit(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3])
    except (ValueError, KeyError, IndexError, TypeError, OSError) as error:
        result = {'errors': [], 'failures': [str(error)]}
    print(json.dumps(result))
    sys.exit(2 if result['errors'] else 1 if result['failures'] else 0)
