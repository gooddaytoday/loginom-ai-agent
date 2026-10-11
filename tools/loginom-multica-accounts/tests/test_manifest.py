import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from common import ops_identity


class SourceIdentity(unittest.TestCase):
    def test_retained_baseline_exact_bytes(self):
        baseline = ROOT / 'baseline'
        snapshot = json.loads((baseline / 'SOURCE_SNAPSHOT.json').read_text())
        for relative, expected in snapshot['files'].items():
            raw = (baseline / relative).read_bytes()
            self.assertEqual(len(raw), expected['bytes'], relative)
            self.assertEqual(hashlib.sha256(raw).hexdigest(), expected['sha256'], relative)

    def test_version_binds_all_candidate_sources_and_remains_non_deployable(self):
        version = json.loads((ROOT / 'VERSION.json').read_text())
        actual = {str(path.relative_to(ROOT)) for directory in ['scripts', 'tests', 'fixtures']
                  for path in (ROOT / directory).rglob('*') if path.is_file()
                  and '__pycache__' not in path.parts}
        self.assertTrue(actual.issubset(version['files']))
        for relative, expected in version['files'].items():
            self.assertEqual(hashlib.sha256((ROOT / relative).read_bytes()).hexdigest(), expected, relative)
        self.assertEqual(version['status'], 'SOURCE_ONLY_LIVE_BLOCKED')
        self.assertEqual(ops_identity()['status'], 'SOURCE_ONLY_LIVE_BLOCKED')
        self.assertEqual(version['deployment']['installed_tool_modified'], False)


if __name__ == '__main__':
    unittest.main()
