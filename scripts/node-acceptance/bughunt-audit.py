#!/usr/bin/env python3
"""Audit run-check model journals and optional per-stage action budgets (Python 3.9+)."""

import argparse
from collections import Counter
import json
import math
from pathlib import Path
import sys


FAILED = {'FAILED', 'NOT_APPLIED', 'AMBIGUOUS', 'REJECTED'}
RECOVERY = ('operation_recover', 'browser_recovery', 'operation_inspect')


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def object_value(value, location):
    if not isinstance(value, dict):
        raise ValueError(f'{location}: expected JSON object')
    return value


def load_json(text):
    def invalid(value):
        raise ValueError(f'invalid JSON number: {value}')
    return json.loads(text, parse_constant=invalid)


def add_numbers(target, values, location):
    """Preserve all numeric token dimensions, including nested cache counters."""
    for key, value in object_value(values, location).items():
        if isinstance(value, dict):
            if key in target and not isinstance(target[key], dict):
                raise ValueError(f'{location}: incompatible counter {key}')
            add_numbers(target.setdefault(key, {}), value, location)
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError(f'{location}: invalid numeric counter {key}')
        if isinstance(target.get(key), dict):
            raise ValueError(f'{location}: incompatible counter {key}')
        target[key] = target.get(key, 0) + value


def delivery_paths(value, delivery=False):
    """Only delivery receipts, never arbitrary port samples or readback paths."""
    if isinstance(value, list):
        for item in value:
            yield from delivery_paths(item, delivery)
    if isinstance(value, dict):
        if value.get('upload_completion_verified') is True and isinstance(value.get('destination'), str):
            yield value['destination']
        for key, item in value.items():
            if delivery and key in {'destination', 'path', 'file_path', 'filePath'} and isinstance(item, str):
                yield item
            yield from delivery_paths(item, delivery or key in {'file_artifacts', 'delivered', 'delivery', 'artifact'})


def stage_budget(cases, stage):
    if cases is None:
        return {}
    folder = cases / stage
    if not folder.is_dir():
        raise ValueError(f'{folder}: missing stage case directory')
    path = folder / 'case.json'
    if not path.exists():
        return {}
    config = object_value(load_json(path.read_text(encoding='utf-8')), path)
    budget = object_value(config.get('budget', {}), path)
    if set(budget) - {'max_tool_calls', 'max_errors', 'max_nodes', 'forbid'}:
        raise ValueError(f'{path}: unknown budget key')
    for key in ('max_tool_calls', 'max_errors', 'max_nodes'):
        if key in budget and (type(budget[key]) is not int or budget[key] < 0):
            raise ValueError(f'{path}: {key} must be a nonnegative integer')
    if 'forbid' in budget and (not isinstance(budget['forbid'], list) or
                             any(not isinstance(v, str) or not v for v in budget['forbid'])):
        raise ValueError(f'{path}: forbid must be a list of nonempty strings')
    return budget


def input_strings(value):
    # Search actual strings too: JSON escaping must not hide Windows paths/newlines.
    if isinstance(value, str):
        yield value
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from input_strings(item)
    if isinstance(value, list):
        for item in value:
            yield from input_strings(item)


def audit_stage(path, cases):
    result = dict(scenario=path.parent.parent.name, stage=path.parent.name,
                  tool_calls=0, loginom_calls=0, errors=0, error_details=[], repeats=0,
                  repeat_details=[], recovery=dict.fromkeys(RECOVERY, 0),
                  nodes=dict(created=0, by_type={}, deleted=0), other_tools=[],
                  delivered_files=[], tokens={}, cost=0, final_text='', session_errors=[],
                  budget=stage_budget(cases, path.parent.name), violations=[], verdict='OK')
    calls = {}
    event_count = 0
    with path.open(encoding='utf-8') as stream:
        for line, text in enumerate(stream, 1):
            if not text.strip():
                continue
            location = f'{path}:{line}'
            try:
                event = object_value(load_json(text), location)
                event_count += 1
                kind = event.get('type')
                if not isinstance(kind, str):
                    raise ValueError('missing event type')
                if kind == 'error':
                    result['session_errors'].append(event.get('error'))
                if kind not in {'tool_use', 'step_finish', 'text'}:
                    continue
                part = object_value(event.get('part'), location)
                if kind == 'text':
                    if not isinstance(part.get('text'), str):
                        raise ValueError('text part must contain text')
                    result['final_text'] = part['text'][:200]
                if kind == 'step_finish':
                    add_numbers(result['tokens'], part.get('tokens', {}), location)
                    cost = {}
                    add_numbers(cost, {'cost': part.get('cost', 0)}, location)
                    result['cost'] += cost['cost']
                if kind == 'tool_use':
                    if not isinstance(part.get('tool'), str) or not part['tool']:
                        raise ValueError('tool part must contain tool name')
                    state = object_value(part.get('state'), location)
                    if state.get('status') not in {'pending', 'running', 'completed', 'error'}:
                        raise ValueError('invalid tool state status')
                    object_value(state.get('input', {}), location)
                    identity = part.get('callID') or part.get('id')
                    key = (event.get('sessionID'), identity) if identity else ('line', line)
                    # A running/completed snapshot is one call, a new call ID is a retry.
                    previous = calls.get(key)
                    if previous and previous[1]['state']['status'] in {'completed', 'error'}:
                        continue
                    calls[key] = (line, part)
            except (ValueError, TypeError) as error:
                raise ValueError(f'{location}: {error}') from error
    if not event_count:
        raise ValueError(f'{path}: empty event journal')

    seen = Counter()
    created = set()
    deleted = set()
    forbidden_inputs = []
    for line, part in calls.values():
        tool, state = part['tool'], part['state']
        data = state.get('input', {})
        result['tool_calls'] += 1
        is_loginom = tool.startswith('loginom_')
        result['loginom_calls'] += int(is_loginom)
        action = tool.removeprefix('loginom_dock_') if is_loginom else ''
        if action in result['recovery']:
            result['recovery'][action] += 1
        signature = (tool, canonical(data))
        seen[signature] += 1
        if seen[signature] > 1:
            result['repeats'] += 1
            result['repeat_details'].append(dict(tool=tool, input=data, line=line))
        output = state.get('output', '')
        try:
            output = load_json(output) if isinstance(output, str) and output.strip() else {}
        except ValueError as error:
            if is_loginom:
                raise ValueError(f'{path}:{line}: invalid Loginom JSON receipt') from error
            output = {}  # Non-Loginom tools legitimately return ordinary text.
        output = output if isinstance(output, dict) else {}
        failure = state['status'] == 'error' or output.get('status') in FAILED
        if failure:
            error = output.get('error')
            code = output.get('code') or (error.get('code') if isinstance(error, dict) else None)
            state_error = state.get('error')
            if code is None and isinstance(state_error, dict):
                code = state_error.get('code')
            result['errors'] += 1
            result['error_details'].append(dict(tool=tool, line=line, status=output.get('status', state['status']),
                                               code=code, error=state_error or error))
        if not is_loginom:
            command = next((data[k] for k in ('command', 'filePath', 'file_path', 'path', 'content') if isinstance(data.get(k), str)), canonical(data))
            result['other_tools'].append(dict(tool=tool, line=line, command=command[:120]))
            forbidden_inputs.append((tool, line, [canonical(data), *input_strings(data)]))
        result['delivered_files'].extend(delivery_paths(output))
        node = output.get('node') if isinstance(output.get('node'), dict) else {}
        target = object_value(data.get('target', {}), f'{path}:{line}: target') if action == 'node_apply' else {}
        if action == 'node_apply' and target.get('kind') == 'new':
            if node.get('node_id') or (state['status'] == 'completed' and output.get('status') == 'SUCCEEDED'):
                identity = node.get('node_id') or ('line', line)
                if identity not in created:
                    created.add(identity)
                    node_type = node.get('type') or target.get('type') or 'unknown'
                    result['nodes']['by_type'][node_type] = result['nodes']['by_type'].get(node_type, 0) + 1
        if action == 'node_delete' and state['status'] == 'completed' and output.get('status') == 'SUCCEEDED':
            target = data.get('node') if isinstance(data.get('node'), dict) else {}
            deleted.add(node.get('node_id') or target.get('node_id') or ('line', line))
    result['nodes'].update(created=len(created), deleted=len(deleted))
    result['delivered_files'] = sorted(set(result['delivered_files']))
    for rule, actual in [('max_tool_calls', result['tool_calls']), ('max_errors', result['errors']),
                         ('max_nodes', result['nodes']['created'])]:
        limit = result['budget'].get(rule)
        if limit is not None and actual > limit:
            result['violations'].append(dict(rule=rule, actual=actual, limit=limit))
    for substring in result['budget'].get('forbid', []):
        for tool, line, strings in forbidden_inputs:
            if any(substring in s for s in strings):
                result['violations'].append(dict(rule='forbid', substring=substring, tool=tool, line=line))
        for destination in result['delivered_files']:
            if substring in destination:
                result['violations'].append(dict(rule='forbid', substring=substring, destination=destination))
    if result['violations']:
        result['verdict'] = 'ACTION_BUDGET_EXCEEDED'
    return result


def cell(value):
    return str(value).replace('\\', '\\\\').replace('|', '\\|').replace('\r', '').replace('\n', '<br>')


def markdown(report):
    lines = ['| Сценарий | Этап | Вызовы | Loginom | Ошибки | Повторы | Recovery | Узлы +/- | Чужие инструменты | Вердикт |',
             '|---|---|---:|---:|---:|---:|---|---|---|---|']
    for stage in report['stages']:
        recovery = '/'.join(str(stage['recovery'][k]) for k in RECOVERY)
        others = ', '.join(f"{t['tool']}: {t['command']}" for t in stage['other_tools']) or '—'
        values = [stage['scenario'], stage['stage'], stage['tool_calls'], stage['loginom_calls'], stage['errors'],
                  stage['repeats'], recovery, f"+{stage['nodes']['created']}/-{stage['nodes']['deleted']}", others, stage['verdict']]
        lines.append('| ' + ' | '.join(cell(v) for v in values) + ' |')
    lines += ['', 'Recovery: operation_recover / browser_recovery / operation_inspect.']
    for stage in report['stages']:
        lines += ['', f"### {cell(stage['scenario'])} / {cell(stage['stage'])}", '',
                  f"Токены: {cell(canonical(stage['tokens']))}; стоимость: {stage['cost']:.10g}.",
                  f"Созданные узлы по типу: {cell(canonical(stage['nodes']['by_type']))}.",
                  f"Ответ: {cell(stage['final_text'])}", '', 'Нарушения:']
        lines += ['- ' + cell(canonical(v)) for v in stage['violations']] or ['- Нет.']
        for key, title in [('error_details', 'Ошибки инструментов'), ('repeat_details', 'Повторы'),
                           ('session_errors', 'Ошибки сессии'), ('delivered_files', 'Доставленные файлы')]:
            if stage[key]:
                lines += ['', title + ':'] + ['- ' + cell(canonical(v)) for v in stage[key]]
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path, help='run-check result directory')
    parser.add_argument('--cases', type=Path, help='case root; each stage uses its own case.json budget')
    parser.add_argument('--json', action='store_true', help='emit JSON instead of Markdown')
    args = parser.parse_args()
    try:
        if not args.directory.is_dir():
            raise ValueError(f'{args.directory}: result directory does not exist')
        if args.cases is not None and not args.cases.is_dir():
            raise ValueError(f'{args.cases}: cases directory does not exist')
        journals = sorted(args.directory.glob('*/*/model.stdout'))
        if not journals:
            raise ValueError(f'{args.directory}: no scenario/stage/model.stdout journals')
        stages = [audit_stage(path, args.cases) for path in journals]
        exceeded = any(s['violations'] for s in stages)
        report = dict(verdict='ACTION_BUDGET_EXCEEDED' if exceeded else 'OK', stages=stages)
        print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) if args.json else markdown(report))
        return int(exceeded)
    except (OSError, ValueError, TypeError) as error:
        print(f'bughunt-audit: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
