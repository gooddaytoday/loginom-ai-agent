#!/usr/bin/env python3
"""Validate a private admission manifest, then invoke the existing CLI once."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
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
        if prefixes['enabled'] is not True or prefixes['joined'] != 'Joined_' or not prefixes['label']:
            raise DeliveryError('LAB-72 requires enabled prefixes, Joined_ and the required label')
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
    return [str(candidate / 'bin/loginom-ai-agent-cli'), 'run', '--model', spec['model'], '--variant', spec['variant'], '--format', 'json', *[arg for p in inputs for arg in ('--file', str(p))], '--', text]


def launch(args):
    path = Path(args.receipt)
    if path.is_symlink():
        raise DeliveryError('Receipt must not be a symlink')
    spec_path = Path(args.manifest)
    spec_bytes = spec_path.read_bytes()
    spec = json.loads(spec_bytes)
    fingerprint = hashlib.sha256(spec_bytes).hexdigest()
    # Exclusive claim survives crashes. Existing receipts are never launch authority.
    with open(path, 'x', opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
        record = {'fingerprint': fingerprint, 'state': 'checking'}
        json.dump(record, stream)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        argv = validate(spec)
        if path.resolve().is_relative_to(Path(spec['cwd']).resolve()) or spec_path.resolve().is_relative_to(Path(spec['cwd']).resolve()):
            raise DeliveryError('Admission manifest and receipt must remain outside the business directory')
        # Serializes use by this wrapper, independently of the CLI profile lock.
        with open(Path(spec['profile']) / '.multica-admission.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if spec_path.read_bytes() != spec_bytes or validate(spec) != argv:
                raise DeliveryError('Checked inputs changed; admission invalidated')
            record.update(state='launching', candidate_sha=spec['candidate']['sha'],
                candidate_manifest_sha256=spec['candidate']['manifest_sha256'],
                task_sha256=spec['task']['sha256'], inputs=[row['sha256'] for row in spec['inputs']],
                requirements_sha256=spec['requirements']['sha256'], evidence_sha256=spec['evidence']['sha256'],
                model=spec['model'], variant=spec['variant'], checked_at=time.time())
            save(path, record)
            env = {key: value for key, value in os.environ.items() if key in (
                'PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'DISPLAY', 'XAUTHORITY',
                'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR')}
            env.update(LOGINOM_AI_AGENT_CLI_PROFILE=spec['profile'],
                LOGINOM_AI_AGENT_SHARED_AUTH_DIR=spec['shared_auth_dir'],
                LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS='false')
            # Do not kill a resource-owning CLI on timeout or retry on failure/UNKNOWN.
            result = subprocess.run(argv, cwd=spec['cwd'], env=env, stdin=subprocess.DEVNULL)
            record.update(state='exited', returncode=result.returncode, acceptance=False)
            save(path, record)
            return result.returncode
    except (OSError, ValueError, KeyError) as error:
        if record['state'] == 'checking':
            record['state'] = 'rejected'
            record['reason'] = str(error) if isinstance(error, DeliveryError) else type(error).__name__
            save(path, record)
        raise


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
