import json
import unittest
from decimal import Decimal
from sales_sorting_oracle import expected, FIXTURE


class SalesOracleTests(unittest.TestCase):
    def test_frozen_expected_matches_fixture(self):
        self.assertEqual(expected(), json.loads(FIXTURE.with_name('expected.json').read_text()))

    def test_totals_ties_returns_and_exact_fractions(self):
        result = expected()
        self.assertEqual(result['sorted_groups']['Product'][:2], [['Alpha', '50.00'], ['Beta', '50.00']])
        self.assertEqual(result['sorted_groups']['Region'][0], ['East', '68.000'])
        total = sum(Decimal(v) for _, v in result['revenue'])
        self.assertEqual(total, Decimal('182.75'))
        for values in result['sorted_groups'].values():
            self.assertEqual(sum(Decimal(v) for _, v in values), total)
        self.assertEqual(result['revenue'][3][1], '-12.50')
        self.assertEqual(result['revenue'][4][1], '0.00')
        self.assertEqual(result['revenue'][5][1], '14.250')


if __name__ == '__main__':
    unittest.main()
