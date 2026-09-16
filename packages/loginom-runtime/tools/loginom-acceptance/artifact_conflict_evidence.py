"""Audit a fixed-pin delivery conflict and the independently downloaded server bytes."""
from hashlib import sha256


def verify_delivery_conflict(events, seed, candidate, original_bytes, candidate_bytes,
                             server_bytes, delivery, replay, inspection, proof, runtime_revision):
    failures = []
    policy = candidate.get('upload', {}).get('overwrite')
    destination = candidate.get('upload', {}).get('destination')
    upload_id = delivery.get('upload_operation_id')
    if (policy not in ('reject', 'replace') or not runtime_revision or not events
            or any(e.get('runtime_revision') != runtime_revision for e in events)
            or len({e.get('session_id') for e in events}) != 1):
        failures.append('conflict_session_or_policy')
    if (seed.get('name') != candidate.get('name') or seed.get('upload', {}).get('destination') != destination
            or original_bytes == candidate_bytes):
        failures.append('conflict_fixture_identity')
    for artifact, data in ((seed, original_bytes), (candidate, candidate_bytes)):
        if artifact.get('bytes') != len(data) or artifact.get('sha256') != sha256(data).hexdigest():
            failures.append('conflict_admitted_bytes')
    expected = original_bytes if policy == 'reject' else candidate_bytes
    if (server_bytes != expected or proof.get('bytes') != len(server_bytes)
            or proof.get('sha256') != sha256(server_bytes).hexdigest()
            or proof.get('name') != candidate.get('name') or proof.get('policy') != policy
            or proof.get('saved') is not True):
        failures.append('conflict_server_bytes')
    if (replay.get('replayed') != delivery or type(replay.get('before')) is not int
            or replay.get('before') != replay.get('after') or delivery.get('state') != 'settled'
            or delivery.get('phase') != ('rejected' if policy == 'reject' else 'completed')
            or delivery.get('error') is not None):
        failures.append('conflict_delivery_lifecycle')
    phases = [e for e in events if e.get('operation_id') == delivery.get('operation_id')]
    if ([e.get('phase') for e in phases] != ['artifact_delivery_prepared', 'artifact_delivery_upload_receipt',
                                          'artifact_delivery_rejected' if policy == 'reject' else 'artifact_delivery_completed']
            or phases[-1].get('result') != delivery.get('outcome')
            or phases[0].get('destination') != destination or phases[0].get('overwrite') != policy
            or phases[0].get('artifact_id') != candidate.get('artifact_id')):
        failures.append('conflict_delivery_journal')
    rows = [e for e in events if e.get('operation_id') == upload_id and e.get('phase') in ('prepared', 'completed')]
    if [e.get('phase') for e in rows] != ['prepared', 'completed']:
        failures.append('conflict_submission_count')
    else:
        prepared, completed = rows
        raw = completed.get('outcome', {})
        params = prepared.get('parameters', {})
        if (prepared.get('checkpoint', {}).get('artifact') != candidate or params.get('overwrite') != policy
                or params.get('destination') != destination or params.get('artifact_id') != candidate.get('artifact_id')
                or params.get('upload_grant_id') != candidate.get('upload', {}).get('grant_id')):
            failures.append('conflict_upload_binding')
        trace = raw.get('trace', [])
        bound = [e for e in trace if e.get('event') == 'upload_conflict_bound']
        clicked = [e for e in trace if e.get('event') == 'upload_conflict_decision_clicked']
        if (len(bound) != 1 or len(clicked) != 1 or bound[0].get('destination') != destination
                or bound[0].get('policy') != policy or clicked[0].get('policy') != policy
                or bound[0].get('button_tid') != 'msgbox;tlb;' + ('no' if policy == 'reject' else 'yes')
                or sum(e.get('event') == 'upload_input_submitted' for e in trace) != 1
                or raw.get('cleanup_complete') is not True):
            failures.append('conflict_single_decision')
        observed = inspection.get('output', {})
        if (observed.get('operation_id') != upload_id or observed.get('state') != 'resolved'
                or observed.get('cleanup_confirmed') is not True):
            failures.append('conflict_transfer_resolution')
        if policy == 'reject':
            if (raw.get('status') != 'FAILED' or raw.get('error', {}).get('code') != 'UPLOAD_PATH_CONFLICT'
                    or raw.get('output') != {'upload_submitted': False, 'conflict_rejected': True, 'destination': destination}
                    or observed.get('outcome') != raw or delivery.get('outcome', {}).get('upload_completion_verified') is not False
                    or any(e.get('parameters', {}).get('upload_operation_id') == upload_id
                           and e.get('phase') == 'download_prepared' for e in events)):
                failures.append('conflict_rejection_semantics')
        else:
            transfer = observed.get('outcome', {})
            verified = transfer.get('output', {}).get('server_copy_verification', {})
            downloads = [e for e in events if e.get('parameters', {}).get('upload_operation_id') == upload_id
                         and e.get('phase') == 'download_verified']
            if (raw.get('status') != 'AMBIGUOUS' or raw.get('output', {}).get('upload_submitted') is not True
                    or transfer.get('status') != 'SUCCEEDED' or verified.get('upload_completion_verified') is not True
                    or verified.get('bytes_verified') is not True or verified.get('destination') != destination
                    or verified.get('sha256') != candidate.get('sha256') or verified.get('bytes') != candidate.get('bytes')
                    or len(downloads) != 1):
                failures.append('conflict_replacement_verification')
    return {'passed': not failures, 'failures': sorted(set(failures)), 'scope': 'integrated_delivery_conflict_' + str(policy),
            'server_bytes_verified': not failures, 'package_persistence_verified': False, 'hermes_acceptance_verified': False,
            'journal_authentication_verified': False}
