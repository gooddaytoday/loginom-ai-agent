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
    def test_grouping_unique_fixture_and_independent_oracle(self):
        case = runner.scenario('grouping-unique')
        self.assertEqual(case['prompt'].name, 'task.md')
        self.assertIsNone(case['base'])
        self.assertEqual(sorted(p.name for p in case['data'].iterdir()), ['customers.csv'])
        expected = runner.expected_for(case, '/test/unique.lgp')
        oracle = json.loads(subprocess.check_output([sys.executable, '-B', case['source'] / 'oracle.py', '/test/unique.lgp']))
        self.assertEqual(expected, oracle)
        self.assertEqual([c['type'] for c in expected['outputs'][0]['columns']], ['string', 'integer', 'integer', 'integer'])
        self.assertEqual(len(expected['outputs'][0]['rows']), 4)
        self.assertIn('grouping-unique', runner.scenario_names('grouping-unique'))

    def test_sampling_invariant_scenarios_are_explicit_and_stock_expected_unchanged(self):
        for name in ['sampling-random', 'partition-random']:
            case = runner.scenario(name)
            expected = runner.expected_for(case, '/test/modes.lgp')
            self.assertEqual(case['input_files'], ['modes.csv'])
            self.assertTrue(case['prompt'].is_file())
            self.assertTrue((case['data'] / 'modes.csv').is_file())
            self.assertEqual(expected['sampling_modes']['mode'], name.rsplit('-', 1)[1])
            self.assertEqual(expected['sampling_modes']['seed'], 42)
            self.assertEqual(len(expected['outputs']), 1 if name.startswith('sampling') else 3)
            self.assertEqual(expected['package_path'], '/test/modes.lgp')
        for name in ['sampling', 'sampling-null', 'sampling-empty', 'data-partition', 'data-partition-null', 'data-partition-empty']:
            case = runner.scenario(name)
            stock = runner.read(case['source'] / case.get('expected_name', 'expected.json'))
            expected = runner.expected_for(case, '/test/stock.lgp')
            self.assertNotIn('sampling_modes', expected)
            outputs = stock.get('outputs', [{k: v for k, v in stock.items() if k not in ['package_path', 'nodes']}])
            self.assertEqual(expected['outputs'], outputs)

    def export_events(self, marker='?', *, destination='/test/all.csv', kind='new', readback=None):
        request = dict(operation_id='export', target=dict(type='exports.text', kind=kind),
                       parameters=dict(destination=destination, null_marker=marker))
        events = [(1, dict(type='tool_use', part=dict(tool='loginom_dock_node_apply',
                  state=dict(status='completed', input=request, output=json.dumps(dict(state='running'))))))]
        if readback is not None:
            events.append((2, dict(type='tool_use', part=dict(tool='loginom_dock_node_wait', state=dict(
                status='completed', output=json.dumps(dict(operation_id='export', status='SUCCEEDED',
                configuration=dict(status='applied', readback=dict(kind='text_export',
                    destination=destination, settings=dict(null_marker=readback))))))))))
        return events

    def test_export_null_marker_observed_lab612_and_fail_closed(self):
        # LAB-612 execution-events.jsonl:470; actual-1.csv preserves ? and empty Class.
        expected = dict(columns=[dict(name='IsTestSet', type='boolean'), dict(name='RowID', type='integer'),
            dict(name='Class', type='string'), dict(name='Value', type='real'),
            dict(name='Flag', type='boolean'), dict(name='Stamp', type='datetime')], rows=[
            dict(IsTestSet=False, RowID=2, Class=None, Value=None, Flag=True, Stamp='2024-01-02'),
            dict(IsTestSet=False, RowID=3, Class='A', Value=-12.25, Flag=None, Stamp=None),
            dict(IsTestSet=True, RowID=1, Class='', Value=.5, Flag=False, Stamp='2024-01-01')])
        observed = 'IsTestSet,RowID,Class,Value,Flag,Stamp\nFalse,2,?,?,True,2024-01-02\nFalse,3,A,-12.25,?,?\nTrue,1,,0.5,False,2024-01-01\n'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'actual.csv'
            path.write_text(observed)
            options = dict(null_marker=None, export_events=self.export_events(), destination='/test/all.csv')
            runner.check_csv(path, expected, **options)
            for events, code in [([], 'CSV_NULL_MARKER_MISSING'),
                    (self.export_events(destination='/other/all.csv'), 'CSV_NULL_MARKER_MISSING'),
                    (self.export_events(marker='NIL'), 'CSV_NULL_MARKER_UNSUPPORTED')]:
                with self.subTest(code=code), self.assertRaisesRegex(AssertionError, code):
                    runner.check_csv(path, expected, **dict(options, export_events=events))
            expected['rows'][2]['Class'] = '?'
            with self.assertRaisesRegex(AssertionError, 'CSV_NULL_MARKER_COLLISION'):
                runner.check_csv(path, expected, **options)
            expected['rows'][2]['Class'] = ''
            with self.assertRaisesRegex(AssertionError, 'CSV_VALUES_OR_ORDER'):
                runner.check_csv(path, expected, **dict(options, null_marker=''))
            path.write_text(observed.replace('False,2,?,?,', 'False,2,?,NULL,'))
            with self.assertRaisesRegex(AssertionError, 'CSV_VALUES_OR_ORDER'):
                runner.check_csv(path, expected, **options)

    def test_export_null_marker_patch_uses_final_receipt(self):
        expected = dict(columns=[dict(name='s', type='string')], rows=[dict(s=None), dict(s='')])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'actual.csv'
            path.write_text('s\nNULL\n""\n')
            options = dict(null_marker=None, destination='/test/all.csv')
            events = self.export_events(kind='existing', readback='NULL')
            runner.check_csv(path, expected, export_events=events, **options)
            # Omitted patch fields must come from observed settings, not defaults.
            events[0][1]['part']['state']['input']['parameters'] = {}
            runner.check_csv(path, expected, export_events=events, **options)
            with self.assertRaisesRegex(AssertionError, 'CSV_NULL_MARKER_MISSING'):
                runner.check_csv(path, expected, export_events=events[:1], **options)
            with self.assertRaisesRegex(AssertionError, 'CSV_NULL_MARKER_COLLISION'):
                runner.check_csv(path, expected,
                                 export_events=self.export_events(kind='existing', readback=''), **options)
            events[1][1]['part']['state']['output'] = events[1][1]['part']['state']['output'].replace('"export"', '"unrelated"')
            with self.assertRaisesRegex(AssertionError, 'CSV_NULL_MARKER_MISSING'):
                runner.check_csv(path, expected, export_events=events, **options)

    def test_empty_export_null_marker_rejects_empty_strings_but_accepts_null_only(self):
        expected = dict(columns=[dict(name='s', type='string')], rows=[dict(s=None), dict(s='')])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'actual.csv'
            path.write_text('s\n""\n""\n')
            runner.check_csv(path, expected, null_marker='')
            for events in [self.export_events(marker=''), self.export_events(kind='existing', readback='')]:
                with self.assertRaisesRegex(AssertionError, 'CSV_NULL_MARKER_COLLISION'):
                    runner.check_csv(path, expected, null_marker=None,
                                     destination='/test/all.csv', export_events=events)
            expected['rows'][1]['s'] = 'value'
            path.write_text('s\n""\nvalue\n')
            runner.check_csv(path, expected, null_marker=None,
                             destination='/test/all.csv', export_events=self.export_events(marker=''))

    def test_export_null_markers_and_last_patch_inspect(self):
        expected = dict(columns=[dict(name='s', type='string')], rows=[dict(s=None), dict(s='value')])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'actual.csv'
            for marker in ['', '?', 'null', 'NULL']:
                path.write_text('s\n"' + marker + '"\nvalue\n')
                runner.check_csv(path, expected, null_marker=None, destination='/test/all.csv',
                                 export_events=self.export_events(marker))
            events = self.export_events(readback='?')
            outcome = json.loads(events[1][1]['part']['state']['output'])
            node = dict(document_id='doc', workflow_id='workflow', node_id='export-node')
            outcome['configuration']['readback']['node'] = node
            events[1][1]['part']['state']['output'] = json.dumps(dict(output=dict(outcome=outcome)))
            patch_events = self.export_events(kind='existing', readback='NULL')
            patch_events[0][1]['part']['state']['input'].update(operation_id='patch')
            patch_events[0][1]['part']['state']['input']['target']['ref'] = node
            patch_events[0][1]['part']['state']['input']['parameters'] = {}
            with self.assertRaisesRegex(AssertionError, 'CSV_NULL_MARKER_MISSING'):
                runner.check_csv(path, expected, null_marker=None, destination='/test/all.csv',
                                 export_events=events + patch_events[:1])
            outcome = json.loads(patch_events[1][1]['part']['state']['output'])
            outcome['operation_id'] = 'patch'
            patch_events[1][1]['part']['state']['output'] = json.dumps(dict(output=dict(outcome=outcome)))
            runner.check_csv(path, expected, null_marker=None, destination='/test/all.csv',
                             export_events=events + patch_events)

    def test_types300_d76_exact_forms_and_strict_other_cells(self):
        # LAB-583 types300-checks.jsonl:1: 15 negative zeros and 14 midnight dates.
        columns = [{'name': 'SmallReal', 'type': 'real'}, {'name': 'EventAt', 'type': 'datetime'},
                   {'name': 'BigID', 'type': 'integer'}]
        expected = dict(columns=columns, ordered=True, column_order='exact', rows=[
            dict(SmallReal=-0.0, EventAt='2027-01-01T00:00:00.001', BigID='9007199254740993')])
        trials = [
            ('0', '2027-01-01', '9007199254740993', True, 1, 1),
            ('-0', '2027-01-01 00:00:00.001', '9007199254740993', True, 0, 0),
            ('0.0', '2027-01-01', '9007199254740993', False, 0, 0),
            ('0', '2027-01-02', '9007199254740993', False, 0, 0),
            ('0', '2027-01-01 00:00:00.000', '9007199254740993', False, 0, 0),
            ('0', '2027-01-01', '9007199254740992', False, 0, 0)]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'actual.csv'
            for real, date, integer, ok, zeros, dates in trials:
                with self.subTest(real=real, date=date, integer=integer):
                    path.write_text('SmallReal,EventAt,BigID\n' + ','.join([real, date, integer]) + '\n')
                    counts = {}
                    if ok:
                        self.assertEqual(runner.check_csv(path, expected, scenario_name='types300', d76=counts), ',')
                        self.assertEqual(counts, {'negative_zero': zeros, 'midnight_date': dates})
                    else:
                        with self.assertRaisesRegex(AssertionError, 'CSV_VALUES_OR_ORDER'):
                            runner.check_csv(path, expected, scenario_name='types300', d76=counts)
            for goal, actual in [(0.1, '0'), (-12.5, '0')]:
                want = dict(columns=columns[:1], ordered=True, rows=[dict(SmallReal=goal)])
                path.write_text('SmallReal\n' + actual + '\n')
                with self.assertRaises(AssertionError):
                    runner.check_csv(path, want, scenario_name='types300')
            for actual in ['2027-01-01', '2027-01-01 12:00:00']:
                want = dict(columns=columns[1:2], ordered=True,
                            rows=[dict(EventAt='2027-01-01T12:00:00.001')])
                path.write_text('EventAt\n' + actual + '\n')
                with self.assertRaises(AssertionError):
                    runner.check_csv(path, want, scenario_name='types300')

    def test_types300_observed_100_rows_count_15_zeros_and_14_dates(self):
        columns = [{'name': 'SmallReal', 'type': 'real'}, {'name': 'EventAt', 'type': 'datetime'}]
        rows = [dict(SmallReal=-0.0 if i % 7 == 0 else 0.1,
                     EventAt='2027-01-01T00:00:00.001' if i % 7 == 4 else '2027-01-01T12:00:00.001')
                for i in range(100)]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'actual.csv'
            with path.open('w') as stream:
                writer = csv.writer(stream)
                writer.writerow(['SmallReal', 'EventAt'])
                writer.writerows([['0' if i % 7 == 0 else row['SmallReal'],
                                  '2027-01-01' if i % 7 == 4 else row['EventAt']]
                                 for i, row in enumerate(rows)])
            expected = dict(columns=columns, rows=rows, ordered=True)
            with self.assertRaises(AssertionError): runner.check_csv(path, expected)
            counts = {}
            runner.check_csv(path, expected, scenario_name='types300', d76=counts)
            self.assertEqual(counts, dict(negative_zero=15, midnight_date=14))

    def test_path_seed_uses_case_source_instead_of_stale_task_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            receipt = dict(status='SUCCEEDED', state='settled', cleanup_complete=True,
                           output=dict(bytes=16, upload_completion_verified=True))
            self.upload_model(root, receipt)
            task = (root / 'run/task.md').read_text()
            self.assertIn(str(root / 'input.csv'), task)
            self.assertNotIn('/obsolete/seed.csv', task)

    def tamper_model(self, root, calls, rejection=None):
        case = root / 'cases/S-tamper'
        (case / 'data').mkdir(parents=True)
        (case / 'task.md').write_text('Проверь отказ после подмены и сохрани пакет.')
        runner.write(case / 'expected.json', dict(nodes=[], outputs=[], rejection=rejection or dict(
            code='LOGINOM_FILE_CHANGED', node_type='transform.group_data')))
        folder, workspace, profile = root / 'run', root / 'workspace', root / 'profile'
        folder.mkdir(); workspace.mkdir(); profile.mkdir()
        runner.write(profile / 'saved-package-cleanup.json', dict(package_closed=True, logged_out=True,
                     unsaved_changes_discarded=False))
        runner.write(profile / 'runtime-close-test.json', dict(closed_ack=True))
        instance = runner.Runner.__new__(runner.Runner)
        instance.out, instance.env, instance.current = root, {}, {}
        instance.options = dict(cases=str(case.parent))
        def phase(*args, **kwargs):
            (folder / 'model.stdout').write_text('\n'.join(json.dumps(dict(
                type='tool_use', sessionID='session', part=part)) for part in calls))
        with patch.object(instance, 'phase', side_effect=phase):
            result = instance.model('S-tamper', folder, profile, workspace, '/test/run.lgp',
                                    dict(package_directory='/test'), root / 'build')
        self.assertEqual(instance.current['rejection'], 'PASS')
        self.assertEqual(instance.current['cleanup'], 'main PASS')
        self.assertEqual(instance.current['save'], 'PASS')
        self.assertNotIn('Выгрузи', (folder / 'task.md').read_text())
        self.assertEqual(result[2:], (None, None))

    def tamper_calls(self):
        def call(tool, parameters, reply):
            return dict(tool=tool, state=dict(status='completed', input=parameters, output=json.dumps(reply)))
        return [call('loginom_dock_node_apply', dict(target=dict(type='exports.text'),
                      parameters=dict(overwrite='replace'), finish='execute'), dict(status='SUCCEEDED')),
                call('loginom_dock_node_apply', dict(target=dict(type='transform.group_data'), finish='execute'),
                     dict(status='NOT_APPLIED', effect_possible=False, cleanup_complete=True,
                          error=dict(code='LOGINOM_FILE_CHANGED'), output=dict(
                              execution=dict(status='not_requested'), output=dict(status='not_refreshed', ports=[])))),
                call('loginom_dock_action_run', {}, dict(status='SUCCEEDED', action_key='package.save_checkpoint',
                     output=dict(save_completed=True)))]

    def test_tamper_accepts_only_guard_after_overwrite_without_stale_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            self.tamper_model(Path(directory), self.tamper_calls())

    def test_tamper_accepts_correlated_async_errors_and_inspect(self):
        for mode in ['error', 'inspect']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                calls = self.tamper_calls()
                events = []
                for index, call in enumerate(calls[:2]):
                    operation = 'node-' + str(index)
                    call['state']['input']['operation_id'] = operation
                    reply = dict(json.loads(call['state']['output']), operation_id=operation)
                    call['state']['output'] = json.dumps(dict(state='running', operation_id=operation))
                    events.append(call)
                    if index == 0:
                        events.append(dict(tool='loginom_dock_node_wait', state=dict(status='completed',
                            input=dict(operation_id=operation), output=json.dumps(reply))))
                    elif mode == 'error':
                        events.append(dict(tool='loginom_dock_node_wait', state=dict(status='error',
                            input=dict(operation_id=operation), error=json.dumps(reply))))
                    else:
                        events.append(dict(tool='loginom_dock_operation_inspect', state=dict(status='completed',
                            input=dict(operation_id=operation), output=json.dumps(dict(action_key='operation.inspect',
                                output=dict(outcome=reply))))))
                self.tamper_model(Path(directory), events + calls[2:])

    def test_tamper_rejects_other_outcomes_and_stale_rows(self):
        for variant in ['missing guard', 'wrong error', 'possible effect', 'execution', 'stale ports',
                        'missing overwrite', 'wrong target', 'later rows', 'missing save', 'wrong oracle']:
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as directory:
                calls = self.tamper_calls()
                reply = json.loads(calls[1]['state']['output'])
                if variant == 'wrong error': reply['error']['code'] = 'UI_DEADLINE_EXCEEDED'
                if variant == 'possible effect': reply['effect_possible'] = True
                if variant == 'execution': reply['output']['execution']['status'] = 'completed'
                if variant == 'stale ports': reply['output']['output']['ports'] = [dict(sample=[['old']])]
                calls[1]['state']['output'] = json.dumps(reply)
                if variant == 'missing guard': calls.pop(1)
                if variant == 'missing overwrite': calls.pop(0)
                if variant == 'wrong target': calls[1]['state']['input']['target']['type'] = 'exports.text'
                if variant == 'later rows':
                    calls.append(dict(tool='loginom_dock_node_apply', state=dict(status='completed',
                        input=dict(target=dict(type='transform.group_data')), output=json.dumps(dict(
                            status='SUCCEEDED', output=dict(ports=[dict(sample=[['old']])]))))))
                if variant == 'missing save': calls.pop()
                with self.assertRaises(AssertionError):
                    self.tamper_model(Path(directory), calls, dict(code='OTHER') if variant == 'wrong oracle' else None)

    def test_sequential_node_scenarios_resolve_approved_oracles(self):
        for name, count, ports in [('sampling', 2, [0, 0]), ('data-partition', 3, [0, 1, 2])]:
            case = runner.scenario(name)
            self.assertEqual(case['prompt'].name, 'task.md')
            self.assertTrue((case['data'] / 'rows.csv').is_file())
            expected = runner.expected_for(case, '/test/check.lgp')
            self.assertEqual(len(expected['outputs']), count)
            self.assertEqual([o['output_port'] for o in expected['outputs']], ports)
            self.assertTrue(all(o['ordered'] and o['column_order'] == 'exact' for o in expected['outputs']))
            self.assertNotIn('oracle', case['prompt'].read_text())

    def test_sequential_null_empty_keep_approved_schema_order_and_row_counts(self):
        for name, counts in [('sampling-null', [3, 2]), ('sampling-empty', [0, 0]),
                             ('data-partition-null', [3, 2, 1]), ('data-partition-empty', [0, 0, 0])]:
            case = runner.scenario(name)
            variant = name.split('-')[-1]
            self.assertEqual([p.name for p in case['data'].iterdir()], [variant + '.csv'])
            expected = runner.expected_for(case, '/test/null-empty.lgp')
            self.assertEqual([len(o['rows']) for o in expected['outputs']], counts)
            self.assertEqual(expected['outputs'][0]['columns'][-1]['type'], 'datetime')
            self.assertTrue(all(o['column_order'] == 'exact' and o['ordered'] for o in expected['outputs']))

    def upload_model(self, root, receipt, *, calls=None):
        source = root / 'input.csv'
        source.write_text('Id,Value\n1,test\n')
        case = root / 'cases/seed'
        (case / 'data').mkdir(parents=True)
        (case / 'task.md').write_text('Загрузи /obsolete/seed.csv в Loginom.')
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

    def test_regex_catalog_keeps_oracles_out_of_model_inputs(self):
        for name, expected, width in [('regex-add', 'expected.json', 5), ('regex-replace', 'expected-replace.json', 4)]:
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

    def test_prepare_only_verifies_build_without_setup_or_model(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.make_runner(Path(directory), ('r6',))
            instance.options['prepare_only'] = True
            with patch.object(instance, 'build', return_value=Path(directory) / 'cli') as build, \
                 patch.object(instance, 'phase') as phase, patch.object(instance, 'model') as model:
                instance.run()
            build.assert_called_once()
            phase.assert_not_called()
            model.assert_not_called()
            self.assertEqual(instance.report['runs'][0]['status'], 'NOT_RUN')
            self.assertEqual(instance.report['runs'][0]['reason'], 'PREPARE_ONLY')
            self.assertTrue(instance.report['runs'][0]['preparation_only'])
            self.assertEqual(instance.report['phase'], 'complete')
            command = [sys.executable, str(Path(runner.__file__)), 'wait', directory, '--timeout', '0']
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('| r6 | подготовка |', result.stdout)
            for status, reason in [('NOT_RUN', 'BATCH_BUDGET_EXHAUSTED'), ('FAIL', 'PREPARE_ONLY')]:
                instance.report['runs'][0].update(status=status, reason=reason)
                instance.save()
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode, 1)

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


    def test_logreg_selection_csv_freedom_uses_oracle_without_relaxing_cold(self):
        # LAB-657 first live run: warm CSV keeps RowID before X, while cold
        # has the approved native used-fields-first layout.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instance = self.make_runner(root, ('logreg-stepwise',))
            seen = []
            def phase(name, command, folder, **kwargs):
                instance.report['phase'] = name
                profile = root / 'logreg-stepwise/profile'
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
                    order = ['PredictionEvent', 'PredictionProbability', 'ActualEvent', 'Target_predicted', 'RowID', 'X', 'Noise', 'Target', 'Note']
                    # The task replacement gives the owned export path explicitly.
                    import re
                    destination = Path(re.search(r'/test/[^\s]+\.csv', (folder / 'task.md').read_text())[0]).name
                    with (profile / destination).open('w') as file:
                        writer = csv.writer(file); writer.writerow(order)
                        writer.writerows([['?' if r[k] is None else r[k] for k in order] for r in expected['rows']])
                if name == 'oracle':
                    seen.append(name)
                    result = subprocess.run(command, capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                if name == 'cold':
                    seen.append(name)
                    command = list(map(str, command))
                    self.assertIn('--csv', command)
                    expected = runner.read(command[command.index('--expected') + 1])['outputs'][0]
                    self.assertEqual(expected['column_order'], 'exact')
                    self.assertEqual([c['name'] for c in expected['columns']][4:], ['X', 'Noise', 'Target', 'RowID', 'Note'])
                    (folder / 'cold').mkdir()
                    runner.write(folder / 'cold/result.json', {'status': 'PASS', 'settingsReapplied': False,
                        'cleanup': {'package_closed': True, 'logged_out': True}})
            with patch.object(instance, 'build', return_value=root / 'build'), patch.object(instance, 'phase', side_effect=phase):
                instance.run()
            self.assertEqual(instance.report['runs'][0]['status'], 'PASS', instance.report['runs'][0])
            self.assertEqual(seen, ['oracle', 'cold'])

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
            case = runner.scenario(name)
            self.assertEqual(case['heavy'], name in ['E3', 'X1'])
        with self.assertRaisesRegex(ValueError, 'LAB-413'):
            runner.scenario_names('X1')

    def test_d87_real_generator_manifest_oracle_and_model_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instance = runner.Runner.__new__(runner.Runner)
            instance.out, instance.env, instance.options, instance.current = root, {}, {}, {}
            def generate(phase, command, folder):
                subprocess.run(list(map(str, command)), check=True, capture_output=True)
            with patch.dict(runner.D87['E1'], generator=['--rows', '233']):
                with patch.object(instance, 'phase', side_effect=generate):
                    instance.prepared_case = instance.prepare_d87('E1', root)
            spec = instance.prepared_case
            manifest = runner.read(spec['source'] / 'manifest.json')
            expected = runner.expected_for(spec, '/test/result.lgp')
            self.assertEqual(sum(r['row_count'] for r in expected['outputs'][0]['rows']), 233)
            self.assertEqual({r['region']: round(r['amount_sum'] * 100) for r in expected['outputs'][0]['rows']}, manifest['sums_minor_by_region'])
            for mode in ['E1', 'E2']:
                workspace, folder = root / (mode + '-workspace'), root / (mode + '-model')
                workspace.mkdir(); folder.mkdir()
                instance.prepared_case = dict(spec, attachment=runner.D87[mode]['attachment'])
                with patch.object(instance, 'phase', side_effect=InterruptedError) as phase:
                    with self.assertRaises(InterruptedError):
                        instance.model(mode, folder, root / 'profile', workspace, '/test/result.lgp',
                                       {'package_directory': '/test'}, root / 'build')
                command = list(map(str, phase.call_args.args[1]))
                self.assertEqual(phase.call_args.kwargs['timeout'], 1800)
                attached = [command[i+1] for i, v in enumerate(command) if v == '--file']
                self.assertEqual(attached, [str(spec['local_file'])] if mode == 'E2' else [])
                self.assertEqual(list(workspace.iterdir()), [])
                self.assertNotIn('sums_minor', command[-1])
                for row in expected['outputs'][0]['rows']:
                    self.assertNotIn(str(row['amount_sum']), command[-1])

    def test_d87_cleanup_uses_prefixed_receipt_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'd87-123-E1.csv'
            source.write_text('input')
            (root / 'fixtures').mkdir()
            runner.write(root / 'fixtures/manifest.json', {'bytes': 5})
            stage = root / 'E1'
            stage.mkdir()
            name = 'a' * 64 + '-' + source.name
            reply = {'artifact': {'bytes': 5, 'upload': {'destination': '/test/' + name}}}
            (stage / 'model.stdout').write_text(json.dumps({'type': 'tool_use', 'part': {
                'tool': 'loginom_file_admit', 'state': {'status': 'completed', 'output': json.dumps(reply)}}}) + '\n')
            instance = runner.Runner.__new__(runner.Runner)
            instance.current = {'dataset': str(source)}
            with patch.object(instance, 'phase', side_effect=InterruptedError):
                with self.assertRaises(InterruptedError):
                    instance.cleanup_d87(root, {'package_directory': '/test'}, root / 'build')
            config = runner.read(root / 'dataset-cleanup-config.json')
            self.assertIn(name, config['names'])
            self.assertIn(source.name, config['names'])

    def test_d87_cleanup_removes_owned_inputs_even_on_storage_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'd87-test-E1.csv'
            source.write_text('input')
            manifest = root / 'manifest.json'
            manifest.write_text('{}')
            profile = root / 'profile'
            profile.mkdir()
            large = profile / 'opaque-attachment'
            with large.open('wb') as f: f.truncate(1000000001)
            outside = root.parent / (root.name + '-unrelated.csv')
            outside.write_text('keep')
            try:
                instance = runner.Runner.__new__(runner.Runner)
                instance.current = {'dataset': str(source)}
                with patch.object(instance, 'phase', side_effect=RuntimeError('storage failed')):
                    with self.assertRaisesRegex(RuntimeError, 'storage failed'):
                        instance.cleanup_d87(root, {'package_directory': '/test'}, root / 'build')
                self.assertFalse(source.exists())
                self.assertFalse(large.exists())
                self.assertTrue(outside.exists())
                self.assertTrue(manifest.exists())
                self.assertEqual(instance.current['dataset-cleanup'], 'storage FAIL; disk PASS')
            finally: outside.unlink()

    def test_all_87_model_commands_attach_initial_data_and_not_repeat_inputs(self):
        names = ([f'{prefix}{i}' for prefix, count in [('n', 20), ('p', 25), ('s', 8), ('q', 10), ('r', 6)]
                  for i in range(1, count + 1)] + [f'v{v}s{i}' for v in range(1, 4) for i in range(1, 7)])
        self.assertEqual(len(names), 87)
        for name in names:
            case = runner.scenario(name)
            steps = [case['base'], name] if case['base'] else [name]
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                workspace = root / 'workspace'
                workspace.mkdir()
                instance = runner.Runner.__new__(runner.Runner)
                instance.out, instance.env = root, {}
                for index, step in enumerate(steps):
                    folder = root / str(index)
                    folder.mkdir()
                    spec = (dict(source=step, data=step / 'data')
                            if isinstance(step, Path) else runner.scenario(step))
                    inputs = sorted(p for p in spec['data'].iterdir() if p.is_file() and p.suffix in ['.csv', '.xlsx'])
                    if step == 'p14': inputs = [spec['data'] / 'exhibits.xlsx']
                    if isinstance(step, Path) and step.parent.name == 'datamining-linregression':
                        inputs = [spec['data'] / 'train.csv']
                    if index:
                        inputs = ([spec['data'] / ('holdout.csv' if step == 'r3' else 'replace.csv')]
                                  if step in ['r3', 'r4'] else [])
                    # Stop at the process boundary after the real command and
                    # workspace have been prepared; no model or oracle is mocked.
                    with patch.object(instance, 'phase', side_effect=InterruptedError) as phase:
                        with self.assertRaises(InterruptedError):
                            instance.model(step, folder, root / 'profile', workspace, '/test/run.lgp',
                                           {'package_directory': '/test'}, root / 'build',
                                           session='base-session' if index else None)
                    command = phase.call_args.args[1]
                    self.assertEqual(phase.call_args.kwargs['timeout'], 1800, name)
                    attached = [Path(command[i + 1]) for i, item in enumerate(command) if item == '--file']
                    self.assertEqual(sorted(attached), sorted(workspace / p.name for p in inputs))
                    for source in inputs:
                        self.assertEqual((workspace / source.name).read_bytes(), source.read_bytes())
                    self.assertEqual(sorted(p.name for p in workspace.iterdir()),
                                     sorted(set(p.name for p in inputs) | (set(previous) if index else set())))
                    previous = [p.name for p in workspace.iterdir()]

    def test_external_path_and_file_cases_keep_the_original_source_and_private_oracle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'sales.csv'
            source.write_text('region;amount\nNorth;10\n')
            expected = {'nodes': [], 'outputs': [{'output_node_type': 'export_input',
                'ordered': False, 'columns': [{'name': 'region', 'type': 'string'}, {'name': 'amount', 'type': 'real'}],
                'rows': [{'region': 'North', 'amount': 123456789}]}]}
            for mode in ['path', 'file', 'E1']:
                case = root / mode
                (case / 'data').mkdir(parents=True)
                runner.write(case / 'case.json', {'source_path': str(source), 'attachment': 'path' if mode == 'E1' else mode})
                runner.write(case / 'expected.json', expected)
                (case / 'task.md').write_text('В файле ' + str(source) + ' продажи. Построй сумму продаж по регионам')
                instance = runner.Runner.__new__(runner.Runner)
                instance.out, instance.env, instance.options = root, {}, {'case_root': str(root)}
                workspace, folder = root / (mode + '-workspace'), root / (mode + '-run')
                workspace.mkdir(); folder.mkdir()
                with patch.object(instance, 'phase', side_effect=InterruptedError) as phase:
                    with self.assertRaises(InterruptedError):
                        instance.model(mode, folder, root / 'profile', workspace, '/test/result.lgp',
                                       {'package_directory': '/test'}, root / 'build')
                command = list(map(str, phase.call_args.args[1]))
                attached = [command[i + 1] for i, value in enumerate(command) if value == '--file']
                self.assertEqual(attached, [str(source)] if mode == 'file' else [])
                self.assertEqual(list(workspace.iterdir()), [])
                self.assertIn(str(source), command[-1])
                self.assertNotIn('123456789', command[-1])
                self.assertEqual(runner.read(folder / 'expected.json')['outputs'][0]['rows'][0]['amount'], 123456789)
            with self.assertRaisesRegex(ValueError, 'Invalid external case name'):
                runner.scenario('../path', root)

    def test_upload_only_external_request_does_not_add_save_or_export(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'input.csv'
            source.write_text('a\n1\n')
            case = root / 'upload'
            (case / 'data').mkdir(parents=True)
            runner.write(case / 'case.json', {'source_path': str(source), 'attachment': 'path', 'upload_only': True})
            runner.write(case / 'expected.json', {'nodes': [], 'outputs': []})
            prompt = 'Загрузи ' + str(source) + ' в Loginom'
            (case / 'task.md').write_text(prompt)
            workspace, folder = root / 'workspace', root / 'run'
            workspace.mkdir(); folder.mkdir()
            instance = runner.Runner.__new__(runner.Runner)
            instance.out, instance.env, instance.options = root, {}, {'case_root': str(root)}
            with patch.object(instance, 'phase', side_effect=InterruptedError) as phase:
                with self.assertRaises(InterruptedError):
                    instance.model('upload', folder, root / 'profile', workspace, '/test/result.lgp',
                                   {'package_directory': '/test'}, root / 'build')
            command = list(map(str, phase.call_args.args[1]))
            self.assertEqual(command[-1], prompt)
            self.assertNotIn('--file', command)
            self.assertEqual(list(workspace.iterdir()), [])
            # Observed user-v1 CLI delivery envelope, not the internal job snapshot.
            profile = root / 'profile'
            profile.mkdir()
            cleanup = {'package_closed': True, 'logged_out': True, 'package_path': None,
                       'save_operation_id': None, 'unsaved_changes_discarded': False}
            runner.write(profile / 'saved-package-cleanup.json', cleanup)
            runner.write(profile / 'runtime-close-1.json', {'closed_ack': True})
            reply = {'upload_status': 'ready', 'state': 'settled', 'status': 'SUCCEEDED',
                     'cleanup_complete': True, 'output': {'bytes': source.stat().st_size,
                     'upload_completion_verified': True}}
            for fault in [None, 'wrong-size', 'not-ready', 'unconfirmed', 'unsettled', 'duplicate', 'save', 'node', 'dirty', 'no-ack']:
                with self.subTest(fault=fault):
                    sample = copy.deepcopy(reply)
                    if fault == 'wrong-size': sample['output']['bytes'] += 1
                    if fault == 'not-ready': sample['upload_status'] = 'uploading'
                    if fault == 'unconfirmed': sample['cleanup_complete'] = False
                    if fault == 'unsettled': sample['state'] = 'running'
                    events = [{'type': 'tool_use', 'sessionID': 'own-session', 'part': {
                        'tool': 'loginom_dock_artifact_deliver',
                        'state': {'status': 'completed', 'output': runner.json.dumps(sample)}}}]
                    if fault == 'duplicate': events += copy.deepcopy(events)
                    if fault in ['save', 'node']:
                        events.append({'type': 'tool_use', 'part': {
                            'tool': 'loginom_dock_action_run' if fault == 'save' else 'loginom_dock_node_apply',
                            'state': {'status': 'error', 'input': {'action_key': 'package.save_checkpoint'}}}})
                    runner.write(profile / 'saved-package-cleanup.json', dict(cleanup,
                        package_closed=fault != 'dirty', logged_out=fault != 'dirty'))
                    runner.write(profile / 'runtime-close-1.json', {'closed_ack': fault != 'no-ack'})
                    def output(*args, **kwargs):
                        (folder / 'model.stdout').write_text('\n'.join(map(runner.json.dumps, events)) + '\n')
                    instance.current = {}
                    with patch.object(instance, 'phase', side_effect=output):
                        if fault:
                            with self.assertRaisesRegex(AssertionError, {'duplicate': 'UPLOAD_COUNT', 'save': 'UNEXPECTED_SAVE', 'node': 'UNEXPECTED_NODE', 'dirty': 'MAIN_CLEANUP_UNCONFIRMED', 'no-ack': 'RUNTIME_CLOSE_ACK_MISSING'}.get(fault, 'UPLOAD_NOT_READY')):
                                instance.model('upload', folder, profile, workspace, '/test/result.lgp',
                                               {'package_directory': '/test'}, root / 'build')
                        else:
                            instance.model('upload', folder, profile, workspace, '/test/result.lgp',
                                           {'package_directory': '/test'}, root / 'build')
                            self.assertEqual(instance.current['cleanup'], 'main PASS')
                            self.assertEqual(instance.current['save'], '0')

    def test_upload_only_generated_case_uses_64_mib_and_plain_request(self):
        self.assertEqual(runner.scenario('upload_only')['generator'], ['--min-bytes', '67108864'])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instance = runner.Runner.__new__(runner.Runner)
            instance.out, instance.env, instance.options, instance.current = root, {}, {}, {}
            def generate(phase, command, folder):
                subprocess.run(list(map(str, command)), check=True, capture_output=True)
            with patch.dict(runner.D87['upload_only'], generator=['--rows', '10']):
                with patch.object(instance, 'phase', side_effect=generate):
                    spec = instance.prepare_d87('upload_only', root)
            self.assertEqual(spec['prompt'].read_text(), 'Загрузи ' + str(spec['local_file']) + ' в Loginom.\n')
            self.assertEqual(runner.expected_for(spec, '/test/result.lgp')['outputs'], [])
            self.assertTrue(spec['upload_only'])

    def test_memory_observation_is_scoped_to_its_exact_process(self):
        instance = runner.Runner.__new__(runner.Runner)
        usage = instance.memory(os.getpid())
        self.assertGreater(usage['agent'], 0)
        self.assertEqual(usage['host'], 0)
        self.assertEqual(usage['runtime'], 0)

    def test_all_regression_names_resolve_real_inputs(self):
        names = ([f'n{i}' for i in range(1, 22)] + ['logreg-enter'] + [f'p{i}' for i in range(1, 26)]
                 + [f'q{i}' for i in range(1, 11)] + [f'r{i}' for i in range(1, 7)]
                 + [f's{i}' for i in range(1, 9)]
                 + [f'v{v}s{i}' for v in range(1, 4) for i in range(1, 7)])
        for name in names:
            with self.subTest(name=name):
                case = runner.scenario(name)
                self.assertTrue(case['prompt'].is_file())
                self.assertTrue((case['source'] / 'oracle.py').is_file())
                self.assertTrue(case['data'].is_dir())
        for name in ['', 'p0', 'p26', 'v0s1', 'v4s1', 'v1s7', 'r0', 'r7', 'n22', 'q11', 's9', '../n1', 'clustering']:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Unknown scenario'):
                runner.scenario(name)

    def test_rest_get_plain_has_no_input_and_independent_single_request_oracle(self):
        case = runner.scenario('rest-get-plain')
        self.assertIsNone(case['base'])
        self.assertEqual(case['prompt'].name, 'task.md')
        self.assertEqual([p for p in case['data'].iterdir() if p.suffix in ['.csv', '.xlsx']], [])
        self.assertIn('без query-параметров и без входной таблицы', case['prompt'].read_text())
        expected = runner.expected_for(case, '/test/plain.lgp')
        self.assertEqual(expected['package_path'], '/test/plain.lgp')
        output = expected['outputs'][0]
        self.assertEqual(output['rows'], [dict(ErrorCode=0, HttpStatusCode=200)])
        self.assertEqual(output['output_node_type'], 'export_input')
        self.assertEqual([c['name'] for c in output['columns']], ['ErrorCode', 'HttpStatusCode'])
        result = subprocess.run([sys.executable, '-B', case['source'] / 'oracle.py', '--check'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_logreg_enter_uses_authored_task_input_and_preserves_n21(self):
        self.assertEqual(runner.scenario('n21')['source'].parent.name, 'transform-slidingwindow')
        case = runner.scenario('logreg-enter')
        self.assertEqual(case['source'].parent.name, 'datamining-logregression')
        self.assertEqual(case['prompt'].name, 'task.md')
        self.assertIsNone(case['base'])
        self.assertEqual(sorted(p.name for p in case['data'].iterdir()), ['train.csv'])
        expected = runner.expected_for(case, '/test/logistic.lgp')
        self.assertEqual(expected['package_path'], '/test/logistic.lgp')
        self.assertEqual(expected['outputs'][0]['output_port'], 0)
        self.assertEqual(len(expected['outputs'][0]['rows']), 32)
        self.assertEqual(expected['outputs'][0]['columns'][1]['tolerance'], {'abs': 1e-8, 'rel': 1e-10})
        result = subprocess.run([sys.executable, '-B', case['source'] / 'oracle.py', '--check'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_logreg_selection_catalog_keeps_oracle_private_and_all_cells(self):
        for variant in ['forward', 'backward', 'stepwise']:
            case = runner.scenario('logreg-' + variant)
            self.assertEqual(case['prompt'].name, 'task-' + variant + '.md')
            self.assertTrue(case['prompt'].is_file())
            self.assertEqual(sorted(p.name for p in case['data'].iterdir()), ['selection.csv'])
            self.assertIsNone(case['base'])
            expected = runner.expected_for(case, '/test/selection.lgp')
            output = expected['outputs'][0]
            self.assertEqual(len(output['rows']), 64)
            self.assertEqual(len(output['columns']), 9)
            self.assertEqual(output['columns'][1]['tolerance'], {'abs': 1e-8, 'rel': 1e-10})
            reference = json.loads(subprocess.check_output([sys.executable, '-B', case['source'] / 'oracle.py']))
            self.assertEqual(output, reference['outputs'][0])

    def test_logreg_custom_selection_cases_are_not_in_v039_catalog(self):
        for variant in ['aic', 'aicc', 'bic', 'hqic', 'strict', 'permissive']:
            with self.assertRaises(ValueError):
                runner.scenario('logreg-stepwise-' + variant)

    def test_p25_source_oracle_and_strict_result(self):
        case = runner.scenario('p25')
        source = runner.REPO / 'evals/tasks/node-evals/crosstable-local-variable-bindings'
        self.assertEqual(case['prompt'].read_text(), runner.read(source / 'task.json')['prompt'])
        self.assertEqual((case['data'] / 'sales.csv').read_bytes(), (source / 'data/sales.csv').read_bytes())
        command = [sys.executable, '-B', str(case['source'] / 'oracle.py')]
        for cwd in [runner.REPO, case['source']]:
            actual = subprocess.check_output(command, cwd=cwd)
            for name in ['expected.json', 'expected-demo.json']:
                self.assertEqual(actual, (case['source'] / name).read_bytes())
        output = runner.expected_for(case, '/personal/p25.lgp')['outputs'][0]
        self.assertEqual([(c['name'], c['label'], c['type']) for c in output['columns']], [
            ('Region', 'Region', 'string'), ('A_Amount_Sum', 'A.Amount.Сумма', 'real'),
            ('A_Amount_Count', 'A.Amount.Количество', 'integer')])
        self.assertTrue(all(not c.get('label_any') for c in output['columns']))
        self.csv_result(output, 'A_Amount_Count,Region,A_Amount_Sum\n2,N,15\n1,S,3\n')
        for text in ['Region,A_Amount_Sum,A_Amount_Count\nS,3,1\nN,15,2\n',
                     'Region,A_Amount_Sum,A_Amount_Count\nN,15,2\nS,999,1\n']:
            with self.assertRaisesRegex(AssertionError, 'CSV_VALUES_OR_ORDER'):
                self.csv_result(output, text)

    def test_variants_reuse_demo_evidence_and_followups_use_documented_bases(self):
        case = runner.scenario('v1s2')
        demo = runner.scenario('s2')
        self.assertEqual(case['source'], demo['source'])
        self.assertEqual(case['data'], demo['data'])
        self.assertEqual(case['prompt'].name, 'prompt-v1.md')
        for name, node in [('r1', 'datamining-clustering'), ('r2', 'datamining-clustering'),
                           ('r3', 'datamining-linregression'), ('r4', 'datamining-linregression'),
                           ('r5', 'integration-restrequest'), ('r6', 'integration-restrequest')]:
            self.assertEqual(runner.scenario(name)['base'].parent.name, node)
        for name in ['p23', 'p24']:
            self.assertEqual(runner.scenario(name)['base'], 's1')

    def test_expected_modes_and_new_cold_fixtures_match_csv_oracles(self):
        for name in ['n1', 'p1', 'p14', 'p24', 'v1s2', 'r1', 'r3', 'r5']:
            expected = runner.expected_for(runner.scenario(name), '/personal/run.lgp')
            self.assertEqual(expected['package_path'], '/personal/run.lgp')
            self.assertTrue(expected['outputs'])
        for name in ['n14', 'n15', 'n16', 'n17']:
            case = runner.scenario(name)
            reference = case['source'] / 'expected/reference.csv'
            output = runner.expected_for(case, '/personal/run.lgp')['outputs'][0]
            self.assertTrue(output['ordered'])
            runner.check_csv(reference, output)
            command = [sys.executable, '-B', str(case['source'] / 'oracle.py')]
            self.assertEqual(subprocess.run(command + [str(reference)], capture_output=True).returncode, 0)
            with tempfile.TemporaryDirectory() as folder:
                bad = Path(folder) / 'bad.csv'
                lines = reference.read_text().splitlines()
                bad.write_text('\n'.join(lines[:-1]) + '\n')
                self.assertNotEqual(subprocess.run(command + [str(bad)], capture_output=True).returncode, 0)
                with self.assertRaisesRegex(AssertionError, 'CSV_ROW_COUNT'):
                    runner.check_csv(bad, output)

    def test_csv_declared_column_order_and_dates_keep_value_checks(self):
        expected = {'columns': [{'name': 'Id', 'type': 'integer'}, {'name': 'Due', 'type': 'datetime'}],
                    'column_order': 'any', 'rows': [{'Id': 1, 'Due': '2026-10-01T00:00:00.000'}]}
        with tempfile.TemporaryDirectory() as folder:
            actual = Path(folder) / 'actual.csv'
            actual.write_text('Due,Id\n2026-10-01,1\n')
            runner.check_csv(actual, expected)
            actual.write_text('Due,Id\n2026-10-02,1\n')
            with self.assertRaisesRegex(AssertionError, 'CSV_VALUES'):
                runner.check_csv(actual, expected)
            actual.write_text('Due,Id\n2026-10-01,1\n')
            expected['column_order'] = 'exact'
            with self.assertRaisesRegex(AssertionError, 'CSV_COLUMN_ORDER'):
                runner.check_csv(actual, expected)

    def test_csv_flexible_order_still_rejects_duplicate_header(self):
        expected = {'columns': [{'name': 'Id', 'type': 'integer'}, {'name': 'Count', 'type': 'integer'}],
                    'column_order': 'any', 'rows': [{'Id': 1, 'Count': 2}]}
        with tempfile.TemporaryDirectory() as folder:
            actual = Path(folder) / 'actual.csv'
            actual.write_text('Count,Id,Id\n2,1,1\n')
            with self.assertRaisesRegex(AssertionError, 'CSV_COLUMN_ORDER'):
                runner.check_csv(actual, expected)

    def test_native_base_export_maps_csv_columns_without_changing_fixture(self):
        source = runner.REPO / 'docs/node-development/nodes/datamining-clustering/acceptance'
        expected = runner.expected_for(dict(source=source, prompt=source / 'task.md'), '/personal/run.lgp')['outputs'][0]
        before = copy.deepcopy(expected)
        # Actual smoke-1/r1 header: Cluster,Distance,RowID,X,Y. The native
        # port fixture orders X/Y before RowID; task.md prescribes no CSV order.
        names = ['Cluster', 'Distance', 'RowID', 'X', 'Y']
        with tempfile.TemporaryDirectory() as folder:
            actual = Path(folder) / 'actual.csv'
            rows = [','.join(str(row[name]) for name in names) for row in expected['rows']]
            actual.write_text(','.join(names) + '\n' + '\n'.join(rows) + '\n')
            runner.check_csv(actual, expected, column_order='any')
            self.assertEqual(expected, before)
            with self.assertRaisesRegex(AssertionError, 'CSV_COLUMN_ORDER'):
                runner.check_csv(actual, expected, column_order='exact')
            rows[-1] = rows[-1].replace(',20.1', ',999')
            actual.write_text(','.join(names) + '\n' + '\n'.join(rows) + '\n')
            with self.assertRaisesRegex(AssertionError, 'CSV_VALUES'):
                runner.check_csv(actual, expected, column_order='any')

    def test_all_87_expected_specifications_have_audited_fields(self):
        names = ([f'{prefix}{i}' for prefix, count in [('n', 20), ('p', 25), ('s', 8), ('q', 10), ('r', 6)]
                  for i in range(1, count + 1)] + [f'v{v}s{i}' for v in range(1, 4) for i in range(1, 7)])
        fields = set()
        for name in names:
            case = runner.scenario(name)
            demo = case['source'] / 'expected-demo.json'
            specifications = [runner.expected_for(case, '/audit/test.lgp')]
            if demo.exists(): specifications.append(runner.read(demo))
            for output in [output for spec in specifications for output in spec.get('outputs', [spec])]:
                for column in output['columns']: fields.update(column)
        self.assertEqual(len(names), 87)
        self.assertEqual(fields, {'name', 'label', 'type', 'types', 'tolerance', 'label_any', 'name_any', 'category_labels_any'})

    def test_outlier_scenarios_resolve_frozen_tasks_and_all_three_ports(self):
        for name, method, counts in [('outlier-sd', 'стандартного отклонения', [22, 0, 1]),
                                     ('outlier-iqr', 'интерквартильной ширины', [22, 1, 1])]:
            case = runner.scenario(name)
            self.assertIn(method, case['prompt'].read_text())
            self.assertEqual(case['export_count'], 3)
            self.assertTrue((case['source'] / 'oracle.py').is_file())
            self.assertEqual(len(list(case['data'].glob('*.csv'))), 1)
            expected = runner.expected_for(case, '/test.lgp')
            self.assertEqual([o['output_port'] for o in expected['outputs']], [0, 1, 2])
            self.assertEqual([len(o['rows']) for o in expected['outputs']], counts)
            self.assertTrue(all(o['ordered'] and o['column_order'] == 'exact' for o in expected['outputs']))
            self.assertTrue(all(c.get('label_any') for o in expected['outputs'] for c in o['columns']))

    def test_n19_file_oracle_accepts_labels_but_rejects_bad_centers_and_extra_rows(self):
        case = runner.scenario('n19')
        output = runner.expected_for(case, '/test.lgp')['outputs'][0]
        with tempfile.TemporaryDirectory() as folder:
            actual = Path(folder) / 'actual.csv'
            rows = [dict(row, Group=str((row['ID'] - 1) // 30)) for row in reversed(output['rows'])]
            command = [sys.executable, '-B', str(case['source'] / 'oracle.py'), str(actual)]
            for data, accepted in [(rows, True), (rows + [rows[0]], False),
                                   ([dict(row, Group=str(row['ID'] % 3)) for row in rows], False)]:
                with actual.open('w') as stream:
                    writer = csv.DictWriter(stream, fieldnames=[c['name'] for c in output['columns']])
                    writer.writeheader()
                    writer.writerows(data)
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, accepted, result.stdout + result.stderr)

    def csv_result(self, expected, text, **options):
        with tempfile.TemporaryDirectory() as folder:
            actual = Path(folder) / 'actual.csv'
            actual.write_text(text)
            return runner.check_csv(actual, expected, **options)

    def test_csv_categories_are_a_bijection_not_fixed_labels(self):
        output = runner.expected_for(runner.scenario('n19'), '/test.lgp')['outputs'][0]
        with tempfile.TemporaryDirectory() as folder:
            actual = Path(folder) / 'actual.csv'
            def write(rows):
                with actual.open('w') as stream:
                    writer = csv.DictWriter(stream, fieldnames=[c['name'] for c in output['columns']])
                    writer.writeheader()
                    writer.writerows(rows)
            rows = [dict(row, Group=str((row['ID'] - 1) // 30)) for row in reversed(output['rows'])]
            write(rows)
            self.assertEqual(runner.check_csv(actual, output), ',')
            for bad in [rows + [rows[0]], [dict(row, Group=str(row['ID'] % 3)) for row in rows],
                        [dict(row, Hours=999) if row['ID'] == 1 else row for row in rows]]:
                write(bad)
                with self.assertRaises(AssertionError): runner.check_csv(actual, output)

    def test_csv_header_freedoms_keep_unique_value_binding(self):
        output = {'columns': [{'name': 'Key', 'type': 'string'},
                              {'name': 'Amount', 'label': 'Old label', 'label_any': True, 'type': 'real'}],
                  'rows': [{'Key': 'A', 'Amount': 2}, {'Key': 'B', 'Amount': 3}]}
        self.csv_result(output, 'New label,Key\n2,A\n3,B\n', header='labels')
        output['columns'][1].update(name_any=True)
        self.csv_result(output, 'Revenue,Key\n2,A\n3,B\n')
        with self.assertRaisesRegex(AssertionError, 'CSV_VALUES'):
            self.csv_result(output, 'Revenue,Key\n3,A\n2,B\n')
        ambiguous = {'columns': [dict(name=name, type='real', name_any=True, label_any=True) for name in ['X', 'Y']],
                     'rows': [{'X': 1, 'Y': 1}]}
        with self.assertRaisesRegex(AssertionError, 'CSV_COLUMN'):
            self.csv_result(ambiguous, 'First,Second\n1,1\n')
        output['columns'][1]['label_any'] = False
        with self.assertRaisesRegex(AssertionError, 'CSV_COLUMN'):
            self.csv_result(output, 'New label,Key\n2,A\n3,B\n', header='labels')

    def test_csv_unspecified_column_order_matches_stock_any(self):
        output = {'columns': [{'name': 'A', 'type': 'integer'}, {'name': 'B', 'type': 'string'}],
                  'rows': [{'A': 1, 'B': 'text'}]}
        self.csv_result(output, 'B,A\ntext,1.0\n')
        output['column_order'] = 'exact'
        with self.assertRaisesRegex(AssertionError, 'CSV_COLUMN'):
            self.csv_result(output, 'B,A\ntext,1\n')

    def test_csv_overlapping_tolerances_use_complete_matching(self):
        output = {'columns': [{'name': 'Value', 'type': 'real', 'tolerance': {'abs': 1}}],
                  'rows': [{'Value': 1}, {'Value': 0}], 'ordered': False}
        self.csv_result(output, 'Value\n0\n2\n')
        output['ordered'] = True
        with self.assertRaisesRegex(AssertionError, 'CSV_VALUES'):
            self.csv_result(output, 'Value\n0\n2\n')
        output['rows'] = [{'Value': 1}]
        output['columns'][0]['tolerance'] = {'abs': 0, 'rel': 0}
        self.csv_result(output, 'Value\n1.0000000000000001\n')
        output['rows'] = [{'Value': 100}]
        output['columns'][0]['tolerance'] = {'abs': 0.01, 'rel': 0.02}
        self.csv_result(output, 'Value\n102\n')
        for value in ['102.01', 'NaN', 'Infinity', '-Infinity']:
            with self.assertRaisesRegex(AssertionError, 'CSV_VALUES'):
                self.csv_result(output, 'Value\n' + value + '\n')

    def test_csv_types_labels_nulls_and_order_remain_checked(self):
        output = {'columns': [{'name': 'Value', 'type': 'integer', 'types': ['integer', 'real'], 'label': 'Number'}],
                  'rows': [{'Value': None}, {'Value': 2}], 'ordered': True}
        self.csv_result(output, 'Number\n""\n2.0\n', header='labels')
        for text in ['Number\n0\n2\n', 'Number\n2\n""\n', 'Number\n""\n3\n']:
            with self.assertRaisesRegex(AssertionError, 'CSV_VALUES'):
                self.csv_result(output, text, header='labels')

    def test_csv_null_marker_is_explicit_and_preserves_other_values(self):
        output = {'columns': [{'name': 'Value', 'type': 'real'},
                              {'name': 'Text', 'type': 'string'}],
                  'rows': [{'Value': None, 'Text': '?'}, {'Value': 0, 'Text': ''}],
                  'ordered': True}
        self.csv_result(output, 'Value,Text\n,?\n0,\n')
        with self.assertRaisesRegex(AssertionError, 'CSV_VALUES'):
            self.csv_result(output, 'Value,Text\n?,?\n0,\n')
        self.csv_result(output, 'Value,Text\n?,?\n0,\n', null_marker='?')
        for text in ['Value,Text\n,?\n0,\n', 'Value,Text\n0,?\n0,\n',
                     'Value,Text\n?,?\n?,\n', 'Value,Text\n?,\n0,\n']:
            with self.subTest(text=text), self.assertRaisesRegex(AssertionError, 'CSV_VALUES'):
                self.csv_result(output, text, null_marker='?')

    def test_corr_null_fixture_declares_csv_marker_separately_from_native_nulls(self):
        expected = runner.expected_for(runner.scenario('corr-null'), '/own/test.lgp')
        self.assertEqual(expected['null_marker'], '?')
        self.assertIsNone(expected['outputs'][0]['rows'][0]['Pirson'])
        self.assertNotIn('null_marker', expected['outputs'][0])

    def test_deadline_is_unknown_with_a_real_failure_journal(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            result = {'scenario': 'n1', 'status': 'PENDING', 'profile': str(path / 'profile')}
            runner.write(path / 'request.json', {})
            runner.write(path / 'results.json', {'head': 'a' * 40, 'tree': 'b' * 40, 'started': 1, 'phase': 'cold', 'runs': [result]})
            instance = runner.Runner(path)
            instance.failure(instance.report['runs'][0], TimeoutError('cold deadline'), path)
            instance.save()
            observed = runner.read(path / 'n1-checks.jsonl')
            self.assertEqual(observed['status'], 'UNKNOWN')
            self.assertEqual(observed['failed_phase'], 'cold')
            self.assertEqual(observed['location'], str(path / 'n1-checks.jsonl') + ':1')
            self.assertEqual(len(observed['failure_load']), 3)
            self.assertIn('| n1 | UNKNOWN |', (path / 'summary.md').read_text())

    def test_download_uses_personal_destination_and_excludes_input_copy(self):
        with tempfile.TemporaryDirectory() as folder:
            profile = Path(folder)
            for base in ['artifacts', 'artifacts/input/output-id']:
                path = profile / base / 'smoke-4-n1-shortages.csv'
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('SKU,Requested\nA,1\n')
            self.assertEqual(runner.downloaded_csv(profile, '/user/smoke-4-n1-shortages.csv'), profile / 'artifacts/smoke-4-n1-shortages.csv')
            with self.assertRaises(AssertionError): runner.downloaded_csv(profile, '/user/shortages.csv')

    def test_port_path_requires_freshness_and_cleanup(self):
        port = {'port': 0, 'schema': [], 'sample': [], 'freshness_basis': 'completed_execution_port_source'}
        reply = {'cleanup_complete': True, 'output': {'ports': [port]}}
        self.assertEqual(runner.port_path(reply, port), 'port')
        self.assertIsNone(runner.port_failure([(44, reply)], 'model.stdout'))
        for key, value in [('freshness_basis', None), ('freshness_basis', 'unknown')]:
            with self.subTest(value=value):
                port[key] = value
                self.assertEqual(runner.port_failure([(44, reply)], 'model.stdout'), 'model.stdout:44')
        port['freshness_basis'] = 'completed_execution_port_source'
        reply['cleanup_complete'] = False
        self.assertEqual(runner.port_failure([(44, reply)], 'model.stdout'), 'model.stdout:44')

    def test_inspect_uses_the_nested_port_receipt(self):
        # Reduced shape from LAB-416 fail-logs/l416-c-jscombined/jscombined/model.stdout:265.
        # inspect.output.outcome is the public action; its output is the read receipt.
        receipt = {'cleanup_complete': True, 'output': {'ports': [{
            'port': 0, 'schema': [], 'sample': [],
            'freshness_basis': 'completed_execution_port_source'}]}}
        reply = {'status': 'SUCCEEDED', 'action_key': 'operation.inspect', 'output': {
            'cleanup_confirmed': True, 'outcome': {'status': 'SUCCEEDED',
                'action_key': 'node.apply', 'cleanup_complete': True, 'output': receipt}}}
        self.assertIsNone(runner.port_failure([(265, reply)], 'model.stdout'))
        reads = list(runner.ports(reply))
        self.assertEqual([runner.port_path(owner, port) for owner, port in reads], ['port'])
        for cleanup in [False, None]:
            receipt['cleanup_complete'] = cleanup
            with self.subTest(cleanup=cleanup):
                self.assertEqual(runner.port_failure([(265, reply)], 'model.stdout'), 'model.stdout:265')
        # A successful sibling or outer wrapper cannot attest this read's cleanup.
        reply['cleanup_complete'] = True
        reply['output']['sibling'] = self.native_reply()
        self.assertEqual(runner.port_failure([(265, reply)], 'model.stdout'), 'model.stdout:265')
        receipt.clear()
        receipt.update(self.native_reply())
        self.assertIsNone(runner.port_failure([(265, reply)], 'model.stdout'))
        self.assertEqual({runner.port_path(owner, port) for owner, port in runner.ports(reply)}, {'native'})
        receipt['execution']['execution_id'] = 'other'
        self.assertEqual(runner.port_failure([(265, reply)], 'model.stdout'), 'model.stdout:265')

    def test_cold_receives_the_last_checked_export_and_its_delimiter(self):
        # LAB-414 repeat/cold.stderr:5: actual.csv was absent; the downloads
        # were actual-1.csv (assignments) and actual-2.csv (centers).
        for count, corrupt in [(1, None), (2, None), (2, 0), (2, 1)]:
            with self.subTest(exports=count, corrupt=corrupt), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / 'points.csv'
                source.write_text('X,Y,RowID\n0,20,1\n')
                case = root / 'cases/repeat'
                (case / 'data').mkdir(parents=True)
                names = ['assignments.csv', 'centers.csv'][:count]
                (case / 'task.md').write_text('Выгрузи ' + ' и '.join(names))
                runner.write(case / 'case.json', {'source_path': str(source), 'attachment': 'path'})
                columns = [
                    [{'name': name, 'type': 'real'} for name in ['Cluster', 'Distance', 'RowID', 'X', 'Y']],
                    [{'name': name, 'type': 'real'} for name in ['Cluster', 'X', 'Y']]][:count]
                rows = [{'Cluster': 2, 'Distance': 0.14142135623730953, 'RowID': 1, 'X': -0.1, 'Y': -0.1},
                        {'Cluster': 0, 'X': 0, 'Y': 20}][:count]
                runner.write(case / 'expected.json', {'package_path': '/test/result.lgp', 'nodes': [],
                    'outputs': [{'output_node_type': 'datamining.clustering', 'output_port': i,
                        'columns': cols, 'rows': [rows[i]]} for i, cols in enumerate(columns)]})
                out = root / 'run'
                out.mkdir()
                runner.write(out / 'request.json', {'case_root': str(root / 'cases'), 'pair': str(root / 'pair'), 'cold': True})
                (root / 'pair').mkdir()
                runner.write(root / 'pair/worker.json', {'package_directory': '/test', 'loginom': {
                    'username': 'test', 'password': 'test', 'url': 'https://example.test', 'api_key': 'test'}})
                runner.write(out / 'results.json', {'head': 'a' * 40, 'tree': 'b' * 40,
                    'started': time.time(), 'runs': [{'scenario': 'repeat', 'status': 'PENDING'}]})
                instance = runner.Runner(out)
                cold_calls = []

                def phase(name, command, folder, **kwargs):
                    instance.report['phase'] = name
                    profile = out / 'repeat/profile'
                    if name == 'setup':
                        (profile / 'data').mkdir(parents=True)
                        (profile / 'config').mkdir()
                        runner.write(folder / 'setup.stdout', {'browser': {'state': 'verified'}})
                    if name == 'model':
                        # Replace the process boundary; model still parses events
                        # and validates every downloaded CSV itself.
                        events = [{'type': 'tool_use', 'sessionID': 'session', 'part': {'state': {
                            'status': 'completed', 'output': json.dumps(reply)}}} for reply in [
                            {'status': 'SUCCEEDED', 'action_key': 'package.save_as', 'output': {'save_completed': True}},
                            {'cleanup_complete': True, 'output': {'ports': [{'port': 0, 'schema': [],
                                'sample': [], 'freshness_basis': 'completed_execution_port_source'}]}}]]
                        (folder / 'model.stdout').write_text('\n'.join(map(json.dumps, events)))
                        runner.write(profile / 'saved-package-cleanup.json', {'package_closed': True, 'logged_out': True})
                        runner.write(profile / 'runtime-close-test.json', {'closed_ack': True})
                        for i, cols in enumerate(columns):
                            delimiter = ',' if i == 0 else ';'
                            (profile / ('run-repeat-' + names[i])).write_text(
                                delimiter.join(c['name'] for c in cols) + '\n' +
                                delimiter.join('999' if i == corrupt and j == 0 else str(rows[i][col['name']])
                                               for j, col in enumerate(cols)) + '\n')
                    if name == 'cold':
                        command = list(map(str, command))
                        actual = Path(command[command.index('--csv') + 1])
                        cold_calls.append(actual.name)
                        self.assertTrue(actual.is_file(), str(actual))
                        self.assertEqual(actual.name, 'actual.csv' if count == 1 else 'actual-2.csv')
                        self.assertEqual(command[command.index('--csv-delimiter') + 1], ',' if count == 1 else ';')
                        self.assertEqual(len(runner.read(Path(command[command.index('--expected') + 1]))['outputs']), count)
                        (folder / 'cold').mkdir()
                        runner.write(folder / 'cold/result.json', {'status': 'PASS', 'settingsReapplied': False,
                            'cleanup': {'package_closed': True, 'logged_out': True}})

                with patch.object(instance, 'build', return_value=root / 'build'), patch.object(instance, 'phase', side_effect=phase):
                    instance.run()
                result = runner.read(out / 'results.json')['runs'][0]
                self.assertEqual(result['status'], 'PASS' if corrupt is None else 'FAIL', result)
                self.assertEqual(len(cold_calls), 1 if corrupt is None else 0)

    def test_types300_d76_requires_successful_cold(self):
        for count, corrupt in [(1, None), (1, 'cold'), (1, 'exact'), (1, 'disabled')]:
            with self.subTest(exports=count, corrupt=corrupt), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / 'points.csv'
                source.write_text('X,Y,RowID\n0,20,1\n')
                case = root / 'cases/types300'
                (case / 'data').mkdir(parents=True)
                names = ['assignments.csv', 'centers.csv'][:count]
                (case / 'task.md').write_text('Выгрузи ' + ' и '.join(names))
                runner.write(case / 'case.json', {'source_path': str(source), 'attachment': 'path'})
                columns = [[{'name': 'SmallReal', 'type': 'real'}, {'name': 'EventAt', 'type': 'datetime'}]]
                rows = [dict(SmallReal=-0.0, EventAt='2027-01-01T00:00:00.001')]
                runner.write(case / 'expected.json', {'package_path': '/test/result.lgp', 'nodes': [],
                    'outputs': [{'output_node_type': 'datamining.clustering', 'output_port': i,
                        'columns': cols, 'rows': [rows[i]]} for i, cols in enumerate(columns)]})
                out = root / 'run'
                out.mkdir()
                runner.write(out / 'request.json', {'case_root': str(root / 'cases'), 'pair': str(root / 'pair'), 'cold': corrupt != 'disabled'})
                (root / 'pair').mkdir()
                runner.write(root / 'pair/worker.json', {'package_directory': '/test', 'loginom': {
                    'username': 'test', 'password': 'test', 'url': 'https://example.test', 'api_key': 'test'}})
                runner.write(out / 'results.json', {'head': 'a' * 40, 'tree': 'b' * 40,
                    'started': time.time(), 'runs': [{'scenario': 'types300', 'status': 'PENDING'}]})
                instance = runner.Runner(out)
                cold_calls = []

                def phase(name, command, folder, **kwargs):
                    instance.report['phase'] = name
                    profile = out / 'types300/profile'
                    if name == 'setup':
                        (profile / 'data').mkdir(parents=True)
                        (profile / 'config').mkdir()
                        runner.write(folder / 'setup.stdout', {'browser': {'state': 'verified'}})
                    if name == 'model':
                        # Replace the process boundary; model still parses events
                        # and validates every downloaded CSV itself.
                        events = [{'type': 'tool_use', 'sessionID': 'session', 'part': {'state': {
                            'status': 'completed', 'output': json.dumps(reply)}}} for reply in [
                            {'status': 'SUCCEEDED', 'action_key': 'package.save_as', 'output': {'save_completed': True}},
                            {'cleanup_complete': True, 'output': {'ports': [{'port': 0, 'schema': [],
                                'sample': [], 'freshness_basis': 'completed_execution_port_source'}]}}]]
                        (folder / 'model.stdout').write_text('\n'.join(map(json.dumps, events)))
                        runner.write(profile / 'saved-package-cleanup.json', {'package_closed': True, 'logged_out': True})
                        runner.write(profile / 'runtime-close-test.json', {'closed_ack': True})
                        for i, cols in enumerate(columns):
                            delimiter = ',' if i == 0 else ';'
                            (profile / ('run-types300-' + names[i])).write_text(
                                delimiter.join(c['name'] for c in cols) + '\n' +
                                delimiter.join(str(rows[i][col['name']]) if corrupt == 'exact' else ('0' if j == 0 else '2027-01-01')
                                               for j, col in enumerate(cols)) + '\n')
                    if name == 'cold':
                        command = list(map(str, command))
                        self.assertIn('--exact-port-windows', command)
                        actual = Path(command[command.index('--csv') + 1])
                        cold_calls.append(actual.name)
                        self.assertTrue(actual.is_file(), str(actual))
                        self.assertEqual(actual.name, 'actual.csv' if count == 1 else 'actual-2.csv')
                        self.assertEqual(command[command.index('--csv-delimiter') + 1], ',' if count == 1 else ';')
                        self.assertEqual(len(runner.read(Path(command[command.index('--expected') + 1]))['outputs']), count)
                        (folder / 'cold').mkdir()
                        runner.write(folder / 'cold/result.json', {'status': 'FAIL' if corrupt == 'cold' else 'PASS', 'settingsReapplied': False,
                            'cleanup': {'package_closed': True, 'logged_out': True}})

                with patch.object(instance, 'build', return_value=root / 'build'), patch.object(instance, 'phase', side_effect=phase):
                    instance.run()
                result = runner.read(out / 'results.json')['runs'][0]
                self.assertEqual(result['status'], runner.D76_STATUS if corrupt is None else 'PASS' if corrupt == 'exact' else 'FAIL', result)
                self.assertIn(result['status'], runner.summary(instance.report))
                if corrupt is None:
                    self.assertEqual(result['d76'], dict(negative_zero=1, midnight_date=1))
                    self.assertIn('negative_zero=1; midnight_date=1', runner.summary(instance.report))
                self.assertEqual(len(cold_calls), 0 if corrupt == 'disabled' else 1)

    def native_reply(self):
        # Public shape observed in smoke-4/q7/s5/model.stdout:48 on v0.3.3.
        return {'cleanup_complete': True, 'node': {'document_id': 'doc', 'workflow_id': 'flow', 'node_id': 'node'},
                'execution': {'status': 'completed', 'execution_id': 'exec'},
                'output': {'workflow_returned': True, 'ports': [{
                    'port': 0, 'port_guid': 'guid', 'fresh': True, 'execution_id': 'exec',
                    'schema': [], 'sample': [], 'exact_table': {'rows': [], 'complete': True},
                    'read_coverage': {'table_complete': True}, 'cell_precision': {'cells': 'exact_native'},
                    'binding': {'read_id': 'native-read', 'document_id': 'doc', 'workflow_id': 'flow',
                                'node_id': 'node', 'port_guid': 'guid',
                                'execution': {'status': 'completed', 'execution_id': 'exec'}}}]}}

    def test_native_path_requires_binding_exactness_and_closed_preview(self):
        reply = self.native_reply()
        port = reply['output']['ports'][0]
        self.assertIsNone(runner.port_failure([(48, reply)], 'model.stdout'))
        self.assertEqual(runner.port_path(reply, port), 'native')
        changes = [('cleanup_complete', False), ('output.workflow_returned', False),
                   ('output.ports', [])]
        for key, value in changes:
            bad = copy.deepcopy(reply)
            obj = bad
            parts = key.split('.')
            for part in parts[:-1]: obj = obj[part]
            obj[parts[-1]] = value
            with self.subTest(key=key):
                self.assertIsNotNone(runner.port_failure([(48, bad)], 'model.stdout'))
        for key, value in [('binding', {}), ('binding.read_id', ''), ('binding.node_id', 'other'),
                           ('binding.port_guid', 'other'), ('binding.document_id', 'other'),
                           ('binding.workflow_id', 'other'), ('binding.execution.execution_id', 'old'),
                           ('binding.execution.status', 'running'),
                           ('cell_precision.cells', 'display'), ('exact_table.complete', False),
                           ('read_coverage.table_complete', False), ('fresh', False)]:
            bad = copy.deepcopy(reply)
            obj = bad['output']['ports'][0]
            parts = key.split('.')
            for part in parts[:-1]: obj = obj[part]
            obj[parts[-1]] = value
            with self.subTest(key=key):
                self.assertEqual(runner.port_failure([(48, bad)], 'model.stdout'), 'model.stdout:48')

    def test_unmarked_port_and_absent_reads_fail(self):
        reply = {'cleanup_complete': True, 'output': {'ports': [{'port': 0, 'schema': [], 'sample': []}]}}
        self.assertEqual(runner.port_failure([(12, reply)], 'model.stdout'), 'model.stdout:12')
        self.assertEqual(runner.port_failure([], 'model.stdout'), 'model.stdout:1')
        native = self.native_reply()
        self.assertEqual(runner.port_failure([(10, native), (12, reply)], 'model.stdout'), 'model.stdout:12')
        native['output']['ports'].append(reply['output']['ports'][0])
        self.assertEqual(runner.port_failure([(10, native)], 'model.stdout'), 'model.stdout:10')

    def test_wait_timeout_then_terminal_result(self):
        with tempfile.TemporaryDirectory() as folder:
            report = {'head': 'a' * 40, 'tree': 'b' * 40, 'phase': 'model', 'runs': [{'scenario': 'n1', 'status': 'PENDING'}]}
            runner.write(Path(folder) / 'results.json', report)
            command = [sys.executable, str(Path(runner.__file__)), 'wait', folder, '--timeout', '0']
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual((result.returncode, result.stdout, result.stderr), (2, '0/1 готово, идёт n1\n', ''))
            report.update(finished=1)
            report['runs'][0]['status'] = 'UNKNOWN'
            runner.write(Path(folder) / 'results.json', report)
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('| n1 | UNKNOWN |', result.stdout)
            self.assertEqual(result.stderr, '')

    def test_start_rejects_invalid_input_before_detach(self):
        with tempfile.TemporaryDirectory() as folder:
            pair = Path(folder) / 'pair'
            pair.mkdir()
            for role in ['worker', 'reviewer']:
                runner.write(pair / (role + '.json'), {'loginom': {'username': 'test'}, 'package_directory': '/test'})
            build = Path(folder) / 'build'
            build.mkdir()
            runner.write(build / 'cli-manifest.json', {'metadata': {'sourceCommit': '0' * 40, 'sourceDirty': False}})
            for scenarios, extra in [('n1,n1', []), ('n999', []), ('n1', ['--build', str(build)])]:
                out = Path(folder) / 'must-not-exist'
                command = [sys.executable, str(Path(runner.__file__)), 'start', '--head', runner.git('rev-parse', 'HEAD'), '--scenarios', scenarios, '--pair', str(pair), '--out', str(out), *extra]
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(out.exists())
                self.assertEqual(result.stdout, '')

    def test_worker_and_phase_survive_missing_launcher_temp(self):
        for exists in [True, False]:
            with self.subTest(launcher_temp_exists=exists), tempfile.TemporaryDirectory() as folder:
                path = Path(folder)
                launcher = path / 'launcher'
                if exists: launcher.mkdir()
                pair = path / 'pair'
                pair.mkdir()
                for role in ['worker', 'reviewer']:
                    runner.write(pair / (role + '.json'), {'loginom': {'username': 'test'}, ('package_directory' if exists else 'personal_folder'): '/test'})
                out = path / ('results' if exists else '.cache/loginom-runs/123')
                argv = ['run-check.py', 'start', '--head', 'HEAD', '--scenarios', 's1', '--pair', str(pair), '--spacing', '0', '--host-load-max', '1000000']
                if exists: argv += ['--out', str(out)]
                inherited = dict(TMPDIR=str(launcher), TMP=str(launcher), TEMP=str(launcher), CODEX_HOME=str(launcher / 'codex'), MULTICA_DAEMON_PORT='12345')
                popen = subprocess.Popen
                def detach(command, **kwargs):
                    return spawn.return_value if '_worker' in command else popen(command, **kwargs)
                mask = os.umask(0o077)
                try:
                    with patch.dict(os.environ, inherited), patch.object(sys, 'argv', argv), redirect_stdout(io.StringIO()), patch.object(runner.subprocess, 'Popen', side_effect=detach) as spawn:
                        spawn.return_value.pid = 123
                        with patch.object(runner.Path, 'home', return_value=path), patch.object(runner.time, 'time_ns', return_value=123):
                            self.assertEqual(runner.main(), 0)
                        environment = spawn.call_args.kwargs.get('env', dict(os.environ))
                    for key in ['TMPDIR', 'TMP', 'TEMP']:
                        self.assertEqual(environment[key], str(out / 'tmp'))
                    self.assertTrue((out / 'tmp').is_dir())
                    self.assertNotIn('CODEX_HOME', environment)
                    self.assertEqual(environment['MULTICA_DAEMON_PORT'], '12345')
                    self.assertEqual(environment.get('HOME'), os.environ.get('HOME'))
                    self.assertEqual(runner.read(out / 'request.json')['pair'], str(pair))
                    if exists: shutil.rmtree(launcher)
                    with patch.dict(os.environ, environment, clear=True):
                        instance = runner.Runner(out)
                        self.assertNotIn('MULTICA_DAEMON_PORT', instance.env)
                        # A real phase child must create files after the launcher's
                        # directory disappears, just as Chromium and the oracle do.
                        instance.phase('probe', [sys.executable, '-c',
                            'import json, os, tempfile; from pathlib import Path; '
                            'p = Path(tempfile.mkdtemp()); '
                            'print(json.dumps(dict(parent=str(p.parent), '
                            'temp=[os.environ[k] for k in ["TMPDIR", "TMP", "TEMP"]], '
                            'codex=os.environ.get("CODEX_HOME"))))'], out)
                    observed = runner.read(out / 'probe.stdout')
                    self.assertEqual(observed['parent'], str(out / 'tmp'))
                    self.assertEqual(observed['temp'], [str(out / 'tmp')] * 3)
                    self.assertIsNone(observed['codex'])
                finally:
                    os.umask(mask)

    def test_arguments_and_load_boundary(self):
        args = runner.arguments(['start', '--head', 'abc123', '--scenarios', 'n1,q7', '--pair', '/pair', '--cold'])
        self.assertEqual((args.host_load_max, args.spacing, args.cold), (8, 60, True))
        self.assertTrue(runner.load_ready((8, 8, 100), 8))
        self.assertFalse(runner.load_ready((7, 8.01, 0), 8))
        self.assertFalse(runner.load_ready((float('nan'), 0, 0), 8))
        with self.assertRaises(SystemExit): runner.arguments(['wait', '/run', '--timeout', '-1'])

    def test_table_failure_details_and_no_raw_logs(self):
        text = runner.summary({'head': 'a' * 40, 'tree': 'b' * 40, 'runs': [
            {'scenario': 'n1', 'status': 'PASS', 'csv': 'PASS', 'read-path': 'native/port', 'start_load': [1, 2]},
            {'scenario': 'q7', 'status': 'FAIL', 'failure_class': 'COLD_FAILED', 'detail': 'bad values', 'location': 'cold/events:17', 'failure_load': [2, 3], 'profile': '/private/profile'}]})
        for word in ['n1 | PASS', '1.00/2.00', 'q7 | FAIL', 'cold/events:17', '/private/profile', 'COLD_FAILED', 'native/port']:
            self.assertIn(word, text)
        self.assertEqual(text.count('FAIL q7:'), 1)
        table = [line for line in text.splitlines() if line.startswith('|')]
        self.assertEqual(len({line.count('|') for line in table}), 1)

    def test_csv_full_file_and_order(self):
        expected = {'columns': [{'name': 'SKU', 'type': 'string'}, {'name': 'Count', 'type': 'integer'}], 'rows': [{'SKU': 'A', 'Count': 2}, {'SKU': 'B', 'Count': 3}], 'ordered': True}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'actual.csv'
            path.write_text('SKU,Count\nA,2\nB,3\n')
            self.assertEqual(runner.check_csv(path, expected), ',')
            path.write_text('SKU,Count\nA,2\nB,999\n')
            with self.assertRaisesRegex(AssertionError, 'CSV_VALUES'): runner.check_csv(path, expected)


if __name__ == '__main__': unittest.main()
