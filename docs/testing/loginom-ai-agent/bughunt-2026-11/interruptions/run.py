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
BROWSER_GESTURES = ('close-wizard', 'reload', 'switch-tab', 'kill-cli', 'foreign-dialog')
LIVE_CHAIN_UNSUPPORTED = 'interruptions/run.py does not support --live-chain. Remove the flag to run interruption cases.'


def record(path, **evidence):
    with path.open('a') as journal:
        journal.write(json.dumps(dict(at=time.time(), **evidence), ensure_ascii=False) + '\n')


def kill_gate(log):
    events = [json.loads(line) for line in log.read_text().splitlines()]
    if len(events) < 2 or events[-1].get('kill_ready') is not True:
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


def model_process(kind, daemon_pid, node, resources, profile, folder, command):
    log = folder / 'intervention.jsonl'
    started = time.time()

    def own_signal(process, signum):
        # Only a direct child can receive a signal, after checking the daemon PID.
        assert process.pid != daemon_pid, 'WORKSPACE_DAEMON_IS_NOT_A_TEST_CHILD'
        if process.poll() is None:
            process.send_signal(signum)

    with (folder / 'intervention.stderr').open('w') as browser_errors:
        child = subprocess.Popen(command, stdin=subprocess.DEVNULL)
        try:
            gesture = subprocess.Popen([node, HERE / 'intervene.mjs', resources, profile, log, kind, str(started)],
                                       stdin=subprocess.DEVNULL, stderr=browser_errors)
        except OSError:
            own_signal(child, signal.SIGTERM)
            child.wait()
            raise

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


def install_interruption_runner(runner):
    if not hasattr(runner, 'PackageCloseUnconfirmed') or not hasattr(runner, 'case_intervention'):
        raise SystemExit('Use bughunt-runner with the LAB-2032 and LAB-2047 runner changes.')

    interventions = {}
    resolve_steps = runner.scenario_steps

    def register_intervention(path):
        config = runner.read(path)
        if not isinstance(config, dict) or not isinstance(config.get('turn'), str):
            raise ValueError(f'{path}: intervention requires a turn and a kind')
        kind = config.get('kind')
        if kind == 'manual-edit' and set(config) == {'turn', 'kind', 'edit'}:
            runner.validate_manual_edit(config['edit'], path.parent.name)
        elif kind not in BROWSER_GESTURES or set(config) != {'turn', 'kind'}:
            raise ValueError(f'{path}: unsupported intervention kind or fields')
        interventions[path.parent.name] = config

    def scenario_steps(name, *args, **kwargs):
        steps = resolve_steps(name, *args, **kwargs)
        for step, _ in steps[:-1]:
            if step in interventions:
                raise ValueError(f'{step}/intervention.json: an intervention belongs to the final case of a chain')
        if config := interventions.get(name):
            for step, spec in steps[:-1]:
                if step == config['turn'] and (config['kind'] != 'manual-edit' or spec.get('manual_edit')):
                    break
            else:
                raise ValueError(f'{name}/intervention.json: intervention turn must be a preceding turn '
                                 '(with manual_edit for a follow-up manual edit)')
        return steps

    def observation(log, kind):
        events = [event for _, event in runner.records(log)] if log.is_file() else []
        after = next((event for event in events if event['phase'] == 'after'), None)
        if kind == 'kill-cli' and not any(event.get('terminated') for event in events):
            after = None
        return after, events

    class InterruptionRunner(runner.Runner):
        def __init__(self, directory):
            super().__init__(directory)
            if self.options.get('live_chain'):
                raise SystemExit(LIVE_CHAIN_UNSUPPORTED)
            self.deadline = min(self.deadline, float(os.environ.get('LAB_2047_END_AT', self.deadline)))
            self.interruption = None

        def intervention_for(self, turn):
            config = interventions.get(self.current['scenario'])
            return config if config and config['turn'] == turn else None

        def phase(self, name, command, folder, **kwargs):
            if self.interruption and name == 'model':
                kind, profile, build = self.interruption
                resources = build / 'resources/loginom'
                try:
                    daemon_pid = runner.daemon_pid()
                except (OSError, ValueError, subprocess.CalledProcessError) as error:
                    self.current['failure_category'] = 'runner/setup'
                    raise RuntimeError('INTERVENTION_DAEMON_CHECK_FAILED') from error
                super().phase(name, [sys.executable, HERE / 'run.py', '_model', kind, str(daemon_pid),
                                     resources / 'bin/node', resources, profile, folder, *command], folder, **kwargs)
                raise ObservedTurn
            return super().phase(name, command, folder, **kwargs)

        def model(self, case, folder, profile, workspace, package, login, build, session=None, baseline=None):
            config = self.intervention_for(case)
            self.interruption = ((config['kind'], profile, build)
                                 if config and config['kind'] in BROWSER_GESTURES else None)
            try:
                return super().model(case, folder, profile, workspace, package, login, build, session, baseline=baseline)
            except ObservedTurn:
                log = folder / 'intervention.jsonl'
                after, events = observation(log, config['kind'])
                if not after:
                    error = next((event['code'] for event in events if event['phase'] == 'fixture_error'),
                                 'INTERVENTION_GATE_NOT_REACHED')
                    self.current['failure_category'] = 'runner/setup'
                    raise RuntimeError(f'{error}: {log}') from None
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
            config = self.intervention_for(stage.name)
            baseline = super().manual_edit(edit, stage, profile, package, login, build, before, **kwargs)
            if config and config['kind'] == 'manual-edit':
                (stage / 'manual').rename(stage / ('manual-' + edit['kind']))
                baseline = super().manual_edit(config['edit'], stage, profile, package, login, build, before, **kwargs)
            recorded_at = (stage / 'manual/result.json').stat().st_mtime
            self.current['intervention'] = dict(kind=edit['kind'], at=recorded_at,
                                                journal=str(stage / 'manual/execution-events.jsonl'))
            return baseline

    runner.case_intervention = register_intervention
    runner.scenario_steps = scenario_steps
    runner.Runner = InterruptionRunner


def run_check():
    path = Path(os.environ.get('LAB_2047_RUNNER', Path.home() / 'bughunt/runner')).resolve()
    spec = importlib.util.spec_from_file_location('run_check', path / 'scripts/node-acceptance/run-check.py')
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    if getattr(runner.arguments(), 'live_chain', False):
        raise SystemExit(LIVE_CHAIN_UNSUPPORTED)
    install_interruption_runner(runner)
    runner.__file__ = str(Path(__file__).resolve())
    return runner.main()


if __name__ == '__main__':
    if sys.argv[1:2] == ['_model']:
        kind, daemon_pid, node, resources, profile, folder, *command = sys.argv[2:]
        model_process(kind, int(daemon_pid), node, resources, profile, Path(folder), command)
    else:
        sys.exit(run_check())
