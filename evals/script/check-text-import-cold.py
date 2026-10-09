#!/usr/bin/env python3
"""Verify independent cold reader output; does not launch Loginom."""
import copy
import hashlib
import importlib.util
import json
import pathlib
import sys

sys.dont_write_bytecode = True
module = importlib.util.spec_from_file_location('warm_checker', pathlib.Path(__file__).with_name('check-text-import.py'))
warm = importlib.util.module_from_spec(module)
module.loader.exec_module(warm)


def audit(task, attempt, cold):
    spec = json.loads((task / 'SPEC.json').read_text())
    recipe = spec['oracle_recipe'][-1]
    source = next(item for item in spec['inputs'] if item['path'] == recipe['input'])
    prepared = json.loads((cold / 'preparation.json').read_text())
    saved = json.loads((cold / 'saved.json').read_text())
    report = json.loads((cold / 'result.json').read_text())
    package = (attempt / 'artifact/package.lgp').read_bytes()
    events = (attempt / 'events.jsonl').read_bytes()
    warm.require(prepared.get('case_id') == spec['id'] and prepared.get('package_sha256') == hashlib.sha256(package).hexdigest()
        and prepared.get('events_sha256') == hashlib.sha256(events).hexdigest()
        and prepared.get('cli_sha') == '5cd74d8ee5d6125692d953eb327b4d4f833c27a1', 'cold: exact preparation package/events required')
    checked = warm.audit(task, attempt, saved['path'])
    warm.require(not checked['errors'] and not checked['failures'], 'cold: warm admission failed')
    warm.require(report.get('status') == 'CHECK_VALUES' and report.get('package_path') == saved['path']
        and report.get('graph_verified') is True and report.get('cleanup', {}).get('package_closed') is True
        and report.get('cleanup', {}).get('logged_out') is True, 'cold: saved graph and cleanup required')
    execution = report.get('fresh_execution', {})
    warm.require(execution.get('status') == 'completed' and execution.get('verified') is True
        and execution.get('owner_verified') is True and execution.get('execution_id'), 'cold: fresh owned execution required')
    calls = warm.calls_from(events.decode())
    executions = {call['result'].get('execution', {}).get('execution_id') for call in calls}
    warm.require(execution['execution_id'] not in executions, 'cold: fresh execution differs from warm required')
    raw = (cold / 'source-0.csv').read_bytes()
    proof = report.get('source', {})
    warm.require(len(raw) == source['bytes'] and hashlib.sha256(raw).hexdigest() == source['sha256']
        and proof.get('bytes') == source['bytes'] and proof.get('sha256') == source['sha256']
        and proof.get('bytes_verified') is True and proof.get('download_completion_verified') is True, 'cold: independently downloaded source bytes required')
    configuration = report.get('configuration', {})
    goal = {**spec, 'settings': recipe['parse']['settings']}
    path = configuration.get('source', {}).get('source_path')
    transfers = warm.source_bindings(spec, calls)[1]
    warm.require(path == transfers[-1]['output']['destination'], 'cold: persisted source delivery differs')
    warm.configuration_matches(goal, configuration, path)
    port = copy.deepcopy(report['port'])
    if 'port' not in port and port.get('table', {}).get('port_guid'):
        port.update(port=0, port_guid=port['table']['port_guid'])
    table = warm.typed_table({'execution': execution, 'output': {'status': 'complete', 'execution_id': execution['execution_id'], 'ports': [port]}})
    warm.compare(json.loads((task / recipe['expected']).read_text()), table)
    return {'errors': [], 'failures': []}


if __name__ == '__main__':
    try:
        result = audit(*(pathlib.Path(arg) for arg in sys.argv[1:4]))
    except (ValueError, KeyError, IndexError, TypeError, OSError, warm.decimal.InvalidOperation) as error:
        result = {'errors': [], 'failures': [str(error)]}
    print(json.dumps(result))
    sys.exit(2 if result['errors'] else 1 if result['failures'] else 0)
