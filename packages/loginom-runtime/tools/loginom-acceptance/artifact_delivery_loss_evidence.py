"""Verify refusal to replay a transfer after destruction of its UI document."""
def verify_delivery_document_loss(events, initial, result, replay, loss, final_observation):
    failures = []
    upload_id = result.get('upload_operation_id')
    out = result.get('outcome', {})
    if (result.get('state') != 'settled' or out.get('status') != 'AMBIGUOUS'
            or out.get('inspection_required') is not True or out.get('upload_operation_id') != upload_id
            or initial.get('upload_operation_id') != upload_id or initial.get('outcome', {}).get('status') != 'AMBIGUOUS'):
        failures.append('loss_unresolved_transfer_required')
    if (replay.get('replayed') != result or type(replay.get('before')) is not int
            or replay.get('before') != replay.get('after')):
        failures.append('loss_replay_effect')
    before, after = loss.get('before', {}), final_observation.get('output', {})
    if (loss.get('closed') is not True or not loss.get('document') or before.get('dom_epoch', {}).get('document') != loss['document']
            or before.get('authenticated') is not True or before.get('operation', {}).get('operation_id') != upload_id
            or before.get('operation', {}).get('state') != 'pending'
            or after.get('authenticated') is not False or after.get('dom_epoch', {}).get('document') in (None, loss['document'])):
        failures.append('loss_document_transition')
    uploads = [e for e in events if e.get('action_key') == 'artifact.upload' and e.get('phase') == 'prepared']
    starts = [e for e in events if e.get('phase') == 'artifact_delivery_resume_started']
    reads = [e for e in events if e.get('phase') == 'artifact_delivery_resume_inspected']
    if (len(uploads) != 1 or uploads[0].get('operation_id') != upload_id
            or uploads[0].get('parameters', {}).get('destination', '').rsplit('/', 1)[0] != before.get('file_storage', {}).get('directory')
            or len(starts) != 1 or len(reads) != 1 or starts[0].get('verification_started') is not False
            or starts[0].get('resume_id') != reads[0].get('resume_id')):
        failures.append('loss_original_upload_and_resume')
    if any(e.get('phase') in ('download_prepared', 'artifact_delivery_completed', 'node_apply_started')
           or e.get('action_key') == 'node.apply' for e in events):
        failures.append('loss_dependent_work_dispatched')
    if starts and any(e.get('phase') == 'prepared' and e.get('action_key') == 'ui.act'
                      for e in events[events.index(starts[0])+1:]):
        failures.append('loss_navigation_replayed')
    return {'passed': not failures, 'failures': failures, 'scope': 'delivery_document_loss_refusal',
            'transfer_verified': False, 'package_persistence_verified': False, 'hermes_acceptance_verified': False}
