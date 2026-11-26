#!/usr/bin/env python3
"""Run interruption fixtures with the existing acceptance runner and browser checks."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


HERE = Path(__file__).resolve().parent
INTERVENTIONS = {
    'bh-x01': 'close-wizard',
    'bh-x02': 'reload',
    'bh-x04': 'switch-tab',
    'bh-x05': 'kill-cli',
    'bh-x07': 'foreign-dialog',
}


def record(path, **evidence):
    with path.open('a') as journal:
        journal.write(json.dumps(dict(at=time.time(), **evidence), ensure_ascii=False) + '\n')


def kill_gate(log):
    events = [json.loads(line) for line in log.read_text().splitlines()]
    if not events or events[-1].get('kill_ready') is not True:
        return False
    before = events[-2]
    journal, _, start = before['location'].rpartition(':')
    with Path(journal).open() as source:
        for line_number, line in enumerate(source, 1):
            if line_number <= int(start) or not line.endswith('\n'):
                continue
            event = json.loads(line)
            if (event.get('operation_id') == before['operation_id']
                    and event.get('receipt', {}).get('phase') == 'configure'
                    and event.get('phase') in ('node_phase_completed', 'node_phase_paused', 'node_phase_refused')):
                return False
    return True


def model_process(kind, node, resources, profile, folder, command):
    log = folder / 'intervention.jsonl'
    started = time.time()
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL)
    with (folder / 'intervention.stderr').open('w') as browser_errors:
        gesture = subprocess.Popen([node, HERE / 'intervene.mjs', resources, profile, log, kind, str(started)],
                                   stdin=subprocess.DEVNULL, stderr=browser_errors)
        # Only this exact CLI child can be interrupted. Comparison happens before any signal.
        daemon = None

        def own_signal(process, signum):
            nonlocal daemon
            if daemon is None:
                daemon = json.loads(subprocess.check_output(
                    [os.environ['MULTICA_CLI_PATH'], 'daemon', 'status', '--output', 'json']
                ))['pid']
            assert process.pid != daemon, 'WORKSPACE_DAEMON_IS_NOT_A_TEST_CHILD'
            if process.poll() is None:
                process.send_signal(signum)

        def cancel(signum, _frame):
            own_signal(gesture, signal.SIGTERM)
            own_signal(child, signum)

        signal.signal(signal.SIGINT, cancel)
        signal.signal(signal.SIGTERM, cancel)
        while child.poll() is None and gesture.poll() is None:
            time.sleep(0.05)
        if gesture.poll() is None:
            own_signal(gesture, signal.SIGTERM)
        gesture_exit = gesture.wait()
        if kind == 'kill-cli' and gesture_exit == 0 and child.poll() is None:
            if kill_gate(log):
                own_signal(child, signal.SIGKILL)
                if child.wait() == -signal.SIGKILL:
                    record(log, phase='signal', kind=kind, signal='SIGKILL', cli_pid=child.pid, terminated=True)
            else:
                record(log, phase='fixture_error', kind=kind, code='CLI_KILL_GATE_CLOSED')
        exit_code = child.wait()
        record(log, phase='model_exit', kind=kind, cli_pid=child.pid,
               exit_code=exit_code, gesture_exit=gesture_exit)


class ObservedTurn(Exception):
    pass


def run_check():
    path = Path(os.environ.get('LAB_2047_RUNNER', Path.home() / 'bughunt/runner')).resolve()
    spec = importlib.util.spec_from_file_location('run_check', path / 'scripts/node-acceptance/run-check.py')
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)

    class InterruptionRunner(runner.Runner):
        def __init__(self, directory):
            super().__init__(directory)
            self.deadline = min(self.deadline, float(os.environ.get('LAB_2047_END_AT', self.deadline)))
            self.env['MULTICA_CLI_PATH'] = os.environ['MULTICA_CLI_PATH']
            self.interruption = None

        def phase(self, name, command, folder, **kwargs):
            if self.interruption and name == 'model':
                profile, build = self.interruption
                kind = INTERVENTIONS[self.current['scenario']]
                resources = build / 'resources/loginom'
                super().phase(name, [sys.executable, HERE / 'run.py', '_model', kind, resources / 'bin/node',
                                     resources, profile, folder, *command], folder, **kwargs)
                raise ObservedTurn
            return super().phase(name, command, folder, **kwargs)

        def model(self, case, folder, profile, workspace, package, login, build, session=None, baseline=None):
            watching = self.current['scenario'] in INTERVENTIONS and case == 'bh-x00-t2'
            self.interruption = (profile, build) if watching else None
            try:
                return super().model(case, folder, profile, workspace, package, login, build, session, baseline=baseline)
            except ObservedTurn:
                log = folder / 'intervention.jsonl'
                events = [event for _, event in runner.records(log)]
                after = next((event for event in events if event['phase'] == 'after'), None)
                if not after or (INTERVENTIONS[self.current['scenario']] == 'kill-cli'
                                 and not any(event.get('terminated') for event in events)):
                    error = next((event['code'] for event in events if event['phase'] == 'fixture_error'),
                                 'INTERVENTION_GATE_NOT_REACHED')
                    raise AssertionError(f'{error}: {log}') from None
                latest = events[-1]
                model_session = next((event.get('sessionID') for _, event in runner.records(folder / 'model.stdout')
                                      if event.get('sessionID')), None)
                assert session and (model_session == session or model_session is None), 'CASE_SESSION_CHANGED'
                self.current['intervention'] = dict(kind=after['kind'], at=after['at'], journal=str(log),
                                                    cli_exit=latest['exit_code'])
                self.current.update(csv='— (intervention)', save='— (intervention)', cleanup='— (intervention)')
                # Recovery starts even when this deliberately perturbed turn never saved.
                return session, runner.read(folder / 'expected.json'), None, None
            finally:
                self.interruption = None

        def manual_edit(self, edit, stage, profile, package, login, build, before, **kwargs):
            baseline = super().manual_edit(edit, stage, profile, package, login, build, before, **kwargs)
            if self.current['scenario'] == 'bh-x06' and edit['kind'] == 'connect':
                (stage / 'manual').rename(stage / 'manual-connect')
                threshold = dict(kind='filter_threshold', node=dict(type='transform.filter_data'),
                                 field='Revenue', value=200)
                baseline = super().manual_edit(threshold, stage, profile, package, login, build, before, **kwargs)
            evidence = stage / 'manual/result.json'
            self.current['intervention'] = dict(kind=edit['kind'], at=evidence.stat().st_mtime,
                                                journal=str(stage / 'manual/execution-events.jsonl'))
            return baseline

    if not hasattr(runner.Runner, 'manual_edit'):
        raise SystemExit('LAB-2047 requires the LAB-2032 manual-edit fixture runner')
    runner.Runner = InterruptionRunner
    runner.__file__ = str(Path(__file__).resolve())
    return runner.main()


if __name__ == '__main__':
    if sys.argv[1:2] == ['_model']:
        kind, node, resources, profile, folder, *command = sys.argv[2:]
        model_process(kind, node, resources, profile, Path(folder), command)
    else:
        sys.exit(run_check())
