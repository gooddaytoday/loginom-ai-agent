"""Exercise the interruption driver through the installed runner's failure path."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from run import install_interruption_runner


HERE = Path(__file__).resolve().parent
CASES = HERE.parent / 'cases'
RUNNER = Path(os.environ.get('LAB_2047_RUNNER', HERE.parents[4])) / 'scripts/node-acceptance/run-check.py'


class InterruptionFailureTests(unittest.TestCase):
    def test_manual_failures_keep_stock_status_and_category(self):
        variants = (
            ('bh-x03', 'package-close', 'MANUAL_EDIT_CLI_PACKAGE_CLOSE_UNCONFIRMED', 'FAIL', 'product', []),
            ('bh-x03', 'close-ack', 'MANUAL_EDIT_CLI_CLOSE_ACK_MISSING', 'FAIL', 'product', []),
            ('bh-x03', 'timeout', 'manual-edit deadline', 'UNKNOWN', 'runner/setup', ['move']),
            ('bh-x06', 'gesture', 'MANUAL_EDIT_GESTURE_UNCONFIRMED', 'FAIL', 'runner/setup',
             ['create', 'connect', 'filter_threshold']),
        )
        for scenario, fault, code, status, category, expected_gestures in variants:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as directory:
                spec = importlib.util.spec_from_file_location('stock_run_check', RUNNER)
                stock = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(stock)
                base = stock.Runner
                install_interruption_runner(stock)
                out = Path(directory)
                stock.write(out / 'worker.json', dict(url='https://example.invalid', username='fixture',
                                                     password='synthetic', package_directory='/test'))
                stock.write(out / 'request.json', dict(pair=str(out), cases=str(CASES), cold=False))
                stock.write(out / 'results.json', dict(head='a' * 40, tree='b' * 40, started=time.time(),
                                                     runs=[dict(scenario=scenario, status='PENDING')]))
                gestures = []

                def phase(instance, name, command, folder, **kwargs):
                    if name == 'setup':
                        for child in ('data', 'config', 'loginom/runtime'):
                            (folder / 'profile' / child).mkdir(parents=True)
                        stock.write(folder / 'setup.stdout', dict(browser=dict(state='verified')))
                        return
                    self.assertEqual(name, 'manual-edit')
                    edit = json.loads(kwargs['stdin'])['edit']
                    gestures.append(edit['kind'])
                    if fault == 'timeout':
                        raise TimeoutError(code)
                    if edit['kind'] == 'filter_threshold':
                        self.assertEqual(edit['value'], 200)
                        (folder / 'manual/execution-events.jsonl').write_text('{}\n')
                        raise AssertionError(code)
                    proof = dict(package_closed=True, logged_out=True)
                    stock.write(folder / 'manual/result.json', dict(status='PASS', cleanup=proof,
                                 reopen_cleanup=proof, persisted=dict(nodes=[], links=[])))

                def model(instance, case, folder, profile, workspace, package, *args, **kwargs):
                    target = case == f'{scenario}-t2'
                    if not (target and fault == 'package-close'):
                        cleanup = profile / f'{case}-cleanup'
                        cleanup.mkdir()
                        stock.write(cleanup / 'saved-package-cleanup.json',
                                    dict(package_closed=True, logged_out=True, package_path=package))
                    if not (target and fault == 'close-ack'):
                        stock.write(profile / f'loginom/runtime/runtime-close-{case}.json', dict(closed_ack=True))
                    return 'test-session', dict(graph={}, outputs=[]), None, None

                instance = stock.Runner(out)
                with patch.object(base, 'build', return_value=out / 'build'), \
                     patch.object(base, 'model', model), patch.object(base, 'phase', phase):
                    instance.run()

                result = stock.read(out / 'results.json')['runs'][0]
                edit = result['turns'][1]['manual_edit']
                for record in (result, edit):
                    self.assertEqual((record['status'], record['failure_class'], record['failure_category']),
                                     (status, code, category))
                self.assertEqual(result['failed_phase'], 'manual-edit')
                self.assertEqual(result['turns'][-1]['status'], 'NOT_RUN')
                self.assertEqual(gestures, expected_gestures)
                summary = (out / 'summary.md').read_text()
                self.assertIn(f'| {scenario} | {status} ({category}) |', summary)
                self.assertIn(f'| {status} | {category} | {code} |', summary)


if __name__ == '__main__':
    unittest.main()
