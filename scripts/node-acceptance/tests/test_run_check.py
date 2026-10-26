import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('run_check', Path(__file__).resolve().parents[1] / 'run-check.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunCheckTests(unittest.TestCase):
    def test_deadline_is_unknown_with_a_real_failure_journal(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            result = {'scenario': 'n1', 'status': 'PENDING', 'profile': str(path / 'profile')}
            runner.write(path / 'request.json', {})
            runner.write(path / 'results.json', {'head': 'a' * 40, 'tree': 'b' * 40, 'started': 1, 'phase': 'cold', 'runs': [result]})
            instance = runner.Runner(path)
            instance.failure(instance.report['runs'][0], TimeoutError('cold deadline'), path)
            instance.save()
            observed = runner.read(path / 'n1-checks.jsonl')
            self.assertEqual(observed['status'], 'UNKNOWN')
            self.assertEqual(observed['failed_phase'], 'cold')
            self.assertEqual(observed['location'], str(path / 'n1-checks.jsonl') + ':1')
            self.assertEqual(len(observed['failure_load']), 3)
            self.assertIn('| n1 | UNKNOWN |', (path / 'summary.md').read_text())

    def test_download_uses_personal_destination_and_excludes_input_copy(self):
        with tempfile.TemporaryDirectory() as folder:
            profile = Path(folder)
            for base in ['artifacts', 'artifacts/input/output-id']:
                path = profile / base / 'smoke-4-n1-shortages.csv'
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('SKU,Requested\nA,1\n')
            self.assertEqual(runner.downloaded_csv(profile, '/user/smoke-4-n1-shortages.csv'), profile / 'artifacts/smoke-4-n1-shortages.csv')
            with self.assertRaises(AssertionError): runner.downloaded_csv(profile, '/user/shortages.csv')

    def test_port_without_freshness_is_failure_even_when_native_and_complete(self):
        port = {'port': 0, 'schema': [], 'sample': [], 'fresh': True, 'sample_complete': True, 'exact_table': {}}
        reply = {'cleanup_complete': True, 'output': {'ports': [port]}}
        self.assertEqual(runner.port_failure([(44, reply)], 'model.stdout'), 'model.stdout:44')
        port['freshness_basis'] = 'completed_execution_port_source'
        self.assertIsNone(runner.port_failure([(44, reply)], 'model.stdout'))
        reply['file_preview'] = {'schema': [], 'sample': []}
        self.assertIsNone(runner.port_failure([(44, reply)], 'model.stdout'))
        reply['cleanup_complete'] = False
        self.assertEqual(runner.port_failure([(44, reply)], 'model.stdout'), 'model.stdout:44')

    def test_wait_timeout_then_terminal_result(self):
        with tempfile.TemporaryDirectory() as folder:
            report = {'head': 'a' * 40, 'tree': 'b' * 40, 'phase': 'model', 'runs': [{'scenario': 'n1', 'status': 'PENDING'}]}
            runner.write(Path(folder) / 'results.json', report)
            command = [sys.executable, str(Path(runner.__file__)), 'wait', folder, '--timeout', '0']
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual((result.returncode, result.stdout, result.stderr), (2, '0/1 готово, идёт n1\n', ''))
            report.update(finished=1)
            report['runs'][0]['status'] = 'UNKNOWN'
            runner.write(Path(folder) / 'results.json', report)
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('| n1 | UNKNOWN |', result.stdout)
            self.assertEqual(result.stderr, '')

    def test_start_rejects_invalid_input_before_detach(self):
        with tempfile.TemporaryDirectory() as folder:
            pair = Path(folder) / 'pair'
            pair.mkdir()
            for role in ['worker', 'reviewer']:
                runner.write(pair / (role + '.json'), {'loginom': {'username': 'test'}, 'package_directory': '/test'})
            build = Path(folder) / 'build'
            build.mkdir()
            runner.write(build / 'cli-manifest.json', {'metadata': {'sourceCommit': '0' * 40, 'sourceDirty': False}})
            for scenarios, extra in [('n1,n1', []), ('n999', []), ('n1', ['--build', str(build)])]:
                out = Path(folder) / 'must-not-exist'
                command = [sys.executable, str(Path(runner.__file__)), 'start', '--head', runner.git('rev-parse', 'HEAD'), '--scenarios', scenarios, '--pair', str(pair), '--out', str(out), *extra]
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(out.exists())
                self.assertEqual(result.stdout, '')

    def test_arguments_and_load_boundary(self):
        args = runner.arguments(['start', '--head', 'abc123', '--scenarios', 'n1,q7', '--pair', '/pair', '--cold'])
        self.assertEqual((args.host_load_max, args.spacing, args.cold), (8, 60, True))
        self.assertTrue(runner.load_ready((8, 8, 100), 8))
        self.assertFalse(runner.load_ready((7, 8.01, 0), 8))
        self.assertFalse(runner.load_ready((float('nan'), 0, 0), 8))
        with self.assertRaises(SystemExit): runner.arguments(['wait', '/run', '--timeout', '-1'])

    def test_table_failure_details_and_no_raw_logs(self):
        text = runner.summary({'head': 'a' * 40, 'tree': 'b' * 40, 'runs': [
            {'scenario': 'n1', 'status': 'PASS', 'csv': 'PASS', 'start_load': [1, 2]},
            {'scenario': 'q7', 'status': 'FAIL', 'failure_class': 'COLD_FAILED', 'detail': 'bad values', 'location': 'cold/events:17', 'failure_load': [2, 3], 'profile': '/private/profile'}]})
        for word in ['n1 | PASS', '1.00/2.00', 'q7 | FAIL', 'cold/events:17', '/private/profile', 'COLD_FAILED']:
            self.assertIn(word, text)
        self.assertEqual(text.count('FAIL q7:'), 1)

    def test_csv_full_file_and_order(self):
        expected = {'columns': [{'name': 'SKU', 'type': 'string'}, {'name': 'Count', 'type': 'integer'}], 'rows': [{'SKU': 'A', 'Count': 2}, {'SKU': 'B', 'Count': 3}], 'ordered': True}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'actual.csv'
            path.write_text('SKU,Count\nA,2\nB,3\n')
            self.assertEqual(runner.check_csv(path, expected), ',')
            path.write_text('SKU,Count\nA,2\nB,999\n')
            with self.assertRaisesRegex(AssertionError, 'CSV_VALUES'): runner.check_csv(path, expected)


if __name__ == '__main__': unittest.main()
