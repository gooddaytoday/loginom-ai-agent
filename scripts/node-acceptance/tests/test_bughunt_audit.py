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

    def dock(self, name, output=None, **data):
        return self.tool('loginom_dock_' + name, output, **data)

    def patterns(self, events, runtime=()):
        root = self.temp_run(events)
        if runtime:
            profile = root / 'sample/profile'
            profile.mkdir()
            (profile / 'execution-events.jsonl').write_text(
                '\n'.join(json.dumps(event) for event in runtime), encoding='utf-8')
        result, report = self.report('--patterns', root)
        self.assertEqual(result.returncode, 0)
        return report['runs'][0]['cases']

    def test_multiple_json_blocks_and_separate_error_result(self):
        call = self.dock('node_apply', operation_id='original')
        call['part'].update(callID='call')
        call['part']['state'].update(status='pending')
        call['part']['state'].pop('output')
        result = dict(type='tool_result', tool_call_id='call', isError=True, content=[
            dict(type='text', text='{"status":"NOT_APPLIED","error":{"code":"RETRY"}}\n'
                 '{"next_step":{"tool":"dock_node_apply","instruction":"Try again."}}\n'
                 'Verify the current state.'),
        ])
        retry = self.dock('node_apply', {'state': 'running'}, operation_id='new')
        _, legacy = self.report(self.temp_run([call, result, retry]))
        self.assertEqual(legacy['stages'][0]['error_details'][0]['code'], 'RETRY')
        cases = self.patterns([call, result, retry])
        repeat = next(case for case in cases if case['pattern'] == 'd')
        self.assertEqual(repeat['trigger']['code'], 'RETRY')
        self.assertEqual(repeat['trigger']['initiator'], 'runtime_next_step')
        self.assertTrue(repeat['trigger']['location'].endswith(':2'))

    def test_wizard_cycle_matches_verified_same_node_in_runtime(self):
        target = dict(kind='existing', type='imports.text', ref=dict(node_id='node'))
        calls = [self.dock('node_apply', operation_id=op, target=target) for op in ['old', 'new']]
        open_receipt = dict(status='SUCCEEDED', output=dict(
            wizard=dict(status='observed'),
            prepared_node_context=dict(verified=True, surface='wizard', node_id='node')))
        runtime = [
            dict(phase='node_step_completed', operation_id='old', outcome=open_receipt),
            dict(phase='node_operation_released', operation_id='old', result=dict(node=dict(node_id='node'))),
            dict(phase='node_step_completed', operation_id='new', outcome=open_receipt),
        ]
        cases = [case for case in self.patterns(calls, runtime) if case['pattern'] == 'a']
        self.assertEqual(len(cases), 1)
        self.assertEqual((cases[0]['variant'], cases[0]['node'], cases[0]['close_kind']), ('import', 'node', 'release'))
        self.assertEqual(cases[0]['reopened'], 'sample/profile/execution-events.jsonl:3')
        self.assertEqual(cases[0]['location'], 'sample/sample/model.stdout:2')
        different = dict(status='SUCCEEDED', output=dict(
            wizard=dict(status='observed'),
            prepared_node_context=dict(verified=True, surface='wizard', node_id='other')))
        runtime[-1]['outcome'] = different
        self.assertFalse(any(case['pattern'] == 'a' for case in self.patterns(calls, runtime)))

    def test_recreate_requires_verified_deletion_and_matches_node_type(self):
        target = dict(kind='new', type='imports.text', label='Input')
        create = self.dock('node_apply', dict(status='SUCCEEDED', node=dict(node_id='one')),
                           operation_id='create', target=target)
        delete = self.dock('node_delete', dict(status='SUCCEEDED'),
                           operation_id='delete', node=dict(node_id='one'))
        recreate = self.dock('node_apply', dict(status='SUCCEEDED', node=dict(node_id='two')),
                             operation_id='recreate', target=target)
        cases = self.patterns([create, delete, recreate])
        case = next(case for case in cases if case['pattern'] == 'b')
        self.assertEqual((case['previous_node'], case['node']), ('one', 'two'))
        delete['part']['state']['output'] = '{"status":"NOT_APPLIED"}'
        self.assertFalse(any(case['pattern'] == 'b' for case in self.patterns([create, delete, recreate])))

    def test_closed_wizard_and_mapping_have_distinct_surfaces(self):
        target = dict(kind='existing', type='transform.grouping', ref=dict(node_id='node'))
        node_context = dict(verified=True, node_id='node')
        events = [self.dock('node_apply', operation_id='apply', target=target)]

        def observation(status, stage, surface):
            return dict(phase='node_observation_completed', operation_id='apply', outcome=dict(
                status='SUCCEEDED', output=dict(wizard=dict(status=status, stage=stage),
                                               prepared_node_context=dict(node_context, surface=surface))))

        opened = observation('observed', 'grouping', 'wizard')
        closed = observation('absent', None, 'graph')
        mapping = observation('observed', 'input_mapping', 'wizard')
        cases = self.patterns(events, [opened, closed, mapping, closed, opened])
        self.assertEqual(len(cases), 1)
        self.assertEqual(cases[0]['wizard_kind'], 'configuration')
        self.assertEqual(cases[0]['trigger']['initiator'], 'runtime_internal')

    def test_same_target_and_phase_after_recovery(self):
        target = dict(kind='existing', type='imports.text', ref=dict(node_id='node'))
        events = [
            self.dock('node_apply', dict(status='FAILED', phase='configure', error=dict(code='STOPPED')),
                      operation_id='first', target=target, phase='configure'),
            self.dock('operation_recover', dict(status='SUCCEEDED', phase='resolved'),
                      operation_id='first', strategy='abandon_operation'),
            self.dock('browser_recovery', dict(phase='dock', verification=dict(
                      next_step=dict(tool='dock_node_apply', instruction='Reapply.'))),
                      operation_id='first', action='finish'),
            self.dock('node_apply', operation_id='wrong-phase', target=target, phase='read'),
            self.dock('node_apply', operation_id='same-phase', target=target, phase='configure'),
        ]
        cases = [case for case in self.patterns(events) if case['pattern'] == 'c']
        self.assertEqual([(case['operation_id'], case['phase']) for case in cases], [('same-phase', 'configure')])
        self.assertEqual(cases[0]['original_code'], 'STOPPED')
        self.assertEqual(cases[0]['trigger']['initiator'], 'runtime_next_step')
        self.assertTrue(cases[0]['trigger']['location'].endswith(':3'))

    def test_identical_calls_and_running_polls(self):
        events = [
            self.dock('node_wait', dict(state='running'), operation_id='a', timeout_ms=3000),
            self.dock('node_wait', dict(state='running'), operation_id='a', timeout_ms=3000),
            self.dock('node_wait', dict(state='running'), operation_id='b', timeout_ms=3000),
            self.dock('node_wait', dict(state='running'), operation_id='a', timeout_ms=5000),
            self.dock('prepare', operation_id='a', intent='create'),
            self.dock('prepare', operation_id='b', intent='create'),
        ]
        cases = [case for case in self.patterns(events) if case['pattern'] == 'd']
        self.assertEqual([case['variant'] for case in cases], ['running_poll', 'different_wait_operation', 'identical'])
        self.assertEqual([case['normal'] for case in cases], [True, False, False])

    def test_repeated_prepare_describe_and_delivery_count_replays_once(self):
        def upload(op, tool='artifact_deliver'):
            return self.dock(tool, dict(status='SUCCEEDED', output=dict(
                upload_operation_id=op, upload_completion_verified=True, sha256='synthetic-digest',
                destination='incoming/file.csv')), operation_id=op, artifact_id='artifact')

        events = [
            self.dock('prepare', intent='create'),
            self.dock('action_describe', node_types=['imports.text', 'imports.excel']),
            upload('first'), upload('first', 'artifact_delivery_status'), upload('second'),
            upload('first', 'artifact_delivery_status'),
            self.dock('prepare', intent='create'),
            self.dock('action_describe', node_types=['imports.excel', 'imports.text']),
        ]
        cases = [case for case in self.patterns(events) if case['pattern'] == 'e']
        self.assertEqual([case['variant'] for case in cases], ['file_delivery', 'prepare', 'action_describe'])
        self.assertEqual(cases[0]['file_name'], 'file.csv')

    def test_repeated_file_request_after_failed_delivery(self):
        failed = self.dock('artifact_deliver', dict(status='NOT_APPLIED', error=dict(code='UPLOAD_REFUSED')),
                           operation_id='first', artifact_id='file')
        retry = self.dock('artifact_deliver', dict(status='NOT_APPLIED'),
                          operation_id='retry', artifact_id='file')
        cases = [c for c in self.patterns([failed, retry]) if c['pattern'] == 'e']
        self.assertEqual([case['variant'] for case in cases], ['file_delivery_retry'])
        self.assertEqual(cases[0]['prior_delivery_code'], 'UPLOAD_REFUSED')

    def release_refusal(self, op, offer=True):
        output = dict(original_operation_pending=True)
        if offer:
            output['next_step'] = dict(tool='dock_browser_recovery', arguments=dict(action='start', operation_id=op))
        event = self.dock('operation_recover', operation_id=op, strategy='abandon_operation')
        event['part']['state'].update(status='error', output=None, error=json.dumps(dict(
            status='AMBIGUOUS', phase='release_refused', output=output, error=dict(code='NODE_RELEASE_REFUSED'))))
        return event

    def test_manual_recovery_offers_start_finish_and_unoffered_refusal(self):
        events = [
            self.release_refusal('started'),
            self.dock('browser_recovery', dict(phase='browser'), action='start', operation_id='started'),
            self.dock('browser_recovery', dict(phase='dock', verification=dict(status='continuable')),
                      action='finish', operation_id='started'),
            self.dock('node_wait', dict(status='SUCCEEDED', action_key='node.apply'), operation_id='built'),
            self.release_refusal('ignored'),
            self.release_refusal('no-offer', offer=False),
        ]
        cases = {case['variant']: case for case in self.patterns(events) if case['pattern'] == 'f'}
        self.assertEqual(set(cases), {'offered_and_started', 'start_to_finish', 'offered_no_start',
                                     'release_blocked_no_offer'})
        finish = cases['start_to_finish']
        self.assertTrue(finish['returned_to_dock'])
        self.assertTrue(finish['continued'])
        self.assertTrue(finish['finish'].endswith(':3'))
        self.assertEqual(cases['offered_no_start']['operation_id'], 'ignored')
        self.assertEqual(cases['release_blocked_no_offer']['last_tool_result']['operation_id'], 'no-offer')

    def test_deadlock_ignores_read_success_and_resolved_pending(self):
        events = [
            self.release_refusal('pending'),
            self.dock('operation_inspect', dict(status='SUCCEEDED', output=dict(state='pending')),
                      operation_id='pending'),
            self.dock('node_read', dict(status='SUCCEEDED'), operation_id='read'),
        ]
        deadlock = next(case for case in self.patterns(events) if case['pattern'] == 'g')
        self.assertEqual(deadlock['pending_operations'], ['pending'])
        self.assertEqual(deadlock['last_tool_result']['tool'], 'loginom_dock_node_read')
        events.append(self.dock('operation_recover', dict(status='SUCCEEDED', phase='resolved'),
                                operation_id='pending', strategy='abandon_operation'))
        self.assertFalse(any(case['pattern'] == 'g' for case in self.patterns(events)))

    def test_recovery_budget_and_blocker_without_change(self):
        blocker = self.dock('browser_recovery', {'refused': 'The browser recovery budget is exhausted.'},
                            operation_id='blocked', action='start')
        cases = self.patterns([blocker])
        self.assertEqual({c['variant'] for c in cases},
                         {'start_refused', 'release_blocked_no_offer', 'blocker_without_change'})
        last = next(c for c in cases if c['pattern'] == 'g')
        self.assertEqual(last['trigger']['code'], 'BROWSER_RECOVERY_BUDGET_EXHAUSTED')
        build = self.dock('node_wait', dict(status='SUCCEEDED', action_key='node.apply'), operation_id='done')
        self.assertFalse(any(case['pattern'] == 'g' for case in self.patterns([blocker, build])))

    def test_pattern_outputs_include_each_run_even_without_matches(self):
        root = self.temp_run([dict(type='step_finish', part={})])
        output = root / 'patterns-output'
        result = self.run_audit('--patterns', root, '--pattern-output', output)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((output / root.name / 'patterns.json').read_text())['cases'], [])
        self.assertEqual((output / 'summary.md').read_text(), result.stdout)


if __name__ == '__main__':
    unittest.main()
