"""Read-only Linux process-session ownership for an original controller Popen.

Tracks PID/start ticks and the original wait handle; never kills or retries work.
Does not prove native package cleanup, runtime ACK, candidate use or unobserved
descendants that escape the session before their first observation.
"""
import copy
import os
from pathlib import Path
import subprocess
import sys
import time
from javascript_cli_candidate import file_sha256,hexadecimal


def linux_process(pid):
    if type(pid) is not int or pid <= 0:raise ValueError('cli_process_pid_invalid')
    try:
        text = Path('/proc',str(pid),'stat').read_text()
        # comm may contain spaces or parentheses; fields after its final ')'
        # retain their kernel positions (state=3, ppid=4, session=6, start=22).
        fields = text[text.rindex(')')+2:].split()
        return dict(pid=pid,parent_pid=int(fields[1]),process_group=int(fields[2]),session=int(fields[3]),
            start_ticks=int(fields[19]),uid=Path('/proc',str(pid)).stat().st_uid)
    except (FileNotFoundError,ProcessLookupError):return None


def linux_executable(pid,pin,previous=None):
    """Pin the live executable inode; hash once while its identity is unchanged."""
    executable = Path('/proc',str(pid),'exe')
    if os.readlink(executable) != str(Path(pin['path']).resolve(strict=True)):
        raise ValueError('cli_process_live_executable_path')
    info = executable.stat()
    identity = dict(device=info.st_dev,inode=info.st_ino,bytes=info.st_size,
        modified_ns=info.st_mtime_ns,changed_ns=info.st_ctime_ns)
    cached = previous is not None and previous['file_identity'] == identity and previous['sha256'] == pin['sha256']
    digest = previous['sha256'] if cached else file_sha256(executable)
    after = executable.stat()
    if (digest != pin['sha256'] or identity != dict(device=after.st_dev,inode=after.st_ino,bytes=after.st_size,
            modified_ns=after.st_mtime_ns,changed_ns=after.st_ctime_ns)):
        raise ValueError('cli_process_live_executable_pin')
    return dict(file_identity=identity,sha256=digest)


class LinuxProcessOwner:
    def __init__(self,process,profile,*,browser=None):
        profile = Path(profile)
        if (sys.platform != 'linux' or not isinstance(process,subprocess.Popen)
                or not profile.is_absolute() or profile.resolve() != profile or not profile.is_dir()):
            raise ValueError('cli_process_original_owner_required')
        root = linux_process(process.pid)
        if (root is None or root['uid'] != os.getuid() or root['session'] != process.pid
                or root['process_group'] != process.pid or root['start_ticks'] <= 0 or process.poll() is not None):
            raise ValueError('cli_process_fresh_owned_session_required')
        self.process,self.profile,self.root = process,profile,root
        self.boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        self.seen = {(root['pid'],root['start_ticks']):root}
        self.browser = None
        self.browsers = {}
        self.failures = set()
        if browser is not None:
            executable = Path(browser['path'])
            if (not executable.is_absolute() or not executable.is_file()
                    or not hexadecimal(browser.get('sha256'),64) or file_sha256(executable) != browser['sha256']):
                raise ValueError('cli_process_browser_executable_pin')
            self.browser = dict(path=str(executable.resolve(strict=True)),sha256=browser['sha256'])
        self.result = None
        self.observe()

    def observe(self):
        if self.result is not None:raise ValueError('cli_process_receipt_already_terminal')
        try:return self._observe()
        except (OSError,ValueError,IndexError,UnicodeError):
            self.failures.add('cli_process_observation_unconfirmed')
            raise

    def _observe(self):
        if Path('/proc/sys/kernel/random/boot_id').read_text().strip() != self.boot:
            raise ValueError('cli_process_boot_identity_changed')
        rows = [row for entry in Path('/proc').iterdir() if entry.name.isdigit()
            for row in [linux_process(int(entry.name))] if row is not None]
        if self.browser is not None:
            for row in rows:
                if row['uid'] != self.root['uid']:continue
                binding = owned_browser(row,self.profile,self.browser,self.browsers.get((row['pid'],row['start_ticks'])))
                if binding is None:continue
                if row['start_ticks'] < self.root['start_ticks']:
                    self.failures.add('cli_process_browser_predates_original_launch')
                if not binding['headed'] or not binding['sandbox_enabled'] or not binding['direct_proxy']:
                    self.failures.add('cli_process_owned_browser_launch_policy')
                key = (row['pid'],row['start_ticks'])
                self.browsers[key] = dict(**row,**binding)
                self.seen[key] = row
        # Playwright launches Chromium detached on Linux. Its exact own profile
        # binding seeds the scan even after reparenting or a missed ancestry read;
        # retain its session so orphaned children cannot hide behind parent exit.
        sessions = {self.root['session']} | {r['session'] for r in self.browsers.values()}
        owned = {r['pid'] for r in rows if r['session'] in sessions
            or (r['pid'],r['start_ticks']) in self.seen}
        while True:
            children = owned | {r['pid'] for r in rows if r['parent_pid'] in owned}
            if children == owned:break
            owned = children
        members = [r for r in rows if r['pid'] in owned]
        if any(r['uid'] != self.root['uid'] for r in members):raise ValueError('cli_process_owner_uid_changed')
        for row in members:self.seen[(row['pid'],row['start_ticks'])] = row
        return members

    def finish(self):
        if self.result is not None:return copy.deepcopy(self.result)
        failures = list(self.failures)
        live = []
        # poll uses the original OS wait handle. A serialized exit-code field or
        # an empty active PID list is not a substitute for its actual outcome.
        outcome = self.process.poll()
        if outcome != 0:failures.append('cli_process_original_clean_exit_required')
        try:
            live = self.observe()
            if live:failures.append('cli_process_owned_identity_still_present')
        except (OSError,ValueError,IndexError) as error:
            failures.append(str(error) if isinstance(error,ValueError) else 'cli_process_observation_unconfirmed')
        if (self.profile/'.writer').exists() or (self.profile/'.writer').is_symlink():
            failures.append('cli_process_profile_guard_retained')
        failures.extend(self.failures)
        if self.browser is not None and not self.browsers:failures.append('cli_process_owned_browser_not_observed')
        self.result = dict(version=1,passed=not failures,failures=sorted(set(failures)),
            scope='original_linux_popen_process_session_and_observed_descendants',boot_id=self.boot,
            root=copy.deepcopy(self.root),observed_processes=sorted(self.seen.values(),key=lambda r:(r['pid'],r['start_ticks'])),
            remaining_processes=live,actual_returncode=outcome,observed_at_ms=time.time_ns()//1000000,
            observed_browsers=sorted(self.browsers.values(),key=lambda r:(r['pid'],r['start_ticks'])),
            owned_browser_launch_policy_verified=self.browser is not None and bool(self.browsers)
                and not any('browser' in f for f in failures),
            original_clean_exit_verified=outcome == 0,owned_process_session_absence_verified=not live and not failures,
            native_package_cleanup_verified=False,runtime_ack_verified=False,candidate_verified=False,
            unobserved_detached_descendants_verified=False,cli_acceptance_verified=False)
        return copy.deepcopy(self.result)


def owned_browser(row,profile,browser,previous=None):
    """Exact executable + own user-data-dir, read only; never export argv."""
    try:
        arguments = Path('/proc',str(row['pid']),'cmdline').read_bytes().decode('utf-8').split('\0')
        # Only the original browser root has the launch policy. Sandboxed
        # renderer/utility children may deny exe access and are tracked instead
        # by this root's owned session and observed PID/start identity.
        if any(arg.startswith('--type=') for arg in arguments):return None
        values = [arg.removeprefix('--user-data-dir=') for arg in arguments if arg.startswith('--user-data-dir=')]
        if len(values) != 1:return None
        directory = Path(values[0])
        if (not directory.is_absolute() or directory.resolve() != directory
                or not directory.is_relative_to(profile)):return None
        # An unrelated same-UID service may be non-dumpable on Ubuntu. Do not
        # require ptrace-style exe access until its argv binds the owned profile.
        # Failure to read an already own profile's executable remains an error.
        try:identity = linux_executable(row['pid'],browser,previous.get('executable') if previous else None)
        except ValueError:raise ValueError('cli_process_live_browser_executable_pin') from None
        current = linux_process(row['pid'])
        if current is None or current['start_ticks'] != row['start_ticks']:return None
        return dict(profile=str(directory),executable_sha256=identity['sha256'],executable=identity,
            headed=not any(arg == '--headless' or arg.startswith('--headless=') for arg in arguments),
            sandbox_enabled=not any(arg == '--no-sandbox' or arg.startswith('--no-sandbox=') for arg in arguments),
            direct_proxy='--no-proxy-server' in arguments)
    except (FileNotFoundError,ProcessLookupError):return None
