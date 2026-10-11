"""Executable strict FD positive/negative probe in an isolated OS PID namespace.

The production collector still reads the real /proc, with no filtering, path
override or error suppression. This is fixture visibility, never host absence.
"""
import copy
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from uuid import uuid4

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from common import process_identity, read_private, write_private
spec = importlib.util.spec_from_file_location('namespace_owner_validation', SCRIPTS / 'owner-reconcile.py')
owner = importlib.util.module_from_spec(spec); spec.loader.exec_module(owner)


def run():
    if os.getpid() != 1: raise RuntimeError('ISOLATED_PID_NAMESPACE_REQUIRED')
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        config = root / 'fixture-config.json'; lock = root / 'fixture.lock'; marker = root / 'fixture.active.json'
        write_private(config, {'fixture': True}); write_private(marker, {'state': 'UNKNOWN', 'fixture': True})
        lock.touch(mode=0o600)
        fd = os.open(lock, os.O_RDWR)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            request = {'operation_id': str(uuid4()), 'nonce': 'f' * 64, 'guardian': process_identity(os.getpid()),
                'guard': {**owner.binding(str(lock)), 'fd': fd},
                'targets': [owner.binding(str(config)), owner.binding(str(lock)), owner.binding(str(marker))]}
            request_file = root / 'request.json'; write_private(request_file, request)
            result = subprocess.run([sys.executable, SCRIPTS / 'own-fd-inventory.py', request_file],
                                    capture_output=True, timeout=10)
            if result.returncode: raise RuntimeError('COLLECTOR_EXECUTABLE_FAILED:' + result.stderr.decode())
            proof = json.loads(result.stdout)
            if proof['before']['visible_pids'] != [1, 2] or proof['after']['visible_pids'] != [1, 2]:
                raise RuntimeError('FIXTURE_VISIBILITY_INCOMPLETE')
            for sample in ['before', 'after']:
                if proof[sample]['errors'] or proof[sample]['control_observed'] is not True:
                    raise RuntimeError('FIXTURE_CENSUS_INCOMPLETE')
            # Actual executable bytes and request hashes, real held guardian
            # flock/control, complete stable visibility, zero errors: no waiver.
            owner.validate_fd_proof(request, proof)
            extra_fd = os.open(config, os.O_RDONLY)
            try:
                extra_result = subprocess.run([sys.executable, SCRIPTS / 'own-fd-inventory.py', request_file],
                                              capture_output=True, timeout=10)
                if extra_result.returncode: raise RuntimeError('HOLDER_COLLECTOR_EXECUTABLE_FAILED')
                holder_proof = json.loads(extra_result.stdout)
                if any(holder_proof[s]['errors'] for s in ['before', 'after']): raise RuntimeError('HOLDER_CENSUS_INCOMPLETE')
                try: owner.validate_fd_proof(request, holder_proof)
                except RuntimeError as error:
                    if str(error) != 'HISTORICAL_FD_HOLDER_PRESENT': raise
                else: raise RuntimeError('REAL_EXTRA_HOLDER_ADMITTED')
            finally: os.close(extra_fd)
            negatives = []
            for label in ['PermissionError', 'FileNotFoundError', 'OSError', 'holder', 'inventory', 'nonce']:
                broken = copy.deepcopy(proof)
                if label in ['PermissionError', 'FileNotFoundError', 'OSError']:
                    broken['before']['errors'].append({'pid': 1, 'error': label})
                elif label == 'holder':
                    broken['after']['holders'].append({'pid': 1, 'fd': 99999, 'device': request['guard']['device'], 'inode': request['guard']['inode']})
                elif label == 'inventory': broken['after']['visible_pids'].append(3)
                else: broken['nonce'] = '0' * 64
                try: owner.validate_fd_proof(request, broken)
                except RuntimeError as error: negatives.append({'case': label, 'code': str(error)})
                else: raise RuntimeError('FIXTURE_NEGATIVE_ADMITTED:' + label)
            if any(process_identity(sample['control']['pid']) for sample in [proof['before'], proof['after']]):
                raise RuntimeError('FIXTURE_COLLECTOR_NOT_REAPED')
            return {'scope': 'isolated-user-pid-mount-namespace', 'request': request, 'proof': proof,
                    'strict_validation': 'PASS', 'real_extra_holder': 'HISTORICAL_FD_HOLDER_PRESENT',
                    'negatives': negatives, 'server_absence': 'NOT_APPLICABLE_NO_LOGIN',
                    'host_absence': 'NOT_PROVED'}
        finally: os.close(fd)


if __name__ == '__main__':
    print(json.dumps(run()))
