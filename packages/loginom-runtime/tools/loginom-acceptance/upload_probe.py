"""Declared synthetic upload probe; never a complete data-pipeline verdict."""
from prepare_binding import successful_prepare
import re
import copy
import rename_effect
from destinations import storage_segments, render_goal

FIXTURE = 'fixtures/data-pipeline/sales.csv'
FIXTURE_SHA = 'f628434c20873f7dd9a8ee142c17af7c0b99f447114fcf60e983f6ed6b357eb3'


def descriptor(run_id, directory):
    storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}', run_id):
        raise ValueError('Invalid upload probe run identity')
    name = 'Dock-upload-' + run_id + '.csv'
    return {'name': name, 'bytes': 230, 'sha256': FIXTURE_SHA,
            'upload': {'directory': directory, 'overwrite': 'replace'}}


def prompt(template, package_path, directory, run_id):
    artifact = descriptor(run_id, directory)
    return render_goal(template, package_path, directory).replace('__UPLOAD_NAME__', artifact['name'])


def delivered_directory(reads, evidence, call, directory):
    """One issued snapshot can be delivered through multiple authenticated pages."""
    if not reads or any(r.get('session_id') != call.get('session_id') or
            r['result'].get('output', {}).get('file_storage', {}).get('directory') != directory for r in reads):
        return False
    if len(reads) == 1:
        return True
    try:
        previous = None
        revision = reads[0]['result']['output']['observation_revision']
        for read in sorted(reads, key=lambda r: r['row']):
            result = copy.deepcopy(read['result'])
            result['output'].pop('operation', None)
            page = result['output']['page']
            records = [e for e in evidence['events'] if e.get('phase') == 'observation_completed'
                       and e.get('operation_id') == result.get('operation_id')]
            calls = [c for c in evidence['calls'] if c.get('session_id') == read['session_id']
                     and c.get('tool_call_id') == read['tool_call_id'] and c.get('tool') == read['tool']
                     and c['row'] < read['row']]
            if (len(records) != 1 or len(calls) != 1
                    or result['output']['observation_revision'] != revision
                    or not rename_effect.journal_equal(records[0]['outcome'], result)):
                return False
            if previous is None:
                if page['offset'] != 0 or calls[0]['arguments'].get('cursor'):
                    return False
            elif (page['offset'] != previous['offset'] + previous['returned']
                  or calls[0]['arguments'].get('cursor') != previous['next_cursor']
                  or page['total_records'] != previous['total_records']):
                return False
            previous = page
        return True
    except (KeyError, TypeError, ValueError):
        return False


def audit(evidence, checks, request, prefix, mutations, storage_audit):
    """Prove one input submission and retained uncertainty, not server success."""
    def check(name, passed):
        checks.append({'name': name, 'passed': bool(passed)})
    expected = descriptor(request['run_id'], request['storage_directory'])
    check('probe_artifact_predeclared', request.get('input_artifact') == expected
          and request.get('harness_inputs', {}).get(FIXTURE) == FIXTURE_SHA)
    calls, tools, events = (evidence[k] for k in ('calls', 'tools', 'events'))
    uploads = [c for c in calls if c['tool'] == prefix + 'dock_artifact_upload']
    check('exactly_one_upload_request', len(uploads) == 1)
    if len(uploads) != 1:
        return {'all_assertions_passed': False, 'assertions': checks, 'goal': 'file-upload-probe'}
    call = uploads[0]; args = call.get('arguments', {})
    check('upload_request_has_exact_identifiers',set(args)=={'artifact_id','upload_grant_id','observation_id','operation_id'}
          and all(isinstance(value,str) and bool(re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',value)) for value in args.values()))
    before = {**evidence, 'calls': [c for c in calls if c['row'] < call['row']],
              'tools': [t for t in tools if t['row'] < call['row']]}
    storage_audit(before, checks, request['storage_directory'])
    prepared = successful_prepare(evidence, prefix, call['session_id'], call['row'])
    artifacts = prepared.get('input_artifacts', []) if prepared else []
    matching = [a for a in artifacts if a.get('artifact_id') == args.get('artifact_id')]
    artifact = matching[0] if len(matching) == 1 else {}
    grant = artifact.get('upload', {})
    destination = expected['upload']['directory'] + '/' + expected['name']
    check('prepared_artifact_matches_probe', len(artifacts) == 1 and len(matching) == 1
          and all(artifact.get(k) == expected[k] for k in ('name', 'bytes', 'sha256'))
          and grant.get('directory') == expected['upload']['directory'] and grant.get('destination') == destination
          and grant.get('overwrite') == 'replace' and bool(grant.get('grant_id'))
          and args.get('upload_grant_id') == grant.get('grant_id'))
    reads = [t for t in before['tools'] if t['tool'] == prefix+'dock_workspace_observe'
             and t['result'].get('output', {}).get('observation_id') == args.get('observation_id')]
    check('upload_uses_delivered_destination', delivered_directory(reads, evidence, call, expected['upload']['directory']))
    replies = [t for t in tools if t['session_id'] == call['session_id'] and t['tool_call_id'] == call['tool_call_id']
               and t['tool'] == call['tool'] and t['row'] > call['row']]
    result = replies[0]['result'] if len(replies) == 1 else {}
    output = result.get('output', {})
    check('submission_explicitly_unverified', result.get('status') == 'AMBIGUOUS' and result.get('phase') == 'submitted'
          and result.get('effect_possible') is True and result.get('cleanup_complete') is True
          and (result.get('error') or {}).get('code') == 'UPLOAD_SERVER_VERIFICATION_REQUIRED'
          and output == {'upload_submitted': True, 'artifact_id': args.get('artifact_id'),
                         'upload_grant_id': args.get('upload_grant_id'), 'destination': destination,
                         'bytes': expected['bytes'], 'sha256': expected['sha256'], 'verification_required': True}
          and result.get('operation_id') == args.get('operation_id'))
    records = [e for e in events if e.get('phase') == 'completed' and e.get('operation_id') == args.get('operation_id')]
    check('upload_receipt_bound_to_journal', len(records) == 1 and records[0].get('outcome') == result)
    check('single_native_input_submission',sum(t.get('event')=='upload_input_submitted' for t in result.get('trace',[]))==1
          and [t.get('destination') for t in result.get('trace',[]) if t.get('event')=='upload_preconditions_verified']==[destination])
    inspections = [t for t in tools if t['tool'] == prefix+'dock_operation_inspect' and t['row'] > call['row']
                   and t['result'].get('output', {}).get('operation_id') == args.get('operation_id')]
    check('upload_remains_pending', bool(inspections) and all(t['result']['output'].get('state') == 'pending'
          and t['result']['output'].get('outcome') == result and t['result']['output'].get('recovery_options') == [] for t in inspections))
    check('no_mutations_after_upload', not any(c['tool'] in mutations and c['row'] > call['row'] for c in calls))
    return {'all_assertions_passed': all(c['passed'] for c in checks), 'assertions': checks,
            'goal': 'file-upload-probe', 'destination': destination,
            'limitations': ['Native input submission only. Server completion, downloaded bytes and reject semantics remain unverified.']}
