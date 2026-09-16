import unittest
from copy import deepcopy
from date_time_oracle import ROWS, calendar_value, verify_output

class DateTimeOracleTests(unittest.TestCase):
    def test_calendar_boundaries_and_null(self):
        self.assertEqual(calendar_value('2024-02-29T08:12:34.000', 'month_end'), '2024-02-29T00:00:00.000')
        self.assertEqual(calendar_value('2023-02-03T00:00:00.000', 'month_end'), '2023-02-28T00:00:00.000')
        self.assertEqual(calendar_value('2024-04-01T00:00:00.000', 'quarter_start'), '2024-04-01T00:00:00.000')
        self.assertEqual(calendar_value('2023-12-31T23:59:59.000', 'year_end'), '2023-12-31T00:00:00.000')
        self.assertEqual(calendar_value('2023-12-31T23:59:59.000', 'hour'), 23)
        self.assertIsNone(calendar_value(None, 'date'))

    def test_output_precision_and_complete_rows_are_required(self):
        projection = [dict(name='M', label='Месяц', type='datetime', input='DateA', operation='month_start')]
        port = dict(schema=[dict(name='M', label='Месяц', type='datetime')], row_count=4, sample_rows=4, sample_complete=True,
                    sample=[[dict(type='datetime', is_null=row['DateA'] is None,
                                  value=calendar_value(row['DateA'], 'month_start'), precision='millisecond',
                                  timezone='unspecified', representation='local_datetime')] for row in ROWS])
        self.assertTrue(verify_output(port, projection)['passed'])
        for mode in ('partial', 'rounded', 'false_null', 'wrong_value', 'swapped_rows', 'wrong_type'):
            bad = deepcopy(port)
            if mode == 'partial': bad['sample_complete'] = False
            if mode == 'rounded': bad['sample'][0][0]['precision'] = 'unverified'
            if mode == 'false_null': bad['sample'][0][0]['is_null'] = True
            if mode == 'wrong_value': bad['sample'][0][0]['value'] = '2023-12-31T23:59:59.999'
            if mode == 'swapped_rows': bad['sample'][0], bad['sample'][1] = bad['sample'][1], bad['sample'][0]
            if mode == 'wrong_type': bad['schema'][0]['type'] = 'string'
            with self.assertRaises(ValueError, msg=mode): verify_output(bad, projection)

    def test_empty_output_has_no_implicit_current_date(self):
        self.assertTrue(verify_output(dict(schema=[], row_count=0, sample_rows=0, sample_complete=True, sample=[]), [], rows=[])['passed'])

if __name__ == '__main__':
    unittest.main()
