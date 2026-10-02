"""Bind actual standalone snapshots to first native owned draft and upload grants.

Does not upload, import, execute, or authenticate a journal/candidate. Uses the
current Host naming contract, not historical Codex/Hermes artifact tickets.
"""
import hashlib
import json
from javascript_cli_evidence import loginom_runtime_url_matches,verify_cli_delivery
from javascript_cli_candidate import hexadecimal


def host_artifact_name(generation, session_id, message_id, index, filename):
    name = filename.replace('\\','/').rstrip('/').rsplit('/',1)[-1]
    if not name or name in ('.','..') or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise ValueError('cli_admission_filename')
    identity = json.dumps([str(generation)+':'+session_id,message_id],ensure_ascii=False,separators=(',',':'))
    prefix = hashlib.sha256(identity.encode()).hexdigest()
    suffix = name.encode('utf-16-le',errors='surrogatepass')[-240:].decode('utf-16-le',errors='surrogatepass')
    return prefix+'-'+str(index)+'-'+suffix


def verify_cli_admission(events, projection, expected_files, native_events, expected, *, submitted_at, deadline_at, directory):
    failures = []
    binding = None
    try:
        if any(not hexadecimal(expected.get(pin),64) for pin in ('runtime_revision','action_manifest_sha256')):
            raise ValueError('cli_admission_external_runtime_pin')
        transport = verify_cli_delivery(events,projection,expected_files,submitted_at=submitted_at,
            deadline_at=deadline_at,directory=directory)
        if not transport['passed']:
            raise ValueError('cli_admission_transport:'+','.join(transport['failures']))
        candidates = []
        seen = set()
        for event in events:
            if event['type'] != 'tool_use':continue
            part = event['part']
            if part['id'] in seen:continue
            seen.add(part['id'])
            if part['tool'] != 'loginom_dock_prepare' or part['state']['status'] != 'completed':continue
            result = json.loads(part['state']['output'])
            if result.get('prepared') is True:candidates.append((part,result))
        if not candidates:
            raise ValueError('cli_admission_successful_prepare_missing')
        part,result = candidates[0]
        workspace = result['workspace']
        args = part['state']['input']
        generation = part['state']['metadata']['generation']
        if (type(generation) is not int or generation < 1 or set(args)-{'operation_id','intent','timeout_ms'}
                or args.get('intent','new_draft') != 'new_draft'
                or result.get('result_version') != 'user-v1'
                or not loginom_runtime_url_matches(result.get('loginomUrl'),expected['loginom_url'])
                or workspace.get('status') != 'READY' or workspace.get('authenticated') is not True
                or workspace.get('created_draft') is not True or workspace.get('ownership_verified') is not True
                or workspace.get('target_verified') is not True or workspace.get('reason') is not None
                or workspace.get('session_id') != result.get('sessionId') or not result.get('sessionId')
                or workspace.get('operation_id') != args.get('operation_id','prepare')
                or workspace.get('target') != expected['target']
                or workspace.get('loginom_account') != expected['account']
                or not workspace.get('document_id') or not workspace.get('workflow_ref',{}).get('tab_tid')
                or not workspace['workflow_ref'].get('prefix') or not workspace['workflow_ref'].get('workflow_id')
                or not isinstance(workspace['workflow_ref'].get('navigation_path'),list) or not workspace['workflow_ref']['navigation_path']
                or workspace.get('package_ref',{}).get('persisted') is not False
                or workspace.get('package_ref',{}).get('path') is not None
                or not isinstance(workspace.get('preserved_workflows'),list)
                or any(w.get('graph_unchanged') is not True for w in workspace['preserved_workflows'])):
            raise ValueError('cli_admission_owned_draft')
        if (expected['loginom_url'] != 'http://logi-test-plan.bg.local/app/' or not expected['account']
                or '/' in expected['account'] or '\\' in expected['account']
                or expected['target'].get('loginom_build') != '7.4.2'
                or expected['target'].get('platform') != 'linux' or expected['target'].get('browser') != 'chromium'
                or set(expected['target']) != {'profile_id','loginom_build','platform','browser'}
                or not isinstance(expected['target'].get('profile_id'),str) or not expected['target']['profile_id']):
            raise ValueError('cli_admission_external_target')
        pins = result.get('knowledge',{}).get('session_manifest',{})
        if (pins.get('clientRevision') != expected['runtime_revision']
                or pins.get('actionManifestDigest') != expected['action_manifest_sha256']):
            raise ValueError('cli_admission_public_runtime_pins')
        if (not native_events or any(e.get('session_id') != result['sessionId']
                or e.get('runtime_revision') != expected['runtime_revision']
                or e.get('manifest_sha256') != expected['action_manifest_sha256'] for e in native_events)):
            raise ValueError('cli_admission_native_runtime_owner')
        prepared = [i for i,e in enumerate(native_events) if e.get('event') == 'workspace_prepared' and e.get('state') == workspace]
        if len(prepared) != 1:
            raise ValueError('cli_admission_native_prepare_receipt')
        if (native_events[prepared[0]].get('target') != expected['target']
                or any(e.get('target') not in (None,expected['target']) for e in native_events[:prepared[0]])):
            raise ValueError('cli_admission_native_target_binding')
        if any(e.get('phase') in ('node_apply_prepared','artifact_delivery_prepared') for e in native_events[:prepared[0]]):
            raise ValueError('cli_admission_effect_before_ready')
        users = [m for m in projection['models'] if m['role'] == 'user']
        if len(users) != 1 or projection['models'][0] != users[0]:
            raise ValueError('cli_admission_single_original_user')
        message = users[0]['message_id']
        snapshots = projection['files']
        if any(f['message_id'] != message for f in snapshots):
            raise ValueError('cli_admission_attachment_message_owner')
        artifacts = result['input_artifacts']
        if (not isinstance(artifacts,list) or len(artifacts) != len(snapshots)
                or len({a['artifact_id'] for a in artifacts}) != len(artifacts)
                or len({a['upload']['grant_id'] for a in artifacts}) != len(artifacts)):
            raise ValueError('cli_admission_artifact_count_or_identity')
        names = set()
        for index,snapshot in enumerate(snapshots):
            name = host_artifact_name(generation,projection['session_id'],message,index,snapshot['filename'])
            matches = [a for a in artifacts if a.get('name') == name]
            if len(matches) != 1:
                raise ValueError('cli_admission_host_filename_binding')
            artifact = matches[0]
            grant = artifact['upload']
            folder = '/'+expected['account']
            if (any(not isinstance(v,str) or not v for v in (artifact.get('artifact_id'),grant.get('grant_id')))
                    or type(artifact.get('bytes')) is not int or artifact['bytes'] != snapshot['bytes']
                    or artifact.get('sha256') != snapshot['sha256']
                    or grant.get('directory') != folder or grant.get('destination') != folder+'/'+name
                    or grant.get('overwrite') != 'reject'):
                raise ValueError('cli_admission_artifact_bytes_or_grant')
            names.add(name)
        if names != {a['name'] for a in artifacts}:
            raise ValueError('cli_admission_exact_artifact_set')
        binding = dict(cli_session_id=projection['session_id'],runtime_session_id=result['sessionId'],
            user_message_id=message,generation=generation,prepare_call_id=part['callID'],
            document_id=workspace['document_id'],workflow_id=workspace['workflow_ref']['workflow_id'],artifacts=len(artifacts))
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'cli_admission_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),binding=binding,
        scope='standalone_snapshot_first_owned_draft_input_artifacts_grants',journal_authenticated=False,
        uploaded_bytes_verified=False,import_execution_verified=False,candidate_use_verified=False,cli_acceptance_verified=False)
