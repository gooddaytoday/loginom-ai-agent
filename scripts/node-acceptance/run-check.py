#!/usr/bin/env python3
"""Quiet, detached live acceptance runner. Python 3 standard library only."""
import argparse
import csv
from datetime import datetime
from decimal import Decimal, InvalidOperation
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

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / 'docs/testing/loginom-ai-agent'
SCENARIOS = {
    'C1': dict(model_timeout=2700),
    '5-REST': dict(model_timeout=2700),
}
D76_STATUS = 'PASS с ограничением платформы D76'
D87 = {
    'upload_only': dict(attachment='path', generator=['--min-bytes', '67108864'], heavy=False, upload_only=True),
    'E1': dict(attachment='path', generator=['--min-bytes', '1000000000'], heavy=False),
    'E2': dict(attachment='file', generator=['--min-bytes', '1000000000'], heavy=False),
    'E3': dict(attachment='path', generator=['--boundary', '32'], heavy=True),
    'X1': dict(attachment='path', generator=['--format', 'xlsx', '--rows', '500000'], heavy=True,
               pending='ожидает LAB-413: XLSX-переключение'),
}


def pair_login(config, source):
    directory = config.get('package_directory') or config.get('personal_folder')
    login = config.get('loginom', config)
    if not isinstance(directory, str) or not directory.startswith('/') or not isinstance(login, dict) or not login.get('username'):
        raise ValueError(f'{source}: expected loginom.username and package_directory or personal_folder; keys: ' + ', '.join(sorted(config)))
    return dict(login, package_directory=directory)


def scenario_names(value, case_root=None):
    names = [case for name in value.split(',') for case in (['E1', 'E2'] if name == 'D87' and not case_root else [name])]
    if len(names) != len(set(names)): raise ValueError('Duplicate scenario')
    for name in names:
        if not case_root and D87.get(name, {}).get('pending'): raise ValueError(D87[name]['pending'])
    return names


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def git(*args, cwd=REPO):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def scenario(name, case_root=None, *, cases=None):
    # Operator fixtures (including private large-file oracles) stay outside Git.
    # They use this runner's unchanged model/CSV/Save/cold/cleanup checks.
    if cases and (name in SCENARIOS or re.fullmatch(r'[A-Za-z][A-Za-z0-9-]{0,79}', name)):
        src = Path(cases).resolve() / name
        if (src / 'task.md').is_file():
            assert src.resolve().parent == Path(cases).resolve(), 'Case must stay in its assigned directory'
            return dict(SCENARIOS.get(name, {}), source=src, prompt=src / 'task.md', data=src / 'data', base=None, external=True)
    if case_root is not None:
        if name not in SCENARIOS and not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,31}', name):
            raise ValueError('Invalid external case name')
        src = Path(case_root).resolve() / name
        config = read(src / 'case.json')
        if set(config) - {'source_path', 'attachment', 'upload_only'} or not {'source_path', 'attachment'} <= set(config) or config['attachment'] not in ['path', 'file'] or type(config.get('upload_only', False)) is not bool:
            raise ValueError('External case requires source_path and attachment path/file')
        source = Path(config['source_path'])
        if not source.is_absolute() or not source.is_file():
            raise ValueError('External source must be an existing absolute file')
        return dict(SCENARIOS.get(name, {}), source=src, prompt=src / 'task.md', data=src / 'data', base=None,
                    local_file=source, attachment=config['attachment'], upload_only=config.get('upload_only', False))
    if name in ['corr-pairs', 'corr-null', 'corr-age']:
        src = REPO / 'docs/node-development/nodes/research-corranalysis/acceptance'
        task, expected, data = {'corr-pairs': ('task.md', 'expected.json', 'pairs.csv'),
                                'corr-null': ('task-null.md', 'expected-null.json', 'null.csv'),
                                'corr-age': ('age-pressure-task.md', 'expected-age-pressure.json', 'age-pressure.csv')}[name]
        return dict(source=src, prompt=src / task, data=src / 'data', base=None,
                    expected_name=expected, input_files=[data])
    if name in ['outlier-sd', 'outlier-iqr']:
        src = REPO / 'docs/node-development/nodes/preprocessing-elimoutlier/acceptance'
        if name == 'outlier-iqr': src = src / 'iqr'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None, export_count=3)
    if name in D87:
        return dict(D87[name], base=None, generated=True)
    if name == 'logreg-enter':
        src = REPO / 'docs/node-development/nodes/datamining-logregression/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name in ['regex-add', 'regex-replace']:
        node = REPO / 'docs/node-development/nodes/replacement'
        return dict(source=node / 'acceptance/regex',
                    prompt=node / 'acceptance' / ('task-regex.md' if name == 'regex-add' else 'task-regex-replace.md'),
                    data=node / 'fixtures/regex', base=None,
                    expected_name='expected.json' if name == 'regex-add' else 'expected-replace.json')
    if name == 'n21':
        src = REPO / 'docs/node-development/nodes/transform-slidingwindow/acceptance'
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    if name in ['sampling', 'data-partition', 'sampling-null', 'sampling-empty', 'data-partition-null', 'data-partition-empty']:
        slug = 'preprocessing-sampling' if name.startswith('sampling') else 'preprocessing-datapartition'
        variant = next((v for v in ['null', 'empty'] if name.endswith('-' + v)), None)
        src = REPO / 'docs/node-development/nodes' / slug / 'acceptance'
        return dict(source=src, prompt=src / ('task-' + variant + '.md' if variant else 'task.md'),
                    data=src / ('data-' + variant if variant else 'data'), base=None,
                    expected_name='expected-' + variant + '.json' if variant else 'expected.json')
    if name in ['join-right', 'join-full', 'join-difference']:
        src = REPO / 'docs/node-development/nodes/join/acceptance' / name.removeprefix('join-')
        return dict(source=src, prompt=src / 'task.md', data=src / 'data', base=None)
    stability = DATA / 'stability-2026-10-20'
    base = None
    if re.fullmatch(r'(?:n(?:[1-9]|1[0-9]|20)|p(?:[1-9]|1[0-9]|2[0-5]))', name):
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
    # These business requests prescribe CSV display labels; native names remain
    # independent (in particular s8 binds its export by export_destination).
    return dict(source=src, prompt=prompt, data=data, base=base,
                csv_header='labels' if name in ['s8', 'q6', 'p24'] else 'names')


def expected_for(case, package):
    src = case['source']
    # CSV-checking oracles do not generate JSON. Their cold fixtures are separate.
    if case.get('expected_name'):
        expected = read(src / case['expected_name'])
        if case['expected_name'] == 'expected-age-pressure.json':
            expected['outputs'].reverse()  # One final CSV; cold still checks both tables.
    elif re.fullmatch(r'n(?:1[3-9]|20)', src.name) or case['prompt'].name == 'task.md' or src.name == 'p24':
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
    start.add_argument('--cases', type=Path, help='Private external task/expected/oracle/data case directory')
    start.add_argument('--cold', action='store_true')
    start.add_argument('--case-root', type=Path, help='Private external task.md/expected.json/case.json fixtures; oracle is never sent')
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
        rows.append('| ' + ' | '.join([r['scenario'], 'не запущен (бюджет пакета)' if r.get('status') == 'NOT_RUN' else r.get('status', 'RUNNING'),
                    *[r.get(k, '—') for k in ['csv', 'save', 'cold', 'cleanup', 'port-read', 'read-path']],
                    '/'.join(f'{v:.2f}' for v in load[:2]) or '—']) + ' |')
    for r in report['runs']:
        if r.get('d76'):
            rows.append(f"\nD76 {r['scenario']}: negative_zero={r['d76']['negative_zero']}; "
                        f"midnight_date={r['d76']['midnight_date']}")
        if r.get('dataset-cleanup'):
            rows.append('\nD87 ' + r['scenario'] + ': ' + r['dataset-cleanup'])
        if r.get('status') == 'FAIL':
            rows.append(f"\nFAIL {r['scenario']}: {r.get('failure_class')}; {r.get('detail')}; "
                        f"журнал: {r.get('location')}; load при отказе: {r.get('failure_load')}; "
                        f"профиль: {r.get('profile')}")
    timings = report.get('phase_timings', [])
    if timings:
        rows += ['\n| сценарий | фаза | queue, с | выполнение, с |', '|---|---|---|---|']
        now = time.time()
        for t in timings:
            end = t.get('finished', now)
            queue = t.get('queue_seconds', (t['started'] if t['started'] is not None else end) - t['queued'])
            duration = t.get('duration_seconds', end - t['started'] if t['started'] is not None else 0)
            rows.append(f"| {t['scenario'] or '—'} | {t['name']} | {queue:.1f} | {duration:.1f} |")
    return '\n'.join(rows) + '\n'


def csv_delimiter(path):
    text = path.read_text(encoding='utf-8-sig')
    try:
        return csv.Sniffer().sniff(text[:8192], delimiters=',;\t').delimiter
    except csv.Error:
        # A single-column CSV has no delimiter to infer.
        if not any(char in text for char in ',;\t'): return ','
        raise


def check_csv(path, expected, header='names', *, column_order=None, null_marker='', scenario_name=None, d76=None):
    delimiter = csv_delimiter(path)
    rows = list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig')), delimiter=delimiter))
    columns = expected['columns']
    assert rows and len(rows[0]) == len(set(rows[0])) == len(columns), 'CSV_COLUMN_ORDER'
    assert all(len(row) == len(columns) for row in rows[1:]), 'CSV_ROW_WIDTH'
    assert len(rows) - 1 == len(expected['rows']), 'CSV_ROW_COUNT'

    def limitation(value, col, target):
        # Owner-approved D76 forms are code-owned and only apply to types300.
        if scenario_name != 'types300': return None
        if (col['type'] == 'real' and isinstance(target, (int, float)) and target == 0
                and math.copysign(1, target) < 0 and value == '0'):
            return 'negative_zero'
        if col['type'] == 'datetime' and isinstance(target, str):
            goal = datetime.fromisoformat(target)
            if (goal.hour == goal.minute == goal.second == 0 and goal.microsecond != 0
                    and value == goal.date().isoformat()):
                return 'midnight_date'
        return None

    def equal(value, col, target):
        if limitation(value, col, target): return True
        if scenario_name == 'types300' and target is not None and col['type'] in ['integer', 'real']:
            try:
                if col['type'] == 'integer':
                    number = Decimal(value)
                    return number.is_finite() and number == Decimal(str(target))
                number, goal = float(value), float(target)
                return (math.isfinite(number) and math.isfinite(goal) and number == goal
                        and (goal != 0 or math.copysign(1, number) == math.copysign(1, goal)))
            except (ValueError, InvalidOperation, OverflowError): return False
        if col.get('category_labels_any'): return bool(value.strip())
        if target is None: return value == null_marker
        if col['type'] in ['integer', 'real']:
            try:
                number = float(value.replace(',', '.'))
                goal = float(target)
                if not math.isfinite(number) or not math.isfinite(goal): return False
                tolerance = col.get('tolerance', {})
                absolute, relative = tolerance.get('abs', 0), tolerance.get('rel', 0)
                difference = abs(number - goal)
                return (difference <= max(absolute, relative * abs(goal)) if math.isfinite(difference)
                        else abs(number / 2 - goal / 2) <= max(absolute / 2, relative * (abs(goal) / 2)))
            except (ValueError, OverflowError):
                return False
        if col['type'] == 'datetime':
            try: return datetime.fromisoformat(value) == datetime.fromisoformat(target)
            except ValueError: return False
        if isinstance(target, bool): return value.lower() == str(target).lower()
        return value == str(target)

    def matching(options, unique=False):
        # Same augmenting-path and ambiguity policy as expected-outputs.mjs.
        def run(blocked=None):
            owners = {}
            def assign(want, seen):
                for actual in options[want]:
                    if actual in seen or (want, actual) == blocked: continue
                    seen.add(actual)
                    if actual not in owners or assign(owners[actual], seen):
                        owners[actual] = want
                        return True
                return False
            if not all(assign(want, set()) for want in range(len(options))): return None
            return [next(actual for actual, owner in owners.items() if owner == want) for want in range(len(options))]
        result = run()
        if result is None or unique and any(run((want, actual)) is not None for want, actual in enumerate(result)): return None
        return result

    def fits(name, col):
        return (col.get('label_any') if header == 'labels' else col.get('name_any')) or name == (col.get('label', col['name']) if header == 'labels' else col['name'])

    if (column_order or expected.get('column_order')) == 'exact':
        assert all(fits(name, col) for name, col in zip(rows[0], columns)), 'CSV_COLUMN_ORDER'
        indices = list(range(len(columns)))
    else:
        flexible = any(c.get('label_any') if header == 'labels' else c.get('name_any') for c in columns)
        indices = matching([[i for i, name in enumerate(rows[0]) if fits(name, col)
                             and (not flexible or matching([[j for j, row in enumerate(rows[1:])
                                  if equal(row[i], col, want[col['name']])] for want in expected['rows']]) is not None)]
                            for col in columns], unique=flexible)
        assert indices is not None, 'CSV_COLUMN_ORDER'
    options = [[j for j, row in enumerate(rows[1:]) if all(equal(row[indices[i]], col, want[col['name']])
                for i, col in enumerate(columns))] for want in expected['rows']]
    categories = [i for i, col in enumerate(columns) if col.get('category_labels_any')]
    pairs = matching(options, unique=bool(categories)) if not expected.get('ordered') else (
        list(range(len(options))) if all(i in choices for i, choices in enumerate(options)) else None)
    assert pairs is not None, 'CSV_VALUES_OR_ORDER'
    for i in categories:
        forward, reverse = {}, {}
        for want, actual in enumerate(pairs):
            key, value = expected['rows'][want][columns[i]['name']], rows[actual + 1][indices[i]]
            assert forward.get(key, value) == value and reverse.get(value, key) == key, 'CSV_VALUES_OR_ORDER'
            forward[key], reverse[value] = value, key
    if scenario_name == 'types300' and d76 is not None:
        counts = dict(negative_zero=0, midnight_date=0)
        for want, actual in enumerate(pairs):
            for i, col in enumerate(columns):
                kind = limitation(rows[actual + 1][indices[i]], col, expected['rows'][want][col['name']])
                if kind: counts[kind] += 1
        d76.update(counts)
    return delimiter


def records(path):
    for n, line in enumerate(path.read_text(errors='replace').splitlines(), 1):
        try: yield n, json.loads(line)
        except ValueError: continue


def ports(value, receipt=None):
    if isinstance(value, dict):
        # inspect may wrap an action and its read receipt. Keep each port with
        # the receipt that owns output.ports, never the outer inspect cleanup.
        if isinstance(value.get('output'), dict) and 'ports' in value['output']:
            receipt = value
        if 'port' in value and 'schema' in value and 'sample' in value: yield receipt or {}, value
        for item in value.values(): yield from ports(item, receipt)
    if isinstance(value, list):
        for item in value: yield from ports(item, receipt)


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
    delivered = [(n, owner, p) for n, o in replies for owner, p in ports(o)]
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

    def memory(self, pid):
        # Observe only descendants of the exact command we launched. Never keep
        # argv (setup or prompt arguments can be private) in the memory journal.
        pending, seen, totals = [pid], set(), dict(agent=0, host=0, runtime=0)
        while pending:
            current = pending.pop()
            if current in seen: continue
            seen.add(current)
            try:
                proc = Path('/proc') / str(current)
                pending.extend(map(int, (proc / 'task' / str(current) / 'children').read_text().split()))
                args = (proc / 'cmdline').read_bytes().split(b'\0')
                role = ('agent' if current == pid else
                        'host' if any(arg.endswith(b'/node-host.mjs') for arg in args) else
                        'runtime' if any(arg.endswith(b'/managed-entry.mjs') for arg in args) else None)
                if role:
                    match = re.search(r'^VmRSS:\s+(\d+) kB$', (proc / 'status').read_text(), re.M)
                    if match: totals[role] += int(match[1]) * 1024
            except (OSError, ValueError): pass  # A child may exit between /proc reads.
        return totals

    def save(self):
        write(self.out / 'results.json', self.report)
        (self.out / 'summary.md').write_text(summary(self.report))

    def failure(self, result, error, folder):
        result.update(status='UNKNOWN' if isinstance(error, TimeoutError) else 'FAIL', failure_class=str(error).split(':')[0] or type(error).__name__, detail=str(error), failure_load=list(os.getloadavg()), failed_phase=self.report['phase'], failed_at=time.time())
        journal = folder / (result['scenario'] + '-checks.jsonl')
        result['location'] = str(journal) + ':1'
        journal.write_text(json.dumps(result, ensure_ascii=False) + '\n')

    def phase(self, name, command, folder, timeout=1800, stdin=None, env=None, cwd=None):
        timing = dict(name=name, scenario=self.current['scenario'] if self.current else None,
                      queued=time.time(), started=None)
        self.report.setdefault('phase_timings', []).append(timing)
        self.report['phase'] = 'gate:' + name
        self.report['phase_folder'] = str(folder)
        self.save()
        try:
            while True:
                if time.time() >= self.deadline: raise TimeoutError('load/spacing budget')
                if load_ready(os.getloadavg(), self.options['host_load_max']) and time.time() - self.last_start >= self.options['spacing']: break
                time.sleep(1)
            self.last_start = timing['started'] = time.time()
            self.report['phase'] = name
            if self.current is not None:
                self.current.setdefault('started', timing['started'])
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
                    loads.write(json.dumps({'at': time.time(), 'phase': name, 'load': os.getloadavg(), 'rss_bytes': self.memory(child.pid)}) + '\n')
                    loads.flush()
                    if time.time() >= end:
                        daemon = json.loads(subprocess.check_output(['multica', 'daemon', 'status', '--output', 'json']))
                        assert child.pid != daemon['pid'], 'Cannot terminate daemon'
                        # The CLI owns runtime close/ACK. Let it close children
                        # before interrupting the whole process group.
                        child.send_signal(signal.SIGINT)
                        # Host teardown already allows up to 90 seconds.
                        try: child.wait(timeout=100)
                        except subprocess.TimeoutExpired:
                            os.killpg(child.pid, signal.SIGINT)
                            try: child.wait(timeout=40)
                            except subprocess.TimeoutExpired:
                                os.killpg(child.pid, signal.SIGKILL)
                                child.wait()
                        raise TimeoutError(name + ' deadline')
                    try: child.wait(timeout=1)
                    except subprocess.TimeoutExpired: pass
                assert child.returncode == 0, f'{name} exit={child.returncode}: {folder / (name + ".stderr")}:1'
        finally:
            timing['finished'] = time.time()
            timing['queue_seconds'] = (timing['started'] if timing['started'] is not None else timing['finished']) - timing['queued']
            timing['duration_seconds'] = timing['finished'] - timing['started'] if timing['started'] is not None else 0
            self.save()

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

    def prepare_d87(self, name, folder):
        spec = scenario(name)
        fixtures = folder / 'fixtures'
        fixtures.mkdir()
        (fixtures / 'data').mkdir()
        source = fixtures / ('d87-' + str(time.time_ns()) + '-' + name + ('.xlsx' if name == 'X1' else '.csv'))
        # Register ownership before generation, so interrupted generation is cleaned too.
        self.current['dataset'] = str(source)
        self.phase('generate', ['nice', '-n', '19', sys.executable, '-B',
                   REPO / 'scripts/node-acceptance/large-dataset-gen.py', '--output', source,
                   '--manifest', fixtures / 'manifest.json', *spec['generator']], folder)
        manifest = read(fixtures / 'manifest.json')
        if spec.get('upload_only'):
            write(fixtures / 'expected.json', {'nodes': [], 'outputs': []})
            (fixtures / 'task.md').write_text('Загрузи ' + str(source) + ' в Loginom.\n')
            return dict(spec, source=fixtures, prompt=fixtures / 'task.md', data=fixtures / 'data', local_file=source)
        write(fixtures / 'expected.json', {
            'nodes': [], 'outputs': [{'output_node_type': 'export_input', 'ordered': False,
            'columns': [{'name': 'region', 'label_any': True, 'type': 'string'},
                        {'name': 'amount_sum', 'name_any': True, 'label_any': True, 'type': 'real', 'tolerance': {'abs': .01}},
                        {'name': 'row_count', 'name_any': True, 'label_any': True, 'type': 'integer'}],
            'rows': [{'region': region, 'amount_sum': total / 100,
                      'row_count': manifest['records_by_region'][region]}
                     for region, total in manifest['sums_minor_by_region'].items()]}]})
        prompt = ('В файле ' + str(source) + ' продажи по регионам. '
                  'Загрузи исходный файл в свою личную папку без переименования. '
                  'Построй группировку по region: сумма amount и количество всех строк (считай непустой region). '
                  'В итоге нужны ровно три поля: region, сумма и количество; имена двух мер свободные. '
                  'Не заменяй исходные данные агрегатами и не обрабатывай их внешним кодом. ')
        if name == 'X1':
            prompt += 'Excel XLSX, лист Sales, одна строка заголовка; типы: region строка, amount вещественный, date дата/время, note строка. '
        else:
            prompt += ('CSV UTF-8, разделитель точка с запятой, десятичный разделитель запятая, '
                       'кавычка двойная, маркер пропуска NULL, первая строка заголовок. '
                       'Типы: region строка, amount вещественный, note строка. ')
        (fixtures / 'task.md').write_text(prompt + 'Выгрузи и скачай результат в result.csv.\n')
        return dict(spec, source=fixtures, prompt=fixtures / 'task.md', data=fixtures / 'data', local_file=source)

    def cleanup_d87(self, folder, login, build):
        source = Path(self.current['dataset'])
        try:
            names = {source.name}
            manifest = folder / 'fixtures/manifest.json'
            size = read(manifest)['bytes'] if manifest.exists() else None
            def destinations(value):
                if isinstance(value, dict):
                    upload = value.get('upload')
                    destination = value.get('destination') or (upload.get('destination') if isinstance(upload, dict) else None)
                    if value.get('bytes') == size and isinstance(destination, str):
                        path = Path(destination)
                        if str(path.parent) != login['package_directory'].rstrip('/') or not re.fullmatch(r'(?:[a-f0-9]{64}-(?:[0-9]+-)?)?' + re.escape(source.name), path.name):
                            raise ValueError('D87 receipt destination is outside the owned source naming/directory')
                        names.add(path.name)
                    for item in value.values(): destinations(item)
                if isinstance(value, list):
                    for item in value: destinations(item)
            for journal in folder.glob('*/model.stdout'):
                for _, event in records(journal):
                    part = event.get('part', {})
                    state = part.get('state', {})
                    if event.get('type') != 'tool_use' or state.get('status') != 'completed' or not part.get('tool', '').startswith('loginom_'): continue
                    try: reply = json.JSONDecoder().raw_decode(state.get('output', ''))[0]
                    except (ValueError, TypeError): continue
                    destinations(reply)
            config = folder / 'dataset-cleanup-config.json'
            write(config, dict(login=login, names=sorted(names)))
            self.phase('dataset-cleanup', [build / 'resources/loginom/bin/node',
                       REPO / 'scripts/node-acceptance/d87-cleanup.mjs', build / 'resources/loginom',
                       config, folder / 'dataset-cleanup'], folder, timeout=180)
            self.current['dataset-cleanup'] = 'storage PASS'
        finally:
            # Only files owned by this run; preserve private manifest and fail logs.
            for file in folder.rglob('*'):
                if file.is_file() and not file.is_symlink() and (file == source or file.stat().st_size >= 1000000000):
                    file.unlink()
            self.current['dataset-cleanup'] = self.current.get('dataset-cleanup', 'storage FAIL') + '; disk PASS'

    def model(self, case, folder, profile, workspace, package, login, build, session=None):
        spec = (self.prepared_case if isinstance(case, str) and case in D87 and not getattr(self, 'options', {}).get('case_root') else
                dict(source=case, prompt=case / 'task.md', data=case / 'data')
                if isinstance(case, Path) else scenario(case, getattr(self, 'options', {}).get('case_root'),
                    cases=getattr(self, 'options', {}).get('cases')))
        src = spec['source']
        prompt = spec['prompt'].read_text().replace('{{PACKAGE_PATH}}', package)
        if spec.get('local_file') and spec['attachment'] == 'path':
            prompt = prompt.replace('{{SOURCE_PATH}}', str(spec['local_file']))
            if spec.get('upload_only') and str(spec['local_file']) not in prompt:
                # Seed identity comes from case.json, never a copied task's old host path.
                prompt = 'Загрузи ' + str(spec['local_file']) + ' в Loginom.\n'
        expected = expected_for(spec, package)
        rejection = expected.get('rejection')
        if rejection is not None:
            assert rejection == dict(code='LOGINOM_FILE_CHANGED', node_type='transform.group_data') and expected['outputs'] == [], 'INVALID_REJECTION_ORACLE'
        filenames = re.findall(r'[\w-]+\.(?:csv|xlsx)', prompt)
        exports = ([Path(output['export_destination']).name for output in expected['outputs']]
                   if spec.get('external') else
                   list(dict.fromkeys(name for name in filenames if not (spec['data'] / name).exists()
                                        and name != (spec.get('local_file').name if spec.get('local_file') else None))))
        if spec.get('external'):
            assert all(re.fullmatch(r'[\w-]+\.csv', name) for name in exports), 'Invalid CSV export filename'
        if spec.get('upload_only') or rejection: exports = []
        if not exports and not spec.get('upload_only') and not rejection:
            count = spec.get('export_count', 2 if src.parent.name == 'datamining-clustering' else 1)
            exports = [f'{src.parent.name}-{i + 1}.csv' for i in range(count)]
            prompt += '\nВыгрузи и скачай таблицы в файлы ' + ', '.join(exports) + '.'
            if spec.get('export_count') == 3: prompt += ' Порядок файлов: обработанные данные, выбросы, экстремальные значения.'
        destinations = [login['package_directory'].rstrip('/') + '/' + self.out.name + '-' + folder.parent.name + '-' + name for name in exports]
        for name, destination in zip(exports, destinations):
            prompt = prompt.replace(name, destination)
        if not spec.get('upload_only'):
            prompt += f'\nСохрани пакет как {package}.'
            if not rejection: prompt += ' Выгрузи и скачай полный итоговый CSV.'
        (folder / 'task.md').write_text(prompt)
        for output in expected['outputs']:
            if output['output_node_type'] == 'export_input': output['export_destination'] = destinations[-1]
        write(folder / 'expected.json', expected)
        command = [build / 'bin/loginom-ai-agent-cli', 'run', '--headless', '--format', 'json', '--dir', workspace, '--model', 'openai/gpt-6.1-sol', '--variant', 'medium', '--dangerously-skip-permissions']
        if session: command += ['--session', session]
        # Initial requests need their inputs even when the prose omits names.
        # Continuations only admit new, explicitly requested files (r3/r4).
        files = ([spec['data'] / name for name in dict.fromkeys(filenames)] if session else
                 sorted(p for p in spec['data'].iterdir() if p.suffix in ['.csv', '.xlsx']))
        # README exceptions: p14 tests Excel, and the regression base uses only
        # train.csv; its other fixtures belong to later operator scenarios.
        if case == 'p14': files = [spec['data'] / 'exhibits.xlsx']
        if spec.get('input_files'): files = [spec['data'] / name for name in spec['input_files']]
        if isinstance(case, Path) and src.parent.name == 'datamining-linregression':
            files = [spec['data'] / 'train.csv']
        if spec.get('local_file'):
            if spec['attachment'] == 'file': command += ['--file', spec['local_file']]
            files = []  # No multi-GiB workspace copy, and no --file for the path case.
        for file in files:
            if not file.is_file(): continue
            target = workspace / file.name
            if target.exists(): continue
            shutil.copyfile(file, target)
            command += ['--file', target]
        env = dict(self.env, LOGINOM_AI_AGENT_CLI_PROFILE=str(profile), LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG='1', LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE='1', LOGINOM_AI_AGENT_PURE='1')
        self.phase('model', command + ['--', prompt], folder, timeout=spec.get('model_timeout', 1800), env=env, cwd=workspace)
        events = list(records(folder / 'model.stdout'))
        session = next(e['sessionID'] for _, e in events if e.get('sessionID'))
        replies = []
        for n, event in events:
            state = event.get('part', {}).get('state', {})
            if event.get('type') != 'tool_use' or state.get('status') != 'completed': continue
            try: reply = json.JSONDecoder().raw_decode(state.get('output', ''))[0]
            except (ValueError, TypeError): continue
            if isinstance(reply, dict): replies.append((n, reply))
        if spec.get('upload_only'):
            calls = [event.get('part', {}) for _, event in records(folder / 'model.stdout')
                     if event.get('type') == 'tool_use']
            assert not any(c.get('tool') == 'loginom_dock_action_run'
                and c.get('state', {}).get('input', {}).get('action_key') in ['package.save_checkpoint', 'package.save_as']
                for c in calls) and not any(o.get('action_key') in ['package.save_checkpoint', 'package.save_as'] for _, o in replies), 'UNEXPECTED_SAVE'
            assert not any(c.get('tool') == 'loginom_dock_node_apply' for c in calls), 'UNEXPECTED_NODE'
            uploads = []
            for call in calls:
                if call.get('tool') != 'loginom_dock_artifact_deliver': continue
                state = call.get('state', {})
                # Validation failures with no possible effect never reach the browser.
                try: rejected = json.JSONDecoder().raw_decode(state.get('error', ''))[0]
                except (ValueError, TypeError): rejected = None
                if (state.get('status') == 'error' and isinstance(rejected, dict)
                        and rejected.get('request_rejected') is True and rejected.get('effect_possible') is False
                        and rejected.get('status') == 'NOT_APPLIED' and rejected.get('state') == 'settled'
                        and rejected.get('action_key') == 'request.validate'):
                    continue
                uploads.append(call)
            assert len(uploads) == 1, 'UPLOAD_COUNT'
            assert any(o.get('upload_status', 'ready') == 'ready' and o.get('status') == 'SUCCEEDED'
                       and o.get('state') == 'settled' and o.get('cleanup_complete') is True
                       and o.get('output', {}).get('bytes') == spec['local_file'].stat().st_size
                       and o.get('output', {}).get('upload_completion_verified') is True for _, o in replies), 'UPLOAD_NOT_READY'
            cleanups = [read(p) for p in profile.rglob('saved-package-cleanup.json')]
            acks = [read(p) for p in profile.rglob('runtime-close-*.json')]
            assert cleanups and all(c.get('package_closed') is True and c.get('logged_out') is True
                and c.get('package_path') is None and c.get('save_operation_id') is None
                and not c.get('unsaved_changes_discarded') for c in cleanups), 'MAIN_CLEANUP_UNCONFIRMED'
            assert acks and all(a.get('closed_ack') is True for a in acks), 'RUNTIME_CLOSE_ACK_MISSING'
            self.current.update(save='0', cleanup='main PASS', upload='ready', cold='—', csv='—')
            return session, expected, None, None
        assert any(o.get('status') == 'SUCCEEDED' and o.get('action_key') in ['package.save_checkpoint', 'package.save_as'] and o.get('output', {}).get('save_completed') is True for _, o in replies), 'SAVE_NOT_CONFIRMED'
        self.current['save'] = 'PASS'
        if rejection:
            overwritten, guarded = False, None
            requests = {}
            for n, event in events:
                part = event.get('part', {})
                state = part.get('state', {})
                if event.get('type') != 'tool_use' or state.get('status') not in ['completed', 'error']: continue
                request = state.get('input', {})
                if part.get('tool') == 'loginom_dock_node_apply' and request.get('operation_id'):
                    requests[request['operation_id']] = request
                try: reply = json.JSONDecoder().raw_decode(state.get('output' if state['status'] == 'completed' else 'error', ''))[0]
                except (ValueError, TypeError): continue
                if not isinstance(reply, dict): continue
                if reply.get('action_key') == 'operation.inspect':
                    reply = reply.get('output', {}).get('outcome', {})
                if reply.get('state') == 'running': continue
                request = requests.get(reply.get('operation_id'), request)
                if (request.get('target', {}).get('type') == 'exports.text'
                        and request.get('parameters', {}).get('overwrite') == 'replace'
                        and request.get('finish') == 'execute' and reply.get('status') == 'SUCCEEDED'):
                    overwritten = True
                if overwritten and request.get('target', {}).get('type') == rejection['node_type']:
                    result = reply['output'] if 'execution' in reply.get('output', {}) else reply
                    assert (request.get('finish') == 'execute' and reply.get('status') == 'NOT_APPLIED'
                            and reply.get('error', {}).get('code') == rejection['code']
                            and reply.get('effect_possible') is False and reply.get('cleanup_complete') is True
                            and result.get('execution', {}).get('status') == 'not_requested'
                            and result.get('output', {}).get('status') == 'not_refreshed'
                            and result.get('output', {}).get('ports') == []), 'TAMPER_REJECTION_INVALID'
                    guarded = n
                if guarded:
                    # A later successful read must never turn stale rows into PASS.
                    assert not any(ports(reply)), 'TAMPER_STALE_ROWS'
            assert guarded is not None, 'TAMPER_REJECTION_MISSING'
            assert any(n > guarded and o.get('status') == 'SUCCEEDED'
                       and o.get('action_key') in ['package.save_checkpoint', 'package.save_as']
                       and o.get('output', {}).get('save_completed') is True for n, o in replies), 'SAVE_AFTER_REJECTION_MISSING'
            self.current['rejection'] = 'PASS'
            self.current['rejection_location'] = str(folder / 'model.stdout') + ':' + str(guarded)
        paths = {port_path(owner, p) for _, o in replies for owner, p in ports(o)} - {None}
        self.current['read-path'] = '/'.join(sorted((set(self.current.get('read-path', '').split('/')) | paths) - {''}))
        invalid = port_failure(replies, folder / 'model.stdout') if not rejection or any(ports([o for _, o in replies])) else None
        if invalid:
            self.current.update(failure_class='PORT_READ_INVALID', detail='Port source or native binding/exactness/Preview cleanup absent or invalid', location=invalid, failure_load=list(os.getloadavg()))
            self.current['port-read'] = 'FAIL'
        self.current.setdefault('port-read', 'PASS')
        cleanups = [read(p) for p in profile.rglob('saved-package-cleanup.json')]
        acks = [read(p) for p in profile.rglob('runtime-close-*.json')]
        assert cleanups and all(c.get('package_closed') is True and c.get('logged_out') is True and not c.get('unsaved_changes_discarded') for c in cleanups), 'MAIN_CLEANUP_UNCONFIRMED'
        assert acks and all(a.get('closed_ack') is True for a in acks), 'RUNTIME_CLOSE_ACK_MISSING'
        self.current['cleanup'] = 'main PASS'
        if rejection:
            self.current.update(csv='— (expected rejection)', cold='— (expected rejection)')
            return session, expected, None, None
        header = spec.get('csv_header', 'names')
        for index, destination in enumerate(destinations):
            actual = folder / ('actual.csv' if len(destinations) == 1 else f'actual-{index + 1}.csv')
            shutil.copyfile(downloaded_csv(profile, destination), actual)
            if re.fullmatch(r'n(?:1[3-9]|20)', src.name) or src.parent.name == 'datamining-logregression':
                self.phase('oracle', [sys.executable, '-B', src / 'oracle.py', actual], folder, timeout=60)
                # The CSV oracle owns its documented value/order freedoms.
                delimiter = csv_delimiter(actual)
                continue
            # Node-base fixtures describe native port order, not CSV export order.
            # Their task.md leaves export order free; continuation fixtures do not.
            counts = {}
            delimiter = check_csv(actual, expected['outputs'][index], header,
                                  column_order='any' if isinstance(case, Path) else None,
                                  null_marker=expected.get('null_marker', ''), scenario_name=case, d76=counts)
            if counts: self.current['d76'] = counts
        self.current['csv'] = D76_STATUS if any(self.current.get('d76', {}).values()) else 'PASS'
        return session, expected, actual, delimiter

    def run(self):
        try:
            build = self.build()
            account = read(Path(self.options['pair']) / 'worker.json')
            login = pair_login(account, 'worker.json')
            for r in self.report['runs']:
                self.current = r
                if time.time() >= self.deadline:
                    r.update(status='NOT_RUN', reason='BATCH_BUDGET_EXHAUSTED')
                    self.save()
                    continue
                folder = self.out / r['scenario']
                folder.mkdir()
                profile, workspace = folder / 'profile', folder / 'workspace'
                workspace.mkdir()
                r.update(profile=str(profile), package=login['package_directory'].rstrip('/') + '/' + self.out.name + '-' + r['scenario'] + '.lgp')
                env = dict(self.env, LOGINOM_AI_AGENT_CLI_PROFILE=str(profile))
                try:
                    if r['scenario'] in D87 and not self.options.get('case_root'):
                        self.prepared_case = self.prepare_d87(r['scenario'], folder)
                    self.phase('setup', [build / 'bin/loginom-ai-agent-cli', 'loginom', 'setup', '--headless', '--stdin-json', '--format', 'json'], folder, timeout=180, env=env, stdin=json.dumps(dict(url=login['url'], username=login['username'], password=login['password'], apiKey=login['api_key'])))
                    assert read(folder / 'setup.stdout').get('browser', {}).get('state') == 'verified', 'SETUP_NOT_VERIFIED'
                    (profile / 'data/auth.json').symlink_to(Path.home() / '.local/state/loginom-cli-oauth/shared-oauth-v1/auth.json')
                    write(profile / 'config/loginom-ai-agent.json', {'provider': {'openai': {'models': {'gpt-6.1-sol': {'name': 'GPT-6.1 Sol', 'reasoning': True, 'tool_call': True, 'limit': {'context': 400000, 'output': 128000}, 'variants': {'medium': {'reasoningEffort': 'medium'}}}}}}})
                    case = r['scenario']
                    spec = scenario(case, self.options.get('case_root'), cases=self.options.get('cases'))
                    base = spec['base']
                    session = None
                    for step in ([base, case] if base else [case]):
                        r.update(csv='—', save='—', cleanup='—')
                        stage = folder / (step.parent.name if isinstance(step, Path) else step)
                        stage.mkdir()
                        session, expected, actual, delimiter = self.model(step, stage, profile, workspace, r['package'], login, build, session)
                    assert case != 'types300' or (self.options['cold'] and not spec.get('upload_only') and not expected.get('rejection')), 'TYPES300_COLD_REQUIRED'
                    if self.options['cold'] and not spec.get('upload_only') and not expected.get('rejection'):
                        r['cold'] = 'FAIL'
                        write(folder / 'cold-config.json', {'loginom_url': login['url'], 'api_key': login['api_key'], 'workflow_profile': {'loginom_user': login['username'], 'password': login['password'], 'passwordless_login': login.get('passwordless_login', False)}})
                        self.phase('cold', [build / 'resources/loginom/bin/node', REPO / 'scripts/node-acceptance/cold-check.mjs', '--config', folder / 'cold-config.json', '--resources', build / 'resources/loginom', '--saved', r['package'], '--expected', stage / 'expected.json', '--output', folder / 'cold', '--csv', actual, '--csv-delimiter', delimiter, '--csv-header', spec.get('csv_header', 'names')], folder)
                        cold = read(folder / 'cold/result.json')
                        assert cold['status'] == 'PASS' and cold.get('settingsReapplied') is False, 'COLD_FAILED'
                        assert all(cold['cleanup'].get(k) is True for k in ['package_closed', 'logged_out']), 'COLD_CLEANUP_UNCONFIRMED'
                        r.update(cold='PASS', cleanup='both PASS')
                    r['status'] = 'FAIL' if r.get('failure_class') else (D76_STATUS if r.get('csv') == D76_STATUS else 'PASS')
                except Exception as error:
                    if isinstance(error, TimeoutError) and not r.get('started') and self.report['phase'].startswith('gate:'):
                        r.update(status='NOT_RUN', reason='BATCH_BUDGET_EXHAUSTED')
                    else:
                        self.failure(r, error, folder)
                finally:
                    if r.get('dataset'):
                        try: self.cleanup_d87(folder, login, build)
                        except Exception as error:
                            # Retain the original model failure if cleanup also fails.
                            r['dataset_cleanup_error'] = str(error)
                            if r.get('status') != 'FAIL': self.failure(r, error, folder)
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
                return 0 if all(r['status'] in ['PASS', D76_STATUS] for r in report['runs']) else 1
            if time.monotonic() >= end:
                ready = sum(r['status'] in ['PASS', D76_STATUS, 'FAIL', 'UNKNOWN', 'NOT_RUN'] for r in report['runs'])
                current = next((r['scenario'] for r in report['runs'] if r['status'] == 'PENDING'), report['phase'])
                print(f"{ready}/{len(report['runs'])} готово, идёт {current}")
                return 2
            time.sleep(min(1, max(0, end - time.monotonic())))
    head = git('rev-parse', '--verify', args.head + '^{commit}')
    names = scenario_names(args.scenarios, args.case_root)
    assert 'types300' not in names or args.cold, 'TYPES300_COLD_REQUIRED'
    for name in names:
        spec = scenario(name, args.case_root, cases=args.cases)
        if spec.get('generated'): continue
        assert spec['prompt'].is_file(), 'Scenario prompt missing'
        assert args.case_root or (spec['source'] / 'oracle.py').is_file(), 'Scenario oracle missing'
        expected_for(spec, '/preflight/package.lgp')
    pair = args.pair.expanduser().resolve()
    for role in ['worker', 'reviewer']:
        pair_login(read(pair / (role + '.json')), role + '.json')
    build = args.build.expanduser().resolve() if args.build else None
    if build:
        meta = read(build / 'cli-manifest.json')['metadata']
        assert meta['sourceCommit'] == head and meta['sourceDirty'] is False, 'Build SHA/cleanliness mismatch'
    # Chromium also puts its Unix singleton socket under TMPDIR. Keep the
    # default short enough even when the checkout is in a deep task directory.
    out = (args.out or Path.home() / '.cache/loginom-runs' / str(time.time_ns())).expanduser().resolve()
    if not args.case_root and any(name in D87 for name in names) and (out == REPO or REPO in out.parents):
        raise ValueError('D87 result directory and generated data must be outside Git checkout')
    out.mkdir(parents=True)
    temporary = out / 'tmp'
    temporary.mkdir()
    # Detached workers outlive the task that owns the inherited temp directory.
    # Set this before spawning so direct children (including oracles) inherit it.
    env = {k: v for k, v in os.environ.items() if not k.startswith('CODEX_')}
    env.update(TMPDIR=str(temporary), TMP=str(temporary), TEMP=str(temporary))
    request = vars(args) | {'pair': str(pair), 'build': str(build) if build else None, 'out': str(out),
                            'cases': str(args.cases.expanduser().resolve()) if args.cases else None,
                            'case_root': str(args.case_root.expanduser().resolve()) if args.case_root else None}
    write(out / 'request.json', request)
    write(out / 'results.json', {'head': head, 'tree': git('rev-parse', head + '^{tree}'), 'started': time.time(), 'phase': 'build', 'runs': [{'scenario': n, 'status': 'PENDING'} for n in names]})
    with (out / 'worker.log').open('wb') as log:
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '_worker', str(out)], env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    write(out / 'worker.json', {'pid': child.pid})
    print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
