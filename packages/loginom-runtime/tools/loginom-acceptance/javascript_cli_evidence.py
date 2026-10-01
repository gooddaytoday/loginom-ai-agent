"""Read-only standalone v1 evidence projection. No native/node acceptance claim.

Never exports DB rows, OAuth secrets, file payloads or hidden reasoning. The caller
must own the exact profile/session and supply independently pinned input files.
Public events must already have been filtered and redacted before persistence.
"""
import base64
import hashlib
import json
from pathlib import Path
import sqlite3


def value_digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')).hexdigest()


def terminal_tool(part):
    state = part['state']
    if (not isinstance(state,dict) or not isinstance(state.get('time'),dict)
            or not isinstance(state.get('metadata',{}),dict)
            or part.get('type') != 'tool' or state.get('status') not in ('completed','error')
            or not isinstance(state.get('input'),dict)
            or any(not isinstance(part.get(k),str) or not part[k] for k in ('id','messageID','sessionID','callID','tool'))
            or type(state.get('time',{}).get('start')) is not int or type(state['time'].get('end')) is not int
            or not 0 <= state['time']['start'] <= state['time']['end']):
        raise ValueError('cli_terminal_tool_shape')
    if state['status'] == 'completed' and not isinstance(state.get('output'),str):
        raise ValueError('cli_terminal_output_shape')
    if state['status'] == 'error' and (not isinstance(state.get('error'),str) or not state['error']):
        raise ValueError('cli_terminal_error_shape')
    return dict(id=part['id'],message_id=part['messageID'],session_id=part['sessionID'],call_id=part['callID'],
        tool=part['tool'],status=state['status'],time={k:state['time'][k] for k in ('start','end')},
        time_sha256=value_digest(state['time']),metadata_sha256=value_digest(state.get('metadata',{})),
        input_sha256=value_digest(state.get('input')),
        output_sha256=value_digest(state.get('output')),error_sha256=value_digest(state.get('error')),
        truncated=state.get('metadata',{}).get('truncated') is True,
        output_utf8_bytes=len(state.get('output','').encode('utf-8')),
        output_lines=len(state.get('output','').splitlines()))


def read_cli_session(profile, session_id):
    """Select only one owned session; return safe facts, never raw messages/parts."""
    profile = Path(profile)
    if not profile.is_absolute() or not session_id or profile.resolve() != profile:
        raise ValueError('cli_owned_absolute_profile_required')
    if (profile/'.writer').exists():
        raise ValueError('cli_profile_not_settled')
    database = profile/'data/loginom-ai-agent.db'
    auth = profile/'data/auth.json'
    if (not database.is_file() or database.is_symlink() or not auth.is_file() or auth.is_symlink()
            or database.resolve().parent != profile/'data' or auth.stat().st_mode & 0o077):
        raise ValueError('cli_profile_evidence_missing_or_unsafe')
    configuration = json.loads(auth.read_text())
    credential = configuration.get('openai',{}) if isinstance(configuration,dict) else None
    if (not isinstance(credential,dict) or credential.get('type') != 'oauth' or not isinstance(credential.get('access'),str) or not credential['access']
            or not isinstance(credential.get('refresh'),str) or not credential['refresh']):
        raise ValueError('cli_openai_oauth_required')
    del credential
    del configuration
    connection = sqlite3.connect(database.as_uri()+'?mode=ro',uri=True)
    try:
        connection.execute('pragma query_only=on')
        sessions = connection.execute('select id,directory,parent_id from session where id=?',(session_id,)).fetchall()
        if len(sessions) != 1 or sessions[0][2] is not None:
            raise ValueError('cli_fresh_root_session_required')
        messages = connection.execute('select id,data from message where session_id=? order by time_created,id',(session_id,)).fetchall()
        models = []
        roles = {}
        for identifier,payload in messages:
            info = json.loads(payload)
            if not isinstance(info,dict):
                raise ValueError('cli_message_shape')
            if info.get('id',identifier) != identifier or info.get('sessionID',session_id) != session_id:
                raise ValueError('cli_message_column_identity')
            if info.get('role') not in ('user','assistant'):
                raise ValueError('cli_message_role')
            roles[identifier] = info['role']
            if info['role'] == 'assistant' and info.get('summary') is True:
                continue
            model = info.get('model',{}) if info['role'] == 'user' else info
            if not isinstance(model,dict) or not isinstance(info.get('time',{}),dict):
                raise ValueError('cli_message_model_time_shape')
            models.append(dict(message_id=identifier,role=info['role'],provider_id=model.get('providerID'),
                model_id=model.get('modelID'),variant=model.get('variant'),
                time={k:info['time'][k] for k in ('created','completed') if k in info.get('time',{})},
                parent_id=info.get('parentID'),error_present=info.get('error') is not None))
        parts = connection.execute("select id,message_id,data from part where session_id=? and json_extract(data,'$.type') in ('file','tool','text') order by message_id,id",(session_id,)).fetchall()
        files,tools,prompts = [],[],[]
        model_ids = {m['message_id'] for m in models}
        for identifier,message_id,payload in parts:
            if message_id not in roles:
                raise ValueError('cli_part_message_owner')
            part = json.loads(payload)
            if (part.get('id',identifier) != identifier or part.get('messageID',message_id) != message_id
                    or part.get('sessionID',session_id) != session_id):
                raise ValueError('cli_part_column_identity')
            if part['type'] == 'file' and roles[message_id] == 'user':
                prefix = 'data:text/plain;base64,'
                if part.get('mime') != 'text/plain' or not isinstance(part.get('url'),str) or not part['url'].startswith(prefix):
                    raise ValueError('cli_text_snapshot_required')
                data = base64.b64decode(part['url'][len(prefix):],validate=True)
                data.decode('utf-8')
                files.append(dict(part_id=identifier,message_id=message_id,filename=part.get('filename'),
                    bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
                continue
            if part['type'] == 'text' and roles[message_id] == 'user' and part.get('synthetic') is not True:
                if not isinstance(part.get('text'),str):
                    raise ValueError('cli_user_text_shape')
                prompts.append(dict(part_id=identifier,message_id=message_id,bytes=len(part['text'].encode('utf-8')),
                    sha256=hashlib.sha256(part['text'].encode('utf-8')).hexdigest()))
                continue
            if part['type'] == 'tool':
                if roles[message_id] != 'assistant' or message_id not in model_ids:
                    raise ValueError('cli_tool_assistant_owner')
                tools.append(terminal_tool({**part,'id':identifier,'messageID':message_id,'sessionID':session_id}))
        return dict(session_id=session_id,directory=sessions[0][1],profile_auth_type='oauth',
            models=models,files=files,tools=tools,user_prompts=prompts,
            scope='own_standalone_v1_metadata_no_raw_payload',native_admission_verified=False,
            package_persistence_verified=False,cli_acceptance_verified=False)
    finally:
        connection.close()


def verify_cli_delivery(events, projection, expected_files, *, submitted_at, deadline_at, directory):
    failures = []
    unique = {}
    repeated = 0
    try:
        if (type(submitted_at) is not int or type(deadline_at) is not int
                or deadline_at-submitted_at != 1800000 or projection.get('directory') != str(directory)
                or projection.get('profile_auth_type') != 'oauth'):
            raise ValueError('cli_submission_contract')
        models = projection['models']
        if not any(m['role'] == 'user' for m in models) or not any(m['role'] == 'assistant' for m in models):
            raise ValueError('cli_actual_model_missing')
        users = {m['message_id'] for m in models if m['role'] == 'user'}
        assistants = {m['message_id']:m for m in models if m['role'] == 'assistant'}
        if len({m['message_id'] for m in models}) != len(models):
            raise ValueError('cli_actual_message_identity')
        for model in models:
            if (model.get('provider_id') != 'openai' or model.get('model_id') != 'gpt-6-sol'
                    or model.get('variant') != 'low' or model.get('error_present') is not False
                    or model['role'] == 'assistant' and model.get('parent_id') not in users
                    or type(model.get('time',{}).get('created')) is not int
                    or not submitted_at <= model['time']['created'] <= deadline_at
                    or model['role'] == 'assistant' and (type(model['time'].get('completed')) is not int
                        or not model['time']['created'] <= model['time']['completed'] <= deadline_at)):
                raise ValueError('cli_actual_model_variant_or_deadline')
        actual = [{k:f[k] for k in ('filename','bytes','sha256')} for f in projection['files']]
        if (not expected_files or len({f['filename'] for f in expected_files}) != len(expected_files)
                or any(not isinstance(f['filename'],str) or not f['filename'] or type(f['bytes']) is not int or f['bytes'] < 0
                    or not isinstance(f['sha256'],str) or len(f['sha256']) != 64
                    or any(c not in '0123456789abcdef' for c in f['sha256']) for f in expected_files)
                or sorted(actual,key=lambda f:f['filename']) != sorted(expected_files,key=lambda f:f['filename'])):
            raise ValueError('cli_input_snapshot_identity')
        if not events:
            raise ValueError('cli_public_events_missing')
        previous_timestamp = submitted_at
        for event in events:
            if (event.get('type') not in ('tool_use','text','step_start','step_finish','error')
                    or event.get('sessionID') != projection['session_id']
                    or type(event.get('timestamp')) is not int or event['timestamp'] < previous_timestamp):
                raise ValueError('cli_public_event_identity_or_order')
            previous_timestamp = event['timestamp']
            # Terminal delivery/cleanup may occur after the solution deadline.
            # The actual model/tool completion time must remain within it.
            if event['type'] == 'error':
                raise ValueError('cli_public_provider_or_cancellation_error')
            part = event.get('part',{})
            types = dict(tool_use='tool',text='text',step_start='step-start',step_finish='step-finish')
            if (part.get('type') != types[event['type']] or part.get('sessionID') != projection['session_id']
                    or part.get('messageID') not in assistants
                    or not isinstance(part.get('id'),str) or not part['id']):
                raise ValueError('cli_public_part_identity_or_type')
            if event['type'] != 'tool_use':
                continue
            tool = terminal_tool(part)
            if tool['session_id'] != projection['session_id']:
                raise ValueError('cli_public_tool_owner')
            assistant = assistants[tool['message_id']]
            if (not submitted_at <= tool['time']['start'] <= tool['time']['end'] <= deadline_at
                    or not assistant['time']['created'] <= tool['time']['start'] <= tool['time']['end'] <= assistant['time']['completed']
                    or tool['time']['end'] > event['timestamp']):
                raise ValueError('cli_public_tool_deadline')
            if tool['truncated']:
                raise ValueError('cli_public_tool_truncated')
            if tool['id'] in unique:
                if unique[tool['id']] != tool:
                    raise ValueError('cli_changed_terminal_delivery')
                repeated += 1
            unique[tool['id']] = tool
        stored = projection['tools']
        if (not stored or len({t['id'] for t in stored}) != len(stored)
                or len({t['call_id'] for t in stored}) != len(stored)
                or sorted(unique.values(),key=lambda t:t['id']) != sorted(stored,key=lambda t:t['id'])):
            raise ValueError('cli_terminal_tool_coverage')
    except (KeyError,IndexError,TypeError,AttributeError,ValueError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'cli_delivery_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),terminal_tools=len(unique),
        repeated_identical_deliveries=repeated,scope='standalone_cli_metadata_snapshots_public_terminal_delivery',
        profile_oauth_configuration_verified=not failures,oauth_transport_verified=False,
        native_admission_verified=False,candidate_verified=False,knowledge_verified=False,
        package_persistence_verified=False,cleanup_verified=False,cli_acceptance_verified=False)
