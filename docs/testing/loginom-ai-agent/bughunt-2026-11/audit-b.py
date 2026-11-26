#!/usr/bin/env python3
"""Audit completed run-check JSONL without changing the runner or product.

Usage: audit-b.py RUN_DIRECTORY --cases CASE_DIRECTORY
Output is local diagnostics; raw arguments can contain private server paths.
Do not commit its output. Create attempts retain their receipt status;
absent native graph evidence is reported as unknown, never guessed.
"""
import argparse
import collections
import json
from pathlib import Path


def objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from objects(child)


def receipt(state):
    value = state.get('output') if state.get('status') == 'completed' else state.get('error')
    if isinstance(value, dict):
        return value
    try:
        return json.JSONDecoder().raw_decode(value or '')[0]
    except (TypeError, ValueError):
        return {}


def audit(path, budget, required_executions=()):
    calls, errors, recoveries, external, forbidden, oracle_access = [], [], [], [], [], []
    signatures = collections.defaultdict(list)
    creates, deletes, graphs, seen = [], [], [], set()
    tool_counts = collections.Counter()
    settled = {}
    operation_types, executed_types = {}, set()
    for line, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        try:
            event = json.loads(raw)
        except ValueError:
            continue
        if event.get('type') != 'tool_use':
            continue
        part = event.get('part', {})
        state = part.get('state', {})
        if state.get('status') not in ['completed', 'error']:
            continue
        identity = part.get('callID') or part.get('id') or ('line', line)
        if identity in seen:
            continue
        seen.add(identity)
        tool, request = part.get('tool', ''), state.get('input', {})
        tool_counts[tool] += 1
        location = f'{path}:{line}'
        entry = dict(location=location, tool=tool, input=request)
        value = receipt(state)
        # Inspect/recovery may quote an earlier failure inside a successful reply.
        # Count the current top-level error once, not that historical outcome.
        error = value.get('error') if isinstance(value, dict) else None
        codes = [error['code']] if isinstance(error, dict) and isinstance(error.get('code'), str) else []
        if codes or state.get('status') == 'error':
            errors.append(dict(entry, codes=codes or ['TOOL_ERROR']))
        if tool.startswith('loginom_'):
            calls.append(entry)
            if tool.endswith('node_apply'):
                operation_types[request.get('operation_id')] = request.get('target', {}).get('type')
            if isinstance(value, dict) and value.get('execution', {}).get('status') == 'completed':
                node_type = operation_types.get(value.get('operation_id'))
                if node_type:
                    executed_types.add(node_type)
            if isinstance(value, dict) and tool.endswith(('node_wait', 'node_apply', 'node_status')) and value.get('status'):
                settled[value.get('operation_id')] = dict(status=value['status'], node=value.get('node'), location=location)
            normalized = {k:v for k,v in request.items() if k != 'operation_id'}
            signatures[json.dumps([tool,normalized], sort_keys=True, ensure_ascii=False)].append(location)
            if 'operation_recover' in tool or 'browser_recovery' in tool:
                recoveries.append(entry)
            if tool.endswith('node_apply') and request.get('target', {}).get('kind') == 'new':
                creates.append(dict(entry, status=value.get('status') if isinstance(value,dict) else None))
            if tool.endswith('node_delete'):
                deletes.append(dict(entry, status=value.get('status') if isinstance(value,dict) else None))
            for obj in objects(value):
                nodes = obj.get('nodes')
                if isinstance(nodes,list) and nodes and all(isinstance(n,dict) and any(k in n for k in ['ref','guid','node_id']) for n in nodes):
                    graphs.append(dict(location=location, count=len(nodes),
                        nodes=[dict(node_id=n.get('node_id'), type=n.get('type'), label=n.get('node_ref',{}).get('node_label')) for n in nodes]))
        elif tool not in ['skill', 'read', 'glob', 'grep', 'list', 'todowrite', 'todoread']:
            external.append(entry)
        serialized = tool + ' ' + json.dumps(request, ensure_ascii=False)
        if any(token in serialized for token in ['expected.json', 'oracle.py']):
            oracle_access.append(entry)
        for token in budget.get('forbid', []):
            if token in serialized:
                forbidden.append(dict(entry, match=token))
    for creation in creates:
        creation['settled'] = settled.get(creation['input'].get('operation_id'))
    confirmed = {c['settled']['node']['node_id']: c['input']['target']['type'] for c in creates
                 if c.get('settled') and isinstance(c['settled'].get('node'), dict) and c['settled']['node'].get('node_id')}
    exceeded = [name for name,value in [('max_tool_calls',len(calls)),('max_errors',len(errors)),('max_nodes',len(confirmed))]
                if name in budget and value>budget[name]]
    missing = sorted(set(required_executions) - executed_types)
    return dict(file=str(path), loginom_calls=len(calls), all_tool_counts=dict(tool_counts),
                error_count=len(errors), errors=errors,
                error_code_counts=dict(collections.Counter(code for error in errors for code in error['codes'])),
                recovery=recoveries, exact_repeats=[v for v in signatures.values() if len(v)>1],
                create_attempts=creates, delete_attempts=deletes, graph_observations=graphs,
                non_loginom_actions=external, forbidden=forbidden, oracle_access=oracle_access,
                confirmed_created_nodes=confirmed,
                budget_exceeded=exceeded, missing_required_executions=missing,
                audit_pass=not (exceeded or forbidden or oracle_access or missing),
                nodes_budget='manual: compare saved native graph and create/delete receipts')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path)
    parser.add_argument('--cases', required=True, type=Path)
    args = parser.parse_args()
    result = []
    for path in sorted(args.run.rglob('model*.stdout')):
        name = next((p.name for p in path.parents if (args.cases/p.name/'case.json').is_file()), None)
        if name is None:
            continue
        config = json.loads((args.cases/name/'case.json').read_text(encoding='utf-8'))
        expected = json.loads((args.cases/name/'expected.json').read_text(encoding='utf-8'))
        required = [n['type'] for n in expected['nodes'] if n['type'] in ['programming.python','programming.javascript']]
        if expected.get('execution_error') or expected.get('refusal'):
            required = []
        result.append(dict(case=name, **audit(path, config.get('budget', {}), required)))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
