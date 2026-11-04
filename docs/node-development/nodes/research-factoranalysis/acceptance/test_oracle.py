"""Analytic fixture checks and negative controls for the proposal oracle."""
import copy
import math
from pathlib import Path
import unittest

from oracle import pca, expected, compare

MATRIX = Path(__file__).parents[1] / 'fixtures/matrix.csv'


class OracleTests(unittest.TestCase):
    def test_known_spectrum_and_loadings(self):
        result = pca(MATRIX)
        for value, correct in zip(result['eigenvalues'], [1.8, 1, 0.2]):
            self.assertAlmostEqual(value, correct, places=12)
        for row, correct in zip(result['loadings'], [[math.sqrt(0.9), 0], [math.sqrt(0.9), 0], [0, 1]]):
            for value, target in zip(row, correct):
                self.assertAlmostEqual(value, target, places=12)

    def test_population_scores_and_unused_factor(self):
        result = expected(MATRIX)
        for row in result['outputs'][0]['rows']:
            self.assertAlmostEqual(row['Factor1'], -1 if row['RowID'] <= 4 else 1, places=12)
            self.assertAlmostEqual(row['Factor2'], -1 if row['RowID'] % 2 else 1, places=12)
            self.assertIsNone(row['Factor3'])
        self.assertTrue(all(row['Factor3'] == 0 for row in result['outputs'][1]['rows']))

    def test_update_is_refitted(self):
        result = expected(MATRIX.with_name('update.csv'))
        first = result['outputs'][0]['rows'][0]
        self.assertEqual([first[k] for k in ['X', 'Y', 'Z']], [6, -6, -6])
        self.assertAlmostEqual(first['Factor1'], -1, places=12)
        self.assertAlmostEqual(first['Factor2'], -1, places=12)

    def test_covariance_mode_is_distinct(self):
        result = pca(MATRIX, standardize=False)
        for value, target in zip(result['eigenvalues'], [144 / 7, 32 / 7, 16 / 7]):
            self.assertAlmostEqual(value, target, places=12)

    def test_unsupported_training_data_refuses(self):
        for filename in ['null.csv', 'constant.csv']:
            with self.subTest(filename=filename), self.assertRaises(ValueError):
                pca(MATRIX.with_name(filename))

    def test_joint_sign_and_negative_controls(self):
        want = expected(MATRIX)
        # Hand-authored values from u/v/w fixture construction, independent of
        # the computed expected scores/loadings used by compare.
        actual = copy.deepcopy(want)
        for table in actual['outputs']:
            for row in table['rows']:
                if table['output_port'] == 0:
                    row['Factor1'] = -1 if row['RowID'] <= 4 else 1
                    row['Factor2'] = -1 if row['RowID'] % 2 else 1
                else:
                    row['Factor1'] = math.sqrt(0.9) if row['ColumnName'] in ['X', 'Y'] else 0
                    row['Factor2'] = 1 if row['ColumnName'] == 'Z' else 0
        self.assertTrue(compare(want, actual))
        for table in actual['outputs']:
            for row in table['rows']:
                row['Factor1'] *= -1
        self.assertTrue(compare(want, actual))
        mutations = [
            lambda a: a['outputs'][1]['rows'][1].update(Factor1=math.sqrt(0.9)),
            lambda a: a['outputs'][0]['rows'][0].update(Factor1=-1),
            lambda a: a['outputs'][0]['rows'][0].update(Factor3=0),
            lambda a: a['outputs'][0]['columns'][0].update(type='string'),
            lambda a: a['outputs'][0]['rows'].reverse(),
            lambda a: a['outputs'][0]['rows'][0].update(RowID=True),
            lambda a: a['outputs'].pop(),
        ]
        for index, mutate in enumerate(mutations):
            changed = copy.deepcopy(actual)
            mutate(changed)
            with self.subTest(mutation=index), self.assertRaises(AssertionError):
                compare(want, changed)


if __name__ == '__main__':
    unittest.main()
