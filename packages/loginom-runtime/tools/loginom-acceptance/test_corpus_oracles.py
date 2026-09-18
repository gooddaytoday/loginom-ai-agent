import tempfile
import unittest
from pathlib import Path
from corpus_oracles import sales_2024, compare_revenue_table, campaign_efficiency, cohort_retention, cross_sell, ratio


class SalesOracleTests(unittest.TestCase):
    def test_ratio_uses_decimal_and_distinguishes_zero_denominator(self):
        self.assertEqual(ratio(1, 3), '0.3333333333333333333333333333')
        self.assertIsNone(ratio(1, 0))

    def test_roi_is_ratio_of_totals_not_mean_of_row_ratios(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'input.csv'
            path.write_text('channel,target_audience,budget,revenue,clicks,impressions,conversions\nA,X,1,2,1,10,1\nA,X,9,9,9,90,0\n')
            summary=campaign_efficiency(path)['overall']
        self.assertEqual(summary['roi_percent'],'10')
        self.assertEqual(summary['ctr_percent'],'10')
        self.assertEqual(summary['conversion_percent'],'10')

    def test_retention_keeps_weighted_and_unweighted_distinct(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'input.csv'
            header='cohort,'+','.join(f'm_{i}' for i in range(1,13))+'\n'
            path.write_text(header+'A,'+','.join(['1']*12)+'\n'+('B,'+','.join(['0']*12)+'\n')*3)
            result=cohort_retention(path)
        self.assertEqual(len(result['matrix']),24)
        self.assertEqual(result['curve'][0]['weighted'],'0.25')
        self.assertEqual(result['curve'][0]['unweighted'],'0.5')

    def test_association_confidence_is_directional(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'input.csv'
            path.write_text('has_electronics,has_clothing,has_books,has_home,has_sports,order_value\n1,1,0,0,0,10\n1,0,0,0,0,20\n')
            result=cross_sell(path)
        pairs={(r['source'],r['target']):r for r in result['pairs']}
        self.assertEqual(pairs['electronics','clothing']['confidence'],'0.5')
        self.assertEqual(pairs['clothing','electronics']['confidence'],'1')

    def test_period_boundaries_and_exact_sums(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'input.csv'
            path.write_text('date,category,region,total\n2023-12-31,A,N,900\n2024-01-01,A,N,0.10\n2024-12-31,A,N,0.20\n2025-01-01,B,S,800\n')
            result = sales_2024(path)
        self.assertEqual(result['period_rows'], 2)
        self.assertEqual(result['revenue'], '0.30')
        self.assertEqual(result['tables']['categories'], [{'keys': ['A'], 'revenue': '0.30'}])

    def test_full_table_and_order_are_required(self):
        rows = [{'keys': ['A'], 'revenue': '3'}, {'keys': ['B'], 'revenue': '2'}]
        self.assertEqual(compare_revenue_table(rows, rows, ranked=True)['rows_checked'], 2)
        for bad in (rows[:1], rows + rows[:1], [dict(rows[0], revenue='4'), rows[1]], list(reversed(rows))):
            with self.assertRaises(ValueError):
                compare_revenue_table(bad, rows, ranked=True)

    def test_binary64_sum_noise_is_distinguished_from_a_cent_error(self):
        expected=[{'keys':['A'],'revenue':'95788.13'}]
        result=compare_revenue_table([{'keys':['A'],'revenue':'95788.12999999999'}],expected)
        self.assertEqual(result['absolute_tolerance'],'1E-7')
        with self.assertRaises(ValueError):
            compare_revenue_table([{'keys':['A'],'revenue':'95788.14'}],expected)


if __name__ == '__main__':
    unittest.main()
