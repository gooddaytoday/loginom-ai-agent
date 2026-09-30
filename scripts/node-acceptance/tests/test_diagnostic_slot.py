import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'diagnostic-slot.py'
spec = importlib.util.spec_from_file_location('diagnostic_slot', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SlotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'attempts').mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def test_exclusive_lock(self):
        with module.slot_lock(self.root):
            with self.assertRaisesRegex(RuntimeError, 'owner alive'):
                with module.slot_lock(self.root):
                    self.fail('second owner admitted')
        self.assertFalse((self.root / 'attempts/.lock').exists())

    def test_exception_releases_lock(self):
        with self.assertRaises(ValueError):
            with module.slot_lock(self.root):
                raise ValueError('diagnostic failed')
        with module.slot_lock(self.root):
            self.assertEqual((self.root / 'attempts/.lock/pid').read_text(), str(os.getpid()))

    def test_crashed_owner_can_be_recovered(self):
        code = f"import importlib.util,time; s=importlib.util.spec_from_file_location('d',{str(SCRIPT)!r}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)\nwith m.slot_lock(m.Path({str(self.root)!r})):\n print('READY',flush=True); time.sleep(30)"
        process = subprocess.Popen([sys.executable, '-c', code], stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(process.stdout.readline().strip(), 'READY')
            process.kill()
            process.wait(timeout=5)
            with module.slot_lock(self.root):
                self.assertEqual((self.root / 'attempts/.lock/pid').read_text(), str(os.getpid()))
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdout.close()

    def test_unknown_owner_blocks(self):
        (self.root / 'attempts/.lock').mkdir()
        with self.assertRaisesRegex(RuntimeError, 'owner unknown'):
            with module.slot_lock(self.root):
                self.fail('unknown owner admitted')

    @unittest.skipUnless(Path('/proc').exists(), 'Linux process ownership inspection')
    def test_live_slot_process_blocks_release(self):
        process = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)', str(self.root)])
        try:
            with self.assertRaisesRegex(RuntimeError, 'process still alive'):
                module.assert_idle(self.root, 'b')
        finally:
            process.kill()
            process.wait()
        module.assert_idle(self.root, 'b')


if __name__ == '__main__':
    unittest.main()
