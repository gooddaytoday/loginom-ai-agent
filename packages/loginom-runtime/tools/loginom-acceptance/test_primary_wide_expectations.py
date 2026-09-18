import csv
from decimal import Decimal
from pathlib import Path
import tempfile
import unittest
from portfolio_audit_expectations import build_tabular_expectations, unpivot_integer_fields


class PrimaryWideExpectationsTests(unittest.TestCase):
    def test_integer_unpivot_preserves_zeros_labels_order_and_composite_identity(self):
        p=dict(information=[dict(kind='input_field',name='id')],transposed=[dict(kind='input_field',name=n) for n in ['m_2','m_1']],ignore_empty=False)
        columns=[dict(name='id',type='integer'),dict(name='m_1',type='integer',label='First'),dict(name='m_2',type='integer',label='Second')]
        rows=[dict(id=Decimal(1),m_1=Decimal(0),m_2=Decimal(1)),dict(id=Decimal(2),m_1=Decimal(1),m_2=Decimal(0))]
        out,keys=unpivot_integer_fields(rows,p,columns,['id'])
        self.assertEqual(keys,['id','Names'])
        self.assertEqual([(r['id'],r['Names'],r['DisplayNames'],r['Values'],r['DataTypes']) for r in out],
                         [(Decimal(1),'m_2','Second',Decimal(1),Decimal(4)),(Decimal(1),'m_1','First',Decimal(0),Decimal(4)),
                          (Decimal(2),'m_2','Second',Decimal(0),Decimal(4)),(Decimal(2),'m_1','First',Decimal(1),Decimal(4))])
        p['ignore_empty']=True;self.assertEqual(unpivot_integer_fields(rows,p,columns,['id'])[0],out)
        rows[0]['m_1']=None
        with self.assertRaises(ValueError):unpivot_integer_fields(rows,p,columns,['id'])

    def test_all_months_and_unequal_cohort_denominators(self):
        names=['customer_id','cohort','cohort_month','acquisition_month']+[f'm_{i}' for i in range(1,13)]
        fields=[dict(source_name=n,name=n,type='string' if n in ('cohort','acquisition_month') else 'integer') for n in names]
        measures=[dict(field=dict(name=f'm_{i}'),function='avg',name=f'R{i}') for i in range(1,13)]
        group=dict(group_by=[dict(name='cohort')],measures=measures)
        overall=dict(group_by=[],measures=measures)
        schema=[dict(name=f'R{i}',type='real') for i in range(1,13)]
        plan=dict(task=38,operator_reviewed=True,run_id='fixture',expected_graph=dict(nodes=[dict(id=n,type=t) for n,t in [('i','imports.text'),('g','transform.group_data'),('a','transform.group_data')]],links=[dict(source='i',target=n,input=0,output=0) for n in ('g','a')]),
            model_operations_for_review=[dict(node_id=n,parameters=p,mappings=[]) for n,p in [('i',dict(settings=dict(columns=fields))),('g',group),('a',overall)]],
            outputs=[dict(name='source',node_id='i',port=0,schema=fields),dict(name='matrix',node_id='g',port=0,schema=[dict(name='cohort',type='string')]+schema),dict(name='curve',node_id='a',port=0,schema=schema)])
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'data.csv'
            with path.open('w',newline='') as stream:
                writer=csv.DictWriter(stream,fieldnames=names);writer.writeheader()
                for i in range(596):
                    cohort=min(i+1,6)
                    row=dict(customer_id=i+1,cohort='C'+str(cohort),cohort_month=cohort,acquisition_month='M'+str(cohort))
                    row.update({f'm_{month}':int(i<5 and month<=6) for month in range(1,13)});writer.writerow(row)
            result=build_tabular_expectations(path,plan)
        self.assertEqual(len(result['tables']['source']['rows']),596)
        self.assertEqual(len(result['tables']['matrix']['rows']),6)
        curve=result['tables']['curve']['rows'][0]
        self.assertEqual(Decimal(curve['R3']),Decimal(5)/596)
        self.assertNotEqual(Decimal(curve['R3']),Decimal(5)/6)
        self.assertEqual(Decimal(curve['R6']),Decimal(5)/596)
        self.assertEqual(Decimal(curve['R12']),0)
        self.assertEqual(len(curve),12)
        self.assertFalse(result['operator_reviewed'])


    def test_cross_sell_keeps_directional_denominators(self):
        names=['order_id','has_electronics','has_clothing','has_books','has_home','has_sports','total_items','order_value','returned']
        fields=[dict(source_name=n,name=n,type='real' if n=='order_value' else 'integer') for n in names]
        expression=lambda name,formula:dict(target=dict(kind='new'),name=name,type='real',replace=False,formula=formula)
        operations=[('i','imports.text',dict(settings=dict(columns=fields))),
            ('c','transform.calculator',dict(expressions=[expression('Both','has_electronics * has_clothing')])),
            ('g','transform.group_data',dict(group_by=[],measures=[dict(field=dict(name=n),function='sum',name=out) for n,out in [('has_electronics','A'),('has_clothing','B'),('Both','AB')]])),
            ('p','transform.calculator',dict(expressions=[expression('B_given_A','AB / A'),expression('A_given_B','AB / B')]))]
        plan=dict(task=34,operator_reviewed=True,run_id='fixture',expected_graph=dict(nodes=[dict(id=n,type=t) for n,t,_ in operations],links=[dict(source=a,target=b,input=0,output=0) for a,b in [('i','c'),('c','g'),('g','p')]]),
            model_operations_for_review=[dict(node_id=n,parameters=p,mappings=[]) for n,_,p in operations],
            outputs=[dict(name='probabilities',node_id='p',port=0,schema=[dict(name=n,type='real') for n in ['A','B','AB','B_given_A','A_given_B']])])
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'data.csv'
            with path.open('w',newline='') as stream:
                writer=csv.DictWriter(stream,fieldnames=names);writer.writeheader()
                for i in range(500):
                    row={n:0 for n in names};row.update(order_id=i+1,has_electronics=int(i<100),has_clothing=int(i<50 or 100<=i<250),order_value=100);writer.writerow(row)
            result=build_tabular_expectations(path,plan)
            # Omitting a large intermediate UI table must not omit its
            # calculation from the independently computed final expectation.
            plan['outputs'].append(dict(name='intermediate',node_id='c',type='transform.calculator',port=0,
                schema=fields+[dict(name='Both',type='real')],configuration_only=True,audit_role='intermediate',
                read_omission_reason='Final directional probabilities are checked completely.',covered_by=['probabilities']))
            scoped=build_tabular_expectations(path,plan)
            self.assertEqual(scoped['tables'],result['tables'])
            plan['outputs'][-1]['node_id']='i'
            with self.assertRaises(ValueError):build_tabular_expectations(path,plan)
        row=result['tables']['probabilities']['rows'][0]
        self.assertEqual(Decimal(row['AB']),50)
        self.assertEqual(Decimal(row['B_given_A']),Decimal('0.5'))
        self.assertEqual(Decimal(row['A_given_B']),Decimal('0.25'))


if __name__=='__main__':unittest.main()
