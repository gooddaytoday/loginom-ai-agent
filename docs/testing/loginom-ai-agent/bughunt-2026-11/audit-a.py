#!/usr/bin/env python3
"""Read completed model JSONL; emit private audit evidence, never credentials.

Usage: audit-a.py MODEL_STDOUT CASE_JSON
Counts model calls only, excluding harness cold/cleanup activity. Node creation
is counted from successful create receipts; final graph remains authoritative.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re


def audit(journal, config):
    calls, errors, repeats, recovery, foreign, forbidden = [], [], [], [], [], []
    seen, ids, created, deleted = Counter(), set(), set(), set()
    budget = config['budget']
    for line, raw in enumerate(journal.read_text().splitlines(), 1):
        try:
            event = json.loads(raw)
        except ValueError:
            continue
        if event.get('type') != 'tool_use':
            continue
        part = event.get('part', {})
        state = part.get('state', {})
        identity = part.get('callID') or part.get('id')
        if identity and identity in ids:
            continue
        if identity:
            ids.add(identity)
        tool, args = part.get('tool', ''), state.get('input', {})
        evidence = dict(line=line, tool=tool, input=args)
        calls.append(evidence)
        text = json.dumps(args, ensure_ascii=False, sort_keys=True)
        signature = tool + ':' + text
        seen[signature] += 1
        if seen[signature] > 1:
            repeats.append(evidence)
        if 'operation_recover' in tool or 'browser_recovery' in tool:
            recovery.append(evidence)
        if not tool.startswith('loginom_'):
            foreign.append(evidence)
        hits = [s for s in budget.get('forbid', []) if s in (tool + ' ' + text).lower()]
        if hits:
            forbidden.append(dict(evidence, matches=hits))
        result = state.get('output') or state.get('error') or ''
        if isinstance(result, str):
            try:
                reply = json.JSONDecoder().raw_decode(result)[0]
            except (ValueError, TypeError):
                code = re.search(r'\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b', result)
                reply = {'code': code.group()} if state.get('status') == 'error' and code else {}
        else:
            reply = result
        if not isinstance(reply, dict):
            reply = {}
        bodies = [reply]
        if isinstance(reply.get('result'), dict):
            bodies.append(reply['result'])
        if isinstance(reply.get('structuredContent'), dict):
            bodies.append(reply['structuredContent'])
        for block in reply.get('content', []):
            if block.get('type') == 'text':
                try:
                    body = json.loads(block['text'])
                except (ValueError, KeyError):
                    continue
                if isinstance(body, dict):
                    bodies.append(body)
        bad = next((b for b in bodies if b.get('status') in
                    ('FAILED', 'NOT_APPLIED', 'REFUSED', 'AMBIGUOUS', 'REJECTED')
                    or b.get('result_delivery') == 'refused'
                    or isinstance(b.get('error'), dict) and b['error'].get('code')), None)
        if state.get('status') == 'error' or bad is not None:
            error = (bad or reply).get('error') or {}
            code = (bad or reply).get('code') or (error.get('code') if isinstance(error, dict) else None)
            errors.append(dict(evidence, code=code or (bad or reply).get('status') or 'TOOL_ERROR'))
        receipt = next((b for b in bodies if b.get('status') == 'SUCCEEDED'), {})
        output, node = receipt.get('output') or {}, receipt.get('node') or {}
        node_id = node.get('node_id') or output.get('node_id') or receipt.get('node_id')
        if node_id:
            target = args.get('target') or {}
            if tool == 'loginom_dock_node_apply' and (target == 'create' or isinstance(target, dict) and target.get('kind') in ('new', 'create')):
                created.add(node_id)
            if tool == 'loginom_dock_node_delete':
                deleted.add(node_id)
    loginom = sum(c['tool'].startswith('loginom_') for c in calls)
    violations = []
    for key, count in [('max_tool_calls', len(calls)), ('max_errors', len(errors)), ('max_nodes', len(created))]:
        if count > budget[key]:
            violations.append(f'{key}: {count}>{budget[key]}')
    if forbidden:
        violations.append('forbid: ' + ', '.join(sorted({match for item in forbidden for match in item['matches']})))
    return dict(loginom_calls=loginom, all_calls=len(calls), errors=errors,
                repeated_calls=repeats, recovery=recovery, non_loginom=foreign,
                forbidden=forbidden, created_nodes=sorted(created), deleted_nodes=sorted(deleted),
                budget_violations=violations, notes='Created-node count requires receipt IDs; verify final graph separately.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('journal', type=Path)
    parser.add_argument('case', type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.journal, json.loads(args.case.read_text())), ensure_ascii=False, indent=2))
