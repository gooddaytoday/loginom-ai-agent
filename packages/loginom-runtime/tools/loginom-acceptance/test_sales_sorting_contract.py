import copy
import unittest
from pathlib import Path
from sales_sorting_contract import COLUMNS,NAMES,verify_sales_goal,sales_rows,branch_rows,sales_graph
from sales_upload_probe import FIXTURE

class SalesGoalTests(unittest.TestCase):
    def setUp(self):
        self.source=(Path(__file__).parent/FIXTURE).read_bytes();self.results={};self.initial=[]
        def add(label,type,mode,parameters,upstream=None):
            op='op'+str(len(self.initial));node=dict(document_id='doc',workflow_id='flow',node_id=op)
            r=dict(operation_id=op,target=dict(kind='new',type=type,label=label),mode=mode,parameters=parameters,
                   inputs=[] if upstream is None else [dict(source=self.results[upstream['operation_id']]['node'],input=0,output=0)],mappings=[],finish='execute',read=dict(ports=[0],sample_rows=10,require_exact_numbers=True))
            self.initial.append(r);self.results[op]=dict(node=node,configuration=dict(readback={}))
            return r
        seed=add('Продажи','imports.text','delimited',dict(settings=dict(source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),format=dict(delimiter=',',text_qualifier='"',decimal_separator='.',null_marker='\\N'),columns=[dict(c,used=True) for c in COLUMNS[:5]])))
        calc=add('Выручка','transform.calculator','expression',{},seed)
        self.results[calc['operation_id']]['configuration']['readback']=dict(expressions=[dict(name='Revenue',type='real',replace=False,formula='Quantity * UnitPrice')],output_mapping=dict(fields=[dict(c,excluded=False) for c in COLUMNS]))
        self.reopened=[]
        for key,(group_label,sort_label) in NAMES.items():
            group=add(group_label,'transform.group_data','aggregate',dict(group_by=[dict(kind='input_field',name=key)],measures=[dict(field=dict(kind='input_field',name='Revenue'),function='sum',name='Total',label='Total')]),calc)
            sort=add(sort_label,'transform.sorting','keys',dict(keys=[dict(field=dict(kind='input_field',name='Total'),direction='DESC'),dict(field=dict(kind='input_field',name=key),direction='ASC',case_sensitive=True)],compare_with_locale=False),group)
            op='reopen'+key;r=dict(sort,operation_id=op,target=dict(kind='existing',type='transform.sorting',ref=self.results[sort['operation_id']]['node']),inputs=[],mappings=[],parameters={})
            self.results[op]=dict(node=self.results[sort['operation_id']]['node'],configuration=dict(readback=dict(keys=[dict(name='Total'),dict(name=key)])))
            self.reopened.append(r)
    def audit(self):return verify_sales_goal(self.initial,self.reopened,self.results,self.source)
    def test_declared_goal_and_decimal_expected_values(self):
        self.assertTrue(self.audit()['passed'],self.audit());self.assertEqual(len(sales_rows(self.source)[1]),10)
        self.assertEqual(branch_rows(self.source,'Product')[1],[['Alpha','50.00'],['Beta','50.00'],['Gamma','42.750'],['Delta','40.00']])
        self.assertEqual(len(sales_graph(self.initial)['links']),5)
    def test_wrong_link_keys_formula_extra_expression_and_reexecution_changes_rejected(self):
        changes=[lambda:self.initial[2]['inputs'].clear(),lambda:self.initial[3]['parameters']['keys'].reverse(),
                 lambda:self.results['op1']['configuration']['readback']['expressions'][0].update(formula='37.5'),
                 lambda:self.results['op1']['configuration']['readback']['expressions'].append(dict(name='Expr1')),
                 lambda:self.reopened[0]['parameters'].update(compare_with_locale=False),lambda:self.reopened[1].update(target=self.reopened[0]['target'])]
        for change in changes:
            self.setUp();change();self.assertFalse(self.audit()['passed'])
    def test_truncated_read_duplicate_branches_and_source_drift_rejected(self):
        self.initial[0]['read']['sample_rows']=1;self.assertFalse(self.audit()['passed'])
        self.setUp();self.reopened[1]=copy.deepcopy(self.reopened[0]);self.assertFalse(self.audit()['passed'])
        self.setUp();self.source+=b'\n';self.assertFalse(self.audit()['passed'])

    def test_saved_graph_uses_native_identifiers_in_all_components(self):
        graph=sales_graph(self.initial)
        self.assertEqual(graph['nodes'],sorted(['Продажи','Выручка','По_товарам','Рейтинг_товаров','По_регионам','Рейтинг_регионов']))
        self.assertEqual([p['node_label'] for p in graph['ports']],graph['nodes'])
        self.assertIn(dict(node_label='По_товарам',tids=['По_товарам;Input_Data[0]','По_товарам;Output_Data[0]']),graph['ports'])
        self.assertEqual(graph['links'],sorted(['Продажи|Output_Data[0]|Выручка|Input_Data[0]',
            'Выручка|Output_Data[0]|По_товарам|Input_Data[0]','Выручка|Output_Data[0]|По_регионам|Input_Data[0]',
            'По_товарам|Output_Data[0]|Рейтинг_товаров|Input_Data[0]','По_регионам|Output_Data[0]|Рейтинг_регионов|Input_Data[0]']))

if __name__=='__main__':unittest.main()
