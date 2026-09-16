import copy
import unittest
import audit


class PaletteInventoryTest(unittest.TestCase):
    def test_rejected_request_is_not_a_gesture_only_with_idle_receipt_and_no_operation_journal(self):
        c={'row':1,'tool_call_id':'r','arguments':{'operation_id':'never-started'}}
        r={'status':'FAILED','phase':'request_rejected','action_key':'request.validate','operation_id':None,
           'request_rejected':True,'effect_possible':False,'trace':[],'error':{'code':'REQUEST_REJECTED'},
           'output':{'operation':{'state':'idle','cleanup_confirmed':True,'effect_state':'none'}}}
        evidence={'tools':[{'row':2,'tool_call_id':'r','result':r}],'events':[]}
        self.assertTrue(audit.rejected_before_browser(c,evidence))
        for mutate in [lambda e:e['events'].append({'phase':'prepared','operation_id':'never-started'}),
                       lambda e:e['tools'][0]['result'].update(effect_possible=True),
                       lambda e:e['tools'][0]['result']['output']['operation'].update(state='pending'),
                       lambda e:e['tools'][0]['result'].update(status='AMBIGUOUS')]:
            bad=copy.deepcopy(evidence);mutate(bad);self.assertFalse(audit.rejected_before_browser(c,bad))

    def test_scroll_proof_rejects_invented_movement_or_missing_journal(self):
        call={'row':1,'tool_call_id':'scroll','arguments':{'action':{'verb':'scroll','delta_y':300}}}
        target={'allowed_actions':['scroll'],'scroll':{'ref':'owner','top':0,'max_top':200}}
        result={'status':'SUCCEEDED','cleanup_complete':True,'operation_id':'s','output':{},
                'trace':[{'event':'ui_scroll_applied','owner_ref':'owner','from':0,'to':200}]}
        evidence={'tools':[{'row':2,'tool_call_id':'scroll','result':result}],
                  'events':[{'phase':'completed','operation_id':'s','outcome':copy.deepcopy(result)}]}
        self.assertTrue(audit.scroll_receipt_bound(call,target,evidence))
        for mutate in [lambda e:e['events'].clear(),lambda e:e['tools'][0]['result']['trace'][0].update(to=300),
                       lambda e:e['tools'][0]['result']['trace'][0].update(owner_ref='other')]:
            bad=copy.deepcopy(evidence);mutate(bad);self.assertFalse(audit.scroll_receipt_bound(call,target,bad))

    def test_bootstrap_proof_requires_order_and_inactive_archive(self):
        data={'calls':[{'row':1,'tool':audit.PREFIX+'dock_workspace_observe','tool_call_id':'b','arguments':{'scope':'bootstrap'}},
                       {'row':5,'tool':audit.PREFIX+'dock_prepare'}],
              'tools':[{'row':2,'tool':audit.PREFIX+'dock_workspace_observe','tool_call_id':'b',
                        'result':{'status':'SUCCEEDED','effect_possible':False,'cleanup_complete':True,
                                  'output':{'bootstrap':True,'observation_only':True,'target_state':'not_open'}}},
                       {'row':4,'tool':audit.PREFIX+'dock_diagnostics','result':{'archiveActive':False,'archive':None}}]}
        def passed(value):
            checks=[];audit.bootstrap_proof(value,lambda name,ok:checks.append(bool(ok)));return all(checks)
        self.assertTrue(passed(data))
        for change in [lambda d:d['tools'][0].update(row=6),
                       lambda d:d['tools'][1]['result'].update(archiveActive=True),
                       lambda d:d['tools'][1]['result'].update(workspaceReady=True),
                       lambda d:d['tools'][0]['result']['output'].update(ui={})]:
            bad=copy.deepcopy(data);change(bad);self.assertFalse(passed(bad))

    def fixture(self):
        group='MF;TF;ModelForm;colVendors_Компоненты>Импорт;TreeExpander'
        component='MF;TF;ModelForm;colVendors_Компоненты>Импорт>Текстовый_файл;TreeText'
        snapshot={'nodes':[],'links':[],'observation_id':'obs','ui':{'truncated':{'nodes':False,'ports':False,'links':False},'elements':[
            {'ref':'group','tid':group,'label':''},{'ref':'component','tid':component,'label':'Текстовый файл'}]}}
        return {'tools':[{'row':1,'result':{'output':snapshot}}, {'row':3,'result':{'output':copy.deepcopy(snapshot)}}],
                'calls':[{'row':2,'tool':audit.PREFIX+'dock_ui_action','arguments':{
                    'observation_id':'obs','action':{'verb':'click','ref':'group'}}}]}

    def test_observed_names_are_preserved_without_claiming_completeness(self):
        result=audit.palette_inventory(self.fixture(),[])
        self.assertTrue(result['all_assertions_passed'])
        self.assertFalse(result['inventory']['complete'])
        self.assertEqual(result['inventory']['components'][0]['label'],'Текстовый файл')

    def test_outside_group_mutations_and_nonempty_graph_are_rejected(self):
        for mutate in [lambda d:d['calls'][0].update(tool=audit.PREFIX+'dock_action_run'),
                       lambda d:d['calls'][0]['arguments']['action'].update(ref='component'),
                       lambda d:d['calls'][0]['arguments'].update(observation_id='unknown'),
                       lambda d:d['tools'][0]['result']['output']['nodes'].append({'label':'Created'})]:
            data=self.fixture();mutate(data)
            self.assertFalse(audit.palette_inventory(data,[])['all_assertions_passed'])

    def test_palette_scope_does_not_prove_empty_graph(self):
        for key in ('nodes','ports','links'):
            data=self.fixture()
            for item in data['tools']:item['result']['output']['ui']['truncated'][key]=True
            self.assertFalse(audit.palette_inventory(data,[])['all_assertions_passed'])
        data=self.fixture();data['tools'].pop()
        self.assertFalse(audit.palette_inventory(data,[])['all_assertions_passed'])

    def test_target_can_be_delivered_on_a_later_page_but_not_after_action(self):
        data=self.fixture();first=data['tools'][0]['result']['output']
        first.update(page={'scope':'all'},observation_revision='a'*64)
        second=copy.deepcopy(first);second['ui']['elements']=[first['ui']['elements'].pop(0)]
        data['tools'].insert(1,{'row':1.5,'result':{'output':second}})
        self.assertTrue(audit.palette_inventory(data,[])['all_assertions_passed'])
        second['observation_revision']='b'*64
        self.assertFalse(audit.palette_inventory(data,[])['all_assertions_passed'])
        second['observation_revision']='a'*64;data['tools'][1]['row']=2.5
        # The final observation is also after the action, so it cannot supply its ref.
        self.assertFalse(audit.palette_inventory(data,[])['all_assertions_passed'])

    def test_prior_mutation_invalidates_previously_delivered_refs(self):
        data=self.fixture();data['calls'].append(copy.deepcopy(data['calls'][0]))
        data['calls'][1]['row']=2.5
        self.assertFalse(audit.palette_inventory(data,[])['all_assertions_passed'])


if __name__=='__main__':unittest.main()
