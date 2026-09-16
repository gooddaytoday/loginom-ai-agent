"""Synthetic UI receipt contracts, never live acceptance evidence."""
import copy
import unittest
import manual_reopen

PATH='/user/data/packages/fixture.lgp'
HOME='MF;TF;HomePage;btnOpenPackage'
MENU='MF;cntMain;tlbMainToolbar;btnPackagesMenu'
OPEN_MENU='MF;MainMenuForm;btnOpenPackage'
FIELD='OpenDialogForm;edtFileName'
OPEN='OpenDialogForm;btnOpen'


def fixture(home=True):
    tools=[];calls=[]
    def add(name,args,result):
        row=len(calls)*2+1;common={'tool':name,'tool_call_id':str(row)}
        calls.append({**common,'row':row,'arguments':args})
        tools.append({**common,'row':row+1,'result':result})
    save={'action_key':'package.save_as','operation_id':'save','status':'AMBIGUOUS','cleanup_complete':True,
          'trace':[{'event':'save_requested','path':PATH},{'event':'saved_package_closed'}]}
    add('dock_action_run',{},save)
    add('dock_workspace_observe',{}, {'status':'SUCCEEDED','output':{'observation_id':'closed','package_identity':None,
        'nodes':[],'links':[],'operation':{'operation_id':'save','cleanup_confirmed':True}}})
    original={**copy.deepcopy(save),'goal_verified':False}
    add('dock_operation_recover',{'strategy':'abandon_operation','operation_id':'save',
        'recovery_operation_id':'abandon','observation_id':'closed'},
        {'status':'SUCCEEDED','output':{'resolution':'abandoned_after_observation','goal_verified':False,'original_outcome':original}})
    events=[{'operation_id':'save','phase':'prepared','checkpoint':{'path':PATH,'workflow_ref':'old','graph':{'nodes':['fixture']}}},
            {'operation_id':'save','phase':'operation_abandoned','outcome':{**original,'recovery_operation_id':'abandon'}}]
    sequence=[HOME] if home else [MENU,OPEN_MENU]
    for index,anchor in enumerate(sequence+[FIELD,OPEN]):
        verb='fill' if anchor==FIELD else 'click'
        element={'ref':anchor,'identity':{'anchor_tid':anchor},'signature':{'dialog_ref':'dialog'}}
        elements=[element]
        if anchor==OPEN:elements.append({'identity':{'anchor_tid':FIELD},'value':PATH})
        add('dock_workspace_observe',{}, {'status':'SUCCEEDED','output':{'observation_id':str(index),
            'ui':{'elements':elements,'dialogs':[{'ref':'dialog','identity':{'anchor_tid':'OpenDialogForm'}}]}}})
        action={'verb':verb,'ref':anchor}
        if verb=='fill':action['text']=PATH
        add('dock_ui_action',{'observation_id':str(index),'action':action},
            {'status':'SUCCEEDED','cleanup_complete':True,'trace':[{'event':'ui_preconditions_verified','verb':verb,'refs':[anchor]},
                                                                  {'event':'ui_gesture_applied','verb':verb}]})
    add('dock_workspace_observe',{}, {'status':'SUCCEEDED','output':{'package_identity':{'path':PATH},'workflow_ref':'new'}})
    return tools,calls,events


class ManualReopenTest(unittest.TestCase):
    def prove(self,data):return manual_reopen.prove(*data,PATH,None)
    def test_both_observed_routes_preserve_ambiguous_save(self):
        for home in (True,False):
            data=fixture(home);proof=self.prove(data)
            self.assertIsNotNone(proof)
            self.assertEqual(proof['domain_save_status'],'AMBIGUOUS')
            self.assertEqual(data[0][0]['result']['status'],'AMBIGUOUS')
    def test_missing_close_or_checkpoint_cannot_prove_saved_file(self):
        for case in ('close','checkpoint','order'):
            data=fixture()
            if case=='close':data[0][0]['result']['trace'].pop()
            elif case=='checkpoint':data[2].pop(0)
            else:data[0][0]['result']['trace'].reverse()
            self.assertIsNone(self.prove(data))
    def test_abandon_requires_empty_observed_workspace_and_preserved_outcome(self):
        for case in ('not_empty','wrong_operation','success'):
            data=fixture()
            if case=='not_empty':data[0][1]['result']['output']['nodes']=['unexpected']
            elif case=='wrong_operation':data[1][2]['arguments']['operation_id']='other'
            else:data[0][2]['result']['output']['original_outcome']['status']='SUCCEEDED'
            self.assertIsNone(self.prove(data))
    def test_wrong_path_in_field_or_final_snapshot_is_rejected(self):
        for case in ('fill','field','final'):
            data=fixture()
            if case=='fill':next(c for c in data[1] if c['arguments'].get('action',{}).get('verb')=='fill')['arguments']['action']['text']='/other.lgp'
            elif case=='field':data[0][-3]['result']['output']['ui']['elements'][-1]['value']='/other.lgp'
            else:data[0][-1]['result']['output']['package_identity']['path']='/other.lgp'
            self.assertIsNone(self.prove(data))
    def test_gesture_requires_real_effect_and_bound_prior_observation(self):
        for case in ('trace','future','ref','dialog','status'):
            data=fixture();reply=data[0][4]['result'];call=data[1][4]
            if case=='trace':reply['trace'].pop()
            elif case=='future':data[0][3]['row']=1000
            elif case=='ref':call['arguments']['action']['ref']='unknown'
            elif case=='dialog':data[0][-3]['result']['output']['ui']['dialogs']=[]
            else:reply['status']='AMBIGUOUS'
            self.assertIsNone(self.prove(data))
    def test_extra_effect_and_unchanged_workflow_are_rejected(self):
        for case in ('effect','workflow','missing_workflow'):
            data=fixture()
            if case=='effect':
                c=copy.deepcopy(data[1][4]);t=copy.deepcopy(data[0][4]);c.update(row=100,tool_call_id='extra');t.update(row=101,tool_call_id='extra')
                data[1].append(c);data[0].append(t)
            elif case=='workflow':data[0][-1]['result']['output']['workflow_ref']='old'
            else:data[0][-1]['result']['output'].pop('workflow_ref')
            self.assertIsNone(self.prove(data))

if __name__=='__main__':unittest.main()
