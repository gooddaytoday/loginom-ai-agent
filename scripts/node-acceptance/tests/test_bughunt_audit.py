import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'bughunt-audit.py'
FIXTURES = Path(__file__).parent / 'fixtures/bughunt-audit'


class BughuntAuditTests(unittest.TestCase):
    def run_audit(self, *args):
        return subprocess.run([sys.executable, '-B', str(SCRIPT), *map(str, args)],
                              capture_output=True, text=True)

    def report(self, *args):
        result = self.run_audit(*args, '--json')
        self.assertIn(result.returncode, (0, 1), result.stderr)
        return result, json.loads(result.stdout)

    def test_counts_receipts_repeats_recovery_tokens_and_text(self):
        result, report = self.report(FIXTURES / 'run')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(report['verdict'], 'OK')
        base, follow = report['stages']
        self.assertEqual((base['scenario'], base['stage']), ('bh-follow', 'bh-base'))
        self.assertEqual(base['tool_calls'], 10)
        self.assertEqual(base['loginom_calls'], 8)
        self.assertEqual(base['errors'], 2)
        self.assertEqual({e['code'] for e in base['error_details']}, {'BAD_INPUT', 'DENIED'})
        self.assertEqual(base['repeats'], 1)
        self.assertEqual(base['recovery'], dict(operation_recover=1, browser_recovery=1, operation_inspect=1))
        self.assertEqual(base['nodes'], dict(created=1, by_type={'transform.sorting': 1}, deleted=1))
        self.assertEqual([t['tool'] for t in base['other_tools']], ['bash', 'write'])
        self.assertEqual(base['other_tools'][0]['command'], 'echo synthetic')
        self.assertEqual(base['other_tools'][1]['command'], '/synthetic/note.txt')
        self.assertEqual(base['tokens'], dict(input=15, output=9, reasoning=3, cache=dict(read=8, write=2)))
        self.assertAlmostEqual(base['cost'], 0.03)
        self.assertEqual(base['final_text'], 'Final synthetic answer')
        self.assertEqual(follow['tool_calls'], 1)
        self.assertEqual(base['delivered_files'], ['/synthetic/forbidden-result.csv'])

    def test_budgets_are_per_stage_and_forbid_checks_full_inputs_and_deliveries(self):
        result, report = self.report(FIXTURES / 'run', '--cases', FIXTURES / 'cases')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(report['verdict'], 'ACTION_BUDGET_EXCEEDED')
        base, follow = report['stages']
        self.assertEqual(base['verdict'], 'ACTION_BUDGET_EXCEEDED')
        self.assertEqual({v['rule'] for v in base['violations']},
                         {'max_tool_calls', 'max_errors', 'max_nodes', 'forbid'})
        self.assertEqual({v['substring'] for v in base['violations'] if v['rule'] == 'forbid'},
                         {'hidden-marker', 'forbidden-result'})
        self.assertEqual(follow['verdict'], 'OK')
        self.assertEqual(follow['budget']['max_tool_calls'], 1)

    def test_markdown_contains_table_and_violation_details(self):
        result = self.run_audit(FIXTURES / 'run', '--cases', FIXTURES / 'cases')
        self.assertEqual(result.returncode, 1, result.stderr)
        for text in ['| Сценарий | Этап |', '| bh-follow | bh-base | 10 | 8 | 2 | 1 |',
                     'ACTION_BUDGET_EXCEEDED', 'max_nodes', 'hidden-marker',
                     'forbidden-result', 'Final synthetic answer', '0.03', 'BAD_INPUT']:
            self.assertIn(text, result.stdout)

    def temp_run(self, events):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        stage = root / 'sample' / 'sample'
        stage.mkdir(parents=True)
        (stage / 'model.stdout').write_text('\n'.join(json.dumps(e) for e in events), encoding='utf-8')
        return root

    def tool(self, tool, output=None, **input_data):
        return dict(type='tool_use', part=dict(type='tool', tool=tool,
                    state=dict(status='completed', input=input_data, output=json.dumps(output or {}))))

    def test_all_failure_statuses_and_error_codes_count_once(self):
        events = [self.tool('loginom_dock_node_read', dict(status=s, code=s))
                  for s in ['FAILED', 'NOT_APPLIED', 'AMBIGUOUS', 'REJECTED']]
        events += [dict(type='tool_use', part=dict(tool='bash', state=dict(
            status='error', input={}, output='{"status":"FAILED"}', error='synthetic failure')))]
        _, report = self.report(self.temp_run(events))
        self.assertEqual(report['stages'][0]['errors'], 5)

    def test_call_updates_are_not_repeated_calls(self):
        start = self.tool('loginom_dock_node_read')
        start['part'].update(callID='same-call', id='part-one')
        start['part']['state']['status'] = 'running'
        finish = json.loads(json.dumps(start))
        finish['part']['state']['status'] = 'completed'
        again = json.loads(json.dumps(finish))
        again['part']['callID'] = 'another-call'
        again['part']['id'] = 'part-two'
        _, report = self.report(self.temp_run([start, finish, again]))
        self.assertEqual(report['stages'][0]['tool_calls'], 2)
        self.assertEqual(report['stages'][0]['repeats'], 1)

    def test_failed_node_creation_and_delete_do_not_count_as_success(self):
        create = self.tool('loginom_dock_node_apply', dict(status='FAILED'))
        create['part']['state']['input'] = dict(target=dict(kind='new'), type='transform.sorting')
        delete = self.tool('loginom_dock_node_delete', dict(status='REJECTED'))
        _, report = self.report(self.temp_run([create, delete]))
        self.assertEqual(report['stages'][0]['nodes'], dict(created=0, by_type={}, deleted=0))

    def test_final_text_is_last_text_and_truncated(self):
        root = self.temp_run([dict(type='text', part=dict(text='earlier')),
                              dict(type='text', part=dict(text='я' * 250))])
        _, report = self.report(root)
        self.assertEqual(report['stages'][0]['final_text'], 'я' * 200)

    def test_error_and_session_events_are_visible_without_inventing_tool_calls(self):
        root = self.temp_run([dict(type='session.status', status=dict(type='idle')),
                              dict(type='error', error=dict(name='APIError', data=dict(message='synthetic')))])
        _, report = self.report(root)
        self.assertEqual(report['stages'][0]['tool_calls'], 0)
        self.assertEqual(report['stages'][0]['session_errors'][0]['name'], 'APIError')

    def test_invalid_inputs_exit_two_with_location(self):
        for contents in ['not json', '[]', '{"type":"tool_use","part":null}',
                         '{"type":"step_finish","part":{"cost":"oops"}}']:
            with self.subTest(contents=contents):
                root = self.temp_run([])
                (root / 'sample/sample/model.stdout').write_text(contents, encoding='utf-8')
                result = self.run_audit(root)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn('model.stdout:1', result.stderr)

    def test_empty_and_missing_directories_exit_two(self):
        root = self.temp_run([])
        for path in [root, root / 'missing']:
            self.assertEqual(self.run_audit(path).returncode, 2)

    def test_bad_cases_and_budgets_exit_two(self):
        root = self.temp_run([dict(type='text', part=dict(text='done'))])
        cases = root / 'cases'
        case = cases / 'sample'
        case.mkdir(parents=True)
        for budget in [None, [], {'max_nodes': -1}, {'max_errors': True},
                       {'max_tool_calls': 1.5}, {'forbid': 'no'}, {'forbid': ['']}, {'typo': 1}]:
            with self.subTest(budget=budget):
                (case / 'case.json').write_text(json.dumps(dict(budget=budget)))
                self.assertEqual(self.run_audit(root, '--cases', cases).returncode, 2)
        self.assertEqual(self.run_audit(root, '--cases', root / 'absent').returncode, 2)

    def test_missing_optional_case_json_has_no_budget(self):
        root = self.temp_run([dict(type='text', part=dict(text='done'))])
        (root / 'cases/sample').mkdir(parents=True)
        result, report = self.report(root, '--cases', root / 'cases')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(report['stages'][0]['budget'], {})

    def test_missing_stage_case_is_input_error(self):
        root = self.temp_run([dict(type='text', part=dict(text='done'))])
        (root / 'cases').mkdir()
        self.assertEqual(self.run_audit(root, '--cases', root / 'cases').returncode, 2)

    def test_exact_budget_limits_pass_and_forbid_is_scoped(self):
        event = self.tool('loginom_dock_node_read')
        event['part']['state']['input'] = {'query': 'allowed-in-loginom'}
        root = self.temp_run([event])
        (root / 'cases/sample').mkdir(parents=True)
        (root / 'cases/sample/case.json').write_text(json.dumps(dict(budget=dict(
            max_tool_calls=1, max_errors=0, max_nodes=0, forbid=['allowed-in-loginom']))))
        result, _ = self.report(root, '--cases', root / 'cases')
        self.assertEqual(result.returncode, 0)

    def test_markdown_escapes_cells(self):
        root = self.temp_run([self.tool('bash|tool', command='echo a|b\nnext')])
        result = self.run_audit(root)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('bash\\|tool', result.stdout)

    def test_target_type_and_partial_created_node_are_counted(self):
        event = self.tool('loginom_dock_node_apply', dict(status='FAILED', node=dict(node_id='created')))
        event['part']['state']['input'] = dict(target=dict(kind='new', type='imports.text'))
        _, report = self.report(self.temp_run([event]))
        self.assertEqual(report['stages'][0]['nodes'], dict(created=1, by_type={'imports.text': 1}, deleted=0))

    def test_verified_delivery_destination_and_long_command(self):
        delivery = self.tool('loginom_dock_artifact_delivery_start', dict(status='SUCCEEDED', output=dict(
            destination='/synthetic/input.csv', upload_completion_verified=True)))
        bash = self.tool('bash', command='x' * 150)
        _, report = self.report(self.temp_run([delivery, bash]))
        self.assertEqual(report['stages'][0]['delivered_files'], ['/synthetic/input.csv'])
        self.assertEqual(report['stages'][0]['other_tools'][0]['command'], 'x' * 120)

    def test_malformed_loginom_output_is_input_error(self):
        event = self.tool('loginom_dock_node_read')
        event['part']['state']['output'] = 'broken JSON receipt'
        result = self.run_audit(self.temp_run([event]))
        self.assertEqual(result.returncode, 2)
        self.assertIn('model.stdout:1', result.stderr)

    def test_malformed_target_is_input_error(self):
        event = self.tool('loginom_dock_node_apply')
        event['part']['state']['input'] = dict(target=None)
        result = self.run_audit(self.temp_run([event]))
        self.assertEqual(result.returncode, 2)

    def test_forbid_matches_windows_path_without_json_escape_changes(self):
        root = self.temp_run([self.tool('write', filePath='C:\\synthetic\\blocked.csv')])
        (root / 'cases/sample').mkdir(parents=True)
        (root / 'cases/sample/case.json').write_text(json.dumps(dict(budget=dict(forbid=['synthetic\\blocked']))))
        result, _ = self.report(root, '--cases', root / 'cases')
        self.assertEqual(result.returncode, 1)


if __name__ == '__main__':
    unittest.main()
