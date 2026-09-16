import tempfile
import unittest
from pathlib import Path
from preflight import runtime_pin


class RuntimePinTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.lib = self.root / 'client/lib'
        self.lib.mkdir(parents=True)
        (self.root / 'client/package.json').write_text('{}')
        (self.lib / 'session.mjs').write_text("const pin=createRuntimeSourcePin(import.meta.url,['../package.json']);")

    def test_new_nested_module_is_included_without_editing_the_fixed_list(self):
        before = runtime_pin(self.root)
        (self.lib / 'nested').mkdir()
        p = self.lib / 'nested/handler.mjs'
        p.write_text('export const revision=1;')
        after = runtime_pin(self.root)
        self.assertNotEqual(before['client_revision'], after['client_revision'])
        self.assertIn('client/lib/nested/handler.mjs', after['inputs'])
        p.write_text('export const revision=2;')
        self.assertNotEqual(after['client_revision'], runtime_pin(self.root)['client_revision'])

    def test_external_fixed_input_is_still_bound(self):
        before = runtime_pin(self.root)
        (self.root / 'client/package.json').write_text('{"version":"2"}')
        self.assertNotEqual(before['client_revision'], runtime_pin(self.root)['client_revision'])

    def test_symlink_is_not_silently_omitted(self):
        (self.lib / 'alias').symlink_to(self.root / 'client', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            runtime_pin(self.root)

    def test_dynamic_input_expression_is_refused(self):
        (self.lib / 'session.mjs').write_text("createRuntimeSourcePin(import.meta.url,['../package.json',unsafe()]);")
        with self.assertRaises(ValueError):
            runtime_pin(self.root)


if __name__ == '__main__':
    unittest.main()
