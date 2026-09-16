"""Check public refusals and independently observed graph preservation."""
import argparse
import json
from pathlib import Path


def graph(value):
    return dict(document_id=value['document_id'], workflow_ref=value['workflow_ref'],
                complete=value['complete'], foreign_links=value['foreign_links'],
                nodes=sorted([{k: v for k, v in n.items() if k != 'dom_epoch'} for n in value['nodes']], key=lambda n: n['ref']['node_id']),
                links=sorted(value['links'], key=lambda e: (e['target'], e['input'], e['source'], e['output'])))


def verify(directory, operation_id, file_name, kind):
    failures = []
    try:
        record = json.loads((directory / file_name).read_text())
        result, before, after = record['result'], record['before'], record['after']
        if (result['status'] != 'NOT_APPLIED' or result.get('effect_possible') is not False
                or result.get('cleanup_complete') is not True or not result.get('error')):
            failures.append('not_a_clean_refusal')
        if before['complete'] is not True or graph(before) != graph(after):
            failures.append('graph_changed')
        events = [json.loads(line) for line in (directory / 'execution-events.jsonl').read_text().splitlines()]
        requests = [e['request'] for e in events if e.get('operation_id') == operation_id and e.get('phase') == 'node_apply_prepared']
        if len(requests) != 1:
            raise ValueError('one_original_request_required')
        request = requests[0]
        public = [json.loads(line) for line in (directory / 'public-api.jsonl').read_text().splitlines()]
        if not any(e.get('phase') == 'response' and e.get('reply', {}).get('structuredContent', {}).get('outcome') == result for e in public):
            failures.append('public_refusal_missing')
        if kind == 'wrong_type':
            field = request['parameters']['fields'][0]['field']['name']
            if request['target']['kind'] != 'new' or any(n['label'] == request['target']['label'] for n in after['nodes']):
                failures.append('invalid_new_target')
            previews = [e['outcome']['output']['node_preview_schema'] for e in events
                        if e.get('operation_id') == operation_id and e.get('phase') == 'node_observation_completed'
                        and e.get('outcome', {}).get('output', {}).get('node_preview_schema')]
            if not any(p.get('verified') is True and any(f['name'] == field and f['type'] == 'integer' for f in p['fields']) for p in previews):
                failures.append('wrong_type_not_observed')
        elif kind == 'occupied_input':
            target, wanted = request['target']['ref']['node_id'], request['inputs'][0]
            links = [e for e in before['links'] if e['target'] == target and e['input'] == wanted['input']]
            if (request['target']['kind'] != 'existing' or len(links) != 1
                    or links[0]['source'] == wanted['source']['node_id'] and links[0]['output'] == wanted['output']):
                failures.append('input_not_occupied_by_another_source')
        else:
            raise ValueError('unknown_refusal_kind')
    except (KeyError, TypeError, ValueError, IndexError) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=sorted(set(failures)), scope='source_date_time_refusal', hermes_acceptance=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    parser.add_argument('operation_id')
    parser.add_argument('file_name')
    parser.add_argument('kind', choices=['wrong_type', 'occupied_input'])
    args = parser.parse_args()
    result = verify(args.session, args.operation_id, args.file_name, args.kind)
    (args.session / (args.operation_id + '-refusal-audit.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
