"""Offline fixtures for ownership, resource phases, bundles and generated views."""
import copy
import tempfile
import unittest
from pathlib import Path

from parallel import check_parallel_views, render_lanes, render_plan_section, validate_parallel


class ParallelTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.coverage = {'source_commit': 'a' * 40, 'nodes': [], 'foundations': []}
        for collection, slug, stages in [
            ('foundations', 'acceptance', [('foundation:oracle-crosstable', [])]),
            ('foundations', 'external-systems', [('foundation:file-artifacts', ['foundation:oracle-crosstable'])]),
            ('foundations', 'dynamic-schema', [('foundation:dynamic-schema', ['foundation:oracle-crosstable'])]),
            ('nodes', 'transform-crosstable', [
                ('transform-crosstable:s1', ['foundation:dynamic-schema', 'foundation:file-artifacts']),
                ('transform-crosstable:s2', ['transform-crosstable:s1']),
            ]),
            ('nodes', 'variables-vartodata', [('variables-vartodata:s1', [])]),
        ]:
            owner = {
                'slug': slug, 'plan': f'{collection}/{slug}/plan.md',
                'stages': [{'id': stage_id, 'hard_requires': dependencies} for stage_id, dependencies in stages],
            }
            self.coverage[collection].append(owner)
            path = self.root / owner['plan']
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('# Авторский подплан\n\nСуществующие критерии.\n')
        bundle = [
            'foundation:oracle-crosstable', 'foundation:file-artifacts',
            'foundation:dynamic-schema', 'transform-crosstable:s1',
        ]
        self.data = {
            'schema_version': 1, 'status': 'proposal_not_deployed',
            'source_commit': 'a' * 40, 'multica_source_commit': 'b' * 40,
            'operations_source_commit': 'c' * 40,
            'profiles': [
                {'id': 'legacy', 'generator': 1, 'worker': 4, 'reviewer': 2,
                 'daemon_capacity': 7, 'card_wip': 4, 'model_slots': 1, 'requires_shared_oauth': False},
                {'id': 'pilot', 'generator': 1, 'worker': 2, 'reviewer': 2,
                 'daemon_capacity': 5, 'card_wip': 2, 'model_slots': 2, 'requires_shared_oauth': True},
            ],
            'lanes': [
                {'id': 'tables', 'title': 'Таблицы', 'description': 'Табличные узлы и общие механизмы'},
                {'id': 'variables', 'title': 'Переменные', 'description': 'Типизированные переменные'},
            ],
            'resources': [
                {'id': 'contracts', 'title': 'Общий контракт', 'phase': 'development', 'scope': 'repository', 'capacity': 1, 'applies_when': 'always'},
                {'id': 'integration', 'title': 'Интеграция', 'phase': 'integration', 'scope': 'repository', 'capacity': 1, 'applies_when': 'always'},
                {'id': 'legacy-oauth', 'title': 'OAuth', 'phase': 'model', 'scope': 'account', 'capacity': 1, 'applies_when': 'legacy_oauth'},
                {'id': 'token-refresh', 'title': 'Обновление токена', 'phase': 'model', 'scope': 'account', 'capacity': 1, 'applies_when': 'always'},
                {'id': 'oracle-account', 'title': 'Аккаунт проверки', 'phase': 'oracle', 'scope': 'account', 'capacity': 1, 'applies_when': 'always'},
            ],
            'stages': [],
            'bundles': [{'id': 'crosstable-v1', 'title': 'Первый принимаемый пакет', 'stages': bundle, 'reason': 'Одна связанная поставка'}],
        }
        for owner in self.coverage['nodes'] + self.coverage['foundations']:
            for stage in owner['stages']:
                self.data['stages'].append({
                    'stage_id': stage['id'], 'lane': 'variables' if owner['slug'] == 'variables-vartodata' else 'tables',
                    'card_group': 'crosstable-v1' if stage['id'] in bundle else owner['slug'],
                    'development_locks': ['contracts'], 'integration_locks': ['integration'],
                    'model_locks': ['legacy-oauth', 'token-refresh'], 'oracle_locks': ['oracle-account'],
                    'note': 'Назначение после приёмки зависимостей.',
                })
        workflow = self.root / 'workflow/multica-parallel.md'
        workflow.parent.mkdir()
        workflow.write_text('# Авторское руководство\n\n<!-- parallel-lanes:start -->\n\n<!-- parallel-lanes:end -->\n\nПослесловие.\n')

    def errors(self):
        return validate_parallel(self.data, self.coverage, self.root)

    def assert_error(self, value):
        errors = self.errors()
        self.assertTrue(any(value in error for error in errors), errors)

    def test_valid_map_does_not_mutate_input(self):
        before = copy.deepcopy((self.data, self.coverage))
        self.assertEqual([], self.errors())
        self.assertEqual(before, (self.data, self.coverage))

    def test_stage_coverage_must_be_exact(self):
        for action in ['remove', 'unknown', 'duplicate']:
            with self.subTest(action=action):
                data = copy.deepcopy(self.data)
                if action == 'remove':
                    data['stages'].pop()
                if action == 'unknown':
                    data['stages'][0]['stage_id'] = 'unknown:s1'
                if action == 'duplicate':
                    data['stages'].append(copy.deepcopy(data['stages'][0]))
                self.assertTrue(validate_parallel(data, self.coverage, self.root))

    def test_unknown_lane(self):
        self.data['stages'][0]['lane'] = 'unassigned'
        self.assert_error('unknown lane')

    def test_duplicate_lane(self):
        self.data['lanes'].append(copy.deepcopy(self.data['lanes'][0]))
        self.assert_error('duplicate lanes tables')

    def test_unbundled_stage_uses_owner_group(self):
        self.data['stages'][1]['card_group'] = 'variables-vartodata'
        self.assert_error('invalid card_group transform-crosstable:s2: expected transform-crosstable')

    def test_later_stage_cannot_join_crosstable_bundle_group(self):
        self.data['stages'][1]['card_group'] = 'crosstable-v1'
        self.assert_error('invalid card_group transform-crosstable:s2')

    def test_bundle_stage_cannot_escape_shared_group(self):
        self.data['stages'][0]['card_group'] = 'transform-crosstable'
        self.assert_error('invalid card_group transform-crosstable:s1: expected crosstable-v1')

    def test_unknown_resource(self):
        self.data['stages'][0]['development_locks'] = ['unknown']
        self.assert_error('unknown resource')

    def test_resource_phase_must_match_lock_phase(self):
        self.data['stages'][0]['development_locks'] = ['integration']
        self.assert_error('resource phase mismatch')

    def test_duplicate_resource(self):
        self.data['resources'].append(copy.deepcopy(self.data['resources'][0]))
        self.assert_error('duplicate resources contracts')

    def test_capacity_bounds_reject_boolean_negative_and_excess(self):
        for field, value in [('generator', 2), ('worker', True), ('reviewer', 0), ('worker', 51), ('model_slots', 51), ('daemon_capacity', -1), ('card_wip', 0)]:
            with self.subTest(field=field, value=value):
                data = copy.deepcopy(self.data)
                data['profiles'][0][field] = value
                self.assertTrue(validate_parallel(data, self.coverage, self.root))

    def test_daemon_must_fit_all_roles(self):
        self.data['profiles'][0]['daemon_capacity'] = 6
        self.assert_error('insufficient daemon_capacity legacy')

    def test_legacy_profile_has_one_model_slot(self):
        self.data['profiles'][0]['model_slots'] = 2
        self.assert_error('model_slots requires shared OAuth legacy')

    def test_shared_oauth_cannot_disable_other_resources(self):
        self.data['resources'][3]['applies_when'] = 'legacy_oauth'
        self.assert_error('conditional resource must be legacy-oauth token-refresh')

    def test_legacy_oauth_has_fixed_capacity_phase_and_condition(self):
        for field, value in [('capacity', 2), ('phase', 'oracle'), ('applies_when', 'always')]:
            with self.subTest(field=field):
                data = copy.deepcopy(self.data)
                data['resources'][2][field] = value
                self.assertTrue(validate_parallel(data, self.coverage, self.root))

    def test_cross_table_bundle_membership(self):
        for action in ['remove', 'add', 'unknown', 'duplicate']:
            with self.subTest(action=action):
                data = copy.deepcopy(self.data)
                values = data['bundles'][0]['stages']
                if action == 'remove':
                    values.pop()
                if action == 'add':
                    values.append('transform-crosstable:s2')
                if action == 'unknown':
                    values[-1] = 'unknown:s1'
                if action == 'duplicate':
                    values.append(values[0])
                self.assertTrue(validate_parallel(data, self.coverage, self.root))

    def test_bundle_predecessor_order(self):
        self.data['bundles'][0]['stages'].reverse()
        self.assert_error('bundle prerequisite follows consumer')

    def test_independent_bundle_stages_can_swap(self):
        values = self.data['bundles'][0]['stages']
        values[1], values[2] = values[2], values[1]
        self.assertEqual([], self.errors())

    def test_stage_cannot_belong_to_multiple_bundles(self):
        bundle = copy.deepcopy(self.data['bundles'][0])
        bundle['id'] = 'duplicate-bundle'
        self.data['bundles'].append(bundle)
        self.assert_error('stage belongs to multiple bundles')

    def test_bundle_name_cannot_collide_with_owner(self):
        self.data['bundles'][0]['id'] = 'transform-crosstable'
        self.assert_error('bundle ID collides with owner slug')

    def test_unknown_shapes_report_errors_without_crashing(self):
        for value in [None, [], {}, 'invalid']:
            with self.subTest(root=value):
                self.assertTrue(validate_parallel(value, self.coverage, self.root))
        for collection, value in [('profiles', [{}]), ('lanes', [None]), ('resources', [{'phase': []}]), ('stages', 'invalid'), ('bundles', [{}])]:
            with self.subTest(collection=collection):
                data = copy.deepcopy(self.data)
                data[collection] = value
                self.assertTrue(validate_parallel(data, self.coverage, self.root))

    def test_document_status_cannot_claim_deployment(self):
        self.data['status'] = 'deployed'
        self.assert_error('status must be proposal_not_deployed')

    def test_stale_source_commit(self):
        self.data['source_commit'] = 'd' * 40
        self.assert_error('source_commit differs from coverage source_commit')

    def test_missing_plan(self):
        (self.root / self.coverage['nodes'][0]['plan']).unlink()
        self.assert_error('missing owner plan')

    def test_read_only_check_and_first_render_preserve_authored_prefix(self):
        before = {path: path.read_text() for path in self.root.rglob('*.md')}
        self.assertTrue(check_parallel_views(self.data, self.coverage, self.root))
        self.assertEqual(before, {path: path.read_text() for path in before})
        self.assertEqual([], check_parallel_views(self.data, self.coverage, self.root, render_view=True))
        self.assertEqual([], check_parallel_views(self.data, self.coverage, self.root))
        for owner in self.coverage['nodes'] + self.coverage['foundations']:
            path = self.root / owner['plan']
            self.assertTrue(path.read_text().startswith(before[path]))
        workflow = (self.root / 'workflow/multica-parallel.md').read_text()
        self.assertTrue(workflow.startswith('# Авторское руководство\n\n'))
        self.assertTrue(workflow.endswith('\n\nПослесловие.\n'))

    def test_stale_section_detected_after_resource_change(self):
        self.assertEqual([], check_parallel_views(self.data, self.coverage, self.root, render_view=True))
        self.data['stages'][0]['development_locks'] = []
        self.assertTrue(any('stale generated section' in error for error in check_parallel_views(self.data, self.coverage, self.root)))

    def test_malformed_markers_do_not_overwrite_affected_plan(self):
        path = self.root / self.coverage['nodes'][0]['plan']
        for content in [
            '<!-- parallel-execution:start -->\n',
            '<!-- parallel-execution:end -->\n<!-- parallel-execution:start -->\n',
            '<!-- parallel-execution:start -->\n<!-- parallel-execution:end -->\n<!-- parallel-execution:end -->\n',
            '<!-- parallel-execution:start-->\n<!-- parallel-execution:end-->\n',
            '<!-- parallel-execution:start\n',
        ]:
            with self.subTest(content=content):
                path.write_text(content)
                self.assertTrue(check_parallel_views(self.data, self.coverage, self.root, render_view=True))
                self.assertEqual(content, path.read_text())

    def test_workflow_requires_authored_markers(self):
        path = self.root / 'workflow/multica-parallel.md'
        path.write_text('# Авторский документ без места для таблицы\n')
        self.assertTrue(check_parallel_views(self.data, self.coverage, self.root, render_view=True))
        self.assertEqual('# Авторский документ без места для таблицы\n', path.read_text())

    def test_rendered_proposal_distinguishes_conditional_lock_and_has_relative_links(self):
        table = render_plan_section(self.data, self.coverage['nodes'][0])
        self.assertIn('legacy-oauth (legacy OAuth)<br>token-refresh', table)
        self.assertIn('существующие карточки могут уже выполняться', table)
        self.assertIn('../../workflow/multica-parallel.md', table)
        lanes = render_lanes(self.data, self.coverage)
        self.assertEqual(1, lanes.count('(../nodes/transform-crosstable/plan.md)'))
        self.assertIn('(../foundations/acceptance/plan.md)', lanes)


if __name__ == '__main__':
    unittest.main()
