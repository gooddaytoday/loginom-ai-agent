"""Independent CLI transcript audit; retained fixtures are never model inputs."""
import argparse, json
from pathlib import Path

def unwrap(value):
    if isinstance(value, str):
        try:
            return unwrap(json.loads(value))
        except ValueError:
            return {}
    if isinstance(value, list):
        return next((result for block in value if isinstance(block, dict) and block.get('type') == 'text' and (result := unwrap(block.get('text', '')))), {})
    return value if isinstance(value, dict) else {}

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
        result = unwrap(state.get('output'))
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
        existing = [c for c in applies if c['input'].get('target', {}).get('kind') == 'existing' and c['input']['target'].get('ref', {}).get('node_id') == node.get('node_id') and good(reply(c))]
        complete = [c for c in [creation] + existing if values(reply(c), want)]
        check(want['output_node_label'] + ' final complete exact values', bool(complete))
        unconfigured = [c for c in existing if not c['input'].get('parameters') and not c['input'].get('mappings') and not c['input'].get('inputs') and values(reply(c), want)]
        check(want['output_node_label'] + ' unconfigured persistence execution', bool(unconfigured))
        if want['output_node_label'] == 'Preserved':
            patches = [c for c in existing if c['input'].get('parameters')]
            check('C-only patch preserves saved output mode', any([r['field']['name'] for r in c['input']['parameters'].get('rules', [])] == ['C'] and 'output_mode' not in c['input']['parameters'] for c in patches))
            for mode, fixture in [('replace', 'expected-partial-replace.json'), ('add', 'expected-partial-add.json')]:
                f = json.loads((fixtures / fixture).read_text())
                w = {'columns': [{'name': n, 'label': f['labels'][i], 'type': f['types'][i]} for i, n in enumerate(f['names'])], 'rows': [dict(zip(f['names'], row)) for row in f['rows']]}
                check('mode-only ' + mode + ' preserves both rules and values', any(c['input']['parameters'] == {'output_mode': mode} and values(reply(c), w) for c in patches))
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
