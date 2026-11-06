import json
from pathlib import Path
import tempfile
import unittest
from test_run_check import runner


class LgdTests(unittest.TestCase):
    def test_export_cases_require_real_same_node_transitions(self):
        path, first = '/own/final.lgd', '/own/first.lgd'
        def exported(destination, sha, existed=False, binding=None):
            return {'status': 'SUCCEEDED', 'execution': {'status': 'completed'},
                    'configuration': {'readback': {'kind': 'lgd_export', 'node': {'node_id': 'sink'},
                        'destination': destination, 'bindings': binding or {},
                        'destination_check': {'existed': existed, 'decision': 'replace' if existed else None, 'overwrite': 'replace' if existed else 'reject'}}},
                    'output': {'file_artifacts': [{'destination': destination, 'bytes': 397, 'sha256': sha * 64}]}}
        rejected = {'status': 'FAILED', 'cleanup_complete': True, 'error': {'message': 'LGD destination exists; reject policy preserved it'}}
        rounds = [(1, exported(path, 'a')), (2, rejected), (3, exported(path, 'b', True))]
        runner.check_lgd_export_case(rounds, 'overwrite', path, first)
        for mutate in [lambda r: r.pop(1),
                       lambda r: r[-1][1]['configuration']['readback']['node'].update(node_id='other'),
                       lambda r: r[-1][1]['output']['file_artifacts'][0].update(sha256='a' * 64),
                       lambda r: r[-1][1]['configuration']['readback']['destination_check'].update(decision='reject')]:
            changed = json.loads(json.dumps(rounds)); mutate(changed)
            with self.assertRaises(AssertionError): runner.check_lgd_export_case(changed, 'overwrite', path, first)
        binding = {'destination': {'variable': 'LgdPath'}}
        rounds = [(1, exported(first, 'a', binding=binding)), (2, exported(path, 'a', binding=binding))]
        runner.check_lgd_export_case(rounds, 'variable', path, first)
        for mutate in [lambda r: r[-1][1]['configuration']['readback'].update(bindings={}),
                       lambda r: r[-1][1]['configuration']['readback'].update(destination=first),
                       lambda r: r[-1][1]['configuration']['readback']['node'].update(node_id='other')]:
            changed = json.loads(json.dumps(rounds)); mutate(changed)
            with self.assertRaises(AssertionError): runner.check_lgd_export_case(changed, 'variable', path, first)

    def test_checksum_switch_requires_two_fresh_full_reads_on_same_node(self):
        def result(checksum, execution, node='same'):
            return {'status': 'SUCCEEDED', 'cleanup_complete': True, 'node': {'node_id': node},
                    'configuration': {'readback': {'kind': 'lgd_import', 'source': {
                        'source_path': '/own/hash-checksum-both.lgd', 'checksum': checksum}}},
                    'execution': {'status': 'completed', 'execution_id': execution},
                    'output': {'ports': [{'port': 0, 'sample_complete': True, 'schema': [{'name': 'Id', 'type': 'integer'}],
                                          'sample': [{'Id': {'type': 'integer', 'value': 1}}],
                                          'freshness_basis': 'completed_execution_port_source'}]}}
        first, second = result(True, 'one'), result(False, 'two')
        runner.check_lgd_checksum_switch([(1, first), (2, second)], 'checksum-both.lgd')
        for replies in [[(1, second)], [(1, first), (2, result(False, 'one'))],
                        [(1, first), (2, result(False, 'two', 'foreign'))]]:
            with self.assertRaisesRegex(AssertionError, 'SAME_NODE_MISSING'):
                runner.check_lgd_checksum_switch(replies, 'checksum-both.lgd')
        second['output']['ports'][0]['sample'][0]['Id']['value'] = 2
        with self.assertRaisesRegex(AssertionError, 'VALUES_CHANGED'):
            runner.check_lgd_checksum_switch([(1, first), (2, second)], 'checksum-both.lgd')

    def test_source_csv_cannot_substitute_for_a_failed_lgd_roundtrip(self):
        reply = {'status': 'SUCCEEDED', 'cleanup_complete': True,
                 'configuration': {'readback': {'kind': 'lgd_import'}},
                 'execution': {'status': 'completed'}, 'output': {'ports': [{
                     'port': 0, 'schema': [], 'sample': [], 'sample_complete': True,
                     'row_count': 5, 'freshness_basis': 'completed_execution_port_source'}]}}
        runner.check_lgd_import_result([(1, reply)], 5)
        for kind, status, complete in [('text_import', 'SUCCEEDED', True),
                                       ('lgd_import', 'AMBIGUOUS', True),
                                       ('lgd_import', 'SUCCEEDED', False)]:
            changed = json.loads(json.dumps(reply))
            changed['configuration']['readback']['kind'] = kind
            changed['status'] = status
            changed['output']['ports'][0]['sample_complete'] = complete
            with self.assertRaises(AssertionError): runner.check_lgd_import_result([(1, changed)], 5)

    def test_binary_source_is_a_user_path_without_provider_file_parts(self):
        class Captured(Exception): pass
        for name in ['lgd-import', 'lgd-properties', 'lgd-corrupt', 'lgd-import-compression']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                stage, workspace, profile = [root / n for n in ['stage', 'workspace', 'profile']]
                for p in [stage, workspace, profile]: p.mkdir()
                instance = object.__new__(runner.Runner)
                instance.out, instance.env, instance.current, instance.options = root, {}, {}, {}
                case = runner.scenario(name)
                sources = [case['data'] / name for name in case['input_files']]
                def phase(phase, command, *args, **kwargs):
                    self.assertEqual(phase, 'model')
                    self.assertNotIn('--file', command)
                    for source in sources:
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
                        'status': 'completed', 'input': {'target': {'type': 'imports.lgd'}}, 'output': json.dumps({'state': 'running'})}}},
                        {'type': 'tool_use', 'sessionID': 'session', 'part': {'tool': 'loginom_dock_node_wait', 'state': {
                            'status': 'error', 'error': json.dumps(failure)}}},
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
