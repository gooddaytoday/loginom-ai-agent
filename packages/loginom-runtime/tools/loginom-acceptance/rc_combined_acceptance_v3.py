"""Reuse the accepted native service-node rule without changing frozen audits."""
import argparse
import json
from pathlib import Path
import rc_combined_acceptance as base
import rc_combined_acceptance_v2 as previous
from date_time_sales_acceptance import analytical_nodes


def complete_audit(run, reopen):
    original = base.reopened_graph_proof

    def analytical_graph_proof(graph, plan):
        # Same native scenario-variables icon rule as the accepted node13 audit.
        # Unknown nodes, duplicate service icons and links to it still fail.
        return original(dict(graph, nodes=analytical_nodes(graph)), plan)

    try:
        base.reopened_graph_proof = analytical_graph_proof
        result = previous.complete_audit(run, reopen)
    finally:
        base.reopened_graph_proof = original
    result['operator_audit_revision'][Path(__file__).name] = base.digest(Path(__file__))
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--run', type=Path, required=True)
    p.add_argument('--reopen', type=Path)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    result = complete_audit(a.run, a.reopen)
    with a.out.open('x') as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps(dict(passed=result['passed'], ready_for_reopen=result['ready_for_reopen'],
                         failed=[k for k, v in result['checks'].items() if not v.get('passed')])))
    return 0 if (result['passed'] if a.reopen else result['ready_for_reopen']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
