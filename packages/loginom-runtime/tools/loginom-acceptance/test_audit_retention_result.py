import copy
import unittest
from decimal import Decimal
from audit_retention_result import audit_matrix, audit_curve


def table(rows, fields):
    return dict(verified=True, complete=True, row_count=len(rows),
                schema=[dict(name=n, type=t) for n,t in fields], rows=[[
                    dict(type=t, is_null=False, value=row[n],
                         precision={'integer':'exact_integer','real':'17_significant_digits','string':'display_text'}[t])
                    for n,t in fields] for row in rows])


class RetentionGoalTests(unittest.TestCase):
    def setUp(self):
        self.oracle = dict(matrix=[dict(cohort=c, month=m, retention=str(v if m<3 else 0))
            for c,v in [('A', Decimal('0.5')),('B',Decimal(1))] for m in range(1,13)],
            curve=[dict(month=m, weighted=str(Decimal('0.625') if m<3 else 0),
                        unweighted=str(Decimal('0.75') if m<3 else 0)) for m in range(1,13)])
        self.matrix = table([dict(C=r['cohort'], M=r['month'], R=r['retention']) for r in self.oracle['matrix']],
                            [('C','string'),('M','integer'),('R','real')])
        self.binding = dict(layout='long',cohort='C',month='M',retention='R',scale=1)

    def test_complete_matrix_keeps_zero_activity_combinations(self):
        self.assertEqual(audit_matrix(self.matrix,self.binding,self.oracle)['cells_checked'],24)
        shortened=copy.deepcopy(self.matrix);shortened['rows']=shortened['rows'][:2];shortened['row_count']=2
        with self.assertRaisesRegex(ValueError,'Missing or extra'):audit_matrix(shortened,self.binding,self.oracle)

    def test_sample_duplicates_wrong_order_and_wrong_denominator_fail(self):
        for fault in ['sample','duplicate','order','value','null']:
            value=copy.deepcopy(self.matrix)
            if fault=='sample':value['complete']=False
            if fault=='duplicate':value['rows'][1]=value['rows'][0]
            if fault=='order':value['rows'][0],value['rows'][1]=value['rows'][1],value['rows'][0]
            if fault=='value':value['rows'][0][2]['value']='0.75'
            if fault=='null':value['rows'][0][1]['is_null']=True
            with self.subTest(fault=fault),self.assertRaises(ValueError):audit_matrix(value,self.binding,self.oracle)

    def test_wide_matrix_requires_every_month_and_explicit_percent_scale(self):
        rows=[dict(C=c,**{'R'+str(m):('50' if c=='A' else '100') if m<3 else '0' for m in range(1,13)}) for c in ['A','B']]
        value=table(rows,[('C','string')]+[('R'+str(m),'real') for m in range(1,13)])
        binding=dict(layout='wide',cohort='C',months={str(m):'R'+str(m) for m in range(1,13)},scale=100)
        self.assertEqual(audit_matrix(value,binding,self.oracle)['cells_checked'],24)
        binding['scale']=1
        with self.assertRaises(ValueError):audit_matrix(value,binding,self.oracle)
        binding['scale']=100;del binding['months']['12']
        with self.assertRaises(ValueError):audit_matrix(value,binding,self.oracle)

    def test_unequal_cohort_weights_cannot_be_silently_substituted(self):
        value=table([dict(M=r['month'],R=r['weighted']) for r in self.oracle['curve']], [('M','integer'),('R','real')])
        binding=dict(layout='long',month='M',retention='R',scale=1,weighting='weighted')
        self.assertEqual(audit_curve(value,binding,self.oracle)['months_checked'],12)
        binding['weighting']='unweighted'
        with self.assertRaises(ValueError):audit_curve(value,binding,self.oracle)

    def test_only_explicit_reviewed_rounding_relaxes_the_numeric_goal_check(self):
        oracle=copy.deepcopy(self.oracle);oracle['matrix'][0]['retention']='0.501234'
        binding={**self.binding,'scale':100,'rounding_decimals':1}
        value=copy.deepcopy(self.matrix)
        for row in value['rows']:row[2]['value']=str(Decimal(row[2]['value'])*100)
        value['rows'][0][2]['value']='50.1'
        audit_matrix(value,binding,oracle)
        del binding['rounding_decimals']
        with self.assertRaises(ValueError):audit_matrix(value,binding,oracle)


if __name__=='__main__':unittest.main()
