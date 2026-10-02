"""Bind normal CLI native package/logout receipt to its last owned Save.

The caller authenticates immutable files, SQLite projection and runtime/candidate
bytes. This helper does not infer process exit from a receipt or certify whole CLI.
Historical isolated cleanup and unprepared skip cannot satisfy this contract.
"""
from datetime import datetime, timezone
import re
from javascript_cli_evidence import value_digest
from javascript_cli_nodes import native_identity
from javascript_cli_persistence import verify_cli_last_save


def native_time(value):
    if not isinstance(value,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z',value):
        raise ValueError('cli_cleanup_native_timestamp')
    return int(datetime.strptime(value,'%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=timezone.utc).timestamp()*1000)


def verify_cli_package_cleanup(events,native_events,source_operation_id,final_path,revisions,expected,receipt,projection):
    failures = []
    save_id = None
    try:
        save = verify_cli_last_save(events,native_events,source_operation_id,final_path,revisions,expected)
        if not save['passed']:raise ValueError('cli_cleanup_last_save_unverified')
        save_id = save['save_operation_id']
        selected = [(i,r) for i,r in enumerate(native_events) if r.get('event') == 'managed_saved_package_cleanup']
        if (len(selected) != 1 or any(r.get('event') == 'isolated_package_cleanup' for r in native_events)):
            raise ValueError('cli_cleanup_normal_event_required')
        position,row = selected[0]
        if (not native_identity(row,expected) or value_digest(row.get('cleanup')) != value_digest(receipt)
                or position != len(native_events)-1):
            raise ValueError('cli_cleanup_native_receipt_binding')
        source = next(r['request'] for r in native_events if r.get('phase') == 'node_apply_prepared'
            and r.get('operation_id') == source_operation_id)
        if (type(receipt.get('version')) is not int or receipt['version'] != 1
                or receipt.get('status') != 'SUCCEEDED' or 'reason' not in receipt or receipt['reason'] is not None
                or receipt.get('policy') != 'last_confirmed_own_save'
                or receipt.get('save_operation_id') != save_id or receipt.get('package_path') != final_path
                or receipt.get('session_id') != expected['runtime_session_id']
                or receipt.get('document_id') != source['document_id'] or receipt.get('account') != expected['account']
                or any(receipt.get(k) is not True for k in ('package_closed','logged_out'))
                or receipt.get('unsaved_changes_discarded') is not False
                or type(receipt.get('packages_before')) is not int or receipt['packages_before'] != 1
                or type(receipt.get('packages_after')) is not int or receipt['packages_after'] != 0):
            raise ValueError('cli_cleanup_owned_native_close_logout')
        starts,completed,recorded = (native_time(receipt['started_at']),native_time(receipt['completed_at']),native_time(row['recorded_at']))
        if not starts <= completed <= recorded:raise ValueError('cli_cleanup_native_time_order')
        # A model terminal is separate from tool terminal delivery. Never replace
        # the actual SQLite assistant completion time with a controller guess.
        models = [m for m in projection['models'] if m.get('role') == 'assistant']
        if (projection.get('session_id') != expected['cli_session_id'] or not models
                or any(type(m.get('time',{}).get('completed')) is not int or m['time']['completed'] <= 0 for m in models)
                or max(m['time']['completed'] for m in models) > starts):
            raise ValueError('cli_cleanup_before_actual_model_terminal')
        states = [(i,r) for i,r in enumerate(native_events) if r.get('phase') == 'saved_package_state_observed'
            and r.get('operation_id') == save_id]
        if (not states or states[-1][0] >= position or native_time(states[-1][1]['recorded_at']) > starts
                or any(e['part']['state']['time']['end'] > starts for e in events if e.get('type') == 'tool_use')):
            raise ValueError('cli_cleanup_save_or_tool_time_order')
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'cli_cleanup_evidence_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),save_operation_id=save_id,package_path=final_path,
        scope='normal_cli_last_save_native_package_close_logout_binding',normal_package_cleanup_receipt_verified=not failures,
        native_package_close_logout_verified=not failures,model_terminal_order_verified=not failures,
        authenticated_journal_verified=False,process_cleanup_verified=False,cold_persistence_verified=False,cli_acceptance_verified=False)
