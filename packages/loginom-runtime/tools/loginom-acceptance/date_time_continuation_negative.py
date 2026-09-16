"""Reject altered recovery evidence without changing the original live session."""
import argparse
import copy
import json
import tempfile
from pathlib import Path
from date_time_continuation import verify


def audit_negative(directory):
    baseline = verify(directory)
    if not baseline['passed']:
        return dict(passed=False, failures=['positive_baseline_required'], cases=[])
    names = ['injected-date-flag-reply-loss.json', 'r1-loss.json', 'r1-resume.json', 'r1-negative.json', 'r1-repeat.json']
    base = {name: json.loads((directory / name).read_text()) for name in names}
    events = [json.loads(x) for x in (directory / 'execution-events.jsonl').read_text().splitlines()]
    public = (directory / 'public-api.jsonl').read_text()
    cases = []
    for kind in ['duplicate_receipt', 'missing_receipt', 'short_matrix', 'foreign_proof_receipt',
                 'unknown_original_gesture', 'uncompleted_resume', 'replayed_effect', 'no_negative_refusal']:
        files, rows = copy.deepcopy(base), copy.deepcopy(events)
        gesture = files[names[0]]['pendingId']
        completed = lambda e: e.get('phase') == 'node_step_completed' and e.get('internal_operation_id') == gesture
        if kind == 'duplicate_receipt':
            rows.append(copy.deepcopy(next(e for e in rows if completed(e))))
        elif kind == 'missing_receipt':
            rows = [e for e in rows if not completed(e)]
        elif kind == 'short_matrix':
            next(e for e in rows if e.get('phase') == 'node_configure_continuation_checked')['matrices'][0]['matrix'].pop()
        elif kind == 'foreign_proof_receipt':
            next(e for e in rows if e.get('phase') == 'node_configure_continuation_checked')['receipt_id'] = 'foreign'
        elif kind == 'unknown_original_gesture':
            files[names[0]]['pendingId'] = 'foreign:n1'
        elif kind == 'uncompleted_resume':
            files['r1-resume.json']['result']['status'] = 'AMBIGUOUS'
        elif kind == 'replayed_effect':
            files['r1-repeat.json']['after'] += 1
        elif kind == 'no_negative_refusal':
            files['r1-negative.json']['outcome'] = {'value': 'accepted'}
        with tempfile.TemporaryDirectory(prefix='date-time-proof-') as tmp:
            target = Path(tmp)
            for name, value in files.items():
                (target / name).write_text(json.dumps(value))
            (target / 'execution-events.jsonl').write_text('\n'.join(json.dumps(e) for e in rows))
            (target / 'public-api.jsonl').write_text(public)
            browser = base[names[0]]['browser_reply']
            (target / browser).symlink_to((directory / browser).resolve())
            result = verify(target)
        cases.append(dict(case=kind, rejected=not result['passed'], failures=result['failures']))
    return dict(passed=all(c['rejected'] for c in cases), cases=cases)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    args = parser.parse_args()
    result = audit_negative(args.session)
    (args.session / 'date-time-continuation-negative-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
