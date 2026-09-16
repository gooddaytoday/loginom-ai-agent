import copy
from pathlib import Path
import unittest
from calculator_goal_contract import verify_goal,expected_rows,IMPORT_COLUMNS,EXPRESSIONS,OUTPUT_NAMES
from upload_probe import FIXTURE


class CalculatorGoalTests(unittest.TestCase):
    def setUp(self):
        self.source=(Path(__file__).parent/FIXTURE).read_bytes()
        read=dict(ports=[0],sample_rows=10,require_exact_numbers=True)
        self.seed=dict(target=dict(kind='new',type='imports.text',label='Продажи'),mode='delimited',finish='execute',inputs=[],mappings=[],read=read,
            parameters=dict(settings=dict(source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),
                format=dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker='\\N'),columns=copy.deepcopy(IMPORT_COLUMNS))))
        fields=[dict(source=dict(kind='configured_field',name=c['name']),**(dict(name='Qty',label='Количество') if c['name']=='Quantity' else {})) for c in IMPORT_COLUMNS]
        outputs=[dict(source=dict(kind='configured_field',name=n)) for n in OUTPUT_NAMES]+[dict(source=dict(kind='configured_field',name='Region'),excluded=True)]
        self.calc=dict(target=dict(kind='new',type='transform.calculator',label='Расчёт'),mode='expression',finish='execute',read=read,
            parameters=dict(expressions=[dict(e,target=dict(kind='new')) for e in EXPRESSIONS]),
            mappings=[dict(direction='input',port=0,autosync=False,fields=fields),dict(direction='output',port=0,autosync=False,fields=outputs)])
    def audit(self):return verify_goal(self.seed,self.calc,self.source)
    def test_declared_task_and_independent_expected(self):
        self.assertTrue(self.audit()['passed']);rows=expected_rows(self.source)
        self.assertEqual(len(rows),6);self.assertEqual(rows[0][2],'37.5');self.assertEqual(rows[4][2],'-8.0')
        self.assertIsNone(rows[1][-1]);self.assertEqual(rows[0][-1],'')
        self.calc['parameters']['expressions'][0]['formula']='Qty*UnitPrice'
        self.assertTrue(self.audit()['passed'])
    def test_incorrect_calculation_and_duplicate_label_change_rejected(self):
        for key,value in [('formula','Qty + UnitPrice'),('label','Other'),('replace',True)]:
            old=self.calc['parameters']['expressions'][0][key];self.calc['parameters']['expressions'][0][key]=value
            self.assertFalse(self.audit()['passed']);self.calc['parameters']['expressions'][0][key]=old
    def test_mapping_must_preserve_source_identity_order_and_exclusion(self):
        self.calc['mappings'][1]['fields'].reverse();self.assertFalse(self.audit()['passed'])
        self.calc['mappings'][1]['fields'].reverse();self.calc['mappings'][1]['fields'][-1]['excluded']=False
        self.assertFalse(self.audit()['passed'])
    def test_fixture_substitution_rejected(self):
        self.source+=b'\n';self.assertFalse(self.audit()['passed'])
    def test_unchanged_explicit_output_names_are_accepted(self):
        self.calc['mappings'][1]['fields'][0].update(name='Id',label='Id')
        self.assertTrue(self.audit()['passed'])
