import copy
from contextlib import redirect_stdout
import csv
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('run_check', Path(__file__).resolve().parents[1] / 'run-check.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunCheckTests(unittest.TestCase):
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

    def test_memory_observation_is_scoped_to_its_exact_process(self):
        instance = runner.Runner.__new__(runner.Runner)
        usage = instance.memory(os.getpid())
        self.assertGreater(usage['agent'], 0)
        self.assertEqual(usage['host'], 0)
        self.assertEqual(usage['runtime'], 0)

    def test_all_regression_names_resolve_real_inputs(self):
        names = ([f'n{i}' for i in range(1, 21)] + [f'p{i}' for i in range(1, 26)]
                 + [f'q{i}' for i in range(1, 11)] + [f'r{i}' for i in range(1, 7)]
                 + [f's{i}' for i in range(1, 9)]
                 + [f'v{v}s{i}' for v in range(1, 4) for i in range(1, 7)])
        for name in names:
            with self.subTest(name=name):
                case = runner.scenario(name)
                self.assertTrue(case['prompt'].is_file())
                self.assertTrue((case['source'] / 'oracle.py').is_file())
                self.assertTrue(case['data'].is_dir())
        for name in ['', 'p0', 'p26', 'v0s1', 'v4s1', 'v1s7', 'r0', 'r7', 'n21', 'q11', 's9', '../n1', 'clustering']:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Unknown scenario'):
                runner.scenario(name)

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
