"""Cold fixture values stay bound to the independent business oracles."""
import csv
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3] / 'docs/testing/loginom-ai-agent/stability-2026-10-20'


class RequestedSchemaOracle(unittest.TestCase):
    def test_s5_oracle_preserves_canonical_label_policy_and_values(self):
        scenario = ROOT.parent / 'demo-2026-10-22/s5-pivot'
        result = subprocess.run([sys.executable, '-B', str(scenario / 'oracle.py')], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), json.loads((scenario / 'expected-demo.json').read_text()))

    def test_cold_references_and_wrong_csv_against_independent_oracles(self):
        with tempfile.TemporaryDirectory(prefix='requested-schema-') as directory:
            for name in ['n13', 'n18', 'n19', 'n20']:
                with self.subTest(case=name):
                    expected = json.loads((ROOT / name / 'expected-demo.json').read_text())['outputs'][0]
                    rows = expected['rows']
                    fields = [column['name'] for column in expected['columns']]
                    path = Path(directory) / (name + '.csv')
                    for correct in [True, False]:
                        values = [dict(row) for row in rows]
                        if not correct:
                            if name == 'n19':
                                for row in values:
                                    row['Group'] = 'one-group'
                            else:
                                field = {'n13': 'Sep', 'n18': 'TotalUnits', 'n20': 'Forecast'}[name]
                                values[0][field] = 999999
                        with path.open('w', newline='', encoding='utf-8') as file:
                            writer = csv.DictWriter(file, fieldnames=fields)
                            writer.writeheader()
                            writer.writerows(values)
                        result = subprocess.run([sys.executable, '-B', str(ROOT / name / 'oracle.py'), str(path)],
                                                capture_output=True, text=True)
                        if correct:
                            self.assertEqual(result.returncode, 0, result.stderr)
                            self.assertEqual(result.stdout.strip(), 'PASS')
                        else:
                            self.assertNotEqual(result.returncode, 0)
                            self.assertTrue(result.stderr.startswith('FAIL:'), result.stderr)

    def test_p22_expected_is_reproduced_by_independent_decimal_oracle(self):
        result = subprocess.run([sys.executable, '-B', str(ROOT / 'p22/oracle.py')], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, (ROOT / 'p22/expected.json').read_bytes())


if __name__ == '__main__':
    unittest.main()
