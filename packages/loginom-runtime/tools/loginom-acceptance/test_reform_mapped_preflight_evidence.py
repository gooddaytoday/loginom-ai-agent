import copy
import unittest
from reform_mapped_preflight_evidence import verify_reform_mapped_preflight


def fixture():
    node=dict(document_id='d',workflow_id='w',node_id='n')
    owner=dict(node,verified=True,surface='wizard')
    im=dict(verified=True,inventory_complete=True,node_context=owner,target_fields=[dict(field_id='0',name='Raw',label='Raw',source=dict(name='Raw'))])
    cfg=dict(verified=True,inventory_complete=True,node_context=owner,caching=dict(value=0),fields=[dict(index=0,field_id='0',name='Amount',label='Raw',type='real',data_kind='Непрерывный',usage_type=0,caching_method=0,excluded=False)])
    graph=dict(prepared_node_context=dict(node,verified=True,surface='graph',locked=False,tid='Graph;N'),wizard=dict(status='absent'),ui=dict(dialogs=[],masks=[],elements=[]))
    wizard=lambda stage:dict(prepared_node_context=owner,wizard=dict(status='observed',stage=stage,root_tid='Wizard'),ui=dict(dialogs=[],masks=[],elements=[dict(ref='close',tid='Wizard;btnClose')]))
    inp=wizard('input_mapping');inp['node_mapping']=im
    reform=wizard('field_parameters');reform['node_reform']=cfg
    seq=dict(passed=True,failures=[],observations=[(1,graph),(3,inp),(5,graph),(7,reform),(9,graph)],
             mutations=[(2,dict(verb='open_input_port',port=0),{}),(4,dict(verb='click',ref='close'),{}),(6,dict(verb='begin_wizard'),{}),(8,dict(verb='click',ref='close'),{})])
    proof=dict(verified=True,cleanup_complete=True,settings_unchanged=True,input=im,configuration=cfg,closed=dict(node_context=graph['prepared_node_context']))
    es=[dict(operation_id='op',phase='node_phase_prepared',receipt=dict(phase='target'))]
    es += [dict(operation_id='op',step=n) for n in range(1,10)]
    es += [dict(operation_id='op',phase='reform_mapped_preflight_completed',proof=proof)]
    req=dict(operation_id='op',target=dict(kind='existing',ref=node),mappings=[dict(direction='input',port=0,autosync=False)])
    return req,es,seq


class MixedPreflightEvidenceTests(unittest.TestCase):
    def test_raw_cancelled_drafts_bind_projection(self):
        r,e,s=fixture();result=verify_reform_mapped_preflight(e,r,s)
        self.assertTrue(result['passed']);self.assertEqual(result['projected_fields'][0]['name'],'Amount')

    def test_settings_commits_missing_inventory_and_foreign_owners_fail(self):
        mutations=[lambda e,s:e[-1]['proof'].update(settings_unchanged=False),
                   lambda e,s:e.append(copy.deepcopy(e[-1])),
                   lambda e,s:s['mutations'][1][1].update(verb='finish_wizard'),
                   lambda e,s:s['mutations'][2][1].update(verb='execute_graph_node'),
                   lambda e,s:s['observations'][1][1].update(node_mapping={}),
                   lambda e,s:s['observations'][3][1].update(node_reform={}),
                   lambda e,s:s['observations'][4][1]['prepared_node_context'].update(locked=True),
                   lambda e,s:s.update(passed=False,failures=['unsafe_sequence'])]
        for mutate in mutations:
            r,e,s=fixture();mutate(e,s);self.assertFalse(verify_reform_mapped_preflight(e,r,s)['passed'])
