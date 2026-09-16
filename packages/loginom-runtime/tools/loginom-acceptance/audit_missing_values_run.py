"""Audit a direct live diagnostic from declared requests and separate full rows."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from missing_values_contract import audit_missing_values


def source_evidence(request, imported, upload, schema, content, source_policy=None):
    """Bind server upload verification to the executed import's observed settings."""
    digest = hashlib.sha256(content).hexdigest()
    declaration = source_policy or request
    path = declaration['parameters']['settings']['source']['source_path']
    verified = False
    try:
        rb = imported['configuration']['readback']
        outcome = upload['outcome']
        verified = all([
            imported['operation_id'] == request['operation_id'],
            imported['status'] == 'SUCCEEDED', imported['cleanup_complete'] is True,
            (imported['node'] == request['target']['ref'] if request['target']['kind'] == 'existing'
             else imported['node']['document_id'] == request['document_id'] and imported['node']['workflow_id'] == request['workflow_ref']['workflow_id']),
            imported['execution']['status'] == 'completed',
            imported['configuration']['status'] == 'applied',
            rb['kind'] == 'text_import', rb['node'] == imported['node'],
            rb['scope'] == 'observed_before_verified_finish', rb['values_are'] == 'observed_ui_values',
            rb['source']['source_path'] == path, rb['source']['encoding'] == 'UTF-8 (65001)',
            rb['source']['rows_to_skip'] == '0', rb['source']['first_line_as_title'] is True,
            rb['format'] == dict(delimiter=';', text_qualifier='"', null_marker='NULL', decimal_separator='.'),
            len(rb['columns']) == len(schema) and all(all(f.get(k) == v for k, v in expected.items()) for f, expected in zip(rb['columns'], schema)),
            all(f['used'] is True for f in rb['columns']),
            upload['state'] == 'settled', outcome['status'] == 'SUCCEEDED',
            outcome['upload_operation_id'] == declaration['parameters']['source']['upload_operation_id'],
            outcome['upload_completion_verified'] is True, outcome['cleanup_complete'] is True,
            outcome['destination'] == path, outcome['sha256'] == digest, outcome['bytes'] == len(content),
        ])
    except (KeyError, TypeError):
        pass
    return dict(verified=verified, sha256=digest, node=imported.get('node'), destination=path,
                execution_id=imported.get('execution', {}).get('execution_id'))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--evidence-dir', type=Path, required=True)
    p.add_argument('--case-id', required=True)
    p.add_argument('--expected-case', required=True)
    p.add_argument('--fixture', required=True)
    p.add_argument('--policy-request', type=Path, help='Prior declared policy for a preserve-settings execution')
    p.add_argument('--source-policy-request', type=Path, help='Prior declared saved import settings for a preserve-settings execution')
    p.add_argument('--previous-execution-id', action='append', default=[])
    p.add_argument('--graph-evidence', type=Path, help='Independent rendered graph proof; required for a new target')
    args = p.parse_args()
    root = Path(__file__).parent / 'fixtures' / 'missing-values'
    manifests = json.loads((root / 'expected.json').read_text())
    template = copy.deepcopy(manifests['cases'][args.expected_case])
    schema = template.pop('schema', manifests['schema'])
    read = lambda suffix: json.loads((args.evidence_dir / (args.case_id + suffix)).read_text())
    requests = read('-requests.json')
    imported, result = read('-import.json')['output'], read('-impute.json')['output']
    table = read('-impute-independent-full.json')
    upload = read('-upload.json')
    source_policy = json.loads(args.source_policy_request.read_text())['import'] if args.source_policy_request else requests['import']
    source = source_evidence(requests['import'], imported, upload, schema, (root / (args.fixture + '.csv')).read_bytes(), source_policy)
    policy_request = json.loads(args.policy_request.read_text())['impute'] if args.policy_request else requests['impute']
    policy = {f['field']['name']: {k: v for k, v in f.items() if k != 'field'} for f in policy_request['parameters']['fields']}
    # MISSING is a declared placeholder for the explicitly requested string.
    if policy.get('Note', {}).get('method') == 'constant':
        note_index = next(i for i, field in enumerate(schema) if field['name'] == 'Note')
        for row in template['rows']:
            if row[note_index] == 'MISSING':
                row[note_index] = policy['Note']['value']
    target = requests['impute']['target']
    graph = json.loads(args.graph_evidence.read_text()) if args.graph_evidence else None
    if requests['import']['target']['kind'] == 'new' and graph is None:
        raise ValueError('New source requires independent graph evidence')
    target_ref = target.get('ref')
    graph_verified = None
    if graph:
        candidates = [n for n in graph['nodes'] if n['icon'] == 'bg-vendor-icon-datarecovery']
        target_ref = dict(document_id=graph['document_id'], workflow_id=graph['workflow_id'], node_id=candidates[0]['node_id']) if len(candidates) == 1 else None
        graph_verified = (graph['verified'] is True and graph['read_only'] is True and target_ref is not None
                          and (target_ref == target['ref'] if target['kind'] == 'existing' else candidates[0]['label'] == target['label'])
                          and len(graph['links']) == 1
                          and graph['links'][0]['source']['node_id'] == imported['node']['node_id']
                          and (requests['import']['target']['kind'] == 'existing' or any(n['node_id'] == imported['node']['node_id'] and n['label'] == requests['import']['target']['label'] for n in graph['nodes']))
                          and graph['links'][0]['target']['node_id'] == target_ref['node_id'])
    if target_ref is None:
        raise ValueError('New target requires independent graph evidence')
    expected = dict(template, schema=schema, fields=policy,
                    operation_id=requests['impute']['operation_id'], node=target_ref,
                    source_node=imported['node'], source_path=source_policy['parameters']['settings']['source']['source_path'],
                    source_sha256=requests['source_sha256'], source_execution_id=imported['execution']['execution_id'],
                    previous_execution_ids=args.previous_execution_id)
    report = audit_missing_values(expected, result, table, source)
    if graph_verified is False:
        report['passed'] = False
        report['failures'].append('graph_source_target')
    report['graph_verified'] = graph_verified
    report.update(case_id=args.case_id, expected_case=args.expected_case, source_verified=source['verified'])
    (args.evidence_dir / (args.case_id + '-audit.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':
    main()
