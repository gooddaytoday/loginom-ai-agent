import copy
import unittest
from grouping_goal_contract import expected_grouping
from grouping_output_evidence import align_expected_rows
from node_procedure_evidence import bound_schema_preview, bound_grouping_factor

class GroupingEvidenceTest(unittest.TestCase):
    def test_count_null_empty_and_all_null(self):
        columns=[dict(name='Key',label='Key',type='string'),dict(name='Amount',label='Amount',type='real')]
        measures=[dict(field='Amount',function=f,name=f,label=f) for f in ['count','sum','avg','min','max']]
        schema,rows=expected_grouping(b'Key;Amount\nA;1.25\nA;\\N\nA;\nA;-2.5\nB;\\N\nB;\n',columns,['Key'],measures)
        self.assertEqual(rows,[['A',4,-1.25,-0.625,-2.5,1.25],['B',2,None,None,None,None]])
        self.assertEqual([f['type'] for f in schema],['string','integer','real','real','real','real'])
        self.assertEqual(expected_grouping(b'Key;Amount\n',columns,['Key'],measures)[1],[])

    def test_full_multiset_consumption_and_binary_precision(self):
        columns=[dict(type='string'),dict(type='real')]
        rows=[['A',0.123456789012345],['B',None]]
        sample=[[dict(type='string',value='B',is_null=False),dict(type='real',value=None,is_null=True)],
                [dict(type='string',value='A',is_null=False),dict(type='real',value=0.123456789012345,is_null=False)]]
        self.assertEqual(align_expected_rows(columns,rows,sample),list(reversed(rows)))
        for changed in [sample[:1],[sample[0],sample[0]],copy.deepcopy(sample)]:
            if changed==sample:changed[1][1]['value']=0.123456789012346
            with self.assertRaises(ValueError):align_expected_rows(columns,rows,changed)

    def test_preview_is_owned_and_specific(self):
        owner=dict(verified=True,document_id='doc',workflow_id='wf',node_id='upstream',surface='graph')
        preview=dict(verified=True,inventory_complete=True,state_source='cached_preview_column_infos',port=0,node_id='upstream',node_context=owner,root_tid='MF;TF-1;ModelForm;PreviewWindow')
        state=dict(node_preview_schema=preview,prepared_node_context=owner,workflow_ref=dict(prefix='MF;TF-1'),ui=dict(masks=[],dialogs=[dict(identity=dict(anchor_tid=preview['root_tid']))]))
        self.assertTrue(bound_schema_preview(state))
        for field,value in [('node_id','foreign'),('inventory_complete',False),('port',-1),('port',100),('port',True),('port','1'),('root_tid','ForeignDialog')]:
            changed=copy.deepcopy(state);changed['node_preview_schema'][field]=value;self.assertFalse(bound_schema_preview(changed))
        second=copy.deepcopy(state);second['node_preview_schema']['port']=1
        self.assertTrue(bound_schema_preview(second))
        self.assertFalse(bound_grouping_factor(state))

if __name__=='__main__':unittest.main()
