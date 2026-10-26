#!/usr/bin/env python3
"""Quiet, detached live acceptance runner. Python 3 standard library only."""
import argparse
import csv
from datetime import datetime
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
from decimal import Decimal

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / 'docs/testing/loginom-ai-agent'


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def git(*args, cwd=REPO):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def scenario(name):
    stability = DATA / 'stability-2026-10-20'
    base = None
    if re.fullmatch(r'(?:n(?:[1-9]|1[0-9]|20)|p(?:[1-9]|1[0-9]|2[0-4]))', name):
        src = stability / name
        base = 's1' if name in ['p23', 'p24'] else None
    elif re.fullmatch(r'[qr][1-6]|q(?:[7-9]|10)', name):
        src = stability / 'followups' / name
        if name.startswith('r'):
            node = ('datamining-clustering' if name in ['r1', 'r2'] else
                    'datamining-linregression' if name in ['r3', 'r4'] else 'integration-restrequest')
            base = REPO / 'docs/node-development/nodes' / node / 'acceptance'
        else:
            base = {'q1':'s1','q2':'s1','q3':'s3','q4':'s3','q5':'s4','q6':'s4','q7':'s5','q8':'s5','q9':'s6','q10':'s6'}[name]
    elif re.fullmatch(r's[1-8]|v[1-3]s[1-6]', name):
        src = next((DATA / 'demo-2026-10-22').glob((name[-2:] if name.startswith('v') else name) + '-*'))
        base = 's1' if name in ['s7', 's8'] else None
    else:
        raise ValueError('Unknown scenario: ' + name)
    prompt = (stability / src.name / ('prompt-' + name[:2] + '.md') if name.startswith('v') else
              src / ('prompt-demo.md' if (src / 'prompt-demo.md').exists() else 'prompt.md'))
    data = (base / 'data' if isinstance(base, Path) else
            scenario(base)['data'] if base and not (src / 'data').is_dir() else src / 'data')
    return dict(source=src, prompt=prompt, data=data, base=base)


def expected_for(case, package):
    src = case['source']
    # CSV-checking oracles do not generate JSON. Their cold fixtures are separate.
    if re.fullmatch(r'n(?:1[3-9]|20)', src.name) or case['prompt'].name == 'task.md' or src.name == 'p24':
        expected = read(src / ('expected-demo.json' if (src / 'expected-demo.json').exists() else 'expected.json'))
    else:
        expected = json.loads(subprocess.check_output([sys.executable, '-B', str(src / 'oracle.py'), package]))
    if 'outputs' not in expected:
        expected = dict(package_path=expected['package_path'], nodes=expected['nodes'],
                        outputs=[{k: v for k, v in expected.items() if k not in ['package_path', 'nodes']}])
    expected['package_path'] = package
    return expected


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    start = commands.add_parser('start')
    start.add_argument('--head', required=True)
    start.add_argument('--scenarios', required=True)
    start.add_argument('--pair', type=Path, required=True)
    start.add_argument('--build', type=Path)
    start.add_argument('--cold', action='store_true')
    start.add_argument('--host-load-max', type=float, default=8)
    start.add_argument('--spacing', type=float, default=60)
    start.add_argument('--out', type=Path)
    wait = commands.add_parser('wait')
    wait.add_argument('directory', type=Path)
    wait.add_argument('--timeout', type=float, required=True)
    worker = commands.add_parser('_worker', help=argparse.SUPPRESS)
    worker.add_argument('directory', type=Path)
    args = parser.parse_args(argv)
    for key in ['host_load_max', 'spacing', 'timeout']:
        value = getattr(args, key, 0)
        if not math.isfinite(value) or value < 0:
            parser.error(key.replace('_', '-') + ' must be finite and nonnegative')
    return args


def load_ready(load, maximum):
    return all(math.isfinite(v) and v <= maximum for v in load[:2])


def summary(report):
    rows = ['SHA: ' + report['head'] + '; tree: ' + report['tree'] + '; sourceDirty=' + str(report.get('metadata', {}).get('sourceDirty', 'unverified')).lower(),
            '| сценарий | итог | CSV | Save | cold | cleanup | port-read | путь | load на старте |',
            '|---|---|---|---|---|---|---|---|---|']
    for r in report['runs']:
        load = r.get('start_load', [])
        rows.append('| ' + ' | '.join([r['scenario'], r.get('status', 'RUNNING'),
                    *[r.get(k, '—') for k in ['csv', 'save', 'cold', 'cleanup', 'port-read', 'read-path']],
                    '/'.join(f'{v:.2f}' for v in load[:2]) or '—']) + ' |')
    for r in report['runs']:
        if r.get('status') == 'FAIL':
            rows.append(f"\nFAIL {r['scenario']}: {r.get('failure_class')}; {r.get('detail')}; "
                        f"журнал: {r.get('location')}; load при отказе: {r.get('failure_load')}; "
                        f"профиль: {r.get('profile')}")
    return '\n'.join(rows) + '\n'


def check_csv(path, expected, header='names'):
    text = path.read_text(encoding='utf-8-sig')
    delimiter = csv.Sniffer().sniff(text[:8192], delimiters=',;\t').delimiter
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    columns = expected['columns']
    names = [c.get('label', c['name']) if header == 'labels' else c['name'] for c in columns]
    assert rows and len(set(rows[0])) == len(columns), 'CSV_COLUMN_ORDER'
    if expected.get('column_order') == 'any':
        assert set(rows[0]) == set(names), 'CSV_COLUMN_ORDER'
        columns = [columns[names.index(name)] for name in rows[0]]
    else:
        assert rows[0] == names, 'CSV_COLUMN_ORDER'
    assert all(len(row) == len(columns) for row in rows[1:]), 'CSV_ROW_WIDTH'
    assert len(rows) - 1 == len(expected['rows']), 'CSV_ROW_COUNT'
    def equal(actual, want):
        for value, col in zip(actual, columns):
            target = want[col['name']]
            if target is None:
                if value != '': return False
            elif col['type'] in ['integer', 'real']:
                try:
                    number = Decimal(value.replace(',', '.'))
                    goal = Decimal(str(target))
                    tolerance = col.get('tolerance', {})
                    delta = max(Decimal(str(tolerance.get('abs', 0))), Decimal(str(tolerance.get('rel', 0))) * abs(goal))
                    if not number.is_finite() or abs(number - goal) > delta: return False
                except ArithmeticError:
                    return False
            elif col['type'] == 'datetime':
                try:
                    if datetime.fromisoformat(value) != datetime.fromisoformat(target): return False
                except ValueError:
                    return False
            elif isinstance(target, bool):
                if value.lower() != str(target).lower(): return False
            elif value != str(target): return False
        return True
    remaining = list(expected['rows'])
    for row in rows[1:]:
        match = next((i for i, want in enumerate(remaining) if equal(row, want)), None)
        assert match is not None and (not expected.get('ordered') or match == 0), 'CSV_VALUES_OR_ORDER'
        remaining.pop(match)
    return delimiter


def records(path):
    for n, line in enumerate(path.read_text(errors='replace').splitlines(), 1):
        try: yield n, json.loads(line)
        except ValueError: continue


def ports(value):
    if isinstance(value, dict):
        if 'port' in value and 'schema' in value and 'sample' in value: yield value
        for item in value.values(): yield from ports(item)
    if isinstance(value, list):
        for item in value: yield from ports(item)


def port_path(reply, port):
    if reply.get('cleanup_complete') is not True:
        return None
    if port.get('freshness_basis') == 'completed_execution_port_source':
        return 'port'
    # Native full closes its owned Preview before publishing workflow_returned.
    # Its public binding is emitted only after the native reader verifies it.
    binding = port.get('binding') or {}
    execution = reply.get('execution') or {}
    if (reply.get('output', {}).get('workflow_returned') is True
            and port.get('fresh') is True
            and port.get('cell_precision', {}).get('cells') == 'exact_native'
            and port.get('exact_table', {}).get('complete') is True
            and port.get('read_coverage', {}).get('table_complete') is True
            and binding.get('read_id')
            and all(binding.get(k) and binding[k] == reply.get('node', {}).get(k)
                    for k in ['document_id', 'workflow_id', 'node_id'])
            and binding.get('port_guid') and binding['port_guid'] == port.get('port_guid')
            and execution.get('status') == 'completed' and execution.get('execution_id')
            and binding.get('execution') == execution
            and port.get('execution_id') == execution['execution_id']):
        return 'native'
    return None


def port_failure(replies, journal):
    delivered = [(n, o, p) for n, o in replies for p in ports(o)]
    invalid = [n for n, o, p in delivered if port_path(o, p) is None]
    return str(journal) + ':' + str(invalid[0] if invalid else 1) if not delivered or invalid else None


def downloaded_csv(profile, destination):
    files = [p for p in profile.rglob(Path(destination).name) if 'artifacts/input/' not in str(p)]
    assert len(files) == 1, 'DOWNLOAD_MISSING_OR_AMBIGUOUS'
    return files[0]


class Runner:
    def __init__(self, directory):
        self.out = directory
        self.report = read(directory / 'results.json')
        self.options = read(directory / 'request.json')
        self.deadline = self.report['started'] + 85 * 60
        self.last_start = 0
        self.current = None
        self.env = {k: v for k, v in os.environ.items() if not k.startswith(('MULTICA_', 'CODEX_'))}
        self.env.update(LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS='false', HTTP_PROXY='http://127.0.0.1:2080', HTTPS_PROXY='http://127.0.0.1:2080', NO_PROXY='localhost,127.0.0.1,::1,app.loginom.ai,mcp.loginom.ai,mas.kartamyshev.dev')

    def save(self):
        write(self.out / 'results.json', self.report)
        (self.out / 'summary.md').write_text(summary(self.report))

    def failure(self, result, error, folder):
        result.update(status='UNKNOWN' if isinstance(error, TimeoutError) else 'FAIL', failure_class=str(error).split(':')[0] or type(error).__name__, detail=str(error), failure_load=list(os.getloadavg()), failed_phase=self.report['phase'], failed_at=time.time())
        journal = folder / (result['scenario'] + '-checks.jsonl')
        result['location'] = str(journal) + ':1'
        journal.write_text(json.dumps(result, ensure_ascii=False) + '\n')

    def phase(self, name, command, folder, timeout=1800, stdin=None, env=None, cwd=None):
        self.report['phase'] = name
        self.report['phase_folder'] = str(folder)
        self.save()
        while not load_ready(os.getloadavg(), self.options['host_load_max']) or time.time() - self.last_start < self.options['spacing']:
            if time.time() >= self.deadline: raise TimeoutError('load/spacing budget')
            time.sleep(1)
        self.last_start = time.time()
        if self.current is not None:
            self.current.setdefault('start_load', list(os.getloadavg()))
        self.save()
        with (folder / (name + '.stdout')).open('wb') as stdout, (folder / (name + '.stderr')).open('wb') as stderr, (folder / 'loads.jsonl').open('a') as loads:
            child = subprocess.Popen(list(map(str, command)), cwd=cwd or folder, env=env or self.env, stdin=subprocess.PIPE if stdin else subprocess.DEVNULL, stdout=stdout, stderr=stderr, start_new_session=True)
            self.report['child_pid'] = child.pid
            self.save()
            if stdin:
                child.stdin.write(stdin.encode())
                child.stdin.close()
            end = min(self.deadline, time.time() + timeout)
            while child.poll() is None:
                loads.write(json.dumps({'at': time.time(), 'phase': name, 'load': os.getloadavg()}) + '\n')
                loads.flush()
                if time.time() >= end:
                    daemon = json.loads(subprocess.check_output(['multica', 'daemon', 'status', '--output', 'json']))
                    assert child.pid != daemon['pid'], 'Cannot terminate daemon'
                    os.killpg(child.pid, signal.SIGINT)
                    try: child.wait(timeout=40)
                    except subprocess.TimeoutExpired:
                        os.killpg(child.pid, signal.SIGKILL)
                        child.wait()
                    raise TimeoutError(name + ' deadline')
                try: child.wait(timeout=1)
                except subprocess.TimeoutExpired: pass
            assert child.returncode == 0, f'{name} exit={child.returncode}: {folder / (name + ".stderr")}:1'

    def build(self):
        cache = Path.home() / '.cache/loginom-run-check' / socket.gethostname() / self.report['head']
        build = Path(self.options['build']) if self.options['build'] else cache / 'cli'
        if not (build / 'cli-manifest.json').exists():
            assert not self.options['build'], 'Provided build has no manifest'
            cache.mkdir(parents=True, exist_ok=True)
            source = cache / 'source'
            if not source.exists(): git('worktree', 'add', '--detach', str(source), self.report['head'])
            assert git('rev-parse', 'HEAD', cwd=source) == self.report['head'] and not git('status', '--porcelain', cwd=source), 'Dirty build source'
            bun = Path.home() / '.cache/loginom-bootstrap/bun-linux-x64/bun'
            env = dict(self.env, LOGINOM_AI_AGENT_NODE_SOURCE=os.environ.get('LOGINOM_AI_AGENT_NODE_SOURCE') or str(next((Path.home() / '.cache/loginom-bootstrap/node').glob('*/bin/node'))), LOGINOM_AI_AGENT_BROWSER_SOURCE=os.environ.get('LOGINOM_AI_AGENT_BROWSER_SOURCE', str(Path.home() / '.cache/loginom-wave2-browsers')), LOGINOM_AI_AGENT_BROWSER_RECOVERY='1')
            self.phase('dependencies', ['nice', '-n', '19', bun, 'install', '--frozen-lockfile', '--ignore-scripts', '--linker', 'hoisted'], cache, env=env, cwd=source)
            os.chmod(source / 'packages/cli/bin/lildax.cjs', int(git('ls-files', '--stage', 'packages/cli/bin/lildax.cjs', cwd=source).split()[0], 8) & 0o777)
            assert not git('status', '--porcelain', cwd=source), 'Dependencies modified tracked source'
            self.phase('build', ['nice', '-n', '19', bun, '--no-install', 'run', 'script/build-cli.ts', build, '--no-archive', *(['--baseline'] if socket.gethostname().split('.')[0] == 'mas2' else [])], cache, env=env, cwd=source / 'packages/loginom-host')
        meta = read(build / 'cli-manifest.json')['metadata']
        assert meta['sourceCommit'] == self.report['head'] and meta['sourceDirty'] is False, 'Build SHA/cleanliness mismatch'
        self.report.update(build=str(build), metadata=meta)
        self.save()
        return build

    def model(self, case, folder, profile, workspace, package, login, build, session=None):
        spec = (dict(source=case, prompt=case / 'task.md', data=case / 'data')
                if isinstance(case, Path) else scenario(case))
        src = spec['source']
        prompt = spec['prompt'].read_text().replace('{{PACKAGE_PATH}}', package)
        expected = expected_for(spec, package)
        filenames = re.findall(r'[\w-]+\.(?:csv|xlsx)', prompt)
        exports = list(dict.fromkeys(name for name in filenames if not (spec['data'] / name).exists()))
        if not exports:
            count = 2 if src.parent.name == 'datamining-clustering' else 1
            exports = [f'{src.parent.name}-{i + 1}.csv' for i in range(count)]
            prompt += '\nВыгрузи и скачай таблицы в файлы ' + ', '.join(exports) + '.'
        destinations = [login['package_directory'].rstrip('/') + '/' + self.out.name + '-' + folder.parent.name + '-' + name for name in exports]
        for name, destination in zip(exports, destinations):
            prompt = prompt.replace(name, destination)
        prompt += f'\nСохрани пакет как {package}. Выгрузи и скачай полный итоговый CSV.'
        (folder / 'task.md').write_text(prompt)
        for output in expected['outputs']:
            if output['output_node_type'] == 'export_input': output['export_destination'] = destinations[-1]
        write(folder / 'expected.json', expected)
        command = [build / 'bin/loginom-ai-agent-cli', 'run', '--headless', '--format', 'json', '--dir', workspace, '--model', 'openai/gpt-6.1-sol', '--variant', 'medium', '--dangerously-skip-permissions']
        if session: command += ['--session', session]
        for name in dict.fromkeys(filenames):
            file = spec['data'] / name
            if not file.is_file(): continue
            target = workspace / file.name
            if target.exists(): continue
            shutil.copyfile(file, target)
            command += ['--file', target]
        env = dict(self.env, LOGINOM_AI_AGENT_CLI_PROFILE=str(profile), LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG='1', LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE='1', LOGINOM_AI_AGENT_PURE='1')
        self.phase('model', command + ['--', prompt], folder, env=env, cwd=workspace)
        events = list(records(folder / 'model.stdout'))
        session = next(e['sessionID'] for _, e in events if e.get('sessionID'))
        replies = []
        for n, event in events:
            state = event.get('part', {}).get('state', {})
            if event.get('type') != 'tool_use' or state.get('status') != 'completed': continue
            try: reply = json.JSONDecoder().raw_decode(state.get('output', ''))[0]
            except (ValueError, TypeError): continue
            if isinstance(reply, dict): replies.append((n, reply))
        assert any(o.get('status') == 'SUCCEEDED' and o.get('action_key') in ['package.save_checkpoint', 'package.save_as'] and o.get('output', {}).get('save_completed') is True for _, o in replies), 'SAVE_NOT_CONFIRMED'
        self.current['save'] = 'PASS'
        paths = {port_path(o, p) for _, o in replies for p in ports(o)} - {None}
        self.current['read-path'] = '/'.join(sorted((set(self.current.get('read-path', '').split('/')) | paths) - {''}))
        invalid = port_failure(replies, folder / 'model.stdout')
        if invalid:
            self.current.update(failure_class='PORT_READ_INVALID', detail='Port source or native binding/exactness/Preview cleanup absent or invalid', location=invalid, failure_load=list(os.getloadavg()))
            self.current['port-read'] = 'FAIL'
        self.current.setdefault('port-read', 'PASS')
        cleanups = [read(p) for p in profile.rglob('saved-package-cleanup.json')]
        acks = [read(p) for p in profile.rglob('runtime-close-*.json')]
        assert cleanups and all(c.get('package_closed') is True and c.get('logged_out') is True and not c.get('unsaved_changes_discarded') for c in cleanups), 'MAIN_CLEANUP_UNCONFIRMED'
        assert acks and all(a.get('closed_ack') is True for a in acks), 'RUNTIME_CLOSE_ACK_MISSING'
        self.current['cleanup'] = 'main PASS'
        header = 'labels' if case in ['q6', 'p24'] else 'names'
        for index, destination in enumerate(destinations):
            actual = folder / ('actual.csv' if len(destinations) == 1 else f'actual-{index + 1}.csv')
            shutil.copyfile(downloaded_csv(profile, destination), actual)
            if re.fullmatch(r'n(?:1[3-9]|20)', src.name):
                self.phase('oracle', [sys.executable, '-B', src / 'oracle.py', actual], folder, timeout=60)
            delimiter = check_csv(actual, expected['outputs'][index], header)
        self.current['csv'] = 'PASS'
        return session, expected, delimiter

    def run(self):
        try:
            build = self.build()
            account = read(Path(self.options['pair']) / 'worker.json')
            login = dict(account['loginom'], package_directory=account['package_directory'])
            for r in self.report['runs']:
                self.current = r
                folder = self.out / r['scenario']
                folder.mkdir()
                profile, workspace = folder / 'profile', folder / 'workspace'
                workspace.mkdir()
                r.update(profile=str(profile), package=login['package_directory'].rstrip('/') + '/' + self.out.name + '-' + r['scenario'] + '.lgp')
                env = dict(self.env, LOGINOM_AI_AGENT_CLI_PROFILE=str(profile))
                try:
                    self.phase('setup', [build / 'bin/loginom-ai-agent-cli', 'loginom', 'setup', '--headless', '--stdin-json', '--format', 'json'], folder, timeout=180, env=env, stdin=json.dumps(dict(url=login['url'], username=login['username'], password=login['password'], apiKey=login['api_key'])))
                    assert read(folder / 'setup.stdout').get('browser', {}).get('state') == 'verified', 'SETUP_NOT_VERIFIED'
                    (profile / 'data/auth.json').symlink_to(Path.home() / '.local/state/loginom-cli-oauth/shared-oauth-v1/auth.json')
                    write(profile / 'config/loginom-ai-agent.json', {'provider': {'openai': {'models': {'gpt-6.1-sol': {'name': 'GPT-6.1 Sol', 'reasoning': True, 'tool_call': True, 'limit': {'context': 400000, 'output': 128000}, 'variants': {'medium': {'reasoningEffort': 'medium'}}}}}}})
                    case = r['scenario']
                    base = scenario(case)['base']
                    session = None
                    for step in ([base, case] if base else [case]):
                        r.update(csv='—', save='—', cleanup='—')
                        stage = folder / (step.parent.name if isinstance(step, Path) else step)
                        stage.mkdir()
                        session, expected, delimiter = self.model(step, stage, profile, workspace, r['package'], login, build, session)
                    if self.options['cold']:
                        r['cold'] = 'FAIL'
                        write(folder / 'cold-config.json', {'loginom_url': login['url'], 'api_key': login['api_key'], 'workflow_profile': {'loginom_user': login['username'], 'password': login['password'], 'passwordless_login': login.get('passwordless_login', False)}})
                        self.phase('cold', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/cold-check.mjs', '--config', folder / 'cold-config.json', '--resources', build / 'resources/loginom', '--saved', r['package'], '--expected', stage / 'expected.json', '--output', folder / 'cold', '--csv', stage / 'actual.csv', '--csv-delimiter', delimiter, '--csv-header', 'labels' if case in ['q6', 'p24'] else 'names'], folder)
                        cold = read(folder / 'cold/result.json')
                        assert cold['status'] == 'PASS' and cold.get('settingsReapplied') is False, 'COLD_FAILED'
                        assert all(cold['cleanup'].get(k) is True for k in ['package_closed', 'logged_out']), 'COLD_CLEANUP_UNCONFIRMED'
                        r.update(cold='PASS', cleanup='both PASS')
                    r['status'] = 'FAIL' if r.get('failure_class') else 'PASS'
                except Exception as error:
                    self.failure(r, error, folder)
                self.save()
        except Exception as error:
            for r in self.report['runs']:
                if r['status'] == 'PENDING': self.failure(r, error, self.out)
        finally:
            self.report.update(finished=time.time(), phase='complete')
            self.save()


def main():
    os.umask(0o077)
    args = arguments()
    if args.command == '_worker': return Runner(args.directory.resolve()).run()
    if args.command == 'wait':
        end = time.monotonic() + args.timeout
        while True:
            report = read(args.directory / 'results.json')
            if report.get('finished'):
                print(summary(report), end='')
                return 0 if all(r['status'] == 'PASS' for r in report['runs']) else 1
            if time.monotonic() >= end:
                ready = sum(r['status'] in ['PASS', 'FAIL', 'UNKNOWN'] for r in report['runs'])
                current = next((r['scenario'] for r in report['runs'] if r['status'] == 'PENDING'), report['phase'])
                print(f"{ready}/{len(report['runs'])} готово, идёт {current}")
                return 2
            time.sleep(min(1, max(0, end - time.monotonic())))
    head = git('rev-parse', '--verify', args.head + '^{commit}')
    names = args.scenarios.split(',')
    assert len(names) == len(set(names)), 'Duplicate scenario'
    for name in names:
        spec = scenario(name)
        assert spec['prompt'].is_file(), 'Scenario prompt missing'
        assert (spec['source'] / 'oracle.py').is_file(), 'Scenario oracle missing'
        expected_for(spec, '/preflight/package.lgp')
    pair = args.pair.expanduser().resolve()
    for role in ['worker', 'reviewer']:
        config = read(pair / (role + '.json'))
        assert config['loginom']['username'] and config['package_directory'], 'Invalid pair configuration'
    build = args.build.expanduser().resolve() if args.build else None
    if build:
        meta = read(build / 'cli-manifest.json')['metadata']
        assert meta['sourceCommit'] == head and meta['sourceDirty'] is False, 'Build SHA/cleanliness mismatch'
    out = (args.out or REPO.parent / ('run-check-' + str(time.time_ns()))).expanduser().resolve()
    out.mkdir(parents=True)
    request = vars(args) | {'pair': str(pair), 'build': str(build) if build else None, 'out': str(out)}
    write(out / 'request.json', request)
    write(out / 'results.json', {'head': head, 'tree': git('rev-parse', head + '^{tree}'), 'started': time.time(), 'phase': 'build', 'runs': [{'scenario': n, 'status': 'PENDING'} for n in names]})
    with (out / 'worker.log').open('wb') as log:
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '_worker', str(out)], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    write(out / 'worker.json', {'pid': child.pid})
    print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
