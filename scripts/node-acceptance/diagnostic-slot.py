#!/usr/bin/env python3
"""Run/recover isolated diagnostics. Shares the acceptance lock; Linux host only."""
import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import signal
import subprocess
import time

ROOT = Path('/opt/loginom-worker/slots')
HARNESS = Path('/opt/loginom-worker/cli-v017-20260926')
BWRAP = '/usr/local/libexec/loginom-swarm/bwrap'
SCRIPT = Path(__file__).resolve().parent


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


@contextlib.contextmanager
def slot_lock(slot_root):
    attempts = slot_root / 'attempts'
    lock = attempts / '.lock'
    with (attempts / '.lock-guard').open('a') as guard:
        fcntl.flock(guard, fcntl.LOCK_EX)
        if lock.exists():
            try:
                pid = int((lock / 'pid').read_text())
            except (ValueError, FileNotFoundError):
                raise RuntimeError('BLOCKED: lock owner unknown') from None
            if pid <= 0 or alive(pid):
                raise RuntimeError('BLOCKED: slot owner alive')
            # Only known lock files may be removed, never arbitrary directories.
            if set(p.name for p in lock.iterdir()) - {'pid', 'started'}:
                raise RuntimeError('BLOCKED: unknown lock contents')
            (lock / 'pid').unlink()
            (lock / 'started').unlink(missing_ok=True)
            lock.rmdir()
        lock.mkdir(mode=0o700)
        (lock / 'pid').write_text(str(os.getpid()))
        (lock / 'started').write_text(str(int(time.time())))
        fcntl.flock(guard, fcntl.LOCK_UN)
        try:
            yield
        finally:
            fcntl.flock(guard, fcntl.LOCK_EX)
            if (lock / 'pid').read_text() == str(os.getpid()):
                (lock / 'pid').unlink()
                (lock / 'started').unlink(missing_ok=True)
                lock.rmdir()


def assert_idle(slot_root, slot):
    """Unknown ownership blocks release. Inspect same-UID browser/runtime processes."""
    display = f':{11 + ord(slot) - ord("a")}'
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit() or int(entry.name) == os.getpid():
            continue
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            command = (entry / 'cmdline').read_bytes().decode(errors='replace').split('\0')
            if not command or not re.search(r'(chrome|chromium|Xvfb|bwrap|loginom-ai-agent|node|python)', Path(command[0]).name):
                continue
            environment = (entry / 'environ').read_bytes().decode(errors='replace').split('\0')
        except FileNotFoundError:
            continue
        except PermissionError:
            raise RuntimeError('BLOCKED: process ownership cannot be inspected') from None
        if (any(str(slot_root) in arg for arg in command)
                or display in command or f'DISPLAY={display}' in environment
                or f'LOGINOM_AI_AGENT_CLI_PROFILE={slot_root / "profile"}' in environment):
            raise RuntimeError('BLOCKED: slot process still alive')


def release(slot_root, slot, resources, output):
    connection = json.loads((slot_root / 'profile/loginom/connection/connection.json').read_text())
    accounts = json.loads((ROOT / 'accounts.json').read_text())
    user = f'lab-slot-{slot}'
    if (connection.get('username') != user or accounts['slots'][slot]['username'] != user
            or connection.get('url', '').split('?')[0].rstrip('/') != accounts['url'].split('?')[0].rstrip('/')):
        raise RuntimeError('BLOCKED: slot account/origin mismatch')
    assert_idle(slot_root, slot)
    resources = resources.resolve()
    if not (resources / 'resource-manifest.json').is_file() or not (HARNESS / 'headed-entry.py').is_file():
        raise RuntimeError('BLOCKED: qualified resources/harness missing')
    payload = next((p for p in resources.parents if (p / 'cli-manifest.json').is_file()), None)
    if payload is None:
        raise RuntimeError('BLOCKED: candidate payload manifest missing')
    release_dir = output / 'release'
    release_dir.mkdir(mode=0o700)
    credentials = output / '.release-accounts.json'
    write_json(credentials, {k: accounts[k] for k in ['url', 'admin_user', 'admin_password']})
    command = [BWRAP, '--die-with-parent', '--new-session', '--unshare-all', '--share-net', '--cap-drop', 'ALL',
               '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/sbin', '/sbin',
               '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64', '--proc', '/proc', '--dev', '/dev',
               '--tmpfs', '/tmp', '--tmpfs', '/run', '--tmpfs', '/dev/shm']
    for path in ['/etc/ssl', '/etc/ca-certificates', '/etc/resolv.conf', '/etc/hosts', '/etc/nsswitch.conf',
                 '/etc/passwd', '/etc/group', '/etc/fonts', '/etc/alternatives/awk', str(payload), str(HARNESS), str(SCRIPT)]:
        command += ['--ro-bind', path, path]
    command += ['--bind', str(slot_root), str(slot_root), '--chdir', str(release_dir),
                '--setenv', 'HOME', str(slot_root), '--setenv', 'TMPDIR', '/tmp',
                '--setenv', 'LOGINOM_AI_AGENT_TEST_HEADLESS', '0',
                '/usr/bin/xvfb-run', '-n', str(11 + ord(slot) - ord('a')),
                '-s', '-screen 0 1920x1200x24 -nolisten tcp', '/usr/bin/python3', str(HARNESS / 'headed-entry.py'),
                str(resources / 'bin/node'), str(SCRIPT / 'release-slot-sessions.mjs'),
                '--resources', str(resources), '--accounts', str(credentials), '--slot-user', user,
                '--output', str(release_dir)]
    try:
        with (release_dir / 'stdout.txt').open('w') as stdout, (release_dir / 'stderr.txt').open('w') as stderr:
            process = subprocess.Popen(command, stdout=stdout, stderr=stderr, start_new_session=True)
            try:
                code = process.wait(timeout=180)
            except BaseException:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise
        if code != 0:
            raise RuntimeError('BLOCKED: administrative cleanup unconfirmed')
        receipt = json.loads((release_dir / 'stdout.txt').read_text().strip().splitlines()[-1])
        if receipt.get('slotUser') != user or receipt.get('loggedOut') is not True or receipt.get('seen') != receipt.get('closed'):
            raise RuntimeError('BLOCKED: release receipt invalid')
        return receipt
    finally:
        credentials.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['run', 'recover'])
    parser.add_argument('--slot', required=True)
    parser.add_argument('--resources', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args, command = parser.parse_known_args()
    if command[:1] == ['--']:
        command = command[1:]
    if not re.fullmatch('[a-z]', args.slot) or os.environ.get('NODE_SLOT') != args.slot:
        parser.error('--slot must equal assigned NODE_SLOT')
    if pwd.getpwuid(os.getuid()).pw_name != 'loginom-worker' or not Path('/proc').exists():
        parser.error('run on Linux as loginom-worker')
    slot_root = ROOT / args.slot
    output = args.out.resolve()
    if not output.is_relative_to(slot_root / 'attempts') or output == slot_root / 'attempts' or output.name.startswith('.'):
        parser.error('--out must be a new directory under slot attempts')
    if (args.mode == 'run') != bool(command):
        parser.error('run requires command after --; recover accepts no command')
    os.umask(0o077)
    result = {'status': 'BLOCKED', 'slot': args.slot, 'cleanup_confirmed': False, 'command_exit': None}
    with slot_lock(slot_root):
        output.mkdir(mode=0o700)
        write_json(output / 'owner.json', {'slot': args.slot, 'account': f'lab-slot-{args.slot}', 'pid': os.getpid(),
                                         'started_at': time.time(), 'mode': args.mode})
        interrupted_run = False
        try:
            assert_idle(slot_root, args.slot)
            if command:
                with (output / 'diagnostic.stdout.txt').open('w') as stdout, (output / 'diagnostic.stderr.txt').open('w') as stderr:
                    process = subprocess.Popen(command, stdout=stdout, stderr=stderr, start_new_session=True)
                    try:
                        result['command_exit'] = process.wait()
                    except BaseException:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                        raise
        except (Exception, KeyboardInterrupt):
            interrupted_run = True
        finally:
            try:
                # Children left alive block release; do not force-close an active run.
                result['release'] = release(slot_root, args.slot, args.resources, output)
                result['cleanup_confirmed'] = True
                result['status'] = 'RECOVERED' if args.mode == 'recover' and not interrupted_run else ('COMPLETED' if result['command_exit'] == 0 and not interrupted_run else 'FAILED')
            except (Exception, KeyboardInterrupt) as error:
                result['status'] = 'BLOCKED'
                # Do not copy exception text: errors can contain credentials.
                result['reason'] = str(error) if type(error) is RuntimeError else 'Cleanup not confirmed; inspect private logs and slot ownership before recovery'
            write_json(output / 'lifecycle.json', result)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['status'] in ['RECOVERED', 'COMPLETED'] else 1


if __name__ == '__main__':
    def interrupted(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    raise SystemExit(main())
