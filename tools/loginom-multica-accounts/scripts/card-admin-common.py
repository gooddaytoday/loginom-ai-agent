"""Pinned existing eight identities; no allocation or credential generation."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
from common import read_private, private_snapshot, process_identity

CARDS = {
 '01a11d36-053e-78da-b06c-e313de5319e3':'ad3a6d4944226b35ad83b7ac4ecab787de2608669f9f3bde9a50a58862e8e18c',
 '01a11d36-10b0-702f-930d-e91315129205':'9ffa8cd01666d44de3dc63d34be26f3544ff0e0f03358b8e99fb54d7eae2856a',
 '01a11d36-1c50-7c05-bb73-d72ffd159b1b':'e4c32267fce53e0a49e11b22036babb513cba117b932756b87e9f6664cf3d675',
 '01a11d36-2811-71ba-a493-0e397e3e60f2':'72da420648a958b3f8a84550141430765e168a200ab5fad1ce0e477405084375',
 '01a11d36-33ae-732e-b618-5618ed5301cd':'47d09ff24ea7e9b381d2638ab89e9195742aa62c72ff2b958ab12f9bc2f21a3e',
 '01a11d36-3f2a-7df1-bd81-d5401bdcdd16':'4fb32ee0672606ae344b459b0d3ec5e355d590ba887ebd87263cfe8b4d243498',
 '01a11d36-4ace-7dd4-a0d4-498195f7d2e9':'7d7fe8f3ed821a5b734f1db0718652626a8deb5a5a08b1df3132b62bda16b749',
 '01a11d36-5670-7786-bfe1-e9a4a4462e6e':'9715c42f1b9825d53a7b440744b8776d0774ca9bf3dc162d153855eea2ed2f61',
}
PROBE_ONLY = {'01a11d36-10b0-702f-930d-e91315129205','01a11d36-1c50-7c05-bb73-d72ffd159b1b'}
digest = lambda raw: hashlib.sha256(raw).hexdigest()
compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(',',':')).encode()

def load(name, file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def binding(path):
    path=Path(path)
    if not path.is_absolute() or any(p.is_symlink() for p in [path,*path.parents]): raise RuntimeError('CARD_PRIVATE_PATH_INVALID')
    before=path.stat()
    if before.st_uid!=os.getuid() or before.st_mode&0o077 or not path.is_file(): raise RuntimeError('CARD_PRIVATE_PATH_INVALID')
    raw=path.read_bytes();after=path.stat()
    if (before.st_dev,before.st_ino,before.st_mtime_ns,before.st_size)!=(after.st_dev,after.st_ino,after.st_mtime_ns,after.st_size):
        raise RuntimeError('CARD_BOUND_BYTES_CHANGED')
    return {'path':str(path),'device':after.st_dev,'inode':after.st_ino,'sha256':digest(raw)}

def require_bindings(items):
    for item in items:
        if binding(item['path'])!=item: raise RuntimeError('CARD_BOUND_BYTES_CHANGED')

def validate_cards(items, global_operator):
    if len(items)!=8 or {item['issue_id'] for item in items}!=set(CARDS): raise RuntimeError('CARD_EIGHT_PIN_REQUIRED')
    operators={}
    for item in items:
        require_bindings([item['operator']]);operator=read_private(item['operator']['path'])
        if (digest(operator['admin_user'].encode())!=CARDS[item['issue_id']] or operator['admin_user']==global_operator['admin_user']
            or any(operator.get(key)!=global_operator.get(key) for key in ['workspace_id','agents','url','api_key','node','browser','playwright_module','proxy'])):
            raise RuntimeError('CARD_PIN_OR_DEPENDENCY_MISMATCH')
        operators[item['issue_id']]=operator
    return operators

def validate_intent(intent, card_binding, card):
    if (intent.get('schema')!='lab53-card-admin-intent-v1' or intent.get('card_operator')!=card_binding
        or intent.get('issue_id') not in CARDS or not intent.get('full_name')
        or intent.get('action') not in ['probe-existing','create-unstarted']): raise RuntimeError('CARD_INTENT_UNKNOWN')
    if card.get('admin_marker') is not None and card['admin_marker']!=intent['full_name']: raise RuntimeError('CARD_INTENT_UNKNOWN')
    history=intent.get('history')
    if not isinstance(history,dict) or history.get('provenance')!='owner-audited-original-task-chain' or not history.get('files'):
        raise RuntimeError('CARD_HISTORY_RECONCILIATION_REQUIRED')
    require_bindings(history['files'])
    if intent['action']=='create-unstarted':
        states=[card[key] for key in ['account_state','admin_account_state','admin_state'] if key in card]
        if intent['issue_id'] in PROBE_ONLY or not states or any(x!='planned' for x in states) or (
                history.get('state')!='NEVER_STARTED' or history.get('prior_attempts')!=[]):
            raise RuntimeError('CARD_RECREATE_FORBIDDEN')
    elif history.get('state') not in ['EXISTING_VERIFIED','RECONCILIATION_REQUIRED','NEVER_STARTED']:
        raise RuntimeError('CARD_HISTORY_RECONCILIATION_REQUIRED')

def check_held(guards):
    for guard in guards:
        stat=os.fstat(guard['fd']);path=Path(guard['path']).stat()
        if (stat.st_dev,stat.st_ino)!=(guard['device'],guard['inode']) or (path.st_dev,path.st_ino)!=(stat.st_dev,stat.st_ino):
            raise RuntimeError('CARD_FLOCK_CHANGED')
        info=Path(f'/proc/self/fdinfo/{guard["fd"]}').read_text()
        if not any('FLOCK' in line and 'ADVISORY' in line and 'WRITE' in line and f':{stat.st_ino} ' in line for line in info.splitlines()):
            raise RuntimeError('CARD_FLOCK_UNKNOWN')

def wait_file(path, timeout=300):
    import time
    deadline=time.monotonic()+timeout
    while not path.exists():
        if time.monotonic()>=deadline: raise RuntimeError('CARD_HANDOFF_TIMEOUT')
        time.sleep(.05)

def validate_fd(request, proof):
    owner=load('card_strict_fd_primitives','owner-reconcile.py')
    if (proof.get('schema')!='lab53-held-fd-inventory-v1' or proof.get('operation_id')!=request['operation_id']
        or proof.get('nonce')!=request['nonce'] or proof.get('request_sha256')!=digest(compact(request))
        or proof.get('source_sha256')!=digest(Path(__file__).with_name('own-fd-inventory.py').read_bytes())
        or proof.get('privileged_census')!={'wrapper_sha256':digest(Path(__file__).with_name('held-fd-inventory.py').read_bytes()),
            'uid':0,'euid':0,**request['census_namespace']}): raise RuntimeError('CARD_FD_PROOF_UNBOUND')
    import datetime
    age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['observed_at'])).total_seconds()
    if not 0<=age<=300 or proof['before']['visible_pids']!=proof['after']['visible_pids']: raise RuntimeError('CARD_FD_CENSUS_UNKNOWN')
    expected=[{'pid':request['guardian']['pid'],**{k:g[k] for k in ['fd','device','inode']}} for g in request['guards']]
    for sample in [proof['before'],proof['after']]:
        if not sample['visible_pids'] or sample['errors'] or sample['targets']!=request['targets'] or sample['control_observed'] is not True:
            raise RuntimeError('CARD_FD_CENSUS_UNKNOWN')
        if not sample['guardian'] or any(sample['guardian'][k]!=request['guardian'][k] for k in ['pid','start_ticks']): raise RuntimeError('CARD_FD_GUARDIAN_CHANGED')
        owner.check_absent([sample['control']]);control={k:sample['control'][k] for k in ['pid','fd','device','inode']}
        if any(x not in sample['holders'] for x in [control,*expected]) or any(x not in [control,*expected] for x in sample['holders']):
            raise RuntimeError('CARD_FOREIGN_FD_PRESENT')
        for target in request['targets']:
            lines=[line for line in sample['kernel_locks'].splitlines() if owner.lock_matches(line,target)]
            guarded=any((g['device'],g['inode'])==(target['device'],target['inode']) for g in request['guards'])
            if (not guarded and lines) or (guarded and (len(lines)!=1 or any(x not in lines[0].split() for x in
                    ['FLOCK','ADVISORY','WRITE',str(request['guardian']['pid'])]))): raise RuntimeError('CARD_FOREIGN_LOCK_PRESENT')

def request_fd(directory, operation, guards, targets):
    import secrets
    from common import write_private
    unique={x['path']:x for x in targets}
    if len({(x['device'],x['inode']) for x in unique.values()})!=len(unique): raise RuntimeError('CARD_TARGET_ALIAS')
    request={'operation_id':operation['operation_id'],'source':operation['source'],'nonce':secrets.token_hex(32),
        'guardian':process_identity(os.getpid()),'guard':guards[0],'guards':guards,'targets':list(unique.values()),
        'census_namespace':{'pid_namespace':os.readlink('/proc/self/ns/pid'),'user_namespace':os.readlink('/proc/self/ns/user')}}
    write_private(directory/'fd-request.json',request);response=directory/'fd-response.json';wait_file(response)
    bound=binding(response);validate_fd(request,read_private(response));require_bindings([bound]);check_held(guards)
    return bound
