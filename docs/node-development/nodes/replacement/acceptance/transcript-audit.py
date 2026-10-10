"""Independent CLI transcript audit; retained fixtures are never model inputs."""
import argparse, json
from pathlib import Path

def unwrap(value):
    """Decode one receipt and its bound annotations; never merge receipts."""
    if isinstance(value, list):
        texts = [b.get('text', '') for b in value if isinstance(b, dict) and b.get('type') == 'text']
        return unwrap('\n'.join(texts)) if texts else {}
    if not isinstance(value, str):
        return value if isinstance(value, dict) else {}
    decoder, items, rest = json.JSONDecoder(), [], value.strip()
    while rest:
        item, end = decoder.raw_decode(rest)
        if not isinstance(item, dict):
            raise ValueError('Non-object receipt')
        items.append(item)
        rest = rest[end:].strip()
    if not items:
        return {}
    primary = items[0]
    operation = primary.get('operation_id')
    seen = set()
    for annotation in items[1:]:
        kind = annotation.get('kind')
        if kind not in {'dock_saved_package_state', 'dock_outcome_verification'} or kind in seen:
            raise ValueError('Ambiguous receipt or annotation')
        seen.add(kind)
        bound = annotation.get('save_operation_id') if kind == 'dock_saved_package_state' else annotation.get('operation_id')
        if not operation or bound != operation:
            raise ValueError('Annotation operation mismatch')
        if kind == 'dock_saved_package_state':
            path = primary.get('output', {}).get('package_ref', {}).get('path')
            if not path or annotation.get('package_path') != path:
                raise ValueError('Annotation package mismatch')
        elif annotation.get('action_key') != primary.get('action_key'):
            raise ValueError('Annotation action mismatch')
    return primary


def label_only_mappings(mappings):
    if mappings is None:
        return True
    return isinstance(mappings, list) and all(
        isinstance(m, dict) and set(m) <= {'direction', 'port', 'autosync', 'fields'}
        and m.get('direction') == 'output' and m.get('port') == 0
        and isinstance(m.get('fields'), list) and all(
            isinstance(f, dict) and set(f) <= {'source', 'label'}
            and ('label' not in f or isinstance(f['label'], str)) and isinstance(f.get('source'), dict)
            and set(f['source']) == {'kind', 'name'}
            and f['source']['kind'] == 'configured_field'
            for f in m['fields']) for m in mappings)


def mode_sequence_matches(calls, mode, reply, values, want):
    """A mode-only apply may be followed by label-only mapping repair.

    A new parameter/input mutation or any unsuccessful apply ends the proof.
    Every candidate remains a fresh complete execution of the same node.
    """
    for index, call in enumerate(calls):
        if call['input'].get('parameters') != {'output_mode': mode}:
            continue
        for current in calls[index:]:
            if (current is not call and current['input'].get('parameters')) or current['input'].get('inputs') or not label_only_mappings(current['input'].get('mappings', [])):
                break
            result = reply(current)
            if result.get('status') != 'SUCCEEDED' or result.get('cleanup_complete') is not True:
                break
            if values(result, want):
                return True
    return False

def audit(attempt, fixtures):
    expected = json.loads((attempt / 'expected.json').read_text())
    calls, settled, seen = [], {}, {}
    for index, line in enumerate((attempt / 'cli-events.jsonl').read_text().splitlines()):
        event = json.loads(line)
        part = event.get('part', {})
        state = part.get('state', {})
        if event.get('type') != 'tool_use' or state.get('status') != 'completed':
            continue
        if part['id'] in seen:
            assert seen[part['id']] == part, 'changed duplicate event'
            continue
        seen[part['id']] = part
        if part['tool'] not in {'loginom_dock_node_apply', 'loginom_dock_operation_inspect', 'loginom_dock_operation_wait', 'loginom_dock_node_wait', 'loginom_dock_action_run'}:
            continue
        try:
            result = unwrap(state.get('output'))
        except (ValueError, TypeError) as error:
            result = {'audit_decode_error': str(error)}
        calls.append(dict(index=index, tool=part['tool'], input=state.get('input', {}), result=result))
        if result.get('state') == 'settled' and result.get('operation_id'):
            key = result['operation_id']
            assert key not in settled or settled[key]['result'] == result, 'conflicting receipt'
            settled[key] = dict(index=index, result=result)
    checks = []
    def check(name, condition):
        checks.append(dict(name=name, passed=bool(condition)))
    def reply(call):
        return settled.get(call['input'].get('operation_id'), {}).get('result', call['result'])
    def good(result):
        return result.get('status') == 'SUCCEEDED' and result.get('cleanup_complete') is True
    def values(result, want):
        ports = result.get('output', {}).get('ports', [])
        if len(ports) != 1:
            return False
        p = ports[0]
        columns = want['columns']
        if not (p.get('fresh') is True and p.get('sample_complete') is True and p.get('row_count') == len(want['rows']) and p.get('sample_rows') == len(want['rows']) and p.get('execution_id') == result.get('execution', {}).get('execution_id')):
            return False
        if [{k: c.get(k) for k in ['name', 'label', 'type']} for c in p.get('schema', [])] != columns:
            return False
        if p.get('precision', {}).get('numbers_verified') is not True:
            return False
        actual = []
        for row in p.get('sample', []):
            if len(row) != len(columns):
                return False
            cells = []
            for cell, column in zip(row, columns):
                if cell.get('type') != column['type']:
                    return False
                value = cell.get('value')
                if cell.get('is_null'):
                    if value is not None:
                        return False
                    cells.append(None)
                    continue
                if column['type'] == 'integer':
                    value = str(value)
                elif column['type'] == 'real':
                    value = float(value)
                cells.append(value)
            actual.append(cells)
        wanted = [[str(row[c['name']]) if c['type'] == 'integer' and row[c['name']] is not None else row[c['name']] for c in columns] for row in want['rows']]
        return sorted(map(lambda r: json.dumps(r, ensure_ascii=False), actual)) == sorted(map(lambda r: json.dumps(r, ensure_ascii=False), wanted))
    check('unambiguous receipt decoding', not any('audit_decode_error' in c['result'] for c in calls))
    applies = [c for c in calls if c['tool'] == 'loginom_dock_node_apply']
    created = [c for c in applies if c['input'].get('target', {}).get('kind') == 'new' and c['input']['target'].get('type') == 'transform.replace_columns' and good(reply(c))]
    check('exactly two replacement nodes', len(created) == 2)
    for want in expected['outputs']:
        matches = [c for c in created if c['input']['target'].get('label') == want['output_node_label']]
        check(want['output_node_label'] + ' unique creation', len(matches) == 1)
        if len(matches) != 1:
            continue
        creation = matches[0]
        node = reply(creation).get('node', {})
        existing = [c for c in applies if c['input'].get('target', {}).get('kind') == 'existing' and c['input']['target'].get('ref', {}).get('node_id') == node.get('node_id') ]
        complete = [c for c in [creation] + existing if good(reply(c)) and good(reply(c)) and values(reply(c), want)]
        check(want['output_node_label'] + ' final complete exact values', bool(complete))
        unconfigured = [c for c in existing if not c['input'].get('parameters') and not c['input'].get('mappings') and not c['input'].get('inputs') and good(reply(c)) and values(reply(c), want)]
        check(want['output_node_label'] + ' unconfigured persistence execution', bool(unconfigured))
        if want['output_node_label'] == 'Preserved':
            patches = [c for c in existing if c['input'].get('parameters') and good(reply(c))]
            check('C-only patch preserves saved output mode', any([r['field']['name'] for r in c['input']['parameters'].get('rules', [])] == ['C'] and 'output_mode' not in c['input']['parameters'] for c in patches))
            for mode, fixture in [('replace', 'expected-partial-replace.json'), ('add', 'expected-partial-add.json')]:
                f = json.loads((fixtures / fixture).read_text())
                w = {'columns': [{'name': n, 'label': f['labels'][i], 'type': f['types'][i]} for i, n in enumerate(f['names'])], 'rows': [dict(zip(f['names'], row)) for row in f['rows']]}
                check('mode-only ' + mode + ' preserves both rules and values', mode_sequence_matches(existing, mode, reply, values, w))
    saves = [c for c in calls if c['tool'] == 'loginom_dock_action_run' and c['input'].get('action_key') in ['package.save_as', 'package.save_checkpoint'] and good(reply(c))]
    check('confirmed owned package save', any(reply(c).get('output', {}).get('save_completed') is True and reply(c).get('output', {}).get('package_ref', {}).get('path') == expected['package_path'] for c in saves))
    check('successful CLI exit', json.loads((attempt / 'cli-result.json').read_text()).get('exit_code') == 0)
    result = dict(status='PASS' if all(c['passed'] for c in checks) else 'FAIL', checks=checks, operations=len(settled), source_commit=json.loads((attempt / 'request.json').read_text())['sourceCommit'], scope='main_typed_partial_mode_switch_persistence_transcript')
    (attempt / 'transcript-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result['status'] == 'PASS'

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('attempt', type=Path)
    p.add_argument('fixtures', type=Path)
    args = p.parse_args()
    raise SystemExit(0 if audit(args.attempt, args.fixtures) else 1)
