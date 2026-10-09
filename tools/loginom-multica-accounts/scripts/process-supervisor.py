#!/usr/bin/env python3
"""One foreground operation's isolated Linux descendant owner, never a daemon."""
import ctypes
import json
import os
from pathlib import Path
import signal
import sys
import time
from common import append_evidence


def record(pid):
    try:
        fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
        return {'pid': pid, 'start_ticks': fields[19], 'state': fields[0],
                'ppid': int(fields[1]), 'pgid': int(fields[2]), 'sid': int(fields[3])}
    except (FileNotFoundError, ProcessLookupError):
        return None
    except (OSError, ValueError, IndexError):
        raise RuntimeError('ACCOUNT_PROVISION_PROVENANCE_UNCONFIRMED') from None


def same(current, expected):
    return isinstance(current, dict) and isinstance(expected, dict) and (
        current.get('pid'), current.get('start_ticks')) == (expected.get('pid'), expected.get('start_ticks'))


def signal_exact(expected, signum):
    current = record(expected['pid'])
    if not same(current, expected) or current['state'] in {'Z', 'X'}:
        return
    try:
        fd = os.pidfd_open(expected['pid'])
    except ProcessLookupError:
        return
    try:
        if same(record(expected['pid']), expected):
            # pidfd keeps the target identity even if its PID is later reused.
            signal.pidfd_send_signal(fd, signum)
    except ProcessLookupError:
        pass
    finally:
        os.close(fd)


class Descendants:
    def __init__(self, directory):
        self.directory = directory
        self.root = record(os.getpid())
        self.records = {}
        self.command_pid = None
        self.returncode = None
        self.unconfirmed = False

    def capture(self, child, parent):
        key = (child['pid'], child['start_ticks'])
        if key not in self.records:
            self.records[key] = {**child, 'owned_by': {'pid': parent['pid'], 'start_ticks': parent['start_ticks']}}
            append_evidence(self.directory, {'phase': 'own-descendant', 'state': 'UNKNOWN', 'process': self.records[key]})

    def discover(self):
        # Traverse only kernel child lists of exact owned processes, across all
        # threads. PGID, SID, username, executable and fd resemblance are not
        # ownership. Orphaned/double-forked children are adopted by this isolated
        # subreaper before it exits, even when they changed sessions or closed fds.
        queue = [self.root]
        visited = set()
        while queue:
            parent = queue.pop()
            key = (parent['pid'], parent['start_ticks'])
            if key in visited or not same(record(parent['pid']), parent):
                continue
            visited.add(key)
            try:
                tasks = list(Path(f'/proc/{parent["pid"]}/task').iterdir())
                children = set()
                for task in tasks:
                    try:
                        children.update(map(int, (task / 'children').read_text().split()))
                    except (FileNotFoundError, ProcessLookupError):
                        continue  # Exited threads reparent their children.
            except (FileNotFoundError, ProcessLookupError):
                continue
            except (OSError, ValueError):
                self.unconfirmed = True
                raise RuntimeError('ACCOUNT_PROVISION_PROVENANCE_UNCONFIRMED') from None
            if not same(record(parent['pid']), parent):
                continue
            for pid in children:
                child = record(pid)
                if child and child['ppid'] == parent['pid'] and same(record(parent['pid']), parent):
                    self.capture(child, parent)
                    queue.append(child)

    def live(self):
        return [item for item in self.records.values() if same(current := record(item['pid']), item)
                and current['state'] not in {'Z', 'X'}]

    def reap(self):
        # WNOWAIT retains the exact zombie until its kernel ancestry and
        # start_ticks are saved. Adoption may happen between discovery and wait;
        # querying it without reaping avoids losing a rapid double-fork record.
        while True:
            self.discover()
            try:
                exited = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            except ChildProcessError:
                return True  # Kernel confirms no children remain.
            if exited is None:
                return False
            child = record(exited.si_pid)
            if child is None or child['ppid'] != self.root['pid']:
                self.unconfirmed = True
                raise RuntimeError('ACCOUNT_PROVISION_PROVENANCE_UNCONFIRMED')
            self.capture(child, self.root)
            pid, status = os.waitpid(exited.si_pid, 0)
            self.records[(child['pid'], child['start_ticks'])]['reaped'] = True
            if pid == self.command_pid:
                self.returncode = os.waitstatus_to_exitcode(status)

    def cleanup(self, grace):
        for signum in (signal.SIGTERM, signal.SIGKILL):
            deadline = time.monotonic() + grace
            while True:
                try:
                    self.discover()
                except RuntimeError:
                    self.unconfirmed = True
                for item in self.live():
                    signal_exact(item, signum)
                try:
                    no_children = self.reap()
                except RuntimeError:
                    self.unconfirmed = True
                    no_children = False
                if no_children and not self.live():
                    return 'UNKNOWN' if self.unconfirmed else 'PASS'
                if time.monotonic() >= deadline:
                    break
                time.sleep(.005)
        return 'UNKNOWN'


def enable_subreaper(parent_pid):
    if not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise RuntimeError('ACCOUNT_PROVISION_SUPERVISOR_UNAVAILABLE')
    libc = ctypes.CDLL(None, use_errno=True)
    value = ctypes.c_int()
    # These flags apply only to this dedicated helper, not the caller/daemon.
    if libc.prctl(36, 1, 0, 0, 0) or libc.prctl(37, ctypes.byref(value), 0, 0, 0) or value.value != 1:
        raise RuntimeError('ACCOUNT_PROVISION_SUPERVISOR_UNAVAILABLE')
    if libc.prctl(1, signal.SIGTERM, 0, 0, 0) or os.getppid() != parent_pid:
        raise RuntimeError('ACCOUNT_PROVISION_CANCELLED')


def main():
    start_fd, parent_pid, timeout, grace, directory = sys.argv[1:6]
    start_fd, parent_pid = int(start_fd), int(parent_pid)
    timeout, grace, directory = float(timeout), float(grace), Path(directory)
    command = sys.argv[6:]
    cancelled = False
    def interrupt(_signum, _frame):
        nonlocal cancelled
        cancelled = True
    signal.signal(signal.SIGTERM, interrupt)
    signal.signal(signal.SIGINT, interrupt)
    tree = Descendants(directory)
    failure = None
    cleanup = 'UNKNOWN'
    try:
        enable_subreaper(parent_pid)
        if os.read(start_fd, 1) != b'1' or cancelled:
            raise RuntimeError('ACCOUNT_PROVISION_CANCELLED')
        os.close(start_fd)
        start_fd = None
        read_fd, write_fd = os.pipe()
        try:
            pid = os.fork()
            if pid == 0:
                try:
                    os.close(write_fd)
                    signal.signal(signal.SIGTERM, signal.SIG_DFL)
                    signal.signal(signal.SIGINT, signal.SIG_DFL)
                    os.setsid()
                    if os.read(read_fd, 1) != b'1': os._exit(1)
                    os.close(read_fd)
                    os.execvpe(command[0], command, os.environ)
                except BaseException:
                    # The forked command must never execute the owner's
                    # finally/result writer when exec fails.
                    os._exit(127)
            os.close(read_fd)
            read_fd = None
            tree.command_pid = pid
            child = record(pid)
            if not child or child['ppid'] != os.getpid():
                raise RuntimeError('ACCOUNT_PROVISION_PROVENANCE_UNCONFIRMED')
            tree.capture(child, tree.root)
            append_evidence(directory, {'phase': 'command-start', 'state': 'UNKNOWN', 'process': child, 'subreaper': tree.root})
            os.write(write_fd, b'1')
        finally:
            if read_fd is not None: os.close(read_fd)
            os.close(write_fd)
        deadline = time.monotonic() + timeout
        while True:
            tree.discover()
            tree.reap()
            if cancelled:
                raise RuntimeError('ACCOUNT_PROVISION_CANCELLED')
            if tree.returncode is not None:
                if tree.live(): failure = 'ACCOUNT_PROVISION_CHILDREN_REMAINED'
                break
            if time.monotonic() >= deadline:
                raise RuntimeError('ACCOUNT_PROVISION_TIMEOUT')
            time.sleep(.005)
    except BaseException as error:
        failure = str(error) if isinstance(error, RuntimeError) else 'ACCOUNT_PROVISION_SUPERVISOR_FAILED'
        if failure in {'ACCOUNT_PROVISION_PROVENANCE_UNCONFIRMED', 'ACCOUNT_PROVISION_SUPERVISOR_FAILED'}:
            tree.unconfirmed = True
    finally:
        if start_fd is not None: os.close(start_fd)
        try:
            cleanup = tree.cleanup(grace)
        except BaseException:
            cleanup = 'UNKNOWN'
        if cleanup != 'PASS': failure = 'ACCOUNT_PROVISION_PROCESS_STOP_UNCONFIRMED'
        result = {'schema': 'account-process-supervisor-v1', 'state': 'UNKNOWN', 'subreaper': tree.root,
            'processes': list(tree.records.values()), 'process_cleanup': cleanup, 'failure': failure,
            'returncode': tree.returncode, 'server_absence': 'NOT_PROVED'}
        append_evidence(directory, {'phase': 'supervisor-result', **result})
        fd = os.open(directory / 'supervisor-result.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(result, stream, indent=2); stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
    return 1 if failure else 0


if __name__ == '__main__':
    raise SystemExit(main())
