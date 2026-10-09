#!/usr/bin/env python3
"""One exact retired Worker45 marker; fresh pair absence, no Loginom operation.

This separate owner route never admits a marker through account_guard, changes
ready state, substitutes old receipts for current proof, or fills old gaps.
"""
import argparse
import datetime
import fcntl
import importlib.util
import os
from pathlib import Path
import secrets
import signal
import time
from uuid import UUID
from common import read_private, write_private, new_evidence_directory, process_identity, marker_paths

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module

owner = load('retired_owner_primitives', 'owner-reconcile.py')
provision = load('retired_owner_foreground', 'provision-accounts.py')
ISSUE = '01a11e17-b869-7550-8450-35e5e17119d4'
PAIR_ISSUE = '01a11d36-053e-78da-b06c-e313de5319e3'
ATTEMPT = '57854c38-db97-405d-9e46-c227615c3059'
MARKER_SHA = 'a7513042bdf7319d61c02611faa4e92563441f3263e5a227457584a8c2ca466b'
CLEANUP_SHA = 'a977c4fedc7d65e9bfa6b9e5e0e144e3de515ba66fa040bb273bbb7615c1ac87'
STOCK_SHA = '278a58bd91a0d9b3ff6c7d0fc74d5cfc271cce3a93c08c40fe19fd5fe2e902c5'

def require_bound(item):
    if set(item) != {'path', 'device', 'inode', 'sha256'} or owner.binding(item['path']) != item:
        raise RuntimeError('RETIRED_TARGET_CHANGED')

def origin_records(marker, cleanup, stock):
    if (marker.get('issue_id') != PAIR_ISSUE or marker.get('attempt_id') != ATTEMPT
        or marker.get('status') != 'retired_cleanup_confirmed' or marker.get('pid') != 176775
        or marker.get('lock_inode') != 2396009 or marker.get('cleanup_sha256') != CLEANUP_SHA
        or 'start_ticks' in marker or stock.get('issue_id') != PAIR_ISSUE
        or stock.get('immutable_attempt', {}).get('uuid') != ATTEMPT
        or not any(x.get('role') == 'worker' and x.get('inode') == 2396009 for x in stock.get('account_locks', []))
        or stock.get('historical_ambiguous_preserved') is not True
        or stock.get('historical_ambiguous_resolved') is not False):
        raise RuntimeError('RETIRED_ORIGIN_UNKNOWN')
    # These two byte-bound originals supply available exact records only.
    # Partial records remain partial and require current numeric PID absence.
    old = [*stock['own_pid_tree_recorded'], *cleanup['browser_processes']]
    exact, partial = {}, {marker['pid']}
    for record in old:
        pid, ticks = record.get('pid'), record.get('start_ticks')
        if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0: raise RuntimeError('RETIRED_PROCESS_PROVENANCE_UNKNOWN')
        if ticks is None: partial.add(pid)
        elif not isinstance(ticks, str) or not ticks.isdigit(): raise RuntimeError('RETIRED_PROCESS_PROVENANCE_UNKNOWN')
        else: exact[(pid, ticks)] = {'pid': pid, 'start_ticks': ticks}
    if not exact: raise RuntimeError('RETIRED_PROCESS_PROVENANCE_UNKNOWN')
    return list(exact.values()), sorted(partial)

def current_process_absence(exact, partial):
    owner.check_absent(exact)
    # A reused unbound numeric PID also blocks. Never signal it or invent ticks.
    for pid in partial:
        if process_identity(pid) is not None: raise RuntimeError('RETIRED_PARTIAL_PID_PRESENT_OR_REUSED')

def role_paths(config):
    username = config['loginom']['username']
    if not isinstance(username, str) or not username or username in {'.', '..'} or any(
            not (c.isalnum() or c in '._-') for c in username): raise RuntimeError('RETIRED_ROLE_IDENTITY_UNKNOWN')
    lock = Path.home() / '.local/state/loginom-multica/account-locks' / (username + '.lock')
    return lock, marker_paths(lock)

def verify_held(guards):
    for guard in guards:
        require_bound({k: guard[k] for k in ['path', 'device', 'inode', 'sha256']})
        stat = os.fstat(guard['fd'])
        if (stat.st_dev, stat.st_ino) != (guard['device'], guard['inode']) or not any(
                'FLOCK' in line and 'ADVISORY' in line and 'WRITE' in line and owner.lock_matches(line, guard)
                for line in Path(f'/proc/self/fdinfo/{guard["fd"]}').read_text().splitlines()):
            raise RuntimeError('RETIRED_FLOCK_UNKNOWN')

def validate_pair_fd(request, proof):
    # Same complete collector, two explicit parent-held role OFDs. Nothing is
    # filtered from the census; only these exact guard FDs and its control pass.
    if (proof.get('schema') != 'lab53-held-fd-inventory-v1' or proof.get('operation_id') != request['operation_id']
        or proof.get('nonce') != request['nonce'] or proof.get('request_sha256') != owner.digest(owner.compact(request))
        or proof.get('source_sha256') != owner.digest(Path(__file__).with_name('own-fd-inventory.py').read_bytes())):
        raise RuntimeError('RETIRED_FD_BINDING_UNKNOWN')
    census = proof.get('privileged_census', {})
    if census != {'wrapper_sha256': owner.digest(Path(__file__).with_name('retired-fd-inventory.py').read_bytes()),
                  'uid': 0, 'euid': 0, **request['census_namespace']}:
        raise RuntimeError('RETIRED_PRIVILEGED_CENSUS_REQUIRED')
    age = (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(proof['observed_at'])).total_seconds()
    if not 0 <= age <= 300: raise RuntimeError('RETIRED_FD_PROOF_STALE')
    if proof['before']['visible_pids'] != proof['after']['visible_pids']: raise RuntimeError('RETIRED_FD_CENSUS_CHANGED')
    guards = request['role_guards']
    if len(guards) != 2 or [x['role'] for x in guards] != ['worker', 'reviewer'] or guards[0] != request['guard']:
        raise RuntimeError('RETIRED_FLOCK_UNKNOWN')
    expected = [{'pid': request['guardian']['pid'], **{k: g[k] for k in ['fd', 'device', 'inode']}} for g in guards]
    if len({(g['device'], g['inode']) for g in guards}) != 2: raise RuntimeError('RETIRED_FLOCK_UNKNOWN')
    for sample in [proof['before'], proof['after']]:
        if not sample['visible_pids'] or sample['errors'] or sample['targets'] != request['targets'] or sample['control_observed'] is not True:
            raise RuntimeError('RETIRED_FD_CENSUS_INCOMPLETE')
        if not sample['guardian'] or any(sample['guardian'][k] != request['guardian'][k] for k in ['pid', 'start_ticks']):
            raise RuntimeError('RETIRED_GUARDIAN_CHANGED')
        owner.check_absent([sample['control']])
        control = {k: sample['control'][k] for k in ['pid', 'fd', 'device', 'inode']}
        allowed = [control, *expected]
        if any(x not in sample['holders'] for x in allowed) or any(x not in allowed for x in sample['holders']):
            raise RuntimeError('RETIRED_FD_HOLDER_PRESENT')
        if not any('FLOCK' in line and 'ADVISORY' in line and 'WRITE' in line and owner.lock_matches(line, guards[0])
                   for line in sample['guardian_fdinfo'].splitlines()): raise RuntimeError('RETIRED_FLOCK_UNKNOWN')
        for target in request['targets']:
            lines = [line for line in sample['kernel_locks'].splitlines() if owner.lock_matches(line, target)]
            guarded = any((g['device'], g['inode']) == (target['device'], target['inode']) for g in guards)
            if (not guarded and lines) or (guarded and (len(lines) != 1 or not all(x in lines[0].split() for x in
                    ['FLOCK', 'ADVISORY', 'WRITE', str(request['guardian']['pid'])]))): raise RuntimeError('RETIRED_KERNEL_LOCK_UNKNOWN')

def reconcile(authorization_file, evidence_dir, source_sha):
    source = provision.clean_candidate(source_sha); authorization = owner.binding(authorization_file)
    grant = read_private(authorization_file)
    if (grant.get('schema') != 'lab53-retired-worker-owner-binding-v1' or grant.get('issue_id') != ISSUE
        or grant.get('source') != source or grant.get('pair_issue_id') != PAIR_ISSUE): raise RuntimeError('RETIRED_OWNER_BINDING_REQUIRED')
    operation_id = str(UUID(grant['operation_id']))
    if operation_id != grant['operation_id']: raise RuntimeError('RETIRED_OWNER_BINDING_REQUIRED')
    configs, locks = grant['configs'], grant['locks']
    if len(configs) != 7 or len(locks) != 5 or len(grant['pair_configs']) != 3: raise RuntimeError('RETIRED_SCOPE_UNKNOWN')
    for target in [*configs, *locks, grant['marker'], grant['stock_receipt']]: require_bound(target)
    if any(path not in [x['path'] for x in configs] for path in grant['pair_configs']): raise RuntimeError('RETIRED_PAIR_CONFIG_CHANGED')
    operator, worker, reviewer = map(read_private, grant['pair_configs'])
    for role, config in [('worker', worker), ('reviewer', reviewer)]:
        if config.get('issue_id') != PAIR_ISSUE or config.get('role') != role or config.get('operator_file') != grant['pair_configs'][0]:
            raise RuntimeError('RETIRED_ROLE_IDENTITY_UNKNOWN')
    worker_lock, worker_markers = role_paths(worker); reviewer_lock, reviewer_markers = role_paths(reviewer)
    marker = grant['marker']; canonical = worker_markers[0]
    if (marker['path'] != str(canonical) or marker['sha256'] != MARKER_SHA
        or (marker['device'], marker['inode']) != (64512, 2396042) or canonical.stat().st_size != 612
        or grant['stock_receipt']['sha256'] != STOCK_SHA or Path(grant['stock_receipt']['path']).stat().st_size != 52385):
        raise RuntimeError('RETIRED_EXACT_MARKER_REQUIRED')
    old_marker = read_private(canonical); cleanup = owner.binding(old_marker['cleanup_receipt'])
    if cleanup['sha256'] != CLEANUP_SHA: raise RuntimeError('RETIRED_ORIGIN_UNKNOWN')
    targets = [*configs, *locks, marker, grant['stock_receipt'], cleanup]
    if len({x['path'] for x in targets}) != len(targets) or len({(x['device'],x['inode']) for x in targets}) != len(targets):
        raise RuntimeError('RETIRED_SCOPE_UNKNOWN')
    exact, partial = origin_records(old_marker, read_private(cleanup['path']), read_private(grant['stock_receipt']['path']))
    directory = new_evidence_directory(evidence_dir); guards = []
    try:
        for role, path in [('worker', worker_lock), ('reviewer', reviewer_lock)]:
            item = next((x for x in locks if x['path'] == str(path)), None)
            if item is None or (role == 'worker' and (item['device'], item['inode']) != (64512, 2396009)):
                raise RuntimeError('RETIRED_FLOCK_UNKNOWN')
            fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW); guards.append({**item, 'role': role, 'fd': fd})
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        def check_current():
            if provision.clean_candidate(source_sha) != source or owner.binding(authorization_file) != authorization:
                raise RuntimeError('RETIRED_SOURCE_OR_AUTHORIZATION_CHANGED')
            for target in targets: require_bound(target)
            for path in [worker_markers[1], *reviewer_markers]:
                if os.path.lexists(path): raise RuntimeError('RETIRED_OTHER_ROLE_MARKER_PRESENT')
            current_process_absence(exact, partial); verify_held(guards)
        check_current()
        input_data = {k: grant[k] for k in ['issue_id','operation_id','source','expected_observer','pair_issue_id','pair_configs','configs','marker']}
        input_data.update(directory=str(directory), stand=operator['url'], provenance={
            'stock_receipt': grant['stock_receipt'], 'marker_cleanup_receipt': cleanup,
            'known_exact_records': exact, 'partial_numeric_pids': partial, 'historical_start_ticks': 'NOT_CAPTURED'})
        input_file = directory / 'input.json'; write_private(input_file, input_data)
        collector = [operator['node'], Path(__file__).with_name('retired-worker-readback.mjs')]
        if provision.run_foreground([*collector,'request',input_file], [], directory/'request', timeout=10): raise RuntimeError('RETIRED_REQUEST_UNKNOWN')
        def wait(path):
            deadline = time.monotonic() + 300
            while not path.exists():
                if time.monotonic() >= deadline: raise RuntimeError('RETIRED_HANDOFF_TIMEOUT')
                time.sleep(.05)
        response = directory/'parent-response.json'; wait(response)
        input_data.update(requestFile=str(directory/'parent-request.json'),responseFile=str(response)); write_private(input_file,input_data)
        if provision.run_foreground([*collector,'verify',input_file], [], directory/'verify', timeout=10): raise RuntimeError('RETIRED_SERVER_PROOF_UNKNOWN')
        request = read_private(directory/'parent-request.json'); consumed = directory/('retired-consumed-'+request['nonce']+'.json')
        proof = read_private(consumed)
        protected = {str(p): owner.binding(p) for p in [input_file, response, directory/'parent-request.json', consumed]}
        if proof['input_sha256'] != protected[str(input_file)]['sha256'] or proof['response_sha256'] != protected[str(response)]['sha256'] or (
                proof['request_sha256'] != protected[str(directory/'parent-request.json')]['sha256']): raise RuntimeError('RETIRED_SERVER_PROOF_CHANGED')
        fd_request = {'operation_id':operation_id,'source':source,'nonce':secrets.token_hex(32),
            'guardian':process_identity(os.getpid()),'guard':guards[0],'role_guards':guards,'targets':targets,
            'census_namespace':{'pid_namespace':os.readlink('/proc/self/ns/pid'), 'user_namespace':os.readlink('/proc/self/ns/user')}}
        write_private(directory/'fd-request.json',fd_request)
        fd_file=directory/'fd-response.json'; wait(fd_file)
        fd_binding=owner.binding(fd_file); validate_pair_fd(fd_request,read_private(fd_file))
        check_current()
        for target in protected.values(): require_bound(target)
        require_bound(fd_binding)
        observed=datetime.datetime.fromisoformat(proof['readback']['refreshed_at'].replace('Z','+00:00'))
        if not 0 <= (datetime.datetime.now(datetime.timezone.utc)-observed).total_seconds() <= 300: raise RuntimeError('RETIRED_SERVER_PROOF_STALE')
        owner.archive_legacy([marker], directory/'immutable-history', directory/'current-retired-worker-reconciled.json', {
            'operation_id':operation_id,'source':source,'current_proof':'CURRENT_RETIRED_WORKER_PROOF_ONLY','ready':False,
            'history_facts_modified':False,'history_state':'UNKNOWN_PRESERVED','historical_status':old_marker['status'],
            'historical_start_ticks':'NOT_CAPTURED','known_exact_records':exact,'partial_numeric_pids':partial,
            'server_receipt_sha256':protected[str(consumed)]['sha256'],'fd_receipt_sha256':fd_binding['sha256'],
            'provenance':input_data['provenance'],'role_guards':[{k:g[k] for k in ['path','device','inode','role']} for g in guards]})
    finally:
        for guard in reversed(guards): os.close(guard['fd'])

if __name__ == '__main__':
    def cancel(_signum,_frame): raise RuntimeError('RETIRED_RECONCILIATION_CANCELLED')
    for signum in [signal.SIGTERM,signal.SIGINT]: signal.signal(signum,cancel)
    parser=argparse.ArgumentParser();parser.add_argument('--authorization',type=Path,required=True)
    parser.add_argument('--evidence-dir',type=Path,required=True);parser.add_argument('--source-sha',required=True)
    args=parser.parse_args()
    try: reconcile(args.authorization,args.evidence_dir,args.source_sha)
    except Exception as error:
        print(str(error) if isinstance(error,RuntimeError) else 'RETIRED_RECONCILIATION_UNKNOWN',file=__import__('sys').stderr)
        raise SystemExit(1)
