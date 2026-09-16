import copy
import unittest
from audit import file_storage_inspect, PREFIX

class FileStorageInspectTest(unittest.TestCase):
    def fixture(self):
        target={'ref':'r','tid':'MF;cntMain;tlbMainToolbar;btnFilestorage'}
        initial={'session_id':'s','tool_call_id':'initial','tool':PREFIX+'dock_workspace_observe','row':1,
                 'result':{'status':'SUCCEEDED','output':{'observation_id':'o','ui':{'elements':[target]}}}}
        call={'session_id':'s','tool_call_id':'click','tool':PREFIX+'dock_ui_action','row':2,
              'arguments':{'observation_id':'o','action':{'verb':'click','ref':'r'}}}
        action={'session_id':'s','tool_call_id':'click','tool':call['tool'],'row':3,
                'result':{'status':'SUCCEEDED','operation_id':'click-op','output':{}}}
        observe={'session_id':'s','tool_call_id':'read','tool':PREFIX+'dock_workspace_observe','row':5,
                 'result':{'status':'SUCCEEDED','operation_id':'read-op','output':{'file_storage':{
                     'status':'observed','directory':'/analyst/data','source':'visible_breadcrumbs',
                     'navigation_identity':{'anchor_tid':'nav'},'listing_complete':False}}}}
        data={'calls':[call,{'session_id':'s','tool_call_id':'read','tool':PREFIX+'dock_workspace_observe','row':4,'arguments':{'scope':'all'}}],'tools':[initial,action,observe],'events':[
            {'phase':'completed','operation_id':t['result']['operation_id'],'outcome':copy.deepcopy(t['result'])}
            for t in (action,observe)]}
        data['events'][-1]['phase']='observation_completed'
        observe['result']['output']['operation']={'operation_id':None,'state':'idle','cleanup_confirmed':True,'effect_state':'none',
            'recovery_options':[],'next_steps':[{'tool':'dock_workspace_observe','arguments':{},'required_fields':[],
            'requires':[],'provides':['observation_id','fresh_ui_refs']}],'outcome_summary':None}
        return data

    def test_bound_navigation_and_directory(self):
        self.assertTrue(file_storage_inspect(self.fixture(),[],'/analyst/data')['all_assertions_passed'])

    def test_rejects_wrong_directory_unbound_results_and_file_mutations(self):
        mutations=[
            lambda d:d['tools'][-1]['result']['output']['file_storage'].update(directory='/user/other'),
            lambda d:d['tools'][-1]['result']['output']['file_storage'].update(listing_complete=True),
            lambda d:d['events'].pop(),
            lambda d:d['tools'][0]['result']['output']['ui']['elements'][0].update(tid='FileStorage;btnDelete'),
            lambda d:d['calls'][0]['arguments']['action'].update(verb='fill'),
            lambda d:d['calls'].append({**d['calls'][0],'row':6}),
            lambda d:d['tools'][-1].update(session_id='other'),
        ]
        for mutate in mutations:
            data=self.fixture();mutate(data)
            self.assertFalse(file_storage_inspect(data,[],'/analyst/data')['all_assertions_passed'])

    def test_epoch_refusal_requires_bound_no_effect_receipt(self):
        data=self.fixture();r=data['tools'][1]['result']
        r.update(status='NOT_APPLIED',phase='preconditions',effect_possible=False,cleanup_complete=True,
                 error={'code':'UI_EPOCH_CHANGED'},trace=[{'event':'ui_action_failed','code':'UI_EPOCH_CHANGED'}])
        data['events'][0]['outcome']=copy.deepcopy(r)
        data['calls'][0]['arguments']['action']={'verb':'press','ref':'r','key':'Enter'}
        self.assertTrue(file_storage_inspect(data,[],'/analyst/data')['all_assertions_passed'])
        for key,value in [('effect_possible',True),('cleanup_complete',False),('phase','gesture')]:
            changed=copy.deepcopy(data);changed['tools'][1]['result'][key]=value
            changed['events'][0]['outcome']=copy.deepcopy(changed['tools'][1]['result'])
            self.assertFalse(file_storage_inspect(changed,[],'/analyst/data')['all_assertions_passed'])

    def selection_fixture(self):
        data=self.fixture()
        target={'ref':'folder','tid':'MF;TF-1;FileStorageForm;colName_data','label':'data',
                'identity':{'anchor_tid':'MF;TF-1;FileStorageForm;colName_data','path':[]},
                'storage_entry':{'row_ref':'folder-row','kind':'folder','selected':False}}
        pre=data['tools'][0]
        pre['result'].update(operation_id='initial-op')
        pre['result']['output'].update(origin='https://loginom.test',loginom_build='build',
            workflow_ref={'prefix':'MF;TF-1'},active_tab_ref='tab',ui={'elements':[target]},
            file_storage={'status':'observed','directory':'/analyst','source':'visible_breadcrumbs',
                          'navigation_identity':{'anchor_tid':'nav'},'listing_complete':False})
        data['calls'].insert(0,{'session_id':'s','tool_call_id':'initial','tool':pre['tool'],'row':0,'arguments':{}})
        data['events'].append({'phase':'observation_completed','operation_id':'initial-op','outcome':copy.deepcopy(pre['result'])})
        pre['result']['output']['operation']=copy.deepcopy(data['tools'][-1]['result']['output']['operation'])
        data['calls'][1]['arguments']['action']['ref']='folder'
        post=data['tools'][1]['result']['output']=copy.deepcopy(pre['result']['output'])
        post.pop('operation');post['observation_id']='after'
        post['ui']['elements'][0]['storage_entry']['selected']=True
        self.sync_selection(data)
        return data

    def sync_selection(self,data):
        for reply in data['tools'][:2]:
            outcome=copy.deepcopy(reply['result'])
            if reply['tool']==PREFIX+'dock_workspace_observe':outcome['output'].pop('operation',None)
            for event in data['events']:
                if event['operation_id']==outcome['operation_id']:event['outcome']=outcome

    def test_folder_selection_requires_bound_unchanged_directory_and_selected_row(self):
        self.assertTrue(file_storage_inspect(self.selection_fixture(),[],'/analyst/data')['all_assertions_passed'])
        def after(d):return d['tools'][1]['result']['output']
        mutations=[
            lambda d:after(d)['file_storage'].update(directory='/other'),
            lambda d:after(d).update(active_tab_ref='other'),
            lambda d:after(d)['ui']['elements'][0]['storage_entry'].update(selected=False),
            lambda d:after(d)['ui']['elements'][0]['storage_entry'].update(row_ref='replacement'),
            lambda d:after(d)['ui']['elements'].append(copy.deepcopy(after(d)['ui']['elements'][0])),
            lambda d:d['tools'][0]['result']['output']['file_storage'].update(status='unobserved'),
            lambda d:d['tools'][0]['result']['output']['file_storage'].update(status='unobserved',directory=None),
            lambda d:d['tools'][0]['result']['output']['ui']['elements'][0]['storage_entry'].update(kind='unknown'),
        ]
        for mutate in mutations:
            data=self.selection_fixture();mutate(data);self.sync_selection(data)
            self.assertFalse(file_storage_inspect(data,[],'/analyst/data')['all_assertions_passed'])
        data=self.selection_fixture();data['events'].pop()
        self.assertFalse(file_storage_inspect(data,[],'/analyst/data')['all_assertions_passed'])
        self.assertFalse(file_storage_inspect(self.selection_fixture(),[],'/other/data')['all_assertions_passed'])
