"""Independent audit of private delivery followed by the full text import."""
import re
from datetime import datetime
from import_output_evidence import verify_text_import_output
from import_source_binding import source_with_delivery_metadata
from import_execution_evidence import verify_text_import_source_execution


def preupload_delivery_restarts(events, operation_id):
    """Validate retained navigation checkpoints without erasing failed attempts.

    Each restart precedes the only upload. Public resume authorization is checked
    separately by the CLI binding auditor; this function proves native continuity.
    """
    phases = [(i,e) for i,e in enumerate(events) if e.get('operation_id') == operation_id]
    starts = [(i,e) for i,e in phases if e.get('phase') == 'artifact_delivery_prepared']
    checkpoints = [(i,e) for i,e in phases if e.get('phase') == 'artifact_delivery_preupload_checkpoint']
    if len(starts) <= 1 and not checkpoints:return []
    if len(starts) != len(checkpoints)+1 or not starts:
        raise ValueError('delivery_preupload_restart_count')
    owner = ('session_id','runtime_revision','manifest_sha256','target')
    identity = ('artifact_id','destination','bytes','sha256','overwrite')
    first = starts[0][1]
    if (any(first.get(k) is None for k in owner+identity)
            or type(first['bytes']) is not int or first['bytes'] < 0
            or not re.fullmatch('[a-f0-9]{64}',first['sha256']) or first['overwrite'] not in ('reject','replace')):
        raise ValueError('delivery_preupload_identity')
    upload_id = operation_id+':upload'
    if any(e.get('operation_id') == upload_id or str(e.get('operation_id','')).startswith(upload_id+':')
            for e in events[:starts[-1][0]]):
        raise ValueError('delivery_preupload_effect_before_restart')
    result = []
    upload_index = next((i for i,e in enumerate(events) if e.get('operation_id') == upload_id),len(events))
    for ordinal,(checkpoint_index,checkpoint) in enumerate(checkpoints):
        begin,start = starts[ordinal]
        restart,next_start = starts[ordinal+1]
        if ([e.get('phase') for _,e in phases[ordinal*2:ordinal*2+3]] !=
                ['artifact_delivery_prepared','artifact_delivery_preupload_checkpoint','artifact_delivery_prepared']
                or not begin < checkpoint_index < restart
                or checkpoint.get('upload_started') is not False
                or type(checkpoint.get('navigation_step')) is not int or checkpoint['navigation_step'] < 0
                or not isinstance(checkpoint.get('document'),str) or not checkpoint['document']
                or any(e.get('internal_provenance') != 'artifact_delivery_v1' for e in (start,checkpoint,next_start))
                or any(any(e.get(k) != first[k] for k in owner) for e in (start,checkpoint,next_start))
                or any(next_start.get(k) != first[k] for k in identity)):
            raise ValueError('delivery_preupload_checkpoint_binding')
        before = [e for e in events[begin+1:checkpoint_index] if e.get('phase') == 'observation_completed']
        times = [datetime.fromisoformat(e['recorded_at'].replace('Z','+00:00')) for e in (start,checkpoint,next_start)]
        if not times[0] <= times[1] <= times[2]:raise ValueError('delivery_preupload_native_order')
        after = [e for e in events[restart+1:upload_index] if e.get('phase') == 'observation_completed']
        if not before or not after:
            raise ValueError('delivery_preupload_document_observation')
        for row in (before[-1],after[0]):
            outcome = row.get('outcome',{})
            if (any(row.get(k) != first[k] for k in owner) or outcome.get('status') != 'SUCCEEDED'
                    or outcome.get('action_key') != 'workspace.observe'
                    or outcome.get('output',{}).get('dom_epoch',{}).get('document') != checkpoint['document']):
                raise ValueError('delivery_preupload_document_observation')
        result.append((start,checkpoint,next_start))
    return result


def verify_integrated_delivery(events, request, source_bytes, delivery, replay, runtime_revision):
    return _verify_delivered_import(events, request, source_bytes, delivery, runtime_revision, replay=replay, require_replay=True)


def verify_delivered_import_output(events, request, source_bytes, delivery, runtime_revision):
    """Verify delivery bytes and fresh import without requiring an extra replay.

    Public call accounting must be checked by the autonomous caller's auditor.
    The historical explicit-replay gate above remains unchanged.
    """
    return _verify_delivered_import(events, request, source_bytes, delivery, runtime_revision)


def verify_delivered_existing_import_output(events, seed_request, request, source_bytes, delivery, runtime_revision, *, seed_source_bytes):
    """Bind replacement delivery/output to an independently verified earlier seed."""
    return _verify_delivered_import(events, request, source_bytes, delivery, runtime_revision,
                                   seed_request=seed_request, seed_source_bytes=seed_source_bytes)


def verify_delivered_import_source_execution(events, request, source_bytes, delivery, runtime_revision):
    """Delivery, configuration and native execution, never exact preview cells."""
    result = verify_text_import_source_execution(events, request, source_bytes)
    return _verify_delivery(events,request,delivery,runtime_revision,result,
        scope='integrated_delivery_to_fresh_import_execution_without_output_data_proof')


def _verify_delivered_import(events, request, source_bytes, delivery, runtime_revision, *, replay=None, require_replay=False,
                             seed_request=None, seed_source_bytes=None):
    if seed_request is None:
        result = verify_text_import_output(events, request, source_bytes)
    else:
        from existing_import_evidence import verify_existing_import_output
        result = verify_existing_import_output(events, seed_request, request, source_bytes, seed_source_bytes=seed_source_bytes)
    return _verify_delivery(events,request,delivery,runtime_revision,result,replay=replay,require_replay=require_replay)


def _verify_delivery(events,request,delivery,runtime_revision,result,*,replay=None,require_replay=False,
                     scope='integrated_delivery_to_fresh_import_output'):
    failures = list(result['failures'])
    source = source_with_delivery_metadata(events, request['parameters']['source'])
    path = request['parameters']['settings']['source']['source_path']
    name = path.rsplit('/', 1)[-1]
    upload_id = source['upload_operation_id']
    if not events or any(e.get('runtime_revision') != runtime_revision for e in events):
        failures.append('delivery_runtime_pin')
    if (delivery.get('state') != 'settled' or delivery.get('phase') != 'completed' or delivery.get('error') is not None
            or delivery.get('upload_operation_id') != upload_id):
        failures.append('delivery_lifecycle_or_replay')
    if require_replay and (not isinstance(replay, dict) or replay.get('replayed') != delivery
            or type(replay.get('before')) is not int or replay.get('before') != replay.get('after')):
        failures.append('delivery_lifecycle_or_replay')
    out = delivery.get('outcome', {})
    if (out.get('status') != 'SUCCEEDED' or out.get('cleanup_complete') is not True
            or out.get('upload_completion_verified') is not True or out.get('upload_operation_id') != upload_id
            or out.get('destination') != path or any(out.get(k) != source[k] for k in ['bytes', 'sha256'])):
        failures.append('delivery_source_identity')
    phases = [e for e in events if e.get('operation_id') == delivery.get('operation_id')]
    upload_recovery = [e for e in phases if e['phase'] == 'artifact_delivery_upload_reconciled']
    verify_recovery = [e for e in phases if e['phase'] == 'artifact_delivery_verification_reconciled']
    try:
        restarts = preupload_delivery_restarts(events,delivery.get('operation_id'))
    except (ValueError,KeyError,TypeError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'delivery_preupload_malformed')
        restarts = []
    expected_phases = ['artifact_delivery_prepared','artifact_delivery_preupload_checkpoint'] * len(restarts)
    expected_phases.extend(['artifact_delivery_prepared', 'artifact_delivery_upload_receipt'])
    if upload_recovery:
        expected_phases.append('artifact_delivery_upload_reconciled')
        recovered_rows = [e for e in events if e.get('operation_id') == upload_id and e.get('phase') == 'receipt_recovered']
        inspection = upload_recovery[0].get('inspection', {}).get('output', {})
        receipt = inspection.get('outcome', {})
        if (len(recovered_rows) != 1 or recovered_rows[0].get('outcome') != receipt
                or inspection.get('operation_id') != upload_id or inspection.get('cleanup_confirmed') is not True
                or receipt.get('operation_id') != upload_id or receipt.get('cleanup_complete') is not True
                or receipt.get('output', {}).get('upload_submitted') is not True):
            failures.append('delivery_upload_recovery_binding')
    resume_starts = [e for e in phases if e['phase'] == 'artifact_delivery_resume_started']
    resume_reads = [e for e in phases if e['phase'] == 'artifact_delivery_resume_inspected']
    if resume_starts or resume_reads:
        expected_phases.extend(['artifact_delivery_resume_started', 'artifact_delivery_resume_inspected'])
        if len(resume_starts) != 1 or len(resume_reads) != 1:
            failures.append('delivery_resume_count')
        else:
            start, read = resume_starts[0], resume_reads[0]
            inspected = read.get('inspection', {}).get('output', {})
            child = inspected.get('outcome', {})
            downloads_before = [e for e in events[:events.index(start)] if e.get('phase') == 'download_prepared'
                                and e.get('parameters', {}).get('upload_operation_id') == upload_id]
            if (not start.get('resume_id') or start.get('resume_id') != read.get('resume_id')
                    or start.get('upload_operation_id') != upload_id or inspected.get('operation_id') != upload_id
                    or inspected.get('cleanup_confirmed') is not True or child.get('operation_id') != upload_id
                    or child.get('cleanup_complete') is not True):
                failures.append('delivery_resume_identity')
            if start.get('verification_started') is True:
                proof = child.get('output', {}).get('server_copy_verification', {})
                if (len(downloads_before) != 1 or inspected.get('state') != 'resolved' or child.get('status') != 'SUCCEEDED'
                        or proof.get('upload_completion_verified') is not True or proof.get('bytes_verified') is not True
                        or proof.get('destination') != path or any(proof.get(k) != source[k] for k in ['bytes', 'sha256'])):
                    failures.append('delivery_resume_completed_verification')
            elif start.get('verification_started') is False:
                if (downloads_before or inspected.get('state') != 'pending' or child.get('output', {}).get('upload_submitted') is not True
                        or child.get('output', {}).get('destination') != path):
                    failures.append('delivery_resume_pending_upload')
            else:
                failures.append('delivery_resume_phase_missing')
    if verify_recovery:
        expected_phases.append('artifact_delivery_verification_reconciled')
        inspection = verify_recovery[0].get('inspection', {}).get('output', {})
        verified = inspection.get('outcome', {}).get('output', {}).get('server_copy_verification', {})
        if (inspection.get('operation_id') != upload_id or inspection.get('state') != 'resolved'
                or inspection.get('cleanup_confirmed') is not True or verified.get('bytes_verified') is not True
                or verified.get('verification_id') != out.get('verification_id')):
            failures.append('delivery_verification_recovery_binding')
    expected_phases.append('artifact_delivery_completed')
    if [e['phase'] for e in phases] != expected_phases:
        failures.append('delivery_phase_order')
    elif phases[-1].get('result') != out or phases[0].get('artifact_id') != source['artifact_id'] or phases[0].get('destination') != path:
        failures.append('delivery_journal_result')
    submitted = [e for e in events if e.get('operation_id') == upload_id and e.get('phase') == 'prepared' and e.get('action_key') == 'artifact.upload']
    if len(submitted) != 1:
        failures.append('delivery_submission_count')
    downloads = [e for e in events if e.get('phase') == 'download_completed' and e.get('parameters', {}).get('upload_operation_id') == upload_id]
    if len(downloads) != 1:
        failures.append('delivery_download_count')
    else:
        row = downloads[0]
        raw = row['outcome']
        binding = row.get('checkpoint', {}).get('discovery', {})
        trace = raw.get('trace', [])
        discovered = [e for e in trace if e.get('event') == 'artifact_file_discovered']
        gestures = [e for e in trace if e.get('event') == 'download_gesture_result']
        if raw.get('status') != 'SUCCEEDED' or row['operation_id'] != out.get('verification_id'):
            failures.append('delivery_download_receipt')
        if len(discovered) != 1 or not binding:
            failures.append('delivery_discovery_missing')
        else:
            d = discovered[0]
            prefix = binding['workflow_ref']['prefix']
            expected_tid = prefix + ';FileStorageForm;colName_' + re.sub(r'\s', '_', name).replace(',', '')
            if (d.get('file_ref') != raw.get('output', {}).get('file_ref') or d.get('file_tid') != expected_tid
                    or d.get('directory') != path.rsplit('/', 1)[0]
                    or any(d.get(k) != binding.get(k) for k in ['document', 'workflow_ref', 'active_tab_ref'])):
                failures.append('delivery_discovery_binding')
            moves = [e for e in trace if e.get('event') == 'artifact_discovery_scroll']
            # Native discovery uses at most 96 iterations. Its legacy `scrolls`
            # field is trace.length BEFORE appending the discovery event, and
            # includes readiness/refresh/size observations as well as moves.
            if (len(moves) >= 96 or type(d.get('scrolls')) is not int or d['scrolls'] != trace.index(d)
                    or any(trace.index(move) >= trace.index(d) for move in moves)):
                failures.append('delivery_scroll_bound')
            previous = None
            for move in moves:
                valid = all(type(move.get(k)) in (int, float) for k in ['from', 'to', 'actual', 'max'])
                if (not valid or move.get('applied') is not True or move.get('grid_tid') != prefix + ';FileStorageForm;pnlFileStorage;tbl'
                        or move.get('directory') != d.get('directory') or move['actual'] != move['to']
                        or not 0 < abs(move['to'] - move['from']) <= 700 or not 0 <= move['to'] <= move['max']
                        or previous is not None and move['from'] != previous):
                    failures.append('delivery_scroll_identity')
                previous = move.get('to')
        if len(gestures) != 1 or gestures[0].get('status') != 'SUCCEEDED' or gestures[0].get('cleanup_complete') is not True:
            failures.append('delivery_download_gesture')
    return dict(result, passed=not failures, failures=sorted(set(failures)), scope=scope,
                integrated_delivery_verified=not failures, package_persistence_verified=False, hermes_acceptance_verified=False)
