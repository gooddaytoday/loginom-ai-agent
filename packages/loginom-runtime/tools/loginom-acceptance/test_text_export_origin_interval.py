import copy
import unittest
from test_text_export_origin import OriginTests
from text_export_origin import observed_origin


class OriginIntervalTests(unittest.TestCase):
    def fixture(self):
        first,node=OriginTests().fixture()
        second=copy.deepcopy(first)
        second[0]['state']['operation_id']='prepare-reopened'
        second[0]['state']['workflow_ref'].update(workflow_id='flow-2',prefix='MF;TF-2',tab_tid='tab-2')
        for e in second[1:]:e['operation_id']='reopened'
        output=second[1]['outcome']['output']
        output['workflow_ref'].update(workflow_id='flow-2',prefix='MF;TF-2',tab_tid='tab-2')
        output['prepared_node_context']['workflow_id']='flow-2'
        output['dom_epoch']['document']='ui-doc-2'
        events=[copy.deepcopy(e) for e in first+second]
        for e in events:e['manifest_sha256']='a'*64
        return events,node,{**node,'workflow_id':'flow-2'}

    def test_old_and_reopened_operations_have_distinct_current_context(self):
        events,old,new=self.fixture();original=copy.deepcopy(events)
        for op,node in [('original',old),('reopened',new)]:
            self.assertEqual(observed_origin(events,op,node,'runtime','session'),'http://logi-test-plan.bg.local')
        self.assertEqual(events,original)

    def test_refuses_ambiguous_invalid_stale_or_interrupted_context(self):
        changes=[
            ('foreign-session',lambda es: es[3].update(session_id='foreign')),
            ('foreign-runtime',lambda es: es[3].update(runtime_revision='foreign')),
            ('foreign-origin',lambda es: es[4]['outcome']['output'].update(origin='https://foreign.invalid')),
            ('foreign-document',lambda es: es[3]['state'].update(document_id='foreign')),
            ('foreign-workflow',lambda es: es[3]['state']['workflow_ref'].update(workflow_id='foreign')),
            ('unverified-owner',lambda es: es[3]['state'].update(ownership_verified=False)),
            ('unauthenticated',lambda es: es[3]['state'].update(authenticated=False)),
            ('not-ready',lambda es: es[3]['state'].update(status='BLOCKED')),
            ('unverified-target',lambda es: es[3]['state'].update(target_verified=False)),
            ('catalog-conflict',lambda es: es[3].update(manifest_sha256='b'*64)),
            ('ambiguous-prep',lambda es: es.insert(4,copy.deepcopy(es[3]))),
            ('prep-in-operation',lambda es: es.insert(5,copy.deepcopy(es[3]))),
            ('future-prep',lambda es: es.append(es.pop(3))),
            ('reordered-preps',lambda es: es.insert(4,es.pop(0))),
            ('owner-tab',lambda es: es[4]['outcome']['output']['workflow_ref'].update(tab_tid='foreign')),
            ('owner-prefix',lambda es: es[4]['outcome']['output']['workflow_ref'].update(prefix='foreign')),
            ('node-owner',lambda es: es[4]['outcome']['output']['prepared_node_context'].update(node_id='foreign')),
            ('missing-epoch',lambda es: es[4]['outcome']['output'].update(dom_epoch={})),
            ('conflicting-epoch',lambda es: es.insert(5,{**copy.deepcopy(es[4]),'outcome':{'output':{**copy.deepcopy(es[4]['outcome']['output']),'dom_epoch':{'document':'foreign'}}}})),
            ('observation-after-terminal',lambda es: es.append(es.pop(4))),
        ]
        for label,change in changes:
            events,_,node=self.fixture();change(events)
            with self.subTest(case=label),self.assertRaises((AssertionError,KeyError)):
                observed_origin(events,'reopened',node,'runtime','session')


if __name__=='__main__':unittest.main()
