"""Automatic delivery is a separate contract from agent-initiated retrieval."""
import copy
import json
import unittest
import audit
import evidence
from test_lost_receipt import lost_fixture


def fixture():
    request,data,prompt=lost_fixture()
    request['require_delivered_context']=True
    body='Relevant source fixture. '*10
    digest=audit.sha(body.encode())
    ref={'path':'bg/helpers/node.ts','sha256':digest,'commit':'a'*40}
    sources=[{'source':'e2e','uri':audit.SOURCE_ROOTS[0]+'/.source/'+ref['path'],'commit':ref['commit'],
              'source_sha256':digest,'excerpt':body,'excerpt_sha256':digest},
             {'source':'help','uri':audit.SOURCE_ROOTS[1]+'/node.md','target_uri':audit.SOURCE_ROOTS[1],
              'discovery':'scoped_find','source_sha256':digest,'excerpt':body,'excerpt_sha256':digest}]
    context={'kind':'dock_recovery_context','version':1,'status':'complete','delivery':'client_automatic',
             'operation_id':'source-op','action_key':'node.add','sources':sources}
    data['tools'][1]['recovery_contexts']=[context]
    data['events'].append({**data['events'][0],'phase':'knowledge_context_delivered','context':copy.deepcopy(context)})
    common={'session_id':'hermes-fixture','tool_call_id':'definition','tool':audit.PREFIX+'dock_action_describe'}
    data['calls'].append({**common,'row':0,'arguments':{'action_key':'node.add'}})
    data['tools'].append({**common,'row':1,'result':{'action':{'action_key':'node.add','evidence':[ref]}}})
    return request,data,prompt


class DeliveredContextTest(unittest.TestCase):
    def test_bound_context_and_continuation_pass(self):
        report=audit.audit(*fixture())
        self.assertTrue(report['all_assertions_passed'],report)

    def test_missing_journal_tamper_wrong_source_and_wrong_operation_fail(self):
        for mutate in [lambda d:d['events'].pop(),
                       lambda d:d['tools'][1]['recovery_contexts'][0].update(operation_id='other'),
                       lambda d:d['tools'][1]['recovery_contexts'][0]['sources'][0].update(excerpt='changed'),
                       lambda d:d['tools'][1]['recovery_contexts'][0]['sources'][1].update(uri='viking://user/private.md')]:
            request,data,prompt=fixture();mutate(data)
            self.assertFalse(audit.audit(request,data,prompt)['all_assertions_passed'])

    def test_export_context_keeps_receipt_separate(self):
        _,data,_=fixture()
        receipt=data['tools'][1]['result'];context=data['tools'][1]['recovery_contexts'][0]
        for raw in [{'content':[{'type':'text','text':json.dumps(receipt)}, {'type':'text','text':json.dumps(context)}]},
                    '<untrusted_tool_result>\n\n'+json.dumps(receipt)+'\nRecovery note\n'+json.dumps(context)+'\n</untrusted_tool_result>']:
            self.assertEqual(evidence.unwrap(raw),receipt)
            self.assertEqual(evidence.recovery_contexts(raw),[context])

if __name__=='__main__':unittest.main()
