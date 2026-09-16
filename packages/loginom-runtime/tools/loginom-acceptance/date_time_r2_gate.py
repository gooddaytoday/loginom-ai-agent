"""Aggregate the focused R2 live gate; no Hermes or persistence claim."""
import json
import sys
from pathlib import Path
from date_time_audit import audit
from date_time_persistence import semantic_configuration
from date_time_terminal_failure import verify


def run(directory):
    events = [json.loads(x) for x in (directory / 'execution-events.jsonl').read_text().splitlines()]
    checkpoints = {e['operation_id']: e for e in events if e.get('phase') == 'node_checkpoint'}
    before, failed, after = [checkpoints[k] for k in ('node13-r2-baseline', 'node13-r2-failure', 'node13-r2-restored')]
    requests = {e['operation_id']: e['request'] for e in events if e.get('phase') == 'node_apply_prepared'}
    missing = json.loads((directory / 'r2-hide-source.json').read_text())['missing']
    restored = json.loads((directory / 'r2-restore-source.json').read_text())
    repeat = json.loads((directory / 'r2-repeat.json').read_text())
    negative = json.loads((directory / 'r2-terminal-negatives.json').read_text())
    terminal = verify(events, 'node13-r2-failure', missing)
    values = audit(events, requests['node13-r2-restored'])
    failures = []
    if not terminal['passed']: failures.append('terminal_audit')
    if not values['passed']: failures.append('restored_values_audit')
    if not negative['passed'] or negative['rejected'] != 15: failures.append('negative_evidence')
    if not (before['recorded_at'] < failed['recorded_at'] < after['recorded_at']): failures.append('operation_order')
    if before['result']['status'] != 'SUCCEEDED' or after['result']['status'] != 'SUCCEEDED': failures.append('success_baselines')
    if len({c['result']['execution']['execution_id'] for c in (before, failed, after)}) != 3: failures.append('reused_execution')
    if before['result']['node'] != failed['result']['node'] or before['result']['node'] != after['result']['node']: failures.append('node_changed')
    if semantic_configuration(before) != semantic_configuration(after): failures.append('manual_configuration_changed')
    output = after['result']['configuration']['readback']['output_mapping']
    if output['autosync'] is not False or not any(f['name'] == 'Amount' and f['excluded'] for f in output['fields']): failures.append('manual_exclusion_lost')
    if restored['restored'] != missing or restored['held_absent'] is not True: failures.append('source_not_restored')
    if not repeat['before'] == repeat['middle'] == repeat['after'] or repeat['repeat'] != 'FAILED' or repeat['resume'] != 'FAILED' or not repeat['identical']: failures.append('repeat_effect')
    if repeat['inspection']['output']['state'] != 'resolved' or repeat['inspection']['output']['cleanup_confirmed'] is not True or not repeat['pending_released']: failures.append('pending_not_released')
    public = [json.loads(x) for x in (directory / 'public-api.jsonl').read_text().splitlines()]
    for key, status in [('node13-r2-baseline', 'SUCCEEDED'), ('node13-r2-failure', 'FAILED'), ('node13-r2-restored', 'SUCCEEDED')]:
        replies = [e['reply'].get('structuredContent', {}) for e in public if e.get('phase') == 'response']
        if not any(r.get('operation_id') == key and r.get('state') == 'settled' and r.get('outcome', {}).get('status') == status for r in replies): failures.append('missing_public_reply:' + key)
    result = dict(passed=not failures, failures=failures, terminal=terminal['passed'], restored_output=values,
                  negative_count=15, repeat_browser_sequence=[repeat[k] for k in ('before', 'middle', 'after')],
                  manual_configuration_preserved=semantic_configuration(before) == semantic_configuration(after),
                  source_restored=restored, hermes_acceptance=False, new_persistence_check=False)
    (directory / 'r2-gate.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return result


if __name__ == '__main__':
    result = run(Path(sys.argv[1]))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
