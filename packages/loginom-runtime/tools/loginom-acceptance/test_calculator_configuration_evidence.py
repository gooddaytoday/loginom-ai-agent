import copy
import unittest
from node_procedure_evidence import bound_expression_dialog,bound_port_open
from calculator_configuration_evidence import verify_calculator_configuration


class CalculatorBindingsTests(unittest.TestCase):
    def test_expression_modal_is_bound_to_selected_name_and_its_only_mask(self):
        root='MF;TF-1;WizrdMCF'
        state=dict(wizard=dict(status='observed',stage='calculator',root_tid=root,root_ref='wizard',
            expression_selection=dict(status='observed',name='Revenue'),
            expression_parameters=dict(status='observed',root_ref='editor',
                selected_expression=dict(tid=root+';CalcDataWizard;colExpressionName_Revenue'),
                fields={k:dict(status='observed',truncated=False) for k in ('name','label','type_label')})),
            ui=dict(dialogs=[dict(ref='editor',identity=dict(anchor_tid=root+';ExprDataEditForm'))],
                masks=[dict(kind='modal_background',target_tid=root,ref='wizard')]))
        self.assertTrue(bound_expression_dialog(state))
        for branch,key,value in [(state['wizard']['expression_selection'],'name','Other'),
                (state['ui']['masks'][0],'target_tid','foreign'),
                (state['wizard']['expression_parameters']['fields']['name'],'truncated',True)]:
            old=branch[key];branch[key]=value
            self.assertFalse(bound_expression_dialog(state));branch[key]=old
        state['ui']['dialogs'].append(copy.deepcopy(state['ui']['dialogs'][0]))
        self.assertFalse(bound_expression_dialog(state))

    def test_port_receipt_requires_direction_same_node_and_terminal_proof(self):
        for direction in ('input','output'):
            owner=dict(verified=True,surface='graph',locked=False,document_id='d',workflow_id='w',node_id='n')
            state=dict(prepared_node_context=owner,wizard=dict(status='absent'))
            actual=dict(verified=True,direction=direction,port=0,opening_operation_id='op:n2',document_id='d',workflow_id='w',node_id='n')
            outcome=dict(operation_id='op:n2',output=actual,trace=[dict(event=direction+'_port_wizard_verified',**actual)])
            action=dict(verb='open_'+direction+'_port',port=0)
            self.assertTrue(bound_port_open(action,outcome,state))
            for key,value in [('direction','other'),('node_id','other'),('opening_operation_id','other')]:
                changed=copy.deepcopy(outcome);changed['output'][key]=value
                self.assertFalse(bound_port_open(action,changed,state))
            outcome['trace']=[]
            self.assertFalse(bound_port_open(action,outcome,state))

    def test_empty_and_malformed_journals_never_prove_configuration(self):
        for events,request in [([],{}),([],dict(operation_id='x')),([dict(operation_id='x',phase='node_checkpoint',result={})],dict(operation_id='x'))]:
            r=verify_calculator_configuration(events,request)
            self.assertFalse(r['passed'])
            self.assertFalse(r['package_persistence_verified'])
            self.assertFalse(r['execution_values_verified'])
