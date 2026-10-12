#!/usr/bin/env python3
"""Owner-scoped artifact lifecycle. Cleanup is a dry run unless --apply is given."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import time
import uuid
import urllib.parse

from supplement import DeliveryError, request

DAY = 86400
KINDS = ('build', 'source', 'dependencies', 'evidence')
PROTECTED = ('current', 'previous', 'final', 'unresolved', 'legacy-unreconciled')


def canonical(path, *, missing=False):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise DeliveryError('An absolute canonical path is required')
    if path.resolve(strict=not missing) != path:
        raise DeliveryError('Linked or aliased paths are refused')
    return path


def atomic(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    with open(temporary, 'x', opener=lambda name, flags: os.open(name, flags | os.O_NOFOLLOW, 0o600)) as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def identity(args):
    agent = os.environ.get('MULTICA_AGENT_ID')
    task = os.environ.get('MULTICA_TASK_ID')
    operator = not agent and not task and not os.environ.get('MULTICA_TOKEN', '').startswith('mat_')
    if not operator and (not agent or not task or args.owner and args.owner != agent):
        raise DeliveryError('Only the active agent may manage its own artifacts')
    owner = str(uuid.UUID(agent or args.owner or ''))
    workspace = str(uuid.UUID(os.environ.get('MULTICA_WORKSPACE_ID') or args.workspace or ''))
    root = canonical(args.state_root or str(Path.home() / '.local/state/loginom-multica/artifacts'), missing=True)
    if not operator and not root.is_relative_to(Path.home() / '.local/state/loginom-multica'):
        raise DeliveryError('Agent state must stay in its private persistent store')
    native = canonical(args.workspaces_root or str(Path.home() / 'multica_workspaces'), missing=True)
    server = os.environ.get('MULTICA_SERVER_URL', '').rstrip('/')
    url = urllib.parse.urlsplit(server)
    if url.scheme not in ('http', 'https') or not url.netloc or url.username or url.password or url.query or url.fragment:
        raise DeliveryError('Invalid Multica server identity')
    return {'owner': owner, 'workspace': workspace, 'task': task, 'operator': operator,
            'root': root, 'native': native, 'server': server}


def api(ctx, route):
    if not ctx['server'] or not os.environ.get('MULTICA_TOKEN'):
        raise DeliveryError('Multica context is required for server reconciliation')
    return request(ctx['server'], {'Authorization': 'Bearer ' + os.environ['MULTICA_TOKEN'],
        'X-Workspace-ID': ctx['workspace']}, route, require_complete=True)


def store(ctx, owner=None):
    return ctx['root'] / ctx['workspace'] / (owner or ctx['owner'])


@contextlib.contextmanager
def catalog(ctx, owner=None):
    directory = store(ctx, owner)
    canonical(directory, missing=True)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(directory / 'catalog.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        path = directory / 'catalog.json'
        canonical(path, missing=True)
        value = json.loads(path.read_text()) if path.exists() else {'format': 1, 'records': {}}
        if value.get('format') != 1 or not isinstance(value.get('records'), dict):
            raise DeliveryError('Invalid artifact catalog; preserve it')
        yield value, path
    finally:
        os.close(fd)


def lock(ctx, artifact, *, owner=None, exclusive=False, nonblocking=False):
    directory = store(ctx, owner) / 'locks'
    canonical(directory, missing=True)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(directory / (artifact + '.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, (fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH) | (fcntl.LOCK_NB if nonblocking else 0))
        return fd
    except BaseException:
        os.close(fd)
        raise


def record(value, artifact, ctx, owner=None):
    if not re.fullmatch('[0-9a-f]{64}', artifact):
        raise DeliveryError('Invalid artifact ID')
    item = value['records'].get(artifact)
    if not item or item['owner'] != (owner or ctx['owner']) or item['workspace'] != ctx['workspace'] or item['server'] != ctx['server']:
        raise DeliveryError('Artifact identity or owner mismatch')
    return item


def provenance(ctx, path, issue):
    objects = store(ctx) / 'objects' / issue
    if path.is_relative_to(objects) and path != objects:
        return {'kind': 'persistent', 'root': str(objects)}
    for parent in path.parents:
        marker = parent / '.managed_env.json'
        if not marker.is_file():
            continue
        canonical(marker)
        native = json.loads(marker.read_text())
        owner_path = parent / '.task_owner'
        canonical(owner_path)
        owner = json.loads(owner_path.read_text())
        if not parent.is_relative_to(ctx['native']) or parent.parent.parent != ctx['native'] or not parent.parent.name.endswith('-' + ctx['workspace'][-12:]) or not path.is_relative_to(parent / 'workdir') or path == parent / 'workdir':
            raise DeliveryError('Artifact is outside the managed workdir')
        if native.get('managed_by') != 'multica-daemon-managed-env' or native.get('agent_id') != ctx['owner'] or native.get('workspace_id') != ctx['workspace'] or native.get('issue_id') != issue or owner.get('workspace_id') != ctx['workspace'] or not owner.get('task_id'):
            raise DeliveryError('Native artifact ownership mismatch')
        if ctx['task']:
            # The current run can belong to another card: the agent also owns
            # its old artifacts. Verify the actor independently of this path.
            runs = api(ctx, f"agents/{ctx['owner']}/tasks")
            current = next((r for r in runs if r['id'] == ctx['task']), None)
            if not current or current['agent_id'] != ctx['owner'] or current.get('workspace_id') != ctx['workspace'] or current['status'] != 'running':
                raise DeliveryError('Active task identity not confirmed')
        return {'kind': 'native', 'root': str(parent), 'marker_sha256': digest(marker),
                'owner_sha256': digest(owner_path)}
    raise DeliveryError('No native ownership or allocated persistent destination')


def verify_build(path, expected=None):
    manifest_path = canonical(path / 'cli-manifest.json')
    manifest = json.loads(manifest_path.read_text())
    metadata = manifest.get('metadata', {})
    required_metadata = {'version', 'channel', 'platform', 'arch', 'sourceCommit', 'sourceTreeSha256', 'sourceDirty', 'dependencies'}
    if set(manifest) != {'format', 'metadata', 'files'} or not required_metadata.issubset(metadata) or set(metadata) - required_metadata - {'capabilities'}:
        raise DeliveryError('Unexpected CLI manifest fields')
    if manifest.get('format') != 'loginom-cli-artifact-v1' or metadata.get('sourceDirty') is not False or not re.fullmatch('[a-f0-9]{40}', metadata.get('sourceCommit', '')) or not re.fullmatch('[a-f0-9]{64}', metadata.get('sourceTreeSha256', '')):
        raise DeliveryError('A clean complete CLI manifest is required')
    entries = manifest.get('files')
    if not isinstance(entries, list) or not entries:
        raise DeliveryError('Empty CLI inventory')
    seen = set()
    for entry in entries:
        if set(entry) - {'path', 'sha256', 'mode', 'link'} or not re.fullmatch('[a-f0-9]{64}', entry.get('sha256', '')):
            raise DeliveryError('Invalid CLI file record')
        relative = entry.get('path', '')
        parts = PurePosixPath(relative).parts
        if not relative or relative.startswith('/') or '\\' in relative or any(p in ('', '.', '..') for p in relative.split('/')) or relative == 'cli-manifest.json' or relative in seen:
            raise DeliveryError('Unsafe CLI inventory path')
        seen.add(relative)
        file = path.joinpath(*parts)
        if not file.resolve(strict=True).is_relative_to(path):
            raise DeliveryError('CLI inventory escapes the artifact')
        info = file.lstat()
        if stat.S_IMODE(info.st_mode) != entry.get('mode'):
            raise DeliveryError('CLI payload mode mismatch')
        link = os.readlink(file) if file.is_symlink() else None
        if link != entry.get('link'):
            raise DeliveryError('CLI payload link mismatch')
        actual = hashlib.sha256(link.encode()).hexdigest() if link is not None and file.is_dir() else digest(file)
        if actual != entry.get('sha256'):
            raise DeliveryError('CLI payload hash mismatch')
    actual_paths = set()
    for directory, dirs, files in os.walk(path, followlinks=False):
        for name in dirs[:]:
            if (Path(directory) / name).is_symlink():
                actual_paths.add(str((Path(directory) / name).relative_to(path)))
                dirs.remove(name)
        actual_paths.update(str((Path(directory) / name).relative_to(path)) for name in files)
    actual_paths.discard('cli-manifest.json')
    if actual_paths != seen:
        raise DeliveryError('CLI payload inventory mismatch')
    required = {'bin/loginom-ai-agent-cli', 'resources/loginom/host/node-host.mjs',
                'resources/loginom/resource-manifest.json', 'resources/loginom/bin/node'}
    if not required.issubset(seen):
        raise DeliveryError('CLI payload incomplete')
    result = {'metadata': metadata, 'manifest_sha256': digest(manifest_path)}
    if expected and result != expected:
        raise DeliveryError('Registered CLI identity changed')
    return result


def git(path, *args):
    result = subprocess.run(['git', '-C', str(path), *args], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise DeliveryError('Git verification failed')
    return result.stdout.strip()


def source_state(path):
    if git(path, 'status', '--porcelain', '--untracked-files=all'):
        raise DeliveryError('Dirty working copy is protected')
    ignored = git(path, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z').split('\0')
    if any(p and not set(p.split('/')[:-1]).intersection(('node_modules', '.next', '.turbo', '__pycache__')) and not p.endswith('.pyc') for p in ignored):
        raise DeliveryError('Unclassified ignored source files are protected')
    head = git(path, 'rev-parse', 'HEAD')
    if not git(path, 'for-each-ref', '--format=%(refname)', '--contains=' + head, 'refs/remotes/origin/'):
        raise DeliveryError('Unpublished source HEAD is protected')
    common = git(path, 'rev-parse', '--path-format=absolute', '--git-common-dir')
    if Path(common) == path / '.git' and git(path, 'rev-list', '--all', '--reflog', '--not', '--remotes=origin'):
        raise DeliveryError('Unpublished refs or reflog commits are protected')
    reflog = sorted(set(git(path, 'reflog', 'show', '--format=%H', 'HEAD').splitlines()))
    if reflog and git(path, 'rev-list', *reflog, '--not', '--remotes=origin'):
        raise DeliveryError('Unpublished worktree reflog commits are protected')
    return {'head': head, 'common': common}


def mounted(path):
    if not Path('/proc/self/mountinfo').is_file():
        raise DeliveryError('Cleanup requires Linux mount and process evidence')
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        mount = Path(re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), line.split()[4]))
        if mount == path or mount.is_relative_to(path):
            return True
    return False


def consumers(path):
    hits = []
    prefix = str(path) + '/'
    uid = path.stat().st_uid
    for proc in Path('/proc').glob('[0-9]*'):
        if int(proc.name) == os.getpid():
            continue
        supervisor = False
        same_user = False
        try:
            same_user = proc.stat().st_uid == uid
            command = (proc / 'cmdline').read_bytes().decode(errors='replace').split('\0')
            values = command[:]
            group = (proc / 'cgroup').read_text()
            parent = Path('/proc') / (proc / 'stat').read_text().rsplit(') ', 1)[1].split()[1]
            # These privilege-separated OS supervisors are not agent workers.
            # Their children are scanned normally. Do not exempt a worker by
            # its comm name: require the exact supervisor argv and cgroup.
            supervisor = command[:2] == ['/usr/lib/systemd/systemd', '--user'] and group.endswith('/init.scope\n')
            if command[0] == '(sd-pam)' and group.endswith('/init.scope\n'):
                supervisor = (parent / 'cmdline').read_bytes().split(b'\0')[:2] == [b'/usr/lib/systemd/systemd', b'--user']
            if command[0].startswith('sshd-session: ') and command[0].endswith('@notty') and '/session-' in group:
                supervisor = parent.stat().st_uid == 0 and (parent / 'comm').read_text().strip() == 'sshd-session'
            for name in ('cwd', 'exe', 'root'):
                try:
                    values.append(os.readlink(proc / name))
                except PermissionError:
                    if same_user and not supervisor:
                        raise DeliveryError('Runtime process visibility incomplete')
                except FileNotFoundError:
                    pass
            if (same_user and not supervisor) or os.geteuid() == 0:
                values.extend(line.rsplit(None, 1)[-1] for line in (proc / 'maps').read_text().splitlines() if '/' in line)
                for fd in (proc / 'fd').iterdir():
                    try:
                        values.append(os.readlink(fd))
                    except FileNotFoundError:
                        pass
            if any(v.removesuffix(' (deleted)') == str(path) or v.startswith(prefix) or str(path) in v for v in values):
                hits.append(int(proc.name))
        except (FileNotFoundError, ProcessLookupError):
            continue
        except PermissionError:
            if same_user and not supervisor:
                raise DeliveryError('Runtime process visibility incomplete')
    return hits


def safety(ctx, item):
    path = canonical(item['path'])
    if mounted(path):
        raise DeliveryError('Mounted artifact is protected')
    info = path.stat()
    if [info.st_dev, info.st_ino] != item['inode'] or provenance(ctx, path, item['issue']) != item['provenance']:
        raise DeliveryError('Artifact path or native provenance changed')
    if consumers(path):
        raise DeliveryError('Active artifact consumers')
    if item['kind'] == 'source' and source_state(path) != item['source']:
        raise DeliveryError('Source identity changed')
    if item['kind'] == 'build':
        verify_build(path, item['build'])
    if item['kind'] == 'dependencies':
        if path.name != 'node_modules' or (path.parent / 'cli-manifest.json').exists() or '/resources/' in str(path):
            raise DeliveryError('Bundled runtime dependencies are protected')
        source_state(path.parent)
    if item['kind'] != 'build':
        for directory, dirs, files in os.walk(path, followlinks=False):
            dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', '.next', '.turbo')]
            if any(name.lower() in ('.env', 'auth.json', 'credentials.json', '.writer', 'pending.json', 'journal.json', '.task_lock', '.task_owner', '.managed_env.json') or name.lower().endswith('.lgp') for name in files) or any(d.lower() in ('profiles', 'recovery', 'journals') for d in dirs):
                raise DeliveryError('Profiles, credentials or operation evidence are protected')
    return path


def allocate(ctx, args):
    issue = str(uuid.UUID(args.issue))
    if not re.fullmatch('[a-z0-9][a-z0-9-]{0,63}', args.name):
        raise DeliveryError('Use a short artifact name')
    directory = store(ctx) / 'objects' / issue
    canonical(directory, missing=True)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / (args.name + '-' + uuid.uuid4().hex[:12])
    print(json.dumps({'destination': str(path), 'owner': ctx['owner'], 'issue': issue}))


def register(ctx, args):
    path = canonical(args.path)
    issue = str(uuid.UUID(args.issue))
    proof = provenance(ctx, path, issue)
    item = {'owner': ctx['owner'], 'workspace': ctx['workspace'], 'server': ctx['server'],
            'issue': issue, 'path': str(path), 'kind': args.kind, 'provenance': proof,
            'inode': [path.stat().st_dev, path.stat().st_ino], 'registered_at': time.time(),
            'protections': list(args.protect or []), 'pins': {}, 'state': 'retained', 'retired_at': None}
    if args.legacy or proof['kind'] == 'native':
        item['protections'].append('legacy-unreconciled')
    if args.kind == 'build':
        item['build'] = verify_build(path)
        item['sha'] = item['build']['metadata']['sourceCommit']
    if args.kind == 'source':
        item['source'] = source_state(path)
        item['sha'] = item['source']['head']
    if args.kind == 'dependencies':
        item['sha'] = source_state(path.parent)['head']
    if args.kind == 'evidence':
        if not args.sha or not re.fullmatch('[a-f0-9]{40}', args.sha):
            raise DeliveryError('Evidence requires its exact source SHA')
        item['sha'] = args.sha
    if args.sha and item.get('sha') != args.sha:
        raise DeliveryError('Artifact source SHA mismatch')
    artifact = hashlib.sha256(json.dumps([ctx['server'], ctx['workspace'], ctx['owner'], str(path)]).encode()).hexdigest()
    with catalog(ctx) as (value, target):
        if any(artifact != key and old['state'] != 'deleted' and (path.is_relative_to(Path(old['path'])) or Path(old['path']).is_relative_to(path)) for key, old in value['records'].items()):
            raise DeliveryError('Overlapping artifact registrations are refused')
        previous = value['records'].get(artifact)
        if previous:
            if any(previous.get(k) != item.get(k) for k in ('inode', 'kind', 'build', 'source', 'issue', 'provenance')) or previous['state'] == 'deleted':
                raise DeliveryError('Registered artifact changed; keep the original record')
            item = previous
        value['records'][artifact] = item
        atomic(target, value)
    print(json.dumps({'id': artifact, **item}))


def pin_handoff(ids, handoff, issue, agent, sha, receipt, *, owner=None, state_root=None, workspace=None, product_sha=None):
    args = argparse.Namespace(owner=owner, workspace=workspace, state_root=state_root, workspaces_root=None)
    ctx = identity(args)
    with catalog(ctx) as (value, target):
        for artifact in ids:
            item = record(value, artifact, ctx)
            expected_sha = product_sha if product_sha and item['kind'] == 'build' else sha
            if item['state'] == 'deleted' or item.get('sha') != expected_sha:
                raise DeliveryError('Handoff artifact source mismatch')
            canonical(item['path'])
            if item['kind'] == 'build':
                verify_build(Path(item['path']), item['build'])
            obligation = {'issue': issue, 'agent': agent, 'sha': item['sha'], 'action_sha': sha, 'receipt': str(canonical(receipt, missing=True))}
            old = item['pins'].get(handoff)
            if old and any(old.get(k) != v for k, v in obligation.items()):
                raise DeliveryError('Artifact pin belongs to another handoff')
            item['pins'][handoff] = old or {**obligation, 'created_at': time.time()}
            item['retired_at'] = None
            item['state'] = 'retained'
        atomic(target, value)
    return [{'id': artifact, 'owner': ctx['owner'], 'path': value['records'][artifact]['path'],
             'kind': value['records'][artifact]['kind'], 'sha': value['records'][artifact]['sha'],
             'manifest_sha256': value['records'][artifact].get('build', {}).get('manifest_sha256'),
             'source': value['records'][artifact].get('build', {}).get('metadata'), 'handoff': handoff} for artifact in ids]


def release(ctx, args):
    with catalog(ctx) as (value, target):
        item = record(value, args.id, ctx)
        obligation = item['pins'].get(args.handoff)
        if not obligation:
            if args.handoff in item.get('released_handoffs', {}):
                print(json.dumps({'released': args.handoff, 'idempotent': True}))
                return
            raise DeliveryError('Unknown handoff pin')
        receipt_path = canonical(obligation['receipt'])
        receipt = json.loads(receipt_path.read_text())
        if receipt.get('key') != args.handoff or receipt.get('state') != 'assigned' or receipt.get('issue') != obligation['issue'] or receipt.get('agent') != obligation['agent']:
            raise DeliveryError('Durable assignment not reconciled')
        runs = api(ctx, f"issues/{obligation['issue']}/task-runs")
        linked = [r for r in runs if r['agent_id'] == obligation['agent'] and (r.get('trigger_comment_id') == receipt['comment'] or any(receipt['comment'] in (r.get(k) or []) for k in ('delivered_comment_ids', 'coalesced_comment_ids', 'planned_comment_ids')))]
        if not linked or any(r['status'] not in ('completed', 'failed', 'cancelled') for r in linked):
            raise DeliveryError('Receiver has not completed the assigned work')
        comments = api(ctx, f"issues/{obligation['issue']}/comments")
        comment = next((c for c in comments if c['id'] == str(uuid.UUID(args.result_comment))), None)
        if not comment or comment.get('author_type') != 'agent' or comment.get('author_id') != obligation['agent'] or comment.get('source_task_id') not in [r['id'] for r in linked if r['status'] == 'completed'] or f'Artifact-release: {args.id}' not in comment.get('content', '').splitlines() or f'Handoff-ID: {args.handoff}' not in comment.get('content', '').splitlines():
            raise DeliveryError('Explicit artifact release result is missing')
        item.setdefault('released_handoffs', {})[args.handoff] = {'comment': comment['id'], 'at': time.time()}
        del item['pins'][args.handoff]
        atomic(target, value)
    print(json.dumps({'released': args.handoff}))


def protect(ctx, args):
    with catalog(ctx) as (value, target):
        item = record(value, args.id, ctx)
        if item['state'] == 'deleted':
            raise DeliveryError('Deleted artifact cannot be retained')
        flags = set(item['protections'])
        if 'final' in (args.remove or []):
            raise DeliveryError('Final acceptance evidence is retained indefinitely')
        flags.update(args.add or [])
        flags.difference_update(args.remove or [])
        if 'legacy-unreconciled' in item['protections'] and 'legacy-unreconciled' not in flags and not args.confirmation:
            raise DeliveryError('Legacy reconciliation needs a private evidence file')
        if args.confirmation:
            proof = canonical(args.confirmation)
            confirmation = json.loads(proof.read_text())
            if any(confirmation.get(k) != item[k] for k in ('owner', 'workspace', 'issue', 'path')) or confirmation.get('all_consumers_released') is not True or confirmation.get('unresolved') is not False or not confirmation.get('evidence'):
                raise DeliveryError('Legacy evidence must confirm this exact owner/path and all releases')
            if confirmation.get('historical_release'):
                if not ctx['operator'] or item['kind'] not in ('source', 'build'):
                    raise DeliveryError('Historical adoption is restricted to operator-reviewed clean sources/builds')
                reference = confirmation['historical_release']
                reference['issue'] = str(uuid.UUID(reference['issue']))
                reference['comment'] = str(uuid.UUID(reference['comment']))
                reference['task'] = str(uuid.UUID(reference['task']))
                comments = api(ctx, f"issues/{reference['issue']}/comments")
                comment = next((c for c in comments if c['id'] == reference['comment']), None)
                runs = api(ctx, f"issues/{reference['issue']}/task-runs")
                run = next((r for r in runs if r['id'] == reference['task']), None)
                heading = comment.get('content', '').split('\n\n')[0] if comment else ''
                if not comment or not run or run['status'] != 'completed' or comment.get('source_task_id') != run['id'] or comment.get('author_type') != 'agent' or comment.get('author_id') != run['agent_id'] or item['sha'][:9] not in heading or 'PASS' not in heading or any(w in heading for w in ('REQUEST_CHANGES', 'CHANGES_REQUESTED', 'PASS пока', 'FAIL', 'P1 открыт', 'NOT_VERIFIED')) or reference.get('reviewed_no_consumers') is not True:
                    raise DeliveryError('Historical review completion not confirmed')
                if item['kind'] == 'build':
                    first_sha = re.search(r'(?<![a-f0-9])([a-f0-9]{9,40})(?![a-f0-9])', heading)
                    if not first_sha or not item['sha'].startswith(first_sha[1]) or confirmation.get('manifest_sha256') != item['build']['manifest_sha256']:
                        raise DeliveryError('Exact historical build verdict or inventory hash not confirmed')
                    if digest(canonical(Path(item['path']) / 'cli-manifest.json')) != item['build']['manifest_sha256']:
                        raise DeliveryError('Historical build manifest changed')
                released_at = datetime.datetime.fromisoformat(comment['created_at']).timestamp()
                if released_at > time.time() or time.time() - released_at < DAY:
                    raise DeliveryError('Historical release has not reached retention')
                item['legacy_released_at'] = released_at
            item['reconciliation'] = {'path': str(proof), 'sha256': digest(proof)}
        item['protections'] = sorted(flags)
        atomic(target, value)
    print(json.dumps({'id': args.id, 'protections': item['protections']}))


def select(ctx, args):
    with catalog(ctx) as (value, target):
        current = record(value, args.current, ctx)
        previous = record(value, args.previous, ctx) if args.previous else None
        for item in [current] + ([previous] if previous else []):
            if item['kind'] != 'build' or item['state'] == 'deleted' or item['issue'] != current['issue']:
                raise DeliveryError('Selection must contain retained builds of one card')
            verify_build(canonical(item['path']), item['build'])
        if previous and args.previous == args.current:
            raise DeliveryError('Current and previous candidates must be distinct')
        for item in value['records'].values():
            if item['issue'] == current['issue']:
                item['protections'] = [p for p in item['protections'] if p not in ('current', 'previous')]
        current['protections'].append('current')
        current.update(state='retained', retired_at=None)
        if previous:
            previous['protections'].append('previous')
            previous.update(state='retained', retired_at=None)
        atomic(target, value)
    print(json.dumps({'current': args.current, 'previous': args.previous}))


def migrate(ctx, args):
    with catalog(ctx) as (value, target):
        item = record(value, args.id, ctx)
        if item['kind'] != 'build' or item['state'] == 'deleted' or item['pins'] or set(item['protections']).intersection(('unresolved', 'legacy-unreconciled')):
            raise DeliveryError('Only reconciled, unused builds may move')
        fd = lock(ctx, args.id, exclusive=True, nonblocking=True)
        try:
            destination = store(ctx) / 'objects' / item['issue'] / args.id
            canonical(destination, missing=True)
            if item['provenance']['kind'] == 'persistent':
                print(json.dumps({'id': args.id, 'path': item['path'], 'already_persistent': True}))
                return
            migration = item.get('migration')
            if not migration:
                path = safety(ctx, item)
                destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                if destination.exists():
                    raise DeliveryError('Migration destination already exists')
                item['migration'] = {'from': str(path), 'to': str(destination), 'at': time.time()}
                atomic(target, value)
                os.rename(path, destination)
            if Path(item['path']).exists() or not destination.is_dir() or [destination.stat().st_dev, destination.stat().st_ino] != item['inode']:
                raise DeliveryError('Migration outcome unknown; preserve the intent')
            verify_build(destination, item['build'])
            item['path'] = str(destination)
            item['provenance'] = provenance(ctx, destination, item['issue'])
            atomic(target, value)
        finally:
            os.close(fd)
    print(json.dumps({'id': args.id, 'path': str(destination), 'migrated': True}))


def find(ctx, args):
    expected = json.loads(canonical(args.expected).read_text())
    fields = ('sourceCommit', 'sourceTreeSha256', 'sourceDirty', 'channel', 'platform', 'arch', 'capabilities', 'dependencies')
    if any(k not in expected for k in fields) or expected['sourceDirty'] is not False:
        raise DeliveryError('Complete clean build input identity is required')
    with catalog(ctx) as (value, target):
        matches = [{'id': artifact, 'path': item['path'], 'build': item['build']} for artifact, item in value['records'].items()
                   if item['kind'] == 'build' and item['state'] != 'deleted' and all(expected[k] == item['build']['metadata'].get(k) for k in fields)]
    print(json.dumps({'matches': matches, 'integrity': 'verify_with_use_before_execution'}))


def retire(ctx, args):
    with catalog(ctx) as (value, target):
        item = record(value, args.id, ctx)
        if item['pins'] or item['protections']:
            raise DeliveryError('Pinned or protected artifact cannot be retired')
        if item['state'] == 'deleted':
            print(json.dumps({'id': args.id, 'state': 'deleted'}))
            return
        if not args.reason or not args.reason.strip():
            raise DeliveryError('Record the verified reason for retirement')
        item['retired_at'] = item['retired_at'] or item.get('legacy_released_at') or time.time()
        item['state'] = 'retired'
        item['reason'] = args.reason
        atomic(target, value)
    print(json.dumps({'id': args.id, 'retired_at': item['retired_at']}))


def use(ctx, args):
    owner = str(uuid.UUID(args.producer or ctx['owner']))
    fd = lock(ctx, args.id, owner=owner)
    try:
        with catalog(ctx, owner) as (value, target):
            item = record(value, args.id, ctx, owner)
            if item['state'] == 'deleted' or item['kind'] != 'build':
                raise DeliveryError('An existing build is required')
            if owner != ctx['owner'] and not any(p['agent'] == ctx['owner'] for p in item['pins'].values()):
                raise DeliveryError('No handoff authorizes this consumer')
            path = canonical(item['path'])
            if args.expected:
                expected = json.loads(canonical(args.expected).read_text())
                fields = ('sourceCommit', 'sourceTreeSha256', 'sourceDirty', 'channel', 'platform', 'arch', 'capabilities', 'dependencies')
                if any(k not in expected or expected[k] != item['build']['metadata'].get(k) for k in fields):
                    raise DeliveryError('Build inputs do not match')
            if owner == ctx['owner']:
                item.update(state='retained', retired_at=None)
                atomic(target, value)
        # Keep the artifact lease, but release the owner's catalog while hashing
        # its payload so independent card consumers can start concurrently.
        verify_build(path, item['build'])
        if not args.command:
            print(json.dumps({'id': args.id, 'path': str(path), 'build': item['build']}))
            return
        environment = {k: v for k, v in os.environ.items() if not k.startswith('MULTICA_')}
        environment['LOGINOM_ARTIFACT_PATH'] = str(path)
        code = subprocess.call(args.command[1:] if args.command[0] == '--' else args.command, env=environment)
        if code:
            raise DeliveryError('Artifact consumer exited unsuccessfully')
    finally:
        os.close(fd)


def legacy_cli(ctx, *arguments):
    """Read only through the supported CLI; never substitute a failed/partial read."""
    environment = dict(os.environ, MULTICA_WORKSPACE_ID=ctx['workspace'], MULTICA_SERVER_URL=ctx['server'])
    try:
        result = subprocess.run(['multica', *arguments, '--output', 'json'],
                                env=environment, capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError) as error:
        raise DeliveryError('Legacy CLI read failed; retain artifacts') from error
    # Cursor/truncation warnings are on stderr, not in the JSON array. Treat any
    # warning as unqualified rather than interpreting it as an empty/full read.
    if result.stderr.strip():
        raise DeliveryError('Legacy CLI read has warnings; retain artifacts') from subprocess.CalledProcessError(
            result.returncode, result.args, output=result.stdout, stderr=result.stderr)
    try:
        return json.loads(result.stdout)
    except (ValueError, TypeError) as error:
        raise DeliveryError('Legacy CLI body invalid; retain artifacts') from error


def legacy_issues(ctx):
    """Complete traversal, not an atomic snapshot of a changing workspace."""
    issues, seen, offset, total = [], set(), 0, None
    while True:
        page = legacy_cli(ctx, 'issue', 'list', '--limit', '100', '--offset', str(offset))
        if (not isinstance(page, dict) or not isinstance(page.get('issues'), list)
                or type(page.get('has_more')) is not bool
                or type(page.get('total')) is not int or page['total'] < 0
                or type(page.get('offset')) is not int or page['offset'] != offset
                or type(page.get('limit')) is not int or page['limit'] != 100):
            raise DeliveryError('Issue pagination incomplete; retain legacy artifacts')
        if total is None:
            total = page['total']
        if page['total'] != total:
            raise DeliveryError('Issue pagination changed; retain legacy artifacts')
        rows = page['issues']
        if len(rows) > 100 or offset + len(rows) > total:
            raise DeliveryError('Issue pagination inconsistent; retain legacy artifacts')
        for issue in rows:
            if (not isinstance(issue, dict) or not isinstance(issue.get('status'), str)
                    or not issue['status'] or not isinstance(issue.get('id'), str)
                    or 'description' not in issue
                    or issue.get('description') is not None and not isinstance(issue['description'], str)):
                raise DeliveryError('Issue projection incomplete; retain legacy artifacts')
            try:
                key = str(uuid.UUID(issue['id']))
            except ValueError as error:
                raise DeliveryError('Issue identity invalid; retain legacy artifacts') from error
            if key in seen:
                raise DeliveryError('Issue pagination overlaps; retain legacy artifacts')
            seen.add(key)
        issues.extend(rows)
        offset += len(rows)
        if not page['has_more']:
            if offset != total:
                raise DeliveryError('Issue pagination ended early; retain legacy artifacts')
            return issues
        if not rows or offset >= total:
            raise DeliveryError('Issue pagination did not advance; retain legacy artifacts')


def legacy_relations(ctx, issue):
    comments = legacy_cli(ctx, 'issue', 'comment', 'list', issue['id'], '--full')
    runs = legacy_cli(ctx, 'issue', 'runs', issue['id'])
    if not isinstance(comments, list) or not isinstance(runs, list):
        raise DeliveryError('Legacy relation projection incomplete; retain artifacts')
    for rows in (comments, runs):
        seen = set()
        for row in rows:
            if (not isinstance(row, dict) or not isinstance(row.get('id'), str)
                    or row['id'] in seen or row.get('issue_id', issue['id']) != issue['id']
                    or row.get('content_truncated') or row.get('folded_reply_count')):
                raise DeliveryError('Legacy relation incomplete or foreign; retain artifacts')
            try:
                key = str(uuid.UUID(row['id']))
            except ValueError as error:
                raise DeliveryError('Legacy relation identity invalid; retain artifacts') from error
            if key in seen:
                raise DeliveryError('Legacy relation identity repeated; retain artifacts')
            seen.add(key)
    for comment in comments:
        if not isinstance(comment.get('content'), str) or not isinstance(comment.get('created_at'), str):
            raise DeliveryError('Legacy comment projection incomplete; retain artifacts')
        try:
            stamp = datetime.datetime.fromisoformat(comment['created_at'])
            if stamp.tzinfo is None:
                raise ValueError('missing timezone')
        except ValueError as error:
            raise DeliveryError('Legacy comment time invalid; retain artifacts') from error
    for run in runs:
        if not isinstance(run.get('status'), str) or not run['status']:
            raise DeliveryError('Legacy run projection incomplete; retain artifacts')
        if run.get('trigger_comment_id') is not None and not isinstance(run['trigger_comment_id'], str):
            raise DeliveryError('Legacy run trigger incomplete; retain artifacts')
        for field in ('delivered_comment_ids', 'coalesced_comment_ids', 'planned_comment_ids'):
            if run.get(field) is not None and (not isinstance(run[field], list)
                    or any(not isinstance(key, str) for key in run[field])):
                raise DeliveryError('Legacy run references incomplete; retain artifacts')
        try:
            for key in ([run['trigger_comment_id']] if run.get('trigger_comment_id') else []) + [
                    key for field in ('delivered_comment_ids', 'coalesced_comment_ids', 'planned_comment_ids')
                    for key in run.get(field) or []]:
                uuid.UUID(key)
        except ValueError as error:
            raise DeliveryError('Legacy run reference identity invalid; retain artifacts') from error
    return comments, runs


def legacy_references(ctx):
    issues = legacy_issues(ctx)
    for issue in issues:
        if not isinstance(issue, dict) or not issue.get('id') or not isinstance(issue.get('status'), str):
            raise DeliveryError('Issue projection incomplete; retain legacy artifacts')
    issues = [i for i in issues if i['status'] not in ('done', 'cancelled')]
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda issue: legacy_relations(ctx, issue), issues))
    fragments = []
    for index, issue in enumerate(issues):
        comments, runs = responses[index]
        fragments.append(issue.get('description') or '')
        active_ids = {r.get('trigger_comment_id') for r in runs if r['status'] not in ('completed', 'failed', 'cancelled')}
        active_ids.update(c for r in runs if r['status'] not in ('completed', 'failed', 'cancelled') for field in ('delivered_comment_ids', 'coalesced_comment_ids', 'planned_comment_ids') for c in (r.get(field) or []))
        fragments.extend(c.get('content', '') for c in comments if c['id'] in active_ids or time.time() - datetime.datetime.fromisoformat(c['created_at']).timestamp() < DAY)
    return '\n'.join(fragments)


def cleanup(ctx, args):
    report = {'owner': ctx['owner'], 'workspace': ctx['workspace'], 'apply': args.apply,
              'at': time.time(), 'free_before': shutil.disk_usage(ctx['root'] if ctx['root'].exists() else Path.home()).free, 'items': []}
    with catalog(ctx) as (value, target):
        needs_legacy = any(i.get('legacy_released_at') and i['state'] != 'deleted' for i in value['records'].values())
    # Network reconciliation must not block other cards from recording pins or
    # protections. Reopen the catalog afterwards and use its current state.
    references = legacy_references(ctx) if needs_legacy else None
    with catalog(ctx) as (value, target):
        for artifact, item in value['records'].items():
            record(value, artifact, ctx)
            entry = {'id': artifact, 'path': item['path'], 'kind': item['kind'], 'status': 'retained'}
            report['items'].append(entry)
            if item['state'] == 'deleted':
                entry['status'] = 'already_deleted'
                continue
            if item['protections'] or item['pins']:
                entry['reason'] = 'protected_or_pinned'
                continue
            if item.get('legacy_released_at') and references is None:
                entry['reason'] = 'legacy_reconciliation_required'
                continue
            if item.get('legacy_released_at') and any(s in references for s in (item.get('sha', '')[:9], item['path'], Path(item['path']).name) if s):
                entry['reason'] = 'current_checkpoint_or_assignment_reference'
                continue
            ttl = 7 * DAY if item['kind'] == 'evidence' else DAY
            if item['state'] != 'retired' or not item['retired_at'] or time.time() - item['retired_at'] < ttl:
                entry['reason'] = 'not_released_or_retention'
                continue
            try:
                fd = lock(ctx, artifact, exclusive=True, nonblocking=True)
            except BlockingIOError:
                entry['reason'] = 'active_lease'
                continue
            try:
                if item.get('deletion_started_at') and not Path(item['path']).exists() and not Path(item['path']).is_symlink():
                    if args.apply:
                        item.update(state='deleted', deleted_at=time.time())
                        atomic(target, value)
                    entry['status'] = 'already_removed_after_intent'
                    continue
                path = safety(ctx, item)
                entry['status'] = 'eligible'
                entry['allocated_bytes'] = 0
                seen = set()
                for directory, dirs, files in os.walk(path, followlinks=False):
                    for name in files:
                        info = (Path(directory) / name).lstat()
                        key = (info.st_dev, info.st_ino)
                        if key not in seen and info.st_nlink == 1:
                            entry['allocated_bytes'] += info.st_blocks * 512
                        seen.add(key)
                if not args.apply:
                    continue
                # Persist intent before any removal. An interrupted deletion is
                # retried only with the same path/inode/provenance and locks.
                item['deletion_started_at'] = item.get('deletion_started_at') or time.time()
                atomic(target, value)
                path = safety(ctx, item)
                if [path.stat().st_dev, path.stat().st_ino] != item['inode'] or canonical(path) != path:
                    raise DeliveryError('Artifact changed immediately before removal')
                if item['kind'] == 'source':
                    common = Path(item['source']['common'])
                    if common != path / '.git':
                        git(path, 'worktree', 'remove', str(path))
                    elif len(re.findall('^worktree ', git(path, 'worktree', 'list', '--porcelain'), re.M)) != 1:
                        raise DeliveryError('Source checkout owns other worktrees')
                    else:
                        shutil.rmtree(path)
                else:
                    shutil.rmtree(path)
                if path.exists() or path.is_symlink():
                    raise DeliveryError('Removal read-back failed')
                item.update(state='deleted', deleted_at=time.time())
                atomic(target, value)
                entry['status'] = 'deleted'
            except (DeliveryError, OSError, ValueError, KeyError) as error:
                entry.update(status='retained', reason=str(error) if isinstance(error, DeliveryError) else type(error).__name__)
            finally:
                os.close(fd)
    report['free_after'] = shutil.disk_usage(ctx['root']).free
    report['low_disk'] = report['free_after'] < 10 * 2**30
    if args.apply:
        atomic(store(ctx) / ('cleanup-' + uuid.uuid4().hex + '.json'), report)
    print(json.dumps(report))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner', help='Human operator only: explicit owner UUID')
    parser.add_argument('--workspace', help='Human operator only: workspace UUID')
    parser.add_argument('--state-root')
    parser.add_argument('--workspaces-root')
    commands = parser.add_subparsers(dest='operation', required=True)
    p = commands.add_parser('allocate')
    p.add_argument('--issue', required=True)
    p.add_argument('--name', required=True)
    p = commands.add_parser('register')
    p.add_argument('--issue', required=True)
    p.add_argument('--path', required=True)
    p.add_argument('--kind', choices=KINDS, required=True)
    p.add_argument('--sha', help='Exact source SHA; required for evidence')
    p.add_argument('--protect', action='append', choices=PROTECTED)
    p.add_argument('--legacy', action='store_true')
    p = commands.add_parser('protect')
    p.add_argument('--id', required=True)
    p.add_argument('--add', action='append', choices=PROTECTED)
    p.add_argument('--remove', action='append', choices=PROTECTED)
    p.add_argument('--confirmation')
    p = commands.add_parser('retire')
    p.add_argument('--id', required=True)
    p.add_argument('--reason', required=True)
    p = commands.add_parser('select')
    p.add_argument('--current', required=True)
    p.add_argument('--previous', help='Previous verified working candidate, not simply the newest directory')
    p = commands.add_parser('migrate')
    p.add_argument('--id', required=True)
    p = commands.add_parser('find')
    p.add_argument('--expected', required=True)
    p = commands.add_parser('release')
    p.add_argument('--id', required=True)
    p.add_argument('--handoff', required=True)
    p.add_argument('--result-comment', required=True)
    p = commands.add_parser('use')
    p.add_argument('--id', required=True)
    p.add_argument('--producer')
    p.add_argument('--expected', help='Complete expected build input identity JSON')
    p.add_argument('command', nargs=argparse.REMAINDER)
    p = commands.add_parser('cleanup')
    p.add_argument('--apply', action='store_true')
    commands.add_parser('preflight', help='Apply permitted cleanup and refuse a heavy build below 10 GiB free')
    args = parser.parse_args()
    try:
        ctx = identity(args)
        if args.operation == 'preflight':
            cleanup(ctx, argparse.Namespace(apply=True))
            if shutil.disk_usage(ctx['root']).free < 10 * 2**30:
                raise DeliveryError('Less than 10 GiB free; defer the heavy build and continue safe analysis')
        else:
            globals()[args.operation](ctx, args)
    except (OSError, ValueError, KeyError) as error:
        print((str(error) if isinstance(error, DeliveryError) else type(error).__name__) + ': artifact operation refused; preserve state.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
