"""Synthetic auditor unit tests only; never a substitute for live acceptance."""
import copy
import importlib.util
from pathlib import Path
import unittest

import audit
import auto_link_delete

def graph(snapshot):
    value=copy.deepcopy(snapshot)
    value.setdefault('ui',{})['truncated']={'nodes':False,'ports':False,'links':False}
    return audit.snapshot_graph(value)

EDGE='Источник|Output_Data[0]|Объединение|Input_Data[0]'
TID='MF;TF-1;Graph;Источник|Output_Data-0|Объединение|Input_Data-0'

class Proof(unittest.TestCase):
    def setUp(self):
        self.snapshot={'observation_id':'before','nodes':[
            {'node_ref':{'node_label':'Источник'},'ports':[{'tid':'MF;TF-1;Graph;Источник;Output_Data-0'}]},
            {'node_ref':{'node_label':'Объединение'},'ports':[{'tid':'MF;TF-1;Graph;Объединение;Input_Data-0'},
                                                         {'tid':'MF;TF-1;Graph;Объединение;Input_Data-1'}]}],
            'links':[TID],'ui':{'elements':[{'ref':'yes','identity':{'anchor_tid':'msgbox-1;tlb;yes'},'scope':'dialog',
                                            'label':'Удалить','signature':{'dialog_ref':'dialog'}}],
                               'dialogs':[{'ref':'dialog','text':'Удалить выделенную связь? Удалить Нет'}]}}
        self.after=copy.deepcopy(self.snapshot);self.after['observation_id']='after';self.after['links']=[]
        self.tools=[{'row':20,'tool_call_id':'observe','result':{'output':self.snapshot}},
                    {'row':22,'tool_call_id':'confirm','result':{'status':'SUCCEEDED','cleanup_complete':True,'output':self.after,
                     'trace':[{'event':'ui_preconditions_verified','verb':'click','refs':['yes']},{'event':'ui_gesture_applied','verb':'click'}]}}]
        self.calls=[{'row':21,'tool':'dock_ui_action','tool_call_id':'confirm',
                     'arguments':{'observation_id':'before','action':{'verb':'click','ref':'yes'}}}]
        self.events=[]
    def proof(self):return auto_link_delete.prove(self.tools,self.calls,self.events,10,EDGE,graph,audit.canonical)
    def test_exact_real_ui_effect_shape(self):self.assertIsNotNone(self.proof())
    def test_no_gesture_is_not_proof(self):
        self.tools[1]['result']['trace']=[];self.assertIsNone(self.proof())
    def test_wrong_confirmation_is_not_proof(self):
        self.snapshot['ui']['dialogs'][0]['text']='Удалить выделенный узел?';self.assertIsNone(self.proof())
    def test_removed_port_is_not_exact_edge_removal(self):
        self.after['nodes'][1]['ports'].pop();self.assertIsNone(self.proof())
    def test_graph_mutation_between_confirmation_and_observation_is_not_credited(self):
        self.tools[1]['result']['output']=copy.deepcopy(self.snapshot)
        self.tools[1]['result']['output']['observation_id']='pending'
        self.tools.append({'row':26,'tool_call_id':'observe2','result':{'output':self.after}})
        self.calls.append({'row':23,'tool':'dock_action_run','tool_call_id':'mutation','arguments':{'operation_id':'another'}})
        self.assertIsNone(self.proof())
    def test_next_domain_preflight_can_supply_before_apply_observation(self):
        self.tools[1]['result']['output']=copy.deepcopy(self.snapshot)
        self.tools[1]['result']['output']['observation_id']='pending'
        self.calls.append({'row':23,'tool':'dock_action_run','tool_call_id':'next','arguments':{'operation_id':'next'}})
        self.events=[{'phase':'prepared','operation_id':'next','checkpoint':{'graph':{'nodes':[
            {'label':n['node_ref']['node_label'],'ports':[p['tid'] for p in n['ports']]} for n in self.after['nodes']], 'links':[]}}}]
        self.assertEqual(self.proof()['actual_after_observation']['kind'],'actual_domain_preflight')

if __name__=='__main__':unittest.main()
