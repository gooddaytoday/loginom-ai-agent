"""Regression checks against a real full-goal journal; never rewrites evidence or its verdict."""
import argparse, copy, json
from pathlib import Path
from artifact_delivery_evidence import verify_delivered_existing_import_output
from missing_values_refusals import classify
from user_result_evidence import normalize_user_evidence
from missing_values_goal import PIN, WORK


def verify(run, candidate_audit):
    original = json.loads((run / 'evidence.json').read_text())
    request = json.loads((run / 'request.json').read_text())
    partition = classify(original, runtime_revision=PIN, manifest_sha256=request['manifest_sha256'])
    if not partition['passed']:
        raise ValueError('Unproved terminal operation')
    terminal = {k: v['outcome'] for k, v in partition['refusals'].items()}
    evidence, projection = normalize_user_evidence(original, terminal_outcomes=terminal)
    if not projection['passed']:
        raise ValueError('Unproved public projection')
    events = evidence['events']
    requests = [e['request'] for e in events if e.get('phase') == 'node_apply_prepared']
    updates = [r for r in requests if r['target']['type'] == 'imports.text' and r['target']['kind'] == 'existing']
    if len(updates) != 1:
        raise ValueError('One replacement import required')
    changed = updates[0]
    seed_results = [e for e in events if e.get('phase') == 'node_checkpoint'
                    and e.get('result', {}).get('node') == changed['target']['ref']
                    and e.get('operation_id') != changed['operation_id']]
    if len(seed_results) != 1:
        raise ValueError('One prior import checkpoint required')
    seed = next(r for r in requests if r['operation_id'] == seed_results[0]['operation_id'])
    report = json.loads(candidate_audit.read_text())
    delivery = report['checks']['delivery:' + changed['operation_id']]['delivery']
    before = (WORK / 'fixtures/missing-values/core.csv').read_bytes()
    after = (WORK / 'fixtures/missing-values/changed.csv').read_bytes()

    def check(rows=events, initial=seed, update=changed, body=after, delivered=delivery):
        return verify_delivered_existing_import_output(rows, initial, update, body, delivered, PIN,
                                                       seed_source_bytes=before)

    positive = check()
    if not positive['passed']:
        raise AssertionError(positive)

    def replace_request(old, new):
        return [{**e, 'request': new} if e.get('phase') == 'node_apply_prepared'
                and e.get('operation_id') == old['operation_id'] else e for e in events]

    negatives = {}
    for mode in ('foreign_ref', 'foreign_seed_label', 'wrong_mapping', 'seed_after_update',
                 'foreign_graph_label', 'changed_bytes', 'wrong_delivery', 'missing_seed'):
        rows = events
        initial, update = copy.deepcopy(seed), copy.deepcopy(changed)
        body, delivered = after, copy.deepcopy(delivery)
        if mode == 'foreign_ref':
            update['target']['ref']['node_id'] = 'foreign-node'
            rows = replace_request(changed, update)
        elif mode == 'foreign_seed_label':
            initial['target']['label'] = 'Foreign seed'
            rows = replace_request(seed, initial)
        elif mode == 'wrong_mapping':
            update['mappings'][0]['fields'][0]['label'] = 'Foreign mapped label'
            rows = replace_request(changed, update)
        elif mode == 'seed_after_update':
            checkpoint = seed_results[0]
            rows = [e for e in events if e is not checkpoint] + [checkpoint]
        elif mode == 'foreign_graph_label':
            rows = []
            for event in events:
                if event.get('operation_id') == changed['operation_id'] and event.get('phase') == 'node_target_checkpoint':
                    event = copy.deepcopy(event)
                    for name in ('final_graph', 'last_graph'):
                        for node in event.get('target_state', {}).get(name, {}).get('nodes', []):
                            if node.get('ref') == changed['target']['ref']:
                                node['label'] = 'Foreign graph node'
                rows.append(event)
        elif mode == 'changed_bytes':
            body = after + b'999;123;456;FOREIGN;0\n'
        elif mode == 'wrong_delivery':
            delivered['outcome']['sha256'] = '0' * 64
        elif mode == 'missing_seed':
            rows = [e for e in events if e.get('operation_id') != seed['operation_id']]
        try:
            result = check(rows, initial, update, body, delivered)
            negatives[mode] = dict(rejected=result['passed'] is False, failures=result['failures'])
        except (KeyError, ValueError, IndexError, TypeError, AssertionError) as error:
            negatives[mode] = dict(rejected=True, error=type(error).__name__, detail=str(error))
    if not all(r['rejected'] for r in negatives.values()):
        raise AssertionError(negatives)
    return dict(passed=True, positive=positive, negative_checks=negatives, model_started=False,
                full_goal_accepted=False, original_frozen_verdict_unchanged=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run-dir', required=True, type=Path)
    parser.add_argument('--candidate-audit', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = verify(args.run_dir, args.candidate_audit)
    with args.output.open('x') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps(dict(passed=result['passed'], negatives=len(result['negative_checks']), full_goal_accepted=False)))
