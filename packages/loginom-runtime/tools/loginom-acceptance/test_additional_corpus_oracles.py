import tempfile
import unittest
from pathlib import Path
from corpus_oracles import monthly_sales_descriptive,geographic_sales_efficiency

class AdditionalCorpusOracles(unittest.TestCase):
    def run_csv(self,text,fn):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'data.csv';p.write_text(text);return fn(p)
    def test_month_ranking_ties_and_unequal_period_counts(self):
        r=self.run_csv('month,sales,advertising_budget,holidays\n2023-01,10,2,0\n2024-01,30,5,1\n2024-02,30,4,0\n',monthly_sales_descriptive)
        self.assertEqual([r['month'] for r in r['monthly_ranking']],['2024-01','2024-02','2023-01'])
        self.assertEqual(r['tables']['calendar_months'][0]['mean_sales'],'20')
        self.assertEqual(r['tables']['calendar_months'][1]['mean_sales'],'30')
        self.assertEqual(r['tables']['holidays'][0]['mean_sales'],'20')
    def test_duplicate_month_rejected(self):
        with self.assertRaises(ValueError):self.run_csv('month,sales,advertising_budget,holidays\n2024-01,1,1,0\n2024-01,2,2,1\n',monthly_sales_descriptive)
    def test_area_weighted_ratio_is_not_mean_of_store_ratios(self):
        r=self.run_csv('store_id,city,region,monthly_sales,store_area\n1,A,X,100,10\n2,A,Y,100,100\n',geographic_sales_efficiency)
        self.assertEqual(r['overall']['mean_store_sales_per_area'],'5.5')
        self.assertEqual(r['overall']['sales_per_total_area'],'1.818181818181818181818181818')
        self.assertEqual(len(r['tables']['cities']),1);self.assertEqual(len(r['tables']['city_regions']),2)
    def test_zero_area_and_duplicate_store_rejected(self):
        for rows in ['1,A,X,100,0\n','1,A,X,100,1\n1,B,X,50,2\n']:
            with self.assertRaises(ValueError):self.run_csv('store_id,city,region,monthly_sales,store_area\n'+rows,geographic_sales_efficiency)
