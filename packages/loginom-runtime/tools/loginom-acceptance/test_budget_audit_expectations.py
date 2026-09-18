import unittest
import csv
import tempfile
from pathlib import Path
from decimal import Decimal as D

from budget_audit_expectations import aggregate, build_budget_expectations, apply_numeric_expressions
from copy import deepcopy


class BudgetArithmetic(unittest.TestCase):
    def test_constant_key_and_existing_absolute_deviation_are_independently_evaluated(self):
        rows=[dict(variance=D('-12.5')),dict(variance=D('2.5'))]
        expressions=[dict(name='all_rows',formula='1',type='integer',replace=False,target={'kind':'new'}),
                     dict(name='magnitude',formula='ABS(variance)',type='real',replace=False,target={'kind':'new'})]
        apply_numeric_expressions(rows,dict(expressions=expressions))
        self.assertEqual(rows,[dict(variance=D('-12.5'),all_rows=D(1),magnitude=D('12.5')),
                               dict(variance=D('2.5'),all_rows=D(1),magnitude=D('2.5'))])

    def test_expression_audit_rejects_code_fractional_integers_overwrites_and_bad_order(self):
        base=dict(expressions=[dict(name='result',formula='1',type='integer',replace=False,target={'kind':'new'})])
        for mutate in [lambda p:p['expressions'][0].update(formula='__import__("os")'),
                       lambda p:p['expressions'][0].update(formula='1/2'),
                       lambda p:p['expressions'][0].update(name='variance'),
                       lambda p:p.update(order=['unknown']),
                       lambda p:p['expressions'][0].update(replace=True)]:
            parameters=deepcopy(base);mutate(parameters)
            with self.assertRaises(ValueError):apply_numeric_expressions([dict(variance=D(2))],parameters)

    def test_average_is_mean_of_rows_not_ratio_of_totals(self):
        rows = [dict(category='A', budget=D(100), actual=D(200), pct=D(100)),
                dict(category='A', budget=D(900), actual=D(900), pct=D(0))]
        parameters = dict(group_by=[dict(name='category')], measures=[
            dict(name='budget', field=dict(name='budget'), function='sum'),
            dict(name='actual', field=dict(name='actual'), function='sum'),
            dict(name='average', field=dict(name='pct'), function='avg'),
            dict(name='count', field=dict(name='budget'), function='count')])
        result, keys = aggregate(rows, parameters)
        self.assertEqual(keys, ['category'])
        self.assertEqual(result, [dict(category='A', budget=D(1000), actual=D(1100), average=D(50), count=D(2))])
        self.assertNotEqual(result[0]['average'], (result[0]['actual']/result[0]['budget']-1)*100)

    def test_binary_csv_flag_can_be_boolean_or_integer_but_not_arbitrary_text(self):
        types = dict(budget_id='integer', category='string', quarter='string', budgeted='real', actual='real', department='string', variance='real', variance_pct='real', is_over_budget='integer')
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory)/'dataset.csv'
            with dataset.open('w') as stream:
                writer = csv.DictWriter(stream, fieldnames=types); writer.writeheader()
                for i in range(120):
                    writer.writerow(dict(budget_id=i, category='A', quarter='Q'+str(i%4+1), budgeted=100, actual=110, department='East', variance=10, variance_pct=10, is_over_budget=1))
            for flag_type in ['boolean', 'integer', 'string']:
                columns = [dict(name=k, source_name=k, type=flag_type if k=='is_over_budget' else v) for k,v in types.items()]
                plan = dict(task=47, operator_reviewed=True, run_id='test', expected_graph=dict(nodes=[dict(id='source', type='imports.text')], links=[]),
                            model_operations_for_review=[dict(node_id='source', parameters=dict(settings=dict(columns=columns)), mappings=[])],
                            outputs=[dict(node_id='source', name='source', port=0, schema=[dict(name=c['name'], type=c['type']) for c in columns])])
                if flag_type == 'string':
                    with self.assertRaisesRegex(ValueError, 'type differs'): build_budget_expectations(dataset, plan)
                else:
                    result = build_budget_expectations(dataset, plan)
                    self.assertEqual(result['tables']['source']['rows'][0]['is_over_budget'], True if flag_type=='boolean' else '1')
                    self.assertFalse(result['operator_reviewed'])

    def test_unknown_aggregate_refused(self):
        with self.assertRaises(ValueError):
            aggregate([dict(value=D(1))], dict(group_by=[], measures=[dict(name='x', field=dict(name='value'), function='invented')]))


if __name__ == '__main__':
    unittest.main()
