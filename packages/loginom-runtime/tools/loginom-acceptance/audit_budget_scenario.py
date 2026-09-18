"""Independent task 47 audit; model answers alone never establish a PASS."""
import argparse
import json
from pathlib import Path

from audit_sales_scenario import require
from audit_corpus_tables import audit_tables
from audit_budget_settings import audit_saved_tabular_settings
from audit_exported_csv import audit_exported_csv
from scenario_audit_plan import confirmed_save


def audit_tabular_scenario(dataset, request, evidence, plan, expected, index, business, run=None):
    require(plan['task'] in (19,21,34,38,47), 'Reviewed tabular auditor task required')
    require(evidence['runtime_source_unchanged'] is True and evidence['process']['returncode'] == 0
            and not evidence['process']['timed_out'], 'Completed unchanged model run required')
    require(evidence['effective_models'] and all(m['model'] == 'mimo-v2.5' for m in evidence['effective_models']), 'Effective model differs')
    require(plan['operator_reviewed'] is True and plan['run_id'] == request['run_id'], 'Reviewed plan identity differs')
    require(business.get('operator_reviewed') is True and business['run_id'] == request['run_id']
            and business['status'] in ('PASS', 'FAIL'), 'Explicit independent business review required')
    has_exports = any(n['type'] == 'exports.text' for n in plan['expected_graph']['nodes'])
    require(not has_exports or run is not None, 'Exported CSV audit requires native downloaded files')
    results = [t['result'] for t in evidence['tools'] if isinstance(t.get('result'), dict)]
    require(any(confirmed_save(r, request['package']) for r in results), 'Saved package receipt missing')
    imports = [o for o in plan['model_operations_for_review'] if 'source' in o['parameters']]
    require(len(imports) == 1, 'Exactly one reviewed budget import required')
    upload = imports[0]['parameters']['source']['upload_operation_id']
    destinations = {r['output']['destination'] for r in results if r.get('status') == 'SUCCEEDED'
                    and r.get('output', {}).get('upload_operation_id') == upload}
    require(len(destinations) == 1, 'Unique verified import delivery required')
    actual = dict(nodes=sorted([dict(id=n['ref']['node_id'], type=n['type'], label=n['label']) for n in index['graph_before']['nodes']], key=lambda n:n['id']),
                  links=sorted([dict(source=e['source'], output=e['output'], target=e['target'], input=e['input']) for e in index['graph_before']['links']], key=lambda e:json.dumps(e, sort_keys=True)))
    planned = dict(nodes=sorted(plan['expected_graph']['nodes'], key=lambda n:n['id']),
                   links=sorted(plan['expected_graph']['links'], key=lambda e:json.dumps(e, sort_keys=True)))
    require(actual == planned, 'Saved graph differs from reviewed model operations')
    numerical = audit_tables(dataset, request, index, expected)
    settings = audit_saved_tabular_settings(plan, index, next(iter(destinations)))
    exports = audit_exported_csv(run, plan, expected, evidence) if has_exports else dict(status='not_applicable')
    numerical['remaining_reviews'] = []
    return dict(status=business['status'], scope='full_declared_task_'+str(plan['task']), run_id=request['run_id'],
                saved_graph='PASS', numerical=numerical, saved_settings=settings, exported_files=exports, business_review=business,
                model=request['model'], runtime=request['runtime_source_pin']['client_revision'])


def audit_budget_scenario(dataset, request, evidence, plan, expected, index, business, run=None):
    require(plan['task']==47, 'Budget task required')
    return audit_tabular_scenario(dataset,request,evidence,plan,expected,index,business,run)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('dataset', 'run', 'plan', 'expected', 'reopen', 'business-review', 'out'):
        parser.add_argument('--'+name, type=Path, required=True)
    args = parser.parse_args()
    read = lambda path: json.loads(path.read_text())
    result = audit_tabular_scenario(args.dataset, read(args.run/'request.json'), read(args.run/'evidence.json'),
                                   read(args.plan), read(args.expected), read(args.reopen/'index.json'), read(args.business_review), args.run)
    with args.out.open('x') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({k: result[k] for k in ('status', 'scope', 'run_id')}))
