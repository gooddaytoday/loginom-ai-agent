"""Repository source assembly, integrity and immutable deployment checks."""
import json
import tempfile
import unittest
from pathlib import Path
import sys
import shutil

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from assemble_runtime import assemble
from project_context import deployment, project_root


class AssemblyTest(unittest.TestCase):
    def test_reproducible_repository_assembly_and_refusal_to_overwrite(self):
        definition = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'runtime'
            identity = deployment(project_root())
            assemble(None, output, definition, identity)
            assemble(None, output, definition, identity)
            self.assertEqual((output / 'deployment.json').stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads((output / 'deployment.json').read_text()), identity)
            (output / 'adapter.mjs').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
                assemble(None, output, definition, identity)
            self.assertEqual((output / 'adapter.mjs').read_text(), 'changed')

    def test_modified_sources_and_wrong_generation_are_rejected_before_output(self):
        definition = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / 'definition'
            shutil.copytree(definition, copy, ignore=shutil.ignore_patterns('__pycache__'))
            output = Path(directory) / 'runtime'
            identity = deployment(project_root())
            with self.assertRaisesRegex(ValueError, 'generation disagree'):
                assemble(None, output, copy, {**identity, 'generation': 'other'})
            (copy / 'source/adapter.mjs').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'Pinned source changed'):
                assemble(None, output, copy, identity)
            self.assertFalse(output.exists())
