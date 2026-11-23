#!/usr/bin/env python3
"""Audit completed run-check model JSONL without reading profiles or credentials.

Usage: python3 audit-c.py RUN_DIR [RUN_DIR ...] > private-audit.json
The output is diagnostic evidence, not a replacement for CSV/cold acceptance.
Keep it outside Git: it contains runtime log locations and native node IDs.
"""
import argparse
import json
from collections import Counter
from pathlib import Path


def objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from objects(child)


def decode(value):
    if isinstance(value, dict):
        return value
    try:
        return json.JSONDecoder().raw_decode(value or '')[0]
    except (ValueError, TypeError):
        return {}


def audit(path, cases):
    # Only terminal tool events count. Deduplicate replayed parts by callID/id.
    calls, seen = [], set()
    for line, text in enumerate(path.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
        event = decode(text)
        if not isinstance(event, dict) or event.get('type') != 'tool_use':
            continue
        part = event.get('part', {})
        state = part.get('state', {})
        if state.get('status') not in ('completed', 'error'):
            continue
        key = part.get('callID') or part.get('id') or str(line)
        if key in seen:
            continue
        seen.add(key)
        reply = decode(state.get('output') if state.get('status') == 'completed' else state.get('error'))
        codes = list(dict.fromkeys(str(item['code']) for item in objects(reply) if item.get('code')))
        failed = state.get('status') == 'error' or any(
            item.get('status') in ('FAILED', 'NOT_APPLIED', 'AMBIGUOUS', 'failed', 'error')
            or item.get('ok') is False for item in objects(reply))
        calls.append({'line': line, 'tool': part.get('tool', ''), 'input': state.get('input', {}),
                      'failed': failed, 'codes': codes, 'reply': reply})
    loginom = [call for call in calls if call['tool'].startswith('loginom_')]
    errors = [call for call in loginom if call['failed']]
    signatures = Counter((call['tool'], json.dumps(call['input'], sort_keys=True, ensure_ascii=False)) for call in loginom)
    creates = [call for call in loginom if call['tool'] == 'loginom_dock_node_apply'
               and call['input'].get('target', {}).get('kind') == 'new']
    deletes = [call for call in loginom if call['tool'] == 'loginom_dock_node_delete']
    nodes = {item['node_id'] for call in creates for item in objects(call['reply']) if item.get('node_id')}
    case = path.parent.name
    config = cases / case / 'case.json'
    budget = json.loads(config.read_text())['budget'] if config.is_file() else {}
    non_loginom = [call for call in calls if not call['tool'].startswith('loginom_')]
    forbidden = [dict(line=call['line'], tool=call['tool'], substring=word)
                 for call in calls for word in budget.get('forbid', [])
                 if word.lower() in (call['tool'] + json.dumps(call['input'], ensure_ascii=False)).lower()]
    breaches = []
    for name, count in [('max_tool_calls', len(loginom)), ('max_errors', len(errors)), ('max_nodes', len(nodes))]:
        if name in budget and count > budget[name]:
            breaches.append(dict(metric=name, actual=count, maximum=budget[name]))
    return dict(case=case, log=str(path), loginom_calls=len(loginom), errors=len(errors),
                first_error={key: errors[0][key] for key in ('line', 'tool', 'codes')} if errors else None,
                error_codes=dict(Counter(code for call in errors for code in call['codes'])),
                recoveries=[dict(line=call['line'], tool=call['tool']) for call in calls
                            if 'recover' in call['tool'] or 'browser_recovery' in json.dumps(call['input'])],
                new_node_requests=len(creates), created_node_ids=sorted(nodes),
                delete_requests=[dict(line=call['line'], failed=call['failed'], input=call['input']) for call in deletes],
                identical_repeats=[dict(tool=tool, input=json.loads(request), count=count)
                                   for (tool, request), count in signatures.items() if count > 1],
                non_loginom=[dict(line=call['line'], tool=call['tool'], input=call['input']) for call in non_loginom],
                forbidden=forbidden, budget_breaches=breaches)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('runs', nargs='+', type=Path)
    parser.add_argument('--cases', type=Path, default=Path(__file__).resolve().parent / 'cases')
    args = parser.parse_args()
    result = []
    for run in args.runs:
        report = json.loads((run / 'results.json').read_text())
        if not report.get('finished'):
            parser.error(f'run is still active: {run.name}; audit only completed runs')
        result.append(dict(run=str(run), head=report['head'], results=report['runs'],
                           turns=[audit(path, args.cases) for path in sorted(run.glob('*/*/model.stdout'))]))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
