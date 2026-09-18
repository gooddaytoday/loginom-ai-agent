import unittest
from copy import deepcopy
from scenario_audit_read_orders import consolidate_read_orders


class ReadOrderTests(unittest.TestCase):
    def fixture(self):
        return dict(expected_graph=dict(nodes=[dict(id='calc',type='transform.calculator')]),
                    outputs=[dict(node_id='calc',port=0,schema=[dict(name='rate'),dict(name='cohort')])],
                    model_operations_for_review=[
                        dict(operation_id='create',node_id='calc',mappings=[],parameters=dict(expressions=[dict(name='rate',formula='active/total')])),
                        dict(operation_id='read',node_id='calc',mappings=[],parameters=dict(expressions=[],order=['rate']))])

    def test_preserves_formulas_and_original_read_with_no_source_mutation(self):
        plan=self.fixture();before=deepcopy(plan);result=consolidate_read_orders(plan)
        self.assertEqual(plan,before)
        self.assertEqual(len(result['model_operations_for_review']),1)
        self.assertEqual(result['model_operations_for_review'][0]['parameters']['expressions'],before['model_operations_for_review'][0]['parameters']['expressions'])
        self.assertEqual(result['calculator_read_order_provenance'][0]['original_operation'],before['model_operations_for_review'][1])

    def test_refuses_formula_mapping_and_incomplete_order_changes(self):
        for parameters,mappings in [(dict(expressions=[dict(formula='0')]),[]),
                                    (dict(expressions=[],order=['rate','rate']),[]),
                                    (dict(expressions=[],order=['rate','cohort']),[]),
                                    (dict(expressions=[],mode='other'),[]),
                                    (dict(expressions=[]),[dict(port=0)])]:
            plan=self.fixture();plan['model_operations_for_review'][1].update(parameters=parameters,mappings=mappings)
            with self.assertRaises(ValueError):consolidate_read_orders(plan)

    def test_expression_reorder_keeps_definitions_and_unchanged_read_needs_no_order(self):
        plan=self.fixture()
        plan['model_operations_for_review'][0]['parameters']['expressions'].append(dict(name='other',formula='active+total'))
        plan['model_operations_for_review'][1]['parameters']['order']=['other','rate']
        result=consolidate_read_orders(plan)
        self.assertEqual(result['model_operations_for_review'][0]['parameters']['expressions'],
                         list(reversed(plan['model_operations_for_review'][0]['parameters']['expressions'])))
        del plan['model_operations_for_review'][1]['parameters']['order']
        result=consolidate_read_orders(plan)
        self.assertEqual(result['model_operations_for_review'][0]['parameters'],plan['model_operations_for_review'][0]['parameters'])
