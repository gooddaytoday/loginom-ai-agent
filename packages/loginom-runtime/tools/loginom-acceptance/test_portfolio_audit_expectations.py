import csv
import tempfile
import unittest
from pathlib import Path
from portfolio_audit_expectations import build_portfolio_expectations, portfolio_filter
from decimal import Decimal


class PortfolioAudit(unittest.TestCase):
    def test_numeric_filter_includes_exact_threshold_and_checks_all_clauses(self):
        groups=[[dict(field=dict(kind='input_field',name='risk'),type='real',operator='>=',value=0.7)]]
        self.assertFalse(portfolio_filter(dict(risk=Decimal('0.699')),groups))
        self.assertTrue(portfolio_filter(dict(risk=Decimal('0.700')),groups))
        groups.append([dict(field=dict(kind='input_field',name='risk'),type='real',operator='unknown',value=0.7)])
        with self.assertRaisesRegex(ValueError,'Unreviewed'):portfolio_filter(dict(risk=Decimal('0.8')),groups)

    def test_all_rows_and_group_boundaries_are_derived_from_source(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset=Path(directory)/'dataset.csv'
            names=['loan_id','customer_age','loan_amount','credit_score','annual_income','default_risk_score','loan_term_months','collateral_value']
            columns=[dict(name=n,source_name=n,type='real' if n=='default_risk_score' else 'integer') for n in names]
            with dataset.open('w') as stream:
                writer=csv.DictWriter(stream,fieldnames=names);writer.writeheader()
                for i in range(300):writer.writerow(dict(zip(names,[i+1,25 if i<100 else 26,100,500,200,'0.1' if i<100 else '0.7',12,80])))
            base_schema=[dict(name=c['name'],type=c['type']) for c in columns]
            plan=dict(task=21,operator_reviewed=True,run_id='test',expected_graph=dict(nodes=[dict(id='i',type='imports.text'),dict(id='c',type='transform.calculator'),dict(id='g',type='transform.group_data')],
                links=[dict(source='i',output=0,target='c',input=0),dict(source='c',output=0,target='g',input=0)]),
                model_operations_for_review=[dict(node_id='i',parameters=dict(settings=dict(columns=columns)),mappings=[]),
                dict(node_id='c',parameters=dict(expressions=[dict(name='age_group',formula='IF(customer_age < 26, "young", "older")',type='string',replace=False,target=dict(kind='new'))]),mappings=[]),
                dict(node_id='g',parameters=dict(group_by=[dict(name='age_group')],measures=[dict(name='count',field=dict(name='loan_id'),function='count'),dict(name='mean',field=dict(name='default_risk_score'),function='avg')]),mappings=[])],
                outputs=[dict(node_id='i',name='import',port=0,schema=base_schema),dict(node_id='c',name='calculator',port=0,schema=base_schema+[dict(name='age_group',type='string')]),
                         dict(node_id='g',name='group',port=0,schema=[dict(name='age_group',type='string'),dict(name='count',type='integer'),dict(name='mean',type='real')])])
            result=build_portfolio_expectations(dataset,plan)
            self.assertFalse(result['operator_reviewed'])
            self.assertEqual(len(result['tables']['calculator']['rows']),300)
            self.assertEqual(result['tables']['group']['rows'],[dict(age_group='young',count='100',mean='0.1'),dict(age_group='older',count='200',mean='0.7')])
            plan['expected_graph']['nodes'].append(dict(id='f',type='transform.filter_data'))
            plan['expected_graph']['links'].append(dict(source='c',output=0,target='f',input=0))
            plan['model_operations_for_review'].append(dict(node_id='f',mappings=[],parameters=dict(groups=[[
                dict(field=dict(kind='input_field',name='default_risk_score'),type='real',operator='>=',value=0.7)]])))
            plan['outputs'].extend(dict(node_id='f',name='filter'+str(port),port=port,schema=plan['outputs'][1]['schema']) for port in (0,1))
            filtered=build_portfolio_expectations(dataset,plan)['tables']
            self.assertEqual(len(filtered['filter0']['rows']),200)
            self.assertEqual(len(filtered['filter1']['rows']),100)
            self.assertEqual({r['loan_id'] for r in filtered['filter0']['rows']} & {r['loan_id'] for r in filtered['filter1']['rows']},set())
            plan['model_operations_for_review'][1]['parameters']['expressions'][0]['formula']='Unknown(customer_age)'
            with self.assertRaisesRegex(ValueError,'Unsupported audit function'):build_portfolio_expectations(dataset,plan)


if __name__=='__main__':unittest.main()
