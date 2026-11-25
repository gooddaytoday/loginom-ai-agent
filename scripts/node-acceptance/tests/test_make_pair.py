import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'make-pair.py'
FAKE = {'LOGINOM_WORKER_USER': 'fake-worker', 'LOGINOM_WORKER_PASS': 'fake-worker-pass',
        'LOGINOM_REVIEWER_USER': 'fake-reviewer', 'LOGINOM_REVIEWER_PASS': 'fake-reviewer-pass'}


def run(env, *args, tmp):
    base = {k: v for k, v in os.environ.items() if not k.startswith('LOGINOM_')} | dict(TMPDIR=str(tmp)) | env
    # Permissive umask so the script itself must set the restrictive modes.
    return subprocess.run([sys.executable, '-B', str(SCRIPT), *args], env=base, capture_output=True, text=True, preexec_fn=lambda: os.umask(0o022))


class MakePairTests(unittest.TestCase):
    def test_builds_both_roles_in_private_directory_and_prints_only_the_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run(FAKE, tmp=tmp)
            self.assertEqual(result.returncode, 0, result.stderr)
            directory = Path(result.stdout.strip())
            self.assertEqual(directory.parent, Path(tmp))
            self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)
            for role in ('worker', 'reviewer'):
                self.assertEqual(stat.S_IMODE((directory / (role + '.json')).stat().st_mode), 0o600)
                document = json.loads((directory / (role + '.json')).read_text())
                self.assertEqual(document['loginom'], dict(url='https://app.loginom.ai', username='fake-' + role, password='fake-' + role + '-pass'))
                self.assertEqual(document['package_directory'], '/fake-' + role)
            self.assertNotIn('fake-worker-pass', result.stdout + result.stderr)
            self.assertEqual(run({}, '--remove', str(directory), tmp=tmp).returncode, 0)
            self.assertFalse(directory.exists())

    def test_refuses_without_a_variable_and_creates_nothing(self):
        for name in FAKE:
            with self.subTest(name), tempfile.TemporaryDirectory() as tmp:
                result = run({k: v for k, v in FAKE.items() if k != name}, tmp=tmp)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(name, result.stderr)
                self.assertEqual(list(Path(tmp).iterdir()), [])
        with tempfile.TemporaryDirectory() as tmp:
            self.assertNotEqual(run(FAKE | {'LOGINOM_REVIEWER_PASS': ''}, tmp=tmp).returncode, 0)

    def test_remove_refuses_a_foreign_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'keep.txt').write_text('x')
            self.assertNotEqual(run({}, '--remove', tmp, tmp=tmp).returncode, 0)
            self.assertTrue((Path(tmp) / 'keep.txt').exists())


class RunCheckModelTests(unittest.TestCase):
    def test_model_is_one_constant_without_variant_or_shared_oauth(self):
        source = (SCRIPT.parent / 'run-check.py').read_text()
        self.assertIn("MODEL = 'deepseek/deepseek-flash'", source)
        self.assertEqual(source.count('deepseek/deepseek-flash'), 1)
        for text in (source, (SCRIPT.parent / 'run-check-two-turn.py').read_text()):
            self.assertNotIn('gpt-6.1-sol', text)
            self.assertNotIn('shared-oauth', text)
            self.assertNotIn("'--variant'", text)


if __name__ == '__main__':
    unittest.main()
