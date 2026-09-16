"""Independent-reader correction; preserve the original model's frozen harness.

Node12 already accepts saved field permutations (12-review-fix-2026-09-13.md
and duplicates_output_evidence.py). This applies that same rule to independent
RC reading. It never derives expected values or field definitions from results.
"""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import rc_combined_acceptance as base


def permute_duplicates_oracle(expected, schema):
    keys = ('name', 'label', 'type')
    canonical = lambda columns: sorted(tuple(c[k] for k in keys) for c in columns)
    columns = expected['columns']
    base.need(len({c['name'] for c in schema}) == len(columns) and canonical(schema) == canonical(columns),
              'duplicates_saved_field_definitions')
    positions = {c['name']: i for i, c in enumerate(columns)}
    indexes = [positions[c['name']] for c in schema]
    return dict(columns=[deepcopy(columns[i]) for i in indexes],
                rows=[[row[i] for i in indexes] for row in expected['rows']])


def complete_audit(run, reopen):
    result = base.model_audit(run)  # original source/goal/receipt checks unchanged
    if reopen and result['model_checks_passed']:
        plan = result['reopen_plan']
        duplicate_id = plan['nodes'].get('Duplicates', {}).get('node', {}).get('node_id')
        original = base.reopened_table_proof

        def bound_table_proof(events, actual, expected):
            if duplicate_id and actual['node']['node_id'] == duplicate_id:
                expected = permute_duplicates_oracle(expected, actual['output']['ports'][0]['schema'])
            return original(events, actual, expected)

        try:
            base.reopened_table_proof = bound_table_proof
            result['checks']['independent_reopen'] = base.reopen_audit(reopen, plan)
        finally:
            base.reopened_table_proof = original
        result['passed'] = result['checks']['independent_reopen']['passed']
        result['scope'] = 'combined_handlers_complete_scenario'
        result['limitation'] = None if result['passed'] else 'Independent reopen did not pass'
    result['operator_audit_revision'] = {p.name: base.digest(p) for p in (
        Path(__file__), Path(__file__).with_name('rc-combined-reopen-v2.mjs'))}
    return result


def main():
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--reopen',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    result=complete_audit(a.run,a.reopen)
    with a.out.open('x') as output:json.dump(result,output,ensure_ascii=False,indent=2);output.write('\n')
    print(json.dumps({'passed':result['passed'],'ready_for_reopen':result['ready_for_reopen'],
        'failed':[k for k,v in result['checks'].items() if not v.get('passed')]}))
    return 0 if (result['passed'] if a.reopen else result['ready_for_reopen']) else 1


if __name__=='__main__':raise SystemExit(main())
