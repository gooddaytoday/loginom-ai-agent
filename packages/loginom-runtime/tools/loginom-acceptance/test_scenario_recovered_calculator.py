import copy
import unittest
from scenario_recovered_calculator import recover_created_calculator


def fixture():
    node=dict(document_id='doc',workflow_id='wf',node_id='calc')
    source=dict(node,node_id='source')
    creation=dict(operation_id='failed',target=dict(kind='new',type='transform.calculator',label='Calc'),inputs=[dict(source=source,output=0,input=0)])
    expression=dict(target=dict(kind='existing',name='Expr1'),name='Month',label='Month',type='integer',formula='1',replace=False)
    args=dict(operation_id='corrected',target=dict(kind='existing',type='transform.calculator',ref=node),inputs=[],parameters=dict(expressions=[expression]))
    result=dict(status='SUCCEEDED',node=node,cleanup_complete=True)
    failed=dict(status='FAILED',operation_id='failed',node=node,cleanup_complete=True)
    nodes={'source':dict(id='source',label='Source',type='imports.text')}
    graph=dict(document_id='doc',workflow_id='wf',foreign_links=[],nodes=[dict(ref=source,label='Source',type='imports.text'),dict(ref=node,label='Calc',type='transform.calculator')],links=[dict(source='source',output=0,target='calc',input=0)])
    baseline=dict(expressions=[dict(name='Expr1',formula='',type='real',replace=False,intermediate=False)])
    closed=dict(verified=True,cleanup_complete=True,settings_applied=False,draft_discarded=True,node_context=node)
    proof=dict(node=node,before=baseline,after=copy.deepcopy(baseline),settings_readback_verified=True,syntax_failure_verified=True,first_close=closed,closed=copy.deepcopy(closed),graph_before=graph,graph_after=copy.deepcopy(graph))
    receipt=dict(phase='configure',status='FAILED',cleanup_complete=True,settings_unchanged=True,verification='calculator_syntax_rejected_draft_restored',before_node=node,proof=proof)
    events=[dict(phase='node_phase_refused',operation_id='failed',receipt=receipt)]
    return args,result,{'failed':[creation]},[failed,result],events,nodes,set()


class RecoveredCalculatorTests(unittest.TestCase):
    def test_complete_patch_projects_verified_default_without_changing_formula(self):
        values=fixture();original=copy.deepcopy(values[0])
        info,edge,parameters,provenance=recover_created_calculator(*values)
        self.assertEqual(info['id'],'calc');self.assertEqual(edge,('source',0,'calc',0))
        self.assertEqual(parameters['expressions'][0]['target'],dict(kind='new'))
        self.assertEqual(parameters['expressions'][0]['formula'],'1')
        self.assertEqual(values[0],original);self.assertEqual(provenance['recorded_parameters'],original['parameters'])

    def test_unknown_effects_foreign_graph_changed_settings_and_partial_patches_are_rejected(self):
        changes=[lambda v:v[4][0]['receipt'].update(cleanup_complete=False),
                 lambda v:v[4][0]['receipt']['proof'].update(settings_readback_verified=False),
                 lambda v:v[4][0]['receipt']['proof']['after']['expressions'][0].update(formula='2'),
                 lambda v:v[4][0]['receipt']['proof']['graph_after']['links'].clear(),
                 lambda v:v[4][0]['receipt']['proof']['closed'].update(node_context=dict(node_id='foreign')),
                 lambda v:v[0]['parameters']['expressions'][0]['target'].update(name='Other'),
                 lambda v:v[0]['parameters']['expressions'][0].pop('formula'),
                 lambda v:v[2]['failed'][0]['inputs'][0]['source'].update(document_id='foreign'),
                 lambda v:v[3].reverse(),lambda v:v[1].update(cleanup_complete=False)]
        for change in changes:
            values=copy.deepcopy(fixture());change(values)
            with self.assertRaises(ValueError):recover_created_calculator(*values)


if __name__=='__main__':unittest.main()
