import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from test_run_check import runner


class ExecutionErrorTests(unittest.TestCase):
    def exercise(self, fault=None, name='throw1'):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder, profile, workspace = [root / p for p in ['run', 'profile', 'workspace']]
            for p in [folder, profile, workspace]: p.mkdir()
            spec = runner.scenario(name)
            source = spec['data'] / spec['input_files'][0]
            (profile / 'artifacts').mkdir()
            (profile / 'artifacts' / (hashlib.sha256(source.read_bytes()).hexdigest()+'-0-'+source.name)).write_bytes(source.read_bytes())
            expected = runner.expected_for(spec, '/test/run.lgp')
            message = expected['execution_error']['text']
            error = dict(status='FAILED', state='settled', action_key='node.apply',
                         error=dict(code='NODE_EXECUTION_FAILED', message=message))
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

    def test_error_modes_keep_save_and_cleanup(self):
        for name in ['linreg-short', 'throw1']:
            with self.subTest(name=name): self.exercise(name=name)
        for fault in ['error state', 'inspect', 'snapshot']:
            with self.subTest(fault=fault): self.exercise(fault)

    def test_error_expectation_does_not_hide_failures(self):
        for fault, code in [('wrong error', 'EXPECTED_EXECUTION_ERROR_MISSING'),
                            ('echo', 'EXPECTED_EXECUTION_ERROR_MISSING'),
                            ('no answer', 'EXECUTION_ERROR_NOT_REPORTED'),
                            ('export', 'UNEXPECTED_EXPORT'), ('download', 'UNEXPECTED_CSV'),
                            ('no save', 'SAVE_NOT_CONFIRMED'),
                            ('cleanup', 'MAIN_CLEANUP_UNCONFIRMED'), ('no ack', 'RUNTIME_CLOSE_ACK_MISSING')]:
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, code):
                self.exercise(fault)
