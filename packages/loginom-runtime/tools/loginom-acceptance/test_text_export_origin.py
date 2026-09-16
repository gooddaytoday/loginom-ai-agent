import copy,json,subprocess,tempfile,unittest
from pathlib import Path
from text_export_origin import observed_origin

class OriginTests(unittest.TestCase):
    def fixture(self):
        target=dict(profile_id='loginom-7.4.2-macos-chromium-ru',loginom_build='7.4.2',platform='macos',browser='chromium')
        node=dict(document_id='doc',workflow_id='flow',node_id='node');wf=dict(workflow_id='flow',prefix='MF;TF-1',tab_tid='tab')
        meta=dict(session_id='session',runtime_revision='runtime',target=target)
        prep=dict(**meta,event='workspace_prepared',state=dict(status='READY',authenticated=True,ownership_verified=True,target_verified=True,session_id='session',document_id='doc',workflow_ref=wf,target=target))
        obs=dict(**meta,operation_id='original',phase='node_observation_completed',outcome=dict(output=dict(origin='http://logi-test-plan.bg.local/',authenticated=True,loginom_build='7.4.2',dom_epoch=dict(document='ui-doc'),workflow_ref=wf,prepared_node_context=dict(verified=True,**node))))
        end=dict(**meta,operation_id='original',phase='completed')
        return copy.deepcopy([prep,obs,end]),node
    def test_actual_profile_without_origin_requires_bound_browser_observation(self):
        es,node=self.fixture();before=copy.deepcopy(es)
        self.assertEqual(observed_origin(es,'original',node,'runtime','session'),'http://logi-test-plan.bg.local');self.assertEqual(es,before)
    def test_missing_stale_foreign_and_conflicting_evidence(self):
        mutations=[lambda e:e.pop(1),lambda e:e.append(e.pop(1)),lambda e:e[1]['outcome']['output'].pop('origin'),
          lambda e:e[1]['outcome']['output'].update(origin='https://foreign.invalid'),
          lambda e:e[1]['outcome']['output']['prepared_node_context'].update(document_id='stale'),
          lambda e:e[1].update(session_id='foreign'),lambda e:e[1].update(target={**e[1]['target'],'profile_id':'foreign'}),
          lambda e:e[1].update(target={**e[1]['target'],'platform':'foreign'}),lambda e:e[1].update(target={**e[1]['target'],'browser':'foreign'}),
          lambda e:e[1]['outcome']['output'].update(loginom_build='7.4.1'),
          lambda e:e[0]['state'].update(document_id='old'),lambda e:e[2].update(target={**e[2]['target'],'origin':'https://foreign.invalid'}),
          lambda e:e.insert(2,{**copy.deepcopy(e[1]),'outcome':{'output':{**copy.deepcopy(e[1]['outcome']['output']),'dom_epoch':{'document':'other'}}}})]
        for mutation in mutations:
            es,node=self.fixture();mutation(es)
            with self.assertRaises((AssertionError,KeyError)):observed_origin(es,'original',node,'runtime','session')
