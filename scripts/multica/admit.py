#!/usr/bin/env python3
"""Validate a private admission manifest, then invoke the existing CLI once."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

from artifacts import verify_build
from supplement import DeliveryError, save


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked(record):
    path = Path(record['path'])
    if not path.is_absolute() or path.is_symlink() or not path.is_file() or digest(path) != record['sha256']:
        raise DeliveryError('Pinned file missing, symlinked or changed')
    return path.resolve()


def validate(spec):
    task = checked(spec['task'])
    inputs = [checked(row) for row in spec['inputs']]
    if any(not Path(spec[key]).is_absolute() for key in ('cwd', 'profile')) or not Path(spec['candidate']['path']).is_absolute():
        raise DeliveryError('Working directory, profile and candidate paths must be absolute')
    cwd = Path(spec['cwd']).resolve(strict=True)
    profile = Path(spec['profile']).resolve(strict=True)
    shared_auth = Path(spec['shared_auth_dir'])
    if not shared_auth.is_absolute() or not shared_auth.is_dir() or shared_auth.resolve().is_relative_to(cwd):
        raise DeliveryError('Existing shared OAuth directory must be explicit and outside business inputs')
    marker = json.loads((profile / 'cli-profile.json').read_text())
    if marker != {'format': 'loginom-cli', 'version': 1, 'channel': spec['candidate']['channel']} or (profile / '.writer').exists():
        raise DeliveryError('An initialized idle CLI profile for the candidate channel is required')
    candidate = Path(spec['candidate']['path']).resolve(strict=True)
    build = verify_build(candidate)
    if build['manifest_sha256'] != spec['candidate']['manifest_sha256'] or build['metadata']['sourceCommit'] != spec['candidate']['sha']:
        raise DeliveryError('Candidate does not match admitted source and manifest')
    for key in ('platform', 'arch', 'channel'):
        if build['metadata'][key] != spec['candidate'][key]:
            raise DeliveryError('Candidate platform, architecture or channel mismatch')
    if not profile.is_dir() or profile == cwd or profile.is_relative_to(cwd) or candidate.is_relative_to(cwd):
        raise DeliveryError('Profile and candidate must be outside the business working directory')
    config = checked(spec['profile_config'])
    if not config.is_relative_to(profile):
        raise DeliveryError('Configuration is not in the admitted profile')
    if set(cwd.rglob('*')) != {task, *inputs} or any(not p.is_relative_to(cwd) for p in [task, *inputs]):
        raise DeliveryError('Business directory must contain only the exact task and input files')
    if spec['model'] != 'openai/gpt-6-luna' or spec['variant'] != 'high':
        raise DeliveryError('Model/variant differs from the current squad assignment')
    contract = json.loads(checked(spec['requirements']).read_text())
    if contract['case'] != spec['case'] or contract['task_sha256'] != spec['task']['sha256'] or not contract['review_reference']:
        raise DeliveryError('Case requirements do not approve this exact business task')
    text = task.read_text()
    if not contract['required_text'] or any(not line or line not in text for line in contract['required_text']):
        raise DeliveryError('Business task is missing required case wording')
    if spec['case'] == 'LAB-72-enabled-prefixes':
        prefixes = contract['prefixes']
        if prefixes['enabled'] is not True or prefixes['joined'] != 'Joined_' or prefixes['label'] != 'Присоединённое: ':
            raise DeliveryError('LAB-72 requires enabled prefixes, Joined_ and the assigned label')
        if 'На первом этапе и при добавлении третьего входа включите префиксы: имя Joined_, метка «Присоединённое: ».' not in text:
            raise DeliveryError('LAB-72 must enable the assigned prefixes at BOTH stages')
        if any(prefixes[k] not in text for k in ('joined', 'label')) or prefixes['enabled_text'] not in text or not prefixes['enabled_text']:
            raise DeliveryError('LAB-72 prefix requirements are absent from the transmitted task')
    if spec['issue'] == 'LAB-72' and spec['case'] not in ('LAB-72-enabled-prefixes', 'LAB-72-original-strict'):
        raise DeliveryError('LAB-72 must identify the strict or enabled-prefixes scenario separately')
    evidence = json.loads(checked(spec['evidence']).read_text())
    binding = {key: spec[key] for key in ('issue', 'case', 'candidate', 'task', 'inputs', 'model', 'variant', 'profile', 'profile_config', 'shared_auth_dir', 'cwd')}
    if evidence['binding'] != binding or not evidence['reviewer'] or not evidence['resource_reference']:
        raise DeliveryError('Evidence is not bound to the exact candidate, task, inputs and profile')
    age = time.time() - evidence['checked_at']
    if age < 0 or age > 300 or evidence['resources'] != 'PASS' or evidence['cleanup'] != 'PASS' or evidence['unknown_operation_replay'] is not False:
        raise DeliveryError('Fresh own-resource/cleanup admission missing; UNKNOWN is not replayable')
    fixes = evidence['fixes']
    if set(fixes) != set(contract['required_fixes']):
        raise DeliveryError('Required fix applicability evidence missing')
    for row in fixes.values():
        checked(row['proof'])
        if row['candidate_sha'] != spec['candidate']['sha'] or not row['explanation'] or row['verdict'] not in ('PASS', 'NOT_APPLICABLE'):
            raise DeliveryError('Fix not verified on this candidate or non-applicability unexplained')
        if row['verdict'] == 'PASS' and not row['reproducer']:
            raise DeliveryError('Applicable fix needs original reproducer verification')
    for record in (spec['requirements'], spec['evidence'], *(row['proof'] for row in fixes.values())):
        if checked(record).is_relative_to(cwd):
            raise DeliveryError('Private verification evidence must not be a model input')
    return [str(candidate / 'bin/loginom-ai-agent-cli'), 'run', '--dir', str(cwd), '--model', spec['model'], '--variant', spec['variant'], '--format', 'json', *[arg for p in inputs for arg in ('--file', str(p))], '--', text]


class _Claim:
    """Original open claim, never authority reconstructed from receipt JSON."""
    def __init__(self, path, fingerprint):
        self.path = path.absolute()
        self.fd = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        self.identity = os.fstat(self.fd)
        self.bytes = b''
        self.record = {'fingerprint': fingerprint, 'state': 'checking'}
        try:
            self.write()
        except BaseException:
            os.close(self.fd)
            raise

    def guard(self):
        current = os.stat(self.path, follow_symlinks=False)
        held = os.fstat(self.fd)
        if (current.st_dev, current.st_ino) != (self.identity.st_dev, self.identity.st_ino) or not stat.S_ISREG(current.st_mode) or current.st_nlink != 1 or held.st_uid != os.getuid() or stat.S_IMODE(current.st_mode) != 0o600:
            raise DeliveryError('Original admission claim changed')
        if os.pread(self.fd, held.st_size + 1, 0) != self.bytes:
            raise DeliveryError('Original admission receipt changed')

    def write(self):
        self.guard()
        data = json.dumps(self.record, ensure_ascii=False, sort_keys=True).encode()
        os.lseek(self.fd, 0, os.SEEK_SET)
        offset = 0
        while offset < len(data):
            offset += os.write(self.fd, data[offset:])
        os.ftruncate(self.fd, len(data))
        os.fsync(self.fd)
        self.bytes = data
        directory = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)


class _Decision:
    # A copied/serialized decision cannot borrow the live original claim.
    def __init__(self, claim, spec_path, spec_bytes, spec, argv):
        self._claim = claim
        self._spec_path, self._spec_bytes = spec_path, spec_bytes
        self._spec, self._argv = spec, argv
        self._owner = self
        self._active = True
        self._monotonic_deadline = None
        self._consumed = False

    def __copy__(self):
        raise DeliveryError('Original admission decision cannot be copied')

    def __deepcopy__(self, memo):
        raise DeliveryError('Original admission decision cannot be copied')

    def consume_birth(self):
        if self._consumed:
            raise DeliveryError('Original admission birth already consumed')
        argv = self.before_spawn()
        self._consumed = True
        return argv

    def before_spawn(self):
        if self._owner is not self or not self._active or self._claim.record['state'] != 'launching':
            raise DeliveryError('Original admission decision unavailable')
        self._claim.guard()
        origin = self._claim.record['execution_origin']
        if time.time_ns() >= origin['deadline_unix_ns'] or time.monotonic_ns() >= self._monotonic_deadline:
            raise DeliveryError('Original admitted execution expired')
        if self._spec_path.read_bytes() != self._spec_bytes or validate(self._spec) != self._argv:
            raise DeliveryError('Checked inputs changed; admission invalidated')
        # Validation consumes the original budget. Never recompute the deadline.
        self._claim.guard()
        if time.time_ns() >= origin['deadline_unix_ns'] or time.monotonic_ns() >= self._monotonic_deadline:
            raise DeliveryError('Original admitted execution expired')
        return list(self._argv)

    def exited(self, returncode):
        self._claim.guard()
        self._claim.record.update(state='exited', returncode=returncode, acceptance=False)
        self._claim.write()


@contextmanager
def admission_decision(args):
    """Actual validation/claim/birth seam; does not spawn or deliver SDK authority."""
    path, spec_path = Path(args.receipt), Path(args.manifest)
    spec_bytes = spec_path.read_bytes()
    spec = json.loads(spec_bytes)
    claim = _Claim(path, hashlib.sha256(spec_bytes).hexdigest())
    decision = None
    try:
        argv = validate(spec)
        if path.resolve().is_relative_to(Path(spec['cwd']).resolve()) or spec_path.resolve().is_relative_to(Path(spec['cwd']).resolve()):
            raise DeliveryError('Admission manifest and receipt must remain outside the business directory')
        with open(Path(spec['profile']) / '.multica-admission.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if spec_path.read_bytes() != spec_bytes or validate(spec) != argv:
                raise DeliveryError('Checked inputs changed; admission invalidated')
            contract = json.loads(checked(spec['requirements']).read_text())
            seconds = contract.get('business_execution_seconds')
            if type(seconds) is not int or not 1 <= seconds <= 7200:
                raise DeliveryError('Original admitted business lifetime unavailable')
            claim.guard()
            # This is the producer's first launch decision, not a receiver timeout.
            born, monotonic = time.time_ns(), time.monotonic_ns()
            origin = {
                'format': 'multica-admitted-execution-origin-v1',
                'producer_sha256': digest(Path(__file__)),
                'claim': {'path': str(claim.path), 'device': claim.identity.st_dev,
                    'inode': claim.identity.st_ino, 'uid': os.getuid(), 'pid': os.getpid()},
                'manifest_sha256': claim.record['fingerprint'],
                'binding': {key: spec[key] for key in ('issue', 'case', 'candidate', 'task', 'inputs',
                    'requirements', 'evidence', 'model', 'variant', 'profile', 'profile_config', 'cwd', 'shared_auth_dir')},
                'business_execution_seconds': seconds, 'born_unix_ns': born,
                'deadline_unix_ns': born + seconds * 1_000_000_000,
                'private_receiver': 'UNAVAILABLE', 'sdk_authority': False,
            }
            claim.record.update(state='launching', execution_origin=origin,
                candidate_sha=spec['candidate']['sha'], candidate_manifest_sha256=spec['candidate']['manifest_sha256'],
                task_sha256=spec['task']['sha256'], inputs=[row['sha256'] for row in spec['inputs']],
                requirements_sha256=spec['requirements']['sha256'], evidence_sha256=spec['evidence']['sha256'],
                model=spec['model'], variant=spec['variant'], checked_at=time.time())
            claim.write()
            decision = _Decision(claim, spec_path, spec_bytes, spec, argv)
            decision._monotonic_deadline = monotonic + seconds * 1_000_000_000
            decision.before_spawn()
            yield decision
    except (OSError, ValueError, KeyError) as error:
        if claim.record['state'] == 'checking':
            claim.record.update(state='rejected', reason=str(error) if isinstance(error, DeliveryError) else type(error).__name__)
            claim.write()
        # launching/UNKNOWN remains claimed. No rollback, remint or replay.
        raise
    finally:
        if decision is not None:
            decision._active = False
        os.close(claim.fd)


def launch(args):
    with admission_decision(args) as decision:
        spec = decision._spec
        env = {key: value for key, value in os.environ.items() if key in (
            'PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'DISPLAY', 'XAUTHORITY',
            'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR')}
        env.update(PWD=spec['cwd'], LOGINOM_AI_AGENT_CLI_PROFILE=spec['profile'],
            LOGINOM_AI_AGENT_SHARED_AUTH_DIR=spec['shared_auth_dir'],
            LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS='false')
        # No origin JSON/env authority is delivered to the unsupported reader.
        # Do not kill a resource-owning CLI on timeout or retry on failure/UNKNOWN.
        result = subprocess.run(decision.consume_birth(), cwd=spec['cwd'], env=env, stdin=subprocess.DEVNULL)
        decision.exited(result.returncode)
        return result.returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--receipt', required=True)
    try:
        return launch(parser.parse_args())
    except (OSError, ValueError, KeyError) as error:
        print(str(error) if isinstance(error, DeliveryError) else type(error).__name__, file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
