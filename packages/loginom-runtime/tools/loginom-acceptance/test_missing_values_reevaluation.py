import tempfile
import unittest
from pathlib import Path
from missing_values_reevaluation_v1 import verify_delta, verify_file, digest


class VersionedProvenanceTests(unittest.TestCase):
    def test_only_exact_declared_change_is_accepted(self):
        self.assertEqual(verify_delta({'a':'old','b':'same'}, {'a':'new','b':'same'}, {'a':'new'}, {'a'}), ['a'])
        for current, expected, declared in [({'a':'new','b':'foreign'}, {'a':'new'}, {'a'}),
                                          ({'a':'other','b':'same'}, {'a':'new'}, {'a'}),
                                          ({'a':'old','b':'same'}, {'a':'new'}, {'a'}),
                                          ({'a':'new'}, {'a':'new'}, {'a'}),
                                          ({'a':'new','b':'same'}, {}, {'a'})]:
            with self.subTest(current=current, expected=expected):
                with self.assertRaises(ValueError):
                    verify_delta({'a':'old','b':'same'}, current, expected, declared)

    def test_original_bytes_are_checked_even_at_same_length(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'evidence.json';path.write_bytes(b'original')
            record=dict(bytes=8,sha256=digest(path));verify_file(path,record)
            path.write_bytes(b'modified')
            with self.assertRaises(ValueError):verify_file(path,record)
            path.write_bytes(b'longer modification')
            with self.assertRaises(ValueError):verify_file(path,record)


class VersionedCompletenessTests(unittest.TestCase):
    def test_all_mandatory_gates_and_twelve_results_are_required(self):
        from missing_values_reevaluation_v2 import REQUIRED, PREFIXES, full_goal_passed_versioned
        checks = {key: {'passed': True} for key in REQUIRED}
        checks.update({prefix + str(i): {'passed': True} for prefix in PREFIXES for i in range(12)})
        self.assertTrue(full_goal_passed_versioned(checks))
        self.assertFalse(full_goal_passed_versioned({}))
        for key in checks:
            with self.subTest(missing=key):
                self.assertFalse(full_goal_passed_versioned({k: v for k, v in checks.items() if k != key}))
            with self.subTest(failed=key):
                self.assertFalse(full_goal_passed_versioned(dict(checks, **{key: {'passed': False}})))
        for prefix in PREFIXES:
            self.assertFalse(full_goal_passed_versioned(dict(checks, **{prefix + 'extra': {'passed': True}})))
