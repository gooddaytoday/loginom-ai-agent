"""Exercise the real runner's audit/exception/final-write/exit boundary offline."""
import ast
import contextlib
import copy
import io
import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ACCEPTANCE = Path(__file__).resolve().parent
ROOT = ACCEPTANCE.parents[4]
tree = ast.parse((ACCEPTANCE / 'run-txt-cli.py').read_text())
boundary = next(node for node in tree.body if isinstance(node, ast.Try))
# Start at the intermediate evidence write after the cold comparison; retain
# the actual audit call, final gate, handler, finally and process exit unchanged.
start = next(i for i, node in enumerate(boundary.body)
             if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
             and isinstance(node.value.func, ast.Name) and node.value.func.id == 'write_private'
             and ast.unparse(node.value.args[0]) == "evidence / 'result.json'")
selected = copy.deepcopy(boundary)
selected.body = selected.body[start - 1:]
tail = tree.body[tree.body.index(boundary) + 1:]
code = compile(ast.fix_missing_locations(ast.Module(body=[selected, *tail], type_ignores=[])),
               'run-txt-cli.py:acceptance-boundary', 'exec')


class RunnerGate(unittest.TestCase):
    def run_boundary(self, audit_ok=False, **changes):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Path(directory)
            tmp = attempt / 'tmp'; tmp.mkdir()
            evidence = attempt / 'evidence'; evidence.mkdir()
            (evidence / 'oracle').mkdir()
            rawout = tmp / 'stdout.raw'; rawout.write_text('')
            rawerr = tmp / 'stderr.raw'; rawerr.write_text('')
            expected = tmp / 'expected.json'; expected.write_text('{}')
            values = {'status': 'PASS', 'all_values_compared': True}
            result = {'status': 'FAIL', 'source_sha': 'test-sha', 'cli_exit': 0,
                      'oracle_exit': 0, 'oracle': {'status': 'PASS', 'full_values': values},
                      'cleanup': {'package_closed': True, 'logged_out': True}, **changes}
            def write_private(path, value):
                path.write_text(json.dumps(value))
            real_run = subprocess.run
            def invoke(command, **kwargs):
                if str(command[1]).endswith('txt-oracle.py'):
                    return subprocess.CompletedProcess(command, 0, stdout=json.dumps(values))
                if str(command[1]).endswith('txt-cli-audit.py'):
                    self.assertEqual(json.loads((evidence / 'result.json').read_text())['status'], 'FAIL')
                    if not audit_ok:
                        # Actual auditor subprocess: empty transcript must be refused.
                        return real_run(command, **kwargs)
                    updated = json.loads((evidence / 'result.json').read_text())
                    updated['cli_full_values'] = values
                    write_private(evidence / 'result.json', updated)
                return subprocess.CompletedProcess(command, 0)
            closed = []
            scope = dict(result=result, cold={'status': 'CHECK_VALUES' if result['oracle']['status']=='PASS' else 'FAIL', 'cleanup': result['cleanup']},
                         oracle=evidence / 'oracle', evidence=evidence, attempt=attempt, expected=expected,
                         acceptance=ACCEPTANCE, root=ROOT, rawout=rawout, rawerr=rawerr,
                         node='node', OPS=Path('/unused'), cfgpath=Path('/unused'),
                         cfg={'provider_auth_file': '/unused'}, started=time.monotonic(), lock=1,
                         os=type('OS', (), {'close': staticmethod(closed.append)}),
                         subprocess=subprocess, sys=sys, json=json, time=time,
                         write_private=write_private)
            exit_code = 0
            with patch.object(subprocess, 'run', side_effect=invoke), contextlib.redirect_stdout(io.StringIO()):
                try:
                    exec(code, scope)
                except SystemExit as error:
                    exit_code = error.code
            self.assertEqual(closed, [1])
            return exit_code, json.loads((evidence / 'result.json').read_text())

    def test_actual_audit_rejection_after_cold_pass(self):
        status, result = self.run_boundary()
        self.assertEqual(status, 1)
        self.assertEqual(result['status'], 'FAIL')
        self.assertIn('error', result)
        self.assertEqual(result['oracle']['status'], 'PASS')

    def test_only_complete_audit_allows_success(self):
        status, result = self.run_boundary(audit_ok=True)
        self.assertEqual((status, result['status']), (0, 'PASS'))

    def test_cleanup_missing_or_false_refused(self):
        for cleanup in ({}, {'package_closed': True}, {'package_closed': True, 'logged_out': False}):
            with self.subTest(cleanup=cleanup):
                status, result = self.run_boundary(audit_ok=True, cleanup=cleanup)
                self.assertEqual((status, result['status']), (1, 'FAIL'))

    def test_failed_client_or_cold_refused(self):
        for changes in ({'cli_exit': 1}, {'oracle_exit': 1}, {'oracle': {'status': 'FAIL'}}):
            with self.subTest(changes=changes):
                status, result = self.run_boundary(audit_ok=True, **changes)
                self.assertEqual((status, result['status']), (1, 'FAIL'))


if __name__ == '__main__':
    unittest.main()
