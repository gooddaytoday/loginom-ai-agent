import copy
import unittest

from audit_sales_scenario import compare_source, typed_rows, aggregate_fields, compare_transaction_counts


class FullSourceAuditTests(unittest.TestCase):
    def setUp(self):
        self.reference = [dict(transaction_id='1', quantity='2', unit_price='0.1', total='0.2', date='2024-01-01', category='A', region='N')]
        # Actual native field order may differ. Every cell remains bound by schema.
        values = [('date', 'datetime', '2024-01-01T00:00:00.000', 'millisecond'),
                  ('region', 'string', 'N', 'display_text'), ('category', 'string', 'A', 'display_text'),
                  ('transaction_id', 'integer', '1', 'exact_integer'), ('quantity', 'integer', '2', 'exact_integer'),
                  ('unit_price', 'real', '0.1', '17_significant_digits'), ('total', 'real', '0.2', '17_significant_digits')]
        self.table = dict(verified=True, complete=True, row_count=1,
                          schema=[dict(name=n, type=t) for n,t,_,_ in values],
                          rows=[[dict(type=t, value=v, precision=p, is_null=False) for _,t,v,p in values]])

    def test_all_fields_compared_independent_of_column_order(self):
        self.assertEqual(compare_source(self.table, self.reference)['rows_checked'], 1)

    def test_same_count_wrong_period_or_value_fails(self):
        for index, value in [(0, '2023-01-01T00:00:00.000'), (1, 'S'), (6, '0.21')]:
            bad = copy.deepcopy(self.table)
            bad['rows'][0][index]['value'] = value
            with self.assertRaises(ValueError):
                compare_source(bad, self.reference)

    def test_repeated_id_cannot_hide_missing_transaction(self):
        bad = copy.deepcopy(self.table)
        bad['rows'] *= 2
        bad['row_count'] = 2
        with self.assertRaises(ValueError):
            compare_source(bad, self.reference + [dict(self.reference[0], transaction_id='2')])

    def test_sample_and_unverified_precision_fail(self):
        bad = copy.deepcopy(self.table)
        bad['row_count'] = 2
        with self.assertRaises(ValueError):
            typed_rows(bad)
        bad = copy.deepcopy(self.table)
        bad['rows'][0][-1]['precision'] = 'unverified'
        with self.assertRaises(ValueError):
            typed_rows(bad)


class SalesCountAuditTests(unittest.TestCase):
    def test_only_reviewed_sum_and_optional_count_are_supported(self):
        parameters = dict(group_by=[dict(kind='input_field', name='category')], measures=[
            dict(field=dict(kind='input_field', name='total'), function='sum', name='revenue'),
            dict(field=dict(kind='input_field', name='transaction_id'), function='count', name='transactions')])
        self.assertEqual(aggregate_fields(parameters, ['category']), ('revenue','transactions'))
        for mutate in [lambda p:p['measures'][1].update(function='sum'),
                       lambda p:p['measures'][1].update(name='revenue'),
                       lambda p:p['group_by'][0].update(name='region'),
                       lambda p:p['measures'].append(dict(p['measures'][0]))]:
            bad=copy.deepcopy(parameters);mutate(bad)
            with self.assertRaises(ValueError):aggregate_fields(bad,['category'])

    def test_counts_reject_wrong_period_duplicate_missing_and_wrong_counts(self):
        reference=[dict(date='2024-01-01',category='A',region='N'),
                   dict(date='2024-01-02',category='A',region='N'),
                   dict(date='2024-12-31',category='B',region='N'),
                   dict(date='2025-01-01',category='B',region='N')]
        rows=[dict(category='A',n=2),dict(category='B',n=1)]
        compare_transaction_counts(rows,reference,['category'],'n')
        for bad in [[dict(category='A',n=2),dict(category='B',n=2)],
                    rows[:1],rows+[rows[0]], [dict(category='A',n=2),dict(category='X',n=1)]]:
            with self.assertRaises(ValueError):compare_transaction_counts(bad,reference,['category'],'n')
if __name__ == '__main__':
    unittest.main()
