import json
from pathlib import Path
import tempfile
import unittest
from test_run_check import runner


class LgdTests(unittest.TestCase):
    def test_binary_source_is_a_user_path_without_provider_file_parts(self):
        class Captured(Exception): pass
        for name in ['lgd-import', 'lgd-properties', 'lgd-corrupt']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                stage, workspace, profile = [root / n for n in ['stage', 'workspace', 'profile']]
                for p in [stage, workspace, profile]: p.mkdir()
                instance = object.__new__(runner.Runner)
                instance.out, instance.env, instance.current, instance.options = root, {}, {}, {}
                case = runner.scenario(name)
                source = case['data'] / case['input_files'][0]
                def phase(phase, command, *args, **kwargs):
                    self.assertEqual(phase, 'model')
                    self.assertNotIn('--file', command)
                    self.assertIn(str(workspace / source.name), command[-1])
                    self.assertEqual((workspace / source.name).read_bytes(), source.read_bytes())
                    self.assertNotIn(str(case['oracle']), command[-1])
                    raise Captured()
                instance.phase = phase
                with self.assertRaises(Captured):
                    instance.model(name, stage, profile, workspace, '/own/run.lgp', {'package_directory': '/own'}, root / 'build')

    def test_corrupt_requires_native_refusal_and_confirmed_main_cleanup(self):
        for clean, settled in [(True, True), (False, True), (True, False)]:
            with self.subTest(clean=clean, settled=settled), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                stage, workspace, profile = [root / n for n in ['stage', 'workspace', 'profile']]
                for p in [stage, workspace, profile]: p.mkdir()
                instance = object.__new__(runner.Runner)
                instance.out, instance.env, instance.current, instance.options = root, {}, {}, {}
                failure = {'status': 'FAILED' if settled else 'AMBIGUOUS', 'cleanup_complete': settled,
                           'execution': {'status': 'not_requested'}, 'output': {'ports': []},
                           'error': {'message': 'Контрольная сумма блока не совпадает'}}
                def phase(name, command, folder, **kwargs):
                    events = [{'type': 'tool_use', 'sessionID': 'session', 'part': {'tool': 'loginom_dock_node_apply', 'state': {
                        'status': 'completed', 'input': {'target': {'type': 'imports.lgd'}}, 'output': json.dumps(failure)}}},
                        {'type': 'tool_use', 'sessionID': 'session', 'part': {'state': {'status': 'completed', 'output': json.dumps({
                            'status': 'SUCCEEDED', 'action_key': 'package.save_checkpoint', 'output': {'save_completed': True}})}}},
                        {'type': 'text', 'sessionID': 'session', 'part': {'text': failure['error']['message']}}]
                    (folder / 'model.stdout').write_text('\n'.join(map(json.dumps, events)))
                    runner.write(profile / 'saved-package-cleanup.json', {'package_closed': clean, 'logged_out': clean})
                    runner.write(profile / 'runtime-close-test.json', {'closed_ack': True})
                instance.phase = phase
                call = lambda: instance.model('lgd-corrupt', stage, profile, workspace, '/own/run.lgp', {'package_directory': '/own'}, root / 'build')
                if clean and settled:
                    call()
                    self.assertEqual(instance.current['cleanup'], 'main PASS')
                else:
                    with self.assertRaises(AssertionError): call()
