"""Run from docs/node-development/tools: python3 -m unittest discover -s tests -v."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from coverage import check_roadmap, render_stages, validate_coverage
from validate import ROOT, render


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.registry = []
        self.data = {
            'schema_version': 1,
            'snapshot_date': '2026-10-02',
            'source_commit': '5f772aea9de6414a19feb6ecc109a196c9e92453',
            'help_version': '7.4',
            'nodes': [],
            'foundations': [{
                'slug': 'typed-ports',
                'plan': 'foundations/typed-ports/plan.md',
                'stages': [{
                    'id': 'foundation:typed-variables', 'title': 'Типизированный порт',
                    'status': 'discovery_required', 'priority': 0,
                    'covers': [], 'hard_requires': [], 'recommended_after': [],
                    'environment_gates': [],
                }],
            }],
            'roadmap_order': ['foundation:typed-variables', 'text-import:s1', 'calculator:s1'],
        }
        for slug, component, dependency in [
            ('text-import', 'component.imports.Text', 'foundation:typed-variables'),
            ('calculator', 'component.transform.Calculator', 'text-import:s1'),
        ]:
            self.registry.append({
                'slug': slug, 'component_id': component,
                'plan': f'nodes/{slug}/plan.md', 'card': f'nodes/{slug}/README.md',
            })
            self.data['nodes'].append({
                'slug': slug, 'component_id': component,
                'plan': f'nodes/{slug}/plan.md', 'catalog_status': 'current_help',
                'sources': [{
                    'id': 'help', 'title': 'Описание узла', 'version': '7.4',
                    'url': f'https://help.loginom.ru/userguide/{slug}.html',
                    'accessed_on': '2026-10-02',
                }],
                'requirements': [{
                    'id': f'{slug}:r01', 'title': 'Типизированный результат',
                    'source_refs': ['help'], 'stage': f'{slug}:s1',
                    'verification': 'Независимое сравнение значений, типов и порядка строк.',
                }],
                'stages': [{
                    'id': f'{slug}:s1', 'title': 'Полное документированное поведение',
                    'status': 'discovery_required', 'priority': 1,
                    'covers': [f'{slug}:r01'], 'hard_requires': [dependency],
                    'recommended_after': [], 'environment_gates': ['Loginom 7.4'],
                }],
            })
            card = self.root / f'nodes/{slug}/README.md'
            card.parent.mkdir(parents=True)
            card.write_text(f'# {slug}\n[План](plan.md)\n')
        for owner in self.data['nodes'] + self.data['foundations']:
            plan = self.root / owner['plan']
            plan.parent.mkdir(parents=True, exist_ok=True)
            plan.write_text('\n'.join(item['id'] for item in owner['stages'] + owner.get('requirements', [])))

    def errors(self):
        return validate_coverage(self.data, self.registry, self.root)

    def assert_error(self, message):
        self.assertTrue(any(message in error for error in self.errors()), self.errors())

    def test_valid_graph_does_not_mutate_input(self):
        before = copy.deepcopy((self.data, self.registry))
        self.assertEqual([], self.errors())
        self.assertEqual(before, (self.data, self.registry))

    def test_foundation_supports_multiple_semantic_stage_ids(self):
        foundation = self.data['foundations'][0]
        second = copy.deepcopy(foundation['stages'][0])
        second['id'] = 'foundation:typed-trees'
        second['hard_requires'] = ['foundation:typed-variables']
        foundation['stages'].append(second)
        self.data['roadmap_order'].append('foundation:typed-trees')
        (self.root / foundation['plan']).write_text('foundation:typed-variables\nfoundation:typed-trees')
        self.assertEqual([], self.errors())

    def test_foundation_stage_namespace_is_required(self):
        self.data['foundations'][0]['stages'][0]['id'] = 'typed-ports:s1'
        self.assert_error('invalid stage ID foundations[0].stages[0]')

    def test_missing_plan(self):
        (self.root / self.data['nodes'][0]['plan']).unlink()
        self.assert_error('missing plan nodes/text-import/plan.md')

    def test_missing_card(self):
        (self.root / 'nodes/calculator/README.md').unlink()
        self.assert_error('missing card calculator')

    def test_missing_requirement_coverage(self):
        self.data['nodes'][0]['stages'][0]['covers'] = []
        self.assert_error('uncovered requirement text-import:r01')

    def test_unknown_stage_dependency(self):
        self.data['nodes'][1]['stages'][0]['hard_requires'].append('unknown:s1')
        self.assert_error('unknown stage calculator:s1: unknown:s1')

    def test_unknown_recommended_stage(self):
        self.data['nodes'][1]['stages'][0]['recommended_after'] = ['unknown:s1']
        self.assert_error('unknown stage calculator:s1: unknown:s1')

    def test_unknown_requirement_stage(self):
        self.data['nodes'][0]['requirements'][0]['stage'] = 'calculator:s1'
        self.assert_error('unknown requirement stage text-import:r01')

    def test_duplicate_slug(self):
        self.data['nodes'].append(copy.deepcopy(self.data['nodes'][0]))
        self.assert_error('duplicate slug text-import')

    def test_dependency_cycle(self):
        self.data['foundations'][0]['stages'][0]['hard_requires'] = ['calculator:s1']
        self.assert_error('dependency cycle:')

    def test_self_dependency(self):
        self.data['nodes'][0]['stages'][0]['hard_requires'] = ['text-import:s1']
        self.assert_error('self dependency text-import:s1')

    def test_roadmap_is_topological(self):
        self.data['roadmap_order'].reverse()
        self.assert_error('roadmap prerequisite follows consumer')

    def test_roadmap_is_exact_permutation(self):
        self.data['roadmap_order'][-1] = self.data['roadmap_order'][0]
        self.assert_error('duplicate values in roadmap_order')

    def test_roadmap_omitted_stage(self):
        self.data['roadmap_order'].pop()
        self.assert_error('roadmap must contain every stage exactly once')

    def test_missing_registry_component(self):
        self.data['nodes'].pop()
        self.assert_error('registry IDs differ:')

    def test_source_must_belong_to_same_node(self):
        self.data['nodes'][1]['sources'][0]['id'] = 'calculator-help'
        self.assert_error('unknown source calculator:r01: help')

    def test_requirement_cannot_be_claimed_by_another_node(self):
        self.data['nodes'][1]['stages'][0]['covers'].append('text-import:r01')
        self.assert_error('unknown requirement calculator:s1: text-import:r01')

    def test_plan_must_contain_exact_ids(self):
        (self.root / self.data['nodes'][0]['plan']).write_text('text-import:r010 text-import:s1')
        self.assert_error('plan missing ID nodes/text-import/plan.md: text-import:r01')

    def test_schema_rejects_invalid_nested_data_without_crashing(self):
        for field, value in [
            ('sources', [None]), ('requirements', [{}]), ('stages', 'not a list'),
            ('sources', [{'url': []}]), ('slug', []), ('plan', '../escaped.md'),
        ]:
            with self.subTest(field=field, value=value):
                data = copy.deepcopy(self.data)
                data['nodes'][0][field] = value
                self.assertTrue(validate_coverage(data, self.registry, self.root))
        for value in [None, [], 'not an object', {}]:
            with self.subTest(root=value):
                self.assertTrue(validate_coverage(value, self.registry, self.root))

    def test_invalid_date_priority_and_status(self):
        self.data['snapshot_date'] = '2026-02-30'
        self.data['nodes'][0]['stages'][0]['priority'] = True
        self.data['nodes'][0]['stages'][0]['status'] = 'PASS'
        self.assert_error('invalid date snapshot_date')
        self.assert_error('priority must be an integer 0..5')
        self.assert_error('invalid stage status')

    def test_inventory_links_every_registry_plan(self):
        registry = json.loads((ROOT / 'registry.json').read_text())
        inventory = render(registry)
        for node in registry['nodes']:
            with self.subTest(component=node['component_id']):
                self.assertEqual(1, inventory.count(f"(nodes/{node['slug']}/plan.md)"))

    def test_stage_table_uses_authored_order_links_and_escaped_values(self):
        self.data['nodes'][1]['stages'][0]['title'] = 'Числа | строки'
        self.data['nodes'][1]['stages'][0]['environment_gates'] = ['A\nB', '<стенд>']
        self.data['nodes'][1]['stages'][0]['recommended_after'] = ['foundation:typed-variables']
        before = copy.deepcopy(self.data)
        rows = render_stages(self.data).splitlines()
        self.assertEqual(5, len(rows))
        self.assertTrue(rows[2].startswith('| 1 | [Типизированный порт](foundations/typed-ports/plan.md)'))
        self.assertIn('[text-import:s1](nodes/text-import/plan.md)', rows[4])
        self.assertIn('[foundation:typed-variables](foundations/typed-ports/plan.md)', rows[4])
        self.assertIn(r'[Числа \| строки](nodes/calculator/plan.md)', rows[4])
        self.assertIn('A<br>B<br>&lt;стенд&gt;', rows[4])
        self.assertEqual(before, self.data)

    def test_roadmap_stale_region_and_render_preserve_authored_text(self):
        path = self.root / 'roadmap.md'
        before = '# Очередь\n\nАвторское введение.\n\n<!-- coverage-stages:start -->'
        after = '<!-- coverage-stages:end -->\n\nАвторское послесловие.\n'
        path.write_text(before + '\nустаревшая таблица\n' + after)
        self.assertEqual(['coverage roadmap stages are stale; run --render'], check_roadmap(self.data, path))
        self.assertEqual([], check_roadmap(self.data, path, render_view=True))
        self.assertEqual(before + '\n\n' + render_stages(self.data) + '\n\n' + after, path.read_text())
        self.assertEqual([], check_roadmap(self.data, path))
        self.data['nodes'][1]['stages'][0]['environment_gates'].append('Новый стенд')
        self.assertEqual(['coverage roadmap stages are stale; run --render'], check_roadmap(self.data, path))

    def test_roadmap_invalid_markers_are_not_repaired_or_overwritten(self):
        path = self.root / 'roadmap.md'
        for text in [
            '# Только авторский текст\n',
            '<!-- coverage-stages:end -->\n<!-- coverage-stages:start -->\n',
            '<!-- coverage-stages:start -->\n<!-- coverage-stages:start -->\n<!-- coverage-stages:end -->\n',
            'Пример <!-- coverage-stages:start -->\n<!-- coverage-stages:end -->\n',
        ]:
            with self.subTest(text=text):
                path.write_text(text)
                self.assertTrue(check_roadmap(self.data, path, render_view=True))
                self.assertEqual(text, path.read_text())

    def test_missing_roadmap_does_not_create_an_unauthored_document(self):
        path = self.root / 'roadmap.md'
        self.assertEqual(['coverage missing roadmap roadmap.md'], check_roadmap(self.data, path, render_view=True))
        self.assertFalse(path.exists())


if __name__ == '__main__':
    unittest.main()
