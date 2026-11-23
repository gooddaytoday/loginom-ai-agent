import csv
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('multi_file', Path(__file__).with_name('oracle-multi-file.py'))
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


class MultiFileOracle(unittest.TestCase):
    def check(self, rows, should_pass):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'actual.csv'
            with path.open('w', encoding='utf-8', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=oracle.NAMES, delimiter=';')
                writer.writeheader()
                writer.writerows({k: '\\N' if v is None else v for k, v in row.items()} for row in rows)
            if should_pass:
                oracle.check_csv(path, oracle.expected())
            else:
                with self.assertRaises(ValueError):
                    oracle.check_csv(path, oracle.expected())

    def test_original_fixture_set(self):
        rows = oracle.expected()['outputs'][0]['rows']
        self.assertEqual(len(rows), 5)
        self.assertEqual({r['FileName'] for r in rows}, {'sales_2026-01.csv', 'sales_2026-02.csv'})
        self.assertEqual(sum(r['SaleID'] == 3 for r in rows), 2)
        self.assertEqual(len(oracle.expected(True)['outputs'][0]['rows']), 6)
        self.check(list(reversed(rows)), True)

    def test_reject_missing_record(self):
        self.check(oracle.expected()['outputs'][0]['rows'][:-1], False)

    def test_reject_duplicate_record(self):
        rows = oracle.expected()['outputs'][0]['rows']
        self.check(rows + [rows[0]], False)

    def test_reject_wrong_provenance(self):
        rows = oracle.expected()['outputs'][0]['rows']
        rows[0]['FileName'] = 'sales_2026-02.csv'
        self.check(rows, False)

    def test_reject_null_replaced_by_zero(self):
        rows = oracle.expected()['outputs'][0]['rows']
        rows[2]['Amount'] = 0
        self.check(rows, False)

    def test_reject_lost_empty_string(self):
        rows = oracle.expected()['outputs'][0]['rows']
        rows[1]['Note'] = ' '
        self.check(rows, False)


if __name__ == '__main__':
    unittest.main()
