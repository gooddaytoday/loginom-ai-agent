import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('scenario_set', Path(__file__).resolve().parents[1] / 'scenario-set.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ScenarioSetTests(unittest.TestCase):
    def test_explicit_version_and_contained_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture = root / 'docs/node-development/nodes/example/acceptance'
            fixture.mkdir(parents=True)
            (fixture / 'data').mkdir()
            (fixture / 'task.md').write_text('goal')
            (fixture / 'expected.json').write_text('{}')
            value = {'version': 'loginom-scenario-set-v1', 'scenarios': [{'id': 'baseline', 'directory': str(fixture.relative_to(root))}]}
            self.assertEqual(module.validate_scenarios(value, root), value['scenarios'])
            for patch in [{'version': 'specification'}, {'extra': True}, {'scenarios': value['scenarios'] * 2},
                          {'scenarios': [{'id': 'escape', 'directory': '../../secret'}]}, {'scenarios': []}]:
                with self.subTest(patch=patch), self.assertRaises(ValueError):
                    module.validate_scenarios({**value, **patch}, root)


if __name__ == '__main__':
    unittest.main()
