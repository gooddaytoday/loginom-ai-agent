"""Independent offline private-file responder. No browser, Loginom or guard FD."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import sys
import time

root, mode = Path(sys.argv[1]), sys.argv[2]
digest = lambda value: hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()
compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
seen = set()
deadline = time.monotonic() + 35
while not (root / 'fixture-stop').exists():
    if time.monotonic() > deadline: raise RuntimeError('FIXTURE_PARENT_TIMEOUT')
    for path in sorted(root.rglob('*request.json')):
        if path in seen: continue
        seen.add(path); request = json.loads(path.read_text())
        if request.get('schema') != 'lab53-parent-readback-request-v1': continue
        expected = request['expected_observer']
        observer = {**expected, 'connected': True, 'mst_self_count': 1}
        rows = [{**expected, 'kind': 'client', 'row_index': 0, 'type': 'mstSelf',
                 'name_hash': digest('admin:' + str(expected['session_id'])), 'packages': [], 'pending_disconnect': False}]
        for name, kind in [('Общие пакеты', 'mstShared'), ('Пул пакетов', 'mstPool')]:
            rows.append({'kind': 'virtual', 'row_index': len(rows), 'name_hash': digest(name), 'user_hash': None,
                'guid_hash': None, 'session_id': None, 'create_time': None, 'type': kind, 'packages': [], 'pending_disconnect': False})
        if request['phase'] == 'while-connected':
            target = request['capture_binding']
            rows.append({'kind': 'client', 'row_index': len(rows), 'user_hash': target['user_hash'],
                'session_id': 200 + len(seen), 'name_hash': digest(target['user_hash'] + ':' + str(200 + len(seen))),
                'create_time': request['after'], 'guid_hash': None, 'type': 'mstClient', 'packages': [], 'pending_disconnect': False})
        timestamp = now()
        readback = {'source': 'existing-authorized-admin', 'stand': request['stand'], 'loaded': True,
            'refresh_complete': True, 'packages_complete': True, 'refreshed_at': timestamp,
            'manager_count': len(rows), 'store_count': len(rows), 'rows': rows, 'observer': observer,
            'calibration': {'observer_guid_hash': expected['guid_hash'], 'stand': request['stand'],
                            'tab_binding_sha256': expected['tab_binding_sha256']}}
        if mode == 'identity' and request['phase'] == 'while-connected': readback['store_count'] += 1
        response = {'schema': 'lab53-parent-readback-response-v1', 'issue_id': request['issue_id'],
            'operation_id': request['operation_id'], 'nonce': request['nonce'], 'source': request['source'],
            'request_sha256': digest(compact(request)), 'configs_sha256': digest(compact(request['configs'])),
            'effects_sha256': digest(compact(request['effects'])), 'access': request['observer_access'],
            'owner_session_preserved': True, 'new_browser_or_login': False, 'close_actions': 0,
            'refresh': {'action': 'native-Refresh', 'started_at': timestamp, 'completed_at': timestamp,
                        'receipt_sha256': digest('synthetic-refresh-' + request['nonce'])}, 'readback': readback}
        for key in ['cleanup_sha256', 'logout_sha256']:
            if key in request: response[key] = request[key]
        if mode == 'readback' and request['phase'] == 'post-cleanup': response['readback']['loaded'] = False
        destination = path.with_name(path.name.replace('-request.json', '-response.json'))
        if path.name == 'parent-request.json': destination = path.with_name('parent-response.json')
        temporary = destination.with_suffix('.tmp')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as out:json.dump(response, out);out.write('\n');out.flush();os.fsync(out.fileno())
        os.rename(temporary, destination)
    time.sleep(.01)
