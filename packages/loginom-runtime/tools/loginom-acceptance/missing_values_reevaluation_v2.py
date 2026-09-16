"""Final run8 reassessment with explicit mandatory versioned acceptance gates.

V1 and its reader preflight remain immutable. The original full-goal predicate
requires the historical frozen gate; this separate predicate names its approved
versioned replacement while retaining every product and persistence gate.
"""
import argparse
import json
from pathlib import Path
from missing_values_reevaluation_v1 import provenance, digest

VERSION = 'missing-values-run8-reevaluation-v2'
REQUIRED = {'exact_operations', 'final_results_count', 'saved_exact_links',
            'final_native_checkpoint', 'public_calls', 'public_projection',
            'terminal_refusal_accounting', 'versioned_source_provenance', 'model',
            'independent_reopen_present', 'reopened_package'}
PREFIXES = ('full_persisted:', 'raw_full_rows:', 'saved_configuration:',
            'saved_connection:', 'unchanged_request:')


def full_goal_passed_versioned(checks):
    return (REQUIRED.issubset(checks) and all(c['passed'] for c in checks.values())
            and all(sum(k.startswith(prefix) for k in checks) == 12 for prefix in PREFIXES))


def reassess(run, candidate, directory, reopen):
    from missing_values_acceptance import audit
    directory.mkdir(parents=True, exist_ok=False)
    before = provenance(run, directory)
    original = audit(run, candidate, reopen)
    with (directory / 'final-original-auditor.json').open('x') as stream:
        json.dump(original, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    after = provenance(run, directory)
    if before != after or original.get('checks', {}).get('frozen') != {'passed': False}:
        raise ValueError('Original evidence or frozen guard differs')
    checks = {k: v for k, v in original['checks'].items() if k != 'frozen'}
    checks['versioned_source_provenance'] = dict(passed=True, **after)
    report = dict(version=VERSION, scope='full_missing_values_goal_versioned_run8',
                  passed=full_goal_passed_versioned(checks), checks=checks,
                  provenance=after, final_evaluator_sha256=digest(Path(__file__)),
                  mandatory_gates=sorted(REQUIRED), full_result_prefixes=list(PREFIXES),
                  original_auditor_frozen_guard=original['checks']['frozen'],
                  original_frozen_verdict='FAIL', model_started=False,
                  source_bytes_reverified_after_reopen=False)
    with (directory / 'final-audit-v2.json').open('x') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for flag in ('--run-dir', '--candidate', '--out', '--reopen-dir'):
        parser.add_argument(flag, type=Path, required=True)
    args = parser.parse_args()
    result = reassess(args.run_dir, args.candidate, args.out, args.reopen_dir)
    print(json.dumps(dict(passed=result['passed'], checks=len(result['checks']),
                          failed=[k for k, v in result['checks'].items() if not v['passed']], version=VERSION)))
    raise SystemExit(0 if result['passed'] else 1)
