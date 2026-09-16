import copy
import unittest
from pathlib import Path
from filter_goal_contract import goal_output,verify_goal,INITIAL_GROUPS,FINAL_GROUPS,COLUMNS
from row_filter_configuration_evidence import native_groups

class FilterGoalTests(unittest.TestCase):
    def test_full_golden_partition_keeps_duplicate_and_null_empty_distinction(self):
        source=(Path(__file__).parent/'fixtures/row-filter/golden.csv').read_bytes()
        _,initial=goal_output(source,False);_,final=goal_output(source,True)
        self.assertEqual([[r[0] for r in p] for p in initial],[[1,2,3,6,6,7,8,9],[4,5]])
        self.assertEqual([[r[0] for r in p] for p in final],[[3,6,6,7,8],[1,2,4,5,9]])
        self.assertEqual(initial[1][0][-1],'');self.assertIsNone(initial[1][1][-1])
        self.assertEqual(final[0][1],final[0][2])
        self.assertEqual(final[0][0][1],'1.23456');self.assertEqual(final[0][1][3],'2024-01-02 12:30:01.000')
    def test_goal_rejects_missing_port_weakened_predicate_and_mapping_reapplication(self):
        source=(Path(__file__).parent/'fixtures/row-filter/golden.csv').read_bytes()
        read=dict(ports=[0,1],sample_rows=10,require_exact_numbers=True)
        seed=dict(target=dict(kind='new',type='imports.text',label='Данные'),mode='delimited',inputs=[],mappings=[],finish='execute',read=dict(read,ports=[0]),
            parameters=dict(settings=dict(source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),
              format=dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker='NULL'),columns=[dict(c,used=True) for c in COLUMNS])))
        mappings=[dict(direction='output',port=p,autosync=False,fields=[dict(source=dict(kind='configured_field',name=c['name'])) for c in COLUMNS]) for p in (0,1)]
        initial=dict(target=dict(kind='new',type='transform.filter_data',label='Отбор'),mode='conditions',parameters=dict(groups=INITIAL_GROUPS),mappings=mappings,finish='execute',read=read)
        changed=dict(initial,target=dict(kind='existing',type='transform.filter_data'),parameters=dict(groups=FINAL_GROUPS),mappings=[])
        self.assertTrue(verify_goal(seed,initial,changed,source)['passed'])
        explicit=copy.deepcopy(seed)
        for c in explicit['parameters']['settings']['columns']:c['source_name']=c['name']
        self.assertTrue(verify_goal(explicit,initial,changed,source)['passed'])
        for value in ('Amount','',None):
            invalid=copy.deepcopy(explicit);invalid['parameters']['settings']['columns'][0]['source_name']=value
            self.assertFalse(verify_goal(invalid,initial,changed,source)['passed'])
        invalid=copy.deepcopy(explicit);invalid['parameters']['settings']['columns'].reverse()
        self.assertFalse(verify_goal(invalid,initial,changed,source)['passed'])
        reordered=dict(changed,parameters=dict(groups=[list(reversed(g)) for g in reversed(FINAL_GROUPS)]))
        self.assertTrue(verify_goal(seed,initial,reordered,source)['passed'])
        for patch in (dict(read=dict(read,ports=[0])),dict(parameters=dict(groups=INITIAL_GROUPS)),dict(mappings=mappings)):
            self.assertFalse(verify_goal(seed,initial,dict(changed,**patch),source)['passed'])
    def test_native_saved_groups_keep_or_and_exact_operands(self):
        row=dict(kind='condition',field=dict(kind='row_number'),type='integer',operator_code=8,lower=2,upper=4)
        result=native_groups(dict(rows=[row,dict(kind='or'),dict(row,operator_code=11,values=[1,9])]))
        self.assertEqual([len(g) for g in result],[1,1]);self.assertEqual(result[1][0]['values'],[1,9])
        for rows in ([],[dict(kind='or')],[row,dict(kind='or')],[dict(row,operator_code=999)]):
            with self.assertRaises(ValueError):native_groups(dict(rows=rows))

if __name__=='__main__':unittest.main()
