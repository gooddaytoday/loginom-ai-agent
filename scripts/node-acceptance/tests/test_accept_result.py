from pathlib import Path
import subprocess
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'accept-node.sh'


class AcceptanceResultTests(unittest.TestCase):
    def run_result(self, cli=0, oracle=0, status='PASS', closed='true', logout='true', timed_out='false'):
        # Execute the production verdict and exit block; do not mirror its logic.
        source = SCRIPT.read_text()
        start = source.rindex('if [[ "$TIMED_OUT" == "true" ]]; then')
        return subprocess.run(['bash', '-c', '''trap 'printf "%s\\n" "$RESULT_STATUS"' EXIT
''' + source[start:]], env={
            'CLI_EXIT': str(cli), 'ORACLE_EXIT': str(oracle), 'ORACLE_STATUS': status,
            'CLEANUP_PACKAGE_CLOSED': closed, 'CLEANUP_LOGGED_OUT': logout,
            'TIMED_OUT': timed_out,
        }, capture_output=True, text=True)

    def test_cli_failure_excludes_pass_after_successful_cold_check(self):
        result = self.run_result(cli=1)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout.strip(), 'FAIL')

    def test_success(self):
        result = self.run_result()
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), 'PASS')

    def test_oracle_and_cleanup_failures(self):
        for inputs in [{'oracle': 1}, {'status': 'FAIL'}, {'closed': 'false'},
                       {'logout': 'false'}, {'timed_out': 'true'}]:
            with self.subTest(inputs=inputs):
                self.assertEqual(self.run_result(**inputs).returncode, 1)


if __name__ == '__main__':
    unittest.main()
