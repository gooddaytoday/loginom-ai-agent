import json
import unittest
from evidence import transport_documents, unwrap, recovery_contexts


class VerificationExportTest(unittest.TestCase):
    def test_preserves_separate_proof_without_changing_the_original_receipt(self):
        receipt = {"status": "SUCCEEDED", "action_key": "ui.act", "operation_id": "gesture"}
        proof = {"kind": "dock_outcome_verification", "schema_version": 1,
                 "operation_id": "gesture", "goal": {"state": "not_verified"}}
        context = {"kind": "dock_recovery_context", "sources": []}
        envelope = json.dumps({"result": {"content": [
            {"type": "text", "text": json.dumps(value)} for value in (receipt, proof, context)]}})
        self.assertEqual(unwrap(envelope), receipt)
        self.assertEqual(transport_documents(envelope, "dock_outcome_verification"), [proof])
        self.assertEqual(recovery_contexts(envelope), [context])
        # Receipt payloads are not recursively interpreted as transport blocks.
        self.assertEqual(transport_documents({"output": proof}, "dock_outcome_verification"), [])

class VerificationAuditTest(unittest.TestCase):
    def test_ui_success_cannot_be_promoted_to_domain_data_or_complete_observation(self):
        import copy
        import audit
        receipt={'action_key':'ui.act','operation_id':'click','status':'SUCCEEDED',
                 'output':{'ui':{'truncated':{'nodes':True}}},'trace':[{'event':'ui_gesture_applied'}]}
        proof={'kind':'dock_outcome_verification','schema_version':1,'operation_id':'click','action_key':'ui.act',
               'receipt_sha256':'a'*64,'gesture':{'state':'performed'},'domain_effect':{'state':'unverified','kind':None},
               'observation':{'state':'bounded','completeness':'truncated',
                              'limitations':['visible_DOM_only','no_dataset_revision','no_full_graph_proof']},
               'settings':{'state':'not_checked'},'data':{'state':'not_checked'},
               'goal':{'state':'not_verified','obligations':[]}}
        def verify(value, journal=True):
            checks=[]
            data={'tools':[{'result':receipt,'verifications':[value]}],
                  'events':[{'phase':'verification_delivered','operation_id':'click','verification':value}] if journal else []}
            audit.verification_proof(data,lambda name,passed:checks.append(passed))
            return all(checks)
        self.assertTrue(verify(proof))
        self.assertFalse(verify(proof,False))
        for field,key,value in [('domain_effect','state','verified'),('data','state','verified'),
                                ('goal','state','verified'),('observation','completeness','complete')]:
            changed=copy.deepcopy(proof);changed[field][key]=value
            self.assertFalse(verify(changed))


if __name__ == '__main__':
    unittest.main()
