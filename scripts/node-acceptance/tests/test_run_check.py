import copy
from contextlib import redirect_stdout
import csv
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('run_check', Path(__file__).resolve().parents[1] / 'run-check.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunCheckTests(unittest.TestCase):
<<<<<<< HEAD
    def test_regex_catalog_keeps_oracles_out_of_model_inputs(self):
        for name, expected, width in [('regex-add', 'expected.json', 5), ('regex-replace', 'expected-replace.json', 4)]:
=======
    def upload_model(self, root, receipt, *, calls=None):
        source = root / 'input.csv'
        source.write_text('Id,Value\n1,test\n')
        case = root / 'cases/seed'
        (case / 'data').mkdir(parents=True)
        (case / 'task.md').write_text('Загрузи исходник без сохранения пакета')
        runner.write(case / 'case.json', dict(source_path=str(source), attachment='path', upload_only=True))
        runner.write(case / 'expected.json', dict(nodes=[], outputs=[]))
        folder, workspace, profile = root / 'run', root / 'workspace', root / 'profile'
        folder.mkdir(); workspace.mkdir(); profile.mkdir()
        runner.write(profile / 'saved-package-cleanup.json', dict(package_closed=True, logged_out=True,
                     package_path=None, save_operation_id=None, unsaved_changes_discarded=False))
        runner.write(profile / 'runtime-close-test.json', dict(closed_ack=True))
        instance = runner.Runner.__new__(runner.Runner)
        instance.out, instance.env, instance.current = root, {}, {}
        instance.options = dict(case_root=str(case.parent))
        events = calls or [dict(tool='loginom_dock_artifact_deliver', state=dict(
            status='completed', output=json.dumps(receipt)))]
        def phase(*args, **kwargs):
            (folder / 'model.stdout').write_text('\n'.join(json.dumps(dict(
                type='tool_use', sessionID='session', part=part)) for part in events))
        with patch.object(instance, 'phase', side_effect=phase):
            result = instance.model('seed', folder, profile, workspace, '/test/run.lgp',
                                    dict(package_directory='/test'), root / 'build')
        self.assertEqual(instance.current['upload'], 'ready')
        return result

    def test_upload_only_accepts_verified_sync_and_async_receipts(self):
        # LAB-549 l549cseed2/model.stdout:20: settled success has no upload_status.
        receipt = dict(status='SUCCEEDED', state='settled', cleanup_complete=True,
                       output=dict(bytes=16, upload_completion_verified=True))
        for mode in ['sync', 'async']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                reply = copy.deepcopy(receipt)
                calls = None
                if mode == 'async':
                    reply['upload_status'] = 'ready'
                    calls = [dict(tool='loginom_dock_artifact_deliver', state=dict(status='completed',
                                  output=json.dumps(dict(state='running', upload_status='authorizing')))),
                             dict(tool='loginom_dock_artifact_delivery_status', state=dict(
                                  status='completed', output=json.dumps(reply)))]
                self.upload_model(Path(directory), reply, calls=calls)

    def test_upload_count_excludes_only_proven_prebrowser_rejections(self):
        # LAB-549 Sseed/model.stdout:20 rejects budget_ms before any browser effect.
        receipt = dict(status='SUCCEEDED', state='settled', upload_status='ready', cleanup_complete=True,
                       output=dict(bytes=16, upload_completion_verified=True))
        rejected = dict(status='NOT_APPLIED', state='settled', action_key='request.validate',
                        phase='request_rejected', request_rejected=True, effect_possible=False,
                        error=dict(code='REQUEST_REJECTED', parameter_path='budget_ms'))
        cases = [('prebrowser', rejected, True), ('possible effect', dict(rejected, effect_possible=True), False),
                 ('unknown effect', {k: v for k, v in rejected.items() if k != 'effect_possible'}, False),
                 ('unproven rejection', dict(rejected, request_rejected=False), False),
                 ('runtime error', dict(state='settled', status='FAILED'), False),
                 ('malformed', None, False), ('second upload', receipt, False)]
        for name, prior, accepted in cases:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                calls = [dict(tool='loginom_dock_artifact_deliver', state=dict(
                             status='completed' if name == 'second upload' else 'error',
                             **{'output' if name == 'second upload' else 'error':
                                json.dumps(prior) if prior else 'not JSON'})),
                         dict(tool='loginom_dock_artifact_deliver', state=dict(
                             status='completed', output=json.dumps(receipt)))]
                if accepted:
                    self.upload_model(Path(directory), receipt, calls=calls)
                else:
                    with self.assertRaisesRegex(AssertionError, 'UPLOAD_COUNT'):
                        self.upload_model(Path(directory), receipt, calls=calls)

    def test_upload_only_keeps_verification_requirements(self):
        receipt = dict(status='SUCCEEDED', state='settled', cleanup_complete=True,
                       output=dict(bytes=16, upload_completion_verified=True))
        for key, value in [('status', 'NOT_APPLIED'), ('state', 'running'), ('cleanup_complete', False),
                           ('bytes', 15), ('upload_completion_verified', False), ('upload_status', 'failed')]:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                reply = copy.deepcopy(receipt)
                (reply['output'] if key in ['bytes', 'upload_completion_verified'] else reply)[key] = value
                with self.assertRaisesRegex(AssertionError, 'UPLOAD_NOT_READY'):
                    self.upload_model(Path(directory), reply)

    def test_model_phase_budget_comes_from_scenario_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, timeout in [('C1', 2700), ('5-REST', 2700), ('other', 1800), ('s1', 1800), ('n11', 1800)]:
                with self.subTest(name=name):
                    if name in ['C1', '5-REST', 'other']:
                        source = root / 'cases' / name
                        (source / 'data').mkdir(parents=True)
                        (source / 'task.md').write_text('Выгрузи result.csv')
                        runner.write(source / 'expected.json', {'nodes': [], 'outputs': [{
                            'output_node_type': 'export_input', 'export_destination': '/test/result.csv'}]})
                    instance = runner.Runner.__new__(runner.Runner)
                    instance.out, instance.env, instance.options = root, {}, {'cases': str(root / 'cases')}
                    folder, workspace = root / (name + '-run'), root / (name + '-workspace')
                    folder.mkdir(); workspace.mkdir()
                    with patch.object(instance, 'phase', side_effect=InterruptedError) as phase:
                        with self.assertRaises(InterruptedError):
                            instance.model(name, folder, root / 'profile', workspace, '/test/run.lgp',
                                           {'package_directory': '/test'}, root / 'build')
                    self.assertEqual(phase.call_args.kwargs.get('timeout', 1800), timeout)

    def test_deadline_interrupts_cli_before_emergency_group_signals(self):
        for exits_on in ['owner', 'group', 'kill']:
            with self.subTest(exits_on=exits_on), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                instance = self.make_runner(root)
                calls = []
                class Child:
                    pid = 12345
                    def poll(self): return None
                    def send_signal(self, sig): calls.append(('owner', sig))
                    def wait(self, timeout=None):
                        calls.append(('wait', timeout))
                        if (len(calls) == 2 and exits_on != 'owner'
                                or len(calls) == 4 and exits_on == 'kill'):
                            raise subprocess.TimeoutExpired('fake-cli', timeout)
                        return 0
                with patch.object(runner.os, 'getloadavg', return_value=(0, 0, 0)), \
                     patch.object(runner.subprocess, 'Popen', return_value=Child()), \
                     patch.object(runner.subprocess, 'check_output', return_value=b'{"pid": 99999}'), \
                     patch.object(runner.os, 'killpg', side_effect=lambda pid, sig: calls.append(('group', sig))), \
                     patch.object(instance, 'memory', return_value={}):
                    with self.assertRaisesRegex(TimeoutError, 'model deadline'):
                        instance.phase('model', ['fake-cli'], root, timeout=0)
                expected = [('owner', signal.SIGINT), ('wait', 100)]
                if exits_on != 'owner': expected += [('group', signal.SIGINT), ('wait', 40)]
                if exits_on == 'kill': expected += [('group', signal.SIGKILL), ('wait', None)]
                self.assertEqual(calls, expected)

    def test_case_root_keeps_catalog_budgets_and_default(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'input.csv'
            source.write_text('a\n1\n')
            for name, timeout in [('C1', 2700), ('5-REST', 2700), ('E1', 1800)]:
                case = root / name
                case.mkdir()
                runner.write(case / 'case.json', {'source_path': str(source), 'attachment': 'path'})
                self.assertEqual(runner.scenario(name, root).get('model_timeout', 1800), timeout)

    def test_external_private_case_uses_stock_checks_and_rejects_directory_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 's-server-a'
            source.mkdir()
            (source / 'task.md').write_text('Сумма продаж по регионам')
            (source / 'data').mkdir()
            case = runner.scenario('s-server-a', cases=root)
            self.assertEqual(case['prompt'], source / 'task.md')
            self.assertIsNone(case['base'])
            self.assertTrue(case['external'])
            self.assertEqual(list(case['data'].iterdir()), [])
            with self.assertRaises(ValueError):
                runner.scenario('../s-server-a', cases=root)

    def test_flat_pair_preserves_the_assigned_account(self):
        config = {'username': 'test', 'url': 'https://app.loginom.ai', 'api_key': 'private', 'password': 'private', 'package_directory': '/test'}
        self.assertEqual(runner.pair_login(config, 'worker.json'), config)
    def make_runner(self, root, names=('s1',)):
        runner.write(root / 'request.json', {'pair': str(root / 'pair'), 'cold': True,
                                           'host_load_max': 8, 'spacing': 60})
        (root / 'pair').mkdir()
        runner.write(root / 'pair/worker.json', {'package_directory': '/test', 'loginom': {
            'username': 'test', 'password': 'test', 'url': 'https://example.test', 'api_key': 'test'}})
        runner.write(root / 'results.json', {'head': 'a' * 40, 'tree': 'b' * 40,
            'started': time.time(), 'phase': 'build', 'runs': [{'scenario': n, 'status': 'PENDING'} for n in names]})
        return runner.Runner(root)

    def test_gate_and_setup_times_are_separate(self):
        for exhausted in [False, True]:
            with self.subTest(exhausted=exhausted), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                instance = self.make_runner(root)
                instance.current = instance.report['runs'][0]
                clock = [100.0]
                instance.deadline = 102 if exhausted else 1000
                instance.last_start = 43
                saved = []
                save = instance.save
                def capture():
                    saved.append(copy.deepcopy(instance.report))
                    save()
                def sleep(seconds):
                    self.assertEqual(instance.report['phase'], 'gate:setup')
                    clock[0] += seconds
                child = unittest.mock.Mock(pid=12345, returncode=0)
                child.poll.side_effect = [None, 0]
                child.wait.side_effect = lambda **kw: clock.__setitem__(0, clock[0] + 5)
                with patch.object(runner.time, 'time', side_effect=lambda: clock[0]), \
                     patch.object(runner.time, 'sleep', side_effect=sleep), \
                     patch.object(runner.os, 'getloadavg', side_effect=lambda: (9, 9, 9) if clock[0] < 102 else (0, 0, 0)), \
                     patch.object(runner.subprocess, 'Popen', return_value=child) as popen, \
                     patch.object(instance, 'memory', return_value={}), \
                     patch.object(instance, 'save', side_effect=capture):
                    if exhausted:
                        with self.assertRaises(TimeoutError): instance.phase('setup', ['unused'], root)
                        popen.assert_not_called()
                    else:
                        instance.phase('setup', ['unused'], root)
                timing = instance.report['phase_timings'][0]
                self.assertEqual(timing['queue_seconds'], 2 if exhausted else 3)
                self.assertEqual(timing['duration_seconds'], 0 if exhausted else 5)
                self.assertEqual(timing['started'], None if exhausted else 103)
                self.assertEqual(saved[0]['phase'], 'gate:setup')
                self.assertIn('queue', runner.summary(instance.report))

    def test_expired_batch_does_not_launch_later_scenarios(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instance = self.make_runner(root, ('s1', 's2', 'E1'))
            calls = []
            def phase(name, command, folder, **kwargs):
                calls.append((name, folder.name))
                instance.deadline = 0
                instance.report['phase'] = name
                raise TimeoutError('setup deadline')
            with patch.object(instance, 'build', return_value=root / 'build'), \
                 patch.object(instance, 'phase', side_effect=phase), \
                 patch.object(instance, 'prepare_d87') as prepare:
                instance.run()
            self.assertEqual(calls, [('setup', 's1')])
            prepare.assert_not_called()
            runs = instance.report['runs']
            self.assertEqual([r['status'] for r in runs], ['UNKNOWN', 'NOT_RUN', 'NOT_RUN'])
            self.assertTrue(all('failure_class' not in r and 'profile' not in r for r in runs[1:]))
            self.assertIn('не запущен (бюджет пакета)', runner.summary(instance.report))

    def test_batch_budget_expires_in_setup_gate_without_a_setup_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instance = self.make_runner(root, ('s1', 'E1'))
            instance.deadline = 102
            clock = [100.0]
            def sleep(seconds): clock[0] += seconds
            with patch.object(instance, 'build', return_value=root / 'build'), \
                 patch.object(runner.time, 'time', side_effect=lambda: clock[0]), \
                 patch.object(runner.time, 'sleep', side_effect=sleep), \
                 patch.object(runner.os, 'getloadavg', return_value=(9, 9, 9)), \
                 patch.object(runner.subprocess, 'Popen') as popen, \
                 patch.object(instance, 'prepare_d87') as prepare:
                instance.run()
            popen.assert_not_called()
            prepare.assert_not_called()
            self.assertEqual([r['status'] for r in instance.report['runs']], ['NOT_RUN', 'NOT_RUN'])
            self.assertTrue(all('failure_class' not in r for r in instance.report['runs']))
            timing = instance.report['phase_timings'][0]
            self.assertEqual((timing['queue_seconds'], timing['duration_seconds']), (2, 0))
            self.assertFalse((root / 's1/setup.stdout').exists())
            with patch.object(sys, 'argv', ['run-check.py', 'wait', str(root), '--timeout', '0']), redirect_stdout(io.StringIO()):
                self.assertEqual(runner.main(), 1)

    def test_header_modes_follow_the_export_contract(self):
        for name in ['s8', 'q6', 'p24', 's1', 'p17', 'p25']:
            self.assertEqual(runner.scenario(name)['csv_header'], 'labels' if name in ['s8', 'q6', 'p24'] else 'names', name)

    def test_s8_csv_header_contract_reaches_stock_cold_matcher(self):
        # LAB-446 s8-A/cold-1-execution-events.jsonl:260: native names
        # Region/Category/Revenue, saved CSV uses the required Russian labels.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instance = self.make_runner(root, ('s8',))
            def phase(name, command, folder, **kwargs):
                instance.report['phase'] = name
                profile = root / 's8/profile'
                if name == 'setup':
                    (profile / 'data').mkdir(parents=True)
                    (profile / 'config').mkdir()
                    runner.write(folder / 'setup.stdout', {'browser': {'state': 'verified'}})
                if name == 'model':
                    expected = runner.read(folder / 'expected.json')['outputs'][0]
                    events = [{'type': 'tool_use', 'sessionID': 'session', 'part': {'state': {
                        'status': 'completed', 'output': json.dumps(reply)}}} for reply in [
                        {'status': 'SUCCEEDED', 'action_key': 'package.save_as', 'output': {'save_completed': True}},
                        {'cleanup_complete': True, 'output': {'ports': [{'port': 0, 'schema': [],
                            'sample': [], 'freshness_basis': 'completed_execution_port_source'}]}}]]
                    (folder / 'model.stdout').write_text('\n'.join(map(json.dumps, events)))
                    runner.write(profile / 'saved-package-cleanup.json', {'package_closed': True, 'logged_out': True})
                    runner.write(profile / 'runtime-close-test.json', {'closed_ack': True})
                    destination = Path(expected['export_destination']).name
                    with (profile / destination).open('w') as file:
                        writer = csv.writer(file)
                        writer.writerow([c['label'] if folder.name == 's8' else c['name'] for c in expected['columns']])
                        writer.writerows([[r[c['name']] for c in expected['columns']] for r in expected['rows']])
                if name == 'cold':
                    command = list(map(str, command))
                    mode = command[command.index('--csv-header') + 1]
                    expected = command[command.index('--expected') + 1]
                    actual = command[command.index('--csv') + 1]
                    script = """
import {readFileSync} from 'node:fs';
import {matchExpectedOutputs,parseExportCsvHeader} from './scripts/node-acceptance/expected-outputs.mjs';
const [expected,csv,header]=process.argv.slice(1),want=JSON.parse(readFileSync(expected)).outputs[0];
const node={node_id:'rename'},schema=want.columns.map(c=>({name:c.name,label:c.label,type:c.type}));
const data={schema,row_count:want.rows.length,sample_complete:true,precision:{numbers_verified:true},
 sample:want.rows.map(r=>schema.map(c=>({type:c.type,is_null:false,value:r[c.name]})))};
matchExpectedOutputs([{node,type:'transform.reform_columns',output_port:0,data}],[want],{
 exportInput:{node:{ref:node},output_port:0,destination:want.export_destination,
 input_fields:schema.map(c=>({...c,source_name:c.name}))},
 exportCsv:{columns:parseExportCsvHeader(readFileSync(csv,'utf8')),header}});
"""
                    result = subprocess.run(['node', '--input-type=module', '-e', script, expected, actual, mode],
                                            cwd=runner.REPO, capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(mode, 'labels')
                    (folder / 'cold').mkdir()
                    runner.write(folder / 'cold/result.json', {'status': 'PASS', 'settingsReapplied': False,
                        'cleanup': {'package_closed': True, 'logged_out': True}})
            with patch.object(instance, 'build', return_value=root / 'build'), patch.object(instance, 'phase', side_effect=phase):
                instance.run()
            self.assertEqual(instance.report['runs'][0]['status'], 'PASS', instance.report['runs'][0])


    def test_pair_directory_formats_and_unknown_key(self):
        for key in ['package_directory', 'personal_folder']:
            with self.subTest(key=key):
                login = runner.pair_login({'loginom': {'username': 'test'}, key: '/test'}, 'worker.json')
                self.assertEqual(login['package_directory'], '/test')
        with self.assertRaisesRegex(ValueError, 'worker.json.*package_directory.*personal_folder.*mystery'):
            runner.pair_login({'loginom': {'username': 'test'}, 'mystery': '/test'}, 'worker.json')

    def test_d87_catalog_and_default_excludes_heavy(self):
        self.assertEqual(runner.scenario_names('D87'), ['E1', 'E2'])
        self.assertEqual(runner.scenario_names('E3'), ['E3'])
        self.assertEqual(runner.scenario_names('X1', '/external-cases'), ['X1'])
        for name in ['E1', 'E2', 'E3', 'X1']:
>>>>>>> origin/acceptance-hygiene
            case = runner.scenario(name)
            self.assertEqual(case['expected_name'], expected)
            self.assertTrue(case['prompt'].is_file())
            self.assertEqual([p.name for p in case['data'].glob('*.csv')], ['input.csv'])
            result = runner.expected_for(case, '/test/regex.lgp')
            self.assertEqual(result['package_path'], '/test/regex.lgp')
            self.assertEqual(len(result['outputs'][0]['columns']), width)
            self.assertEqual(len(result['outputs'][0]['rows']), 8)
            self.assertIn('transform.replace_columns', [n['type'] for n in result['nodes']])

    def test_join_modes_resolve_approved_tasks_inputs_and_cold_expectations(self):
        for mode, columns, rows in [('right', 6, 7), ('full', 6, 9), ('difference', 3, 2)]:
            with self.subTest(mode=mode):
                case = runner.scenario('join-' + mode)
                self.assertIsNone(case['base'])
                self.assertEqual(case['prompt'].resolve(), (runner.REPO / 'docs/node-development/nodes/join/acceptance' / ('task-' + mode + '.md')).resolve())
                self.assertEqual(sorted(p.name for p in case['data'].iterdir()), ['left.csv', 'manifest.json', 'right.csv'])
                expected = runner.expected_for(case, '/test/join.lgp')
                self.assertEqual(expected['package_path'], '/test/join.lgp')
                self.assertEqual(expected['null_marker'], 'NULL')
                output = expected['outputs'][0]
                self.assertEqual(len(output['columns']), columns)
                self.assertEqual(len(output['rows']), rows)
                self.assertEqual(output['export_destination'], '/' + mode + '-result.csv')
