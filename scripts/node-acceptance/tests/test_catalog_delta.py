import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from test_run_check import runner


class TreeOnlyTests(unittest.TestCase):
    def test_tree_read_is_required_and_cold_receives_no_csv(self):
        for missing in [False, True]:
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                out = root / 'run'
                out.mkdir()
                (root / 'pair').mkdir()
                runner.write(root / 'pair/worker.json', dict(package_directory='/test', loginom=dict(
                    username='test', password='test', url='https://example.test')))
                runner.write(out / 'request.json', dict(pair=str(root / 'pair'), cold=True))
                runner.write(out / 'results.json', dict(head='a'*40, tree='b'*40, started=runner.time.time(),
                    runs=[dict(scenario='tree-null-leaves', status='PENDING')]))
                instance = runner.Runner(out)
                expected = runner.expected_for(runner.scenario('tree-null-leaves'), '/test/tree.lgp')['proposed_tree_output']
                schema = [dict(index=0, path='', name='Root', is_container=True, is_array=False, children=[])]
                for path, kind in expected['schema_types'].items():
                    parent = next(n for n in schema if n['path'] == path.rsplit('/', 1)[0])
                    index = len(schema)
                    parent['children'].append(index)
                    schema.append(dict(index=index, path=path, name=path.rsplit('/', 1)[1],
                        type='object' if kind == 'object_array' else kind, is_array=kind == 'object_array', children=[]))
                instances = []
                def add(node, parent=None, path=''):
                    index = len(instances)
                    binding = next(n for n in schema if n['path'] == path)
                    value = dict(index=index, parent=parent, path=node['path'], schema_index=binding['index'], type=node['type'])
                    instances.append(value)
                    if 'children' in node:
                        value['children'] = [add(child, index, path if node['type'] == 'array' else path+'/'+child['path'].rsplit('/', 1)[1])
                                             for child in node['children']]
                    else:
                        null = node['type'] == 'null'
                        value.update(type=binding['type'], is_null=null, value=node['value'], precision='exact_null' if null else
                            'exact_integer' if node['type'] == 'integer' else 'source_text')
                    return index
                add(expected['document'])
                port = dict(port=0, port_kind='tree', sample_complete=True, freshness_basis='completed_execution_port_source',
                    tree=dict(complete=True, schema=schema, instances=instances, node_count=len(instances), max_depth=4))
                cold_calls = []
                def phase(name, command, folder, **kwargs):
                    instance.report['phase'] = name
                    profile = out / 'tree-null-leaves/profile'
                    if name == 'setup':
                        (profile / 'data').mkdir(parents=True)
                        (profile / 'config').mkdir()
                        runner.write(folder / 'setup.stdout', dict(browser=dict(state='verified')))
                    if name == 'model':
                        replies = [dict(status='SUCCEEDED', action_key='package.save_as', output=dict(save_completed=True))]
                        if not missing:
                            replies.append(dict(cleanup_complete=True, node=dict(node_id='tree'),
                                configuration=dict(readback=dict(kind='json_to_tree')), output=dict(ports=[port])))
                        (folder / 'model.stdout').write_text('\n'.join(json.dumps(dict(type='tool_use', sessionID='session',
                            part=dict(state=dict(status='completed', output=json.dumps(reply))))) for reply in replies))
                        runner.write(profile / 'saved-package-cleanup.json', dict(package_closed=True, logged_out=True))
                        runner.write(profile / 'runtime-close-test.json', dict(closed_ack=True))
                    if name == 'cold':
                        self.assertNotIn('--csv', command)
                        cold_calls.append(command)
                        (folder / 'cold').mkdir()
                        runner.write(folder / 'cold/result.json', dict(status='PASS', settingsReapplied=False,
                            cleanup=dict(package_closed=True, logged_out=True)))
                with patch.object(instance, 'build', return_value=root / 'build'), patch.object(instance, 'phase', side_effect=phase):
                    instance.run()
                result = runner.read(out / 'results.json')['runs'][0]
                self.assertEqual(result['status'], 'FAIL' if missing else 'PASS', result)
                self.assertEqual(len(cold_calls), 0 if missing else 1)
                if missing: self.assertEqual(result['failure_class'], 'TREE_READ_MISSING')
                else: self.assertEqual(result['tree-read'], 'PASS')


class DuplicatesCatalogTests(unittest.TestCase):
    def test_typed_inputs_use_approved_tasks_and_exact_expectations(self):
        node = runner.REPO / 'docs/node-development/nodes/duplicates'
        for name, kind, expected in [('duplicates-typed', 'keys', 'expected.json'),
                                     ('duplicates-empty', 'empty', 'expected-empty.json'),
                                     ('duplicates-singleton', 'singleton', 'expected-singleton.json')]:
            with self.subTest(name=name):
                spec = runner.scenario(name)
                self.assertEqual(spec['prompt'], node / ('acceptance/task-typed-keys.md' if kind == 'keys' else 'acceptance/task-' + kind + '.md'))
                self.assertEqual(spec['input_files'], ['typed-' + kind + '.csv'])
                self.assertEqual(spec['data'], node / 'fixtures')
                self.assertIsNone(spec['base'])
                self.assertEqual(spec['oracle'], node / 'acceptance/modes/oracle.py')
                approved = runner.read(node / 'acceptance/modes' / expected)
                self.assertEqual(runner.expected_for(spec, '/test/run.lgp'), dict(approved, package_path='/test/run.lgp'))


class ExecutionErrorTests(unittest.TestCase):
    def exercise(self, fault=None, name='throw1'):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder, profile, workspace = [root / p for p in ['run', 'profile', 'workspace']]
            for p in [folder, profile, workspace]: p.mkdir()
            spec = runner.scenario(name)
            source = spec['data'] / spec['input_files'][0]
            (profile / 'artifacts').mkdir()
            # Admission prefixes identify the message's file group, not file bytes.
            (profile / 'artifacts' / ('0'*64+'-0-'+source.name)).write_bytes(source.read_bytes())
            if fault == 'modified input':
                (profile / 'artifacts' / ('0'*64+'-0-'+source.name)).write_text('changed')
            if fault == 'renamed input':
                (profile / 'artifacts' / source.name).write_bytes(source.read_bytes())
            expected = runner.expected_for(spec, '/test/run.lgp')
            message = expected['execution_error']['text']
            error = dict(status='FAILED', state='settled', action_key='node.apply',
                         error=dict(code='NODE_EXECUTION_FAILED', message=message))
            if fault == 'bad port':
                error['output'] = dict(ports=[dict(port=0, schema=[], sample=[])])
            if fault == 'wrong error': error['error']['message'] = 'MCP Request timed out'
            if fault == 'echo':
                error = dict(status='SUCCEEDED', configuration=dict(code=message))
            def call(tool, request, receipt, status='completed'):
                return dict(type='tool_use', sessionID='session', part=dict(tool=tool,
                            state=dict(status=status, input=request,
                                       **{('error' if status == 'error' else 'output'): json.dumps(receipt)})))
            events = [call('loginom_dock_node_wait', {}, error,
                           'error' if fault == 'error state' else 'completed')]
            if fault == 'inspect':
                events = [call('loginom_dock_operation_inspect', {}, dict(output=dict(outcome=error)))]
            if fault == 'snapshot':
                events = [dict(type='tool_use', sessionID='session', part=dict(tool='loginom_browser_snapshot',
                               state=dict(status='completed', input={}, output='Ошибка: '+message)))]
            if fault != 'no save':
                events.append(call('loginom_dock_action_run', dict(action_key='package.save_checkpoint'),
                                   dict(status='SUCCEEDED', action_key='package.save_checkpoint',
                                        output=dict(save_completed=True))))
            if fault == 'export':
                events.append(call('loginom_dock_node_apply', dict(target=dict(type='exports.text')), {}))
            events.append(dict(type='text', part=dict(text='Ошибка: '+message if fault != 'no answer' else 'Готово')))
            runner.write(profile / 'saved-package-cleanup.json', dict(package_closed=True,
                         logged_out=fault != 'cleanup', unsaved_changes_discarded=False))
            if fault != 'no ack': runner.write(profile / 'runtime-close-test.json', dict(closed_ack=True))
            if fault == 'download':
                (profile / 'artifacts/output').mkdir(parents=True)
                (profile / 'artifacts/output/result.csv').write_text('Broken\n')
            instance = runner.Runner.__new__(runner.Runner)
            instance.out, instance.env, instance.current, instance.options = root, {}, {}, {}
            def phase(*args, **kwargs):
                (folder / 'model.stdout').write_text('\n'.join(json.dumps(e) for e in events))
            with patch.object(instance, 'phase', side_effect=phase):
                result = instance.model(name, folder, profile, workspace, '/test/run.lgp',
                                        dict(package_directory='/test'), root / 'build')
            prompt = (folder / 'task.md').read_text()
            self.assertNotIn('Выгрузи и скачай полный итоговый CSV', prompt)
            self.assertNotIn('Выгрузи и скачай таблицы в файлы', prompt)
            self.assertEqual(instance.current['execution-error'], 'PASS')
            self.assertEqual(instance.current['save'], 'PASS')
            self.assertEqual(instance.current['cleanup'], 'main PASS')
            self.assertEqual(instance.current['cold'], '— (expected execution error)')
            self.assertIsNone(result[2])
            if fault == 'bad port':
                self.assertEqual(instance.current.get('failure_class'), 'PORT_READ_INVALID')
                return result
            self.assertNotIn('failure_class', instance.current)
            self.assertEqual(instance.current['port-read'], '— (expected execution error)')

    def test_error_modes_keep_save_and_cleanup(self):
        for name in ['linreg-short', 'throw1', 'tree-parent-cycle', 'tree-parent-orphan']:
            with self.subTest(name=name): self.exercise(name=name)
        for fault in ['error state', 'inspect', 'snapshot']:
            with self.subTest(fault=fault): self.exercise(fault)

    def test_returned_ports_still_require_native_evidence(self):
        self.exercise('bad port')

    def test_error_expectation_does_not_hide_failures(self):
        for fault, code in [('wrong error', 'EXPECTED_EXECUTION_ERROR_MISSING'),
                            ('echo', 'EXPECTED_EXECUTION_ERROR_MISSING'),
                            ('no answer', 'EXECUTION_ERROR_NOT_REPORTED'),
                            ('export', 'UNEXPECTED_EXPORT'), ('download', 'UNEXPECTED_CSV'),
                            ('modified input', 'UNEXPECTED_CSV'), ('renamed input', 'UNEXPECTED_CSV'),
                            ('no save', 'SAVE_NOT_CONFIRMED'),
                            ('cleanup', 'MAIN_CLEANUP_UNCONFIRMED'), ('no ack', 'RUNTIME_CLOSE_ACK_MISSING')]:
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, code):
                self.exercise(fault)
