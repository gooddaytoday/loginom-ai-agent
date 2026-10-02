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


class LinuxProcessOwner:
    def __init__(self,process,profile):
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
        self.result = None
        self.observe()

    def observe(self):
        if self.result is not None:raise ValueError('cli_process_receipt_already_terminal')
        if Path('/proc/sys/kernel/random/boot_id').read_text().strip() != self.boot:
            raise ValueError('cli_process_boot_identity_changed')
        rows = [row for entry in Path('/proc').iterdir() if entry.name.isdigit()
            for row in [linux_process(int(entry.name))] if row is not None]
        owned = {r['pid'] for r in rows if r['session'] == self.root['session']
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
        failures = []
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
        self.result = dict(version=1,passed=not failures,failures=sorted(set(failures)),
            scope='original_linux_popen_process_session_and_observed_descendants',boot_id=self.boot,
            root=copy.deepcopy(self.root),observed_processes=sorted(self.seen.values(),key=lambda r:(r['pid'],r['start_ticks'])),
            remaining_processes=live,actual_returncode=outcome,observed_at_ms=time.time_ns()//1000000,
            original_clean_exit_verified=outcome == 0,owned_process_session_absence_verified=not live and not failures,
            native_package_cleanup_verified=False,runtime_ack_verified=False,candidate_verified=False,
            unobserved_detached_descendants_verified=False,cli_acceptance_verified=False)
        return copy.deepcopy(self.result)
