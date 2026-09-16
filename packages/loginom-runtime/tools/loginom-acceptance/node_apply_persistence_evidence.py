"""Compose task, save chain, real preparation and native fresh-output proofs.

Provenance, delivery, complete public-call accounting and autonomous model gates
remain required in the outer acceptance auditor. Never use this as its verdict.
"""
from node_apply_goal_contract import verify_sales_goal_request
from node_apply_save_chain import verify_save_chain
from node_apply_reopen_binding import verify_reopen_binding
from existing_import_evidence import _verify_existing_import_output


def verify_sales_persistence(evidence, seed_request, reopened_request, run_id,
                             directory, source_bytes, final_path, revisions):
    checks = {}
    checks['task'] = verify_sales_goal_request(seed_request, run_id, directory, source_bytes)
    checks['saves'] = verify_save_chain(evidence['events'], seed_request, final_path, revisions)
    if checks['saves']['passed']:
        checks['preparation'] = verify_reopen_binding(evidence, seed_request, reopened_request,
                                                     checks['saves']['save_operation_ids'][1], final_path)
    if all(check.get('passed') is True for check in checks.values()) and 'preparation' in checks:
        # The reopen exception is only enabled after checking the real saved
        # package and fresh workflow binding; the verifier retains node identity,
        # native settings/mapping observations and a distinct execution ID.
        checks['native_output'] = _verify_existing_import_output(
            evidence['events'], seed_request, reopened_request, source_bytes, reopened_package=True)
    passed = len(checks) == 4 and all(check.get('passed') is True for check in checks.values())
    return dict(passed=passed, checks=checks,
                scope='sales_saved_settings_and_fresh_output',
                package_persistence_verified=passed, hermes_acceptance_verified=False,
                public_effect_accounting_verified=False, provenance_verified=False)
