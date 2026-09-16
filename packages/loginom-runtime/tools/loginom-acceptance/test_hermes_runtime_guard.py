import copy
import unittest
from unittest.mock import Mock
import hermes_runtime_guard as guard

class RuntimeGuardTest(unittest.TestCase):
    expected={'provider':'openai-codex','model':'gpt-5.6-sol','reasoning_effort':'low','max_turns':160}
    def setup_guard(self,*,probe=False):
        init=Mock();sent=Mock();states=[];usage=[]
        class Agent:
            def __init__(self,**kwargs):init(**kwargs)
            def run_conversation(self,prompt):return {'completed':True,'api_calls':1,'input_tokens':10,'final_response':'not recorded'}
        class Transport:
            def build_kwargs(self,**kwargs):sent(**kwargs);return kwargs
        state=guard.install_runtime(Agent,Transport,self.expected,lambda v:states.append(copy.deepcopy(v)),usage.append,probe=probe)
        return Agent,Transport,state,init,states,usage
    def kwargs(self):
        return dict(provider='openai-codex',model='gpt-5.6-sol',reasoning_config={'effort':'low'},max_iterations=160)
    def test_rejects_oneshot_dropped_arguments_before_constructor(self):
        for change in [dict(reasoning_config=None),dict(max_iterations=2**63-1),dict(model='other'),dict(provider='other')]:
            A,T,s,init,states,usage=self.setup_guard()
            with self.assertRaises(RuntimeError):A(**{**self.kwargs(),**change})
            init.assert_not_called();self.assertTrue(s['blocked'])
    def test_checks_outbound_request_and_records_metadata_only(self):
        A,T,s,init,states,usage=self.setup_guard();a=A(**self.kwargs())
        payload={'model':'gpt-5.6-sol','reasoning':{'effort':'low'},'input':'private prompt'}
        self.assertEqual(T().build_kwargs(**payload),payload)
        a.run_conversation('private prompt')
        self.assertEqual(s['wire_requests_verified'],1)
        self.assertNotIn('private prompt',str(states));self.assertNotIn('final_response',usage[0])
        for bad in [dict(model='other'),dict(reasoning={'effort':'medium'})]:
            with self.assertRaises(RuntimeError):T().build_kwargs(**{**payload,**bad})
    def test_probe_verifies_actual_cli_arguments_without_agent_or_network(self):
        A,T,s,init,states,usage=self.setup_guard(probe=True)
        with self.assertRaises(SystemExit) as result:A(**self.kwargs())
        self.assertEqual(result.exception.code,0);init.assert_not_called()
        self.assertTrue(s['constructor_verified']);self.assertEqual(s['wire_requests_verified'],0)
    def test_requires_explicit_cli_policy(self):
        args=['chat','--provider','openai-codex','--model','gpt-5.6-sol','--reasoning','low','--max-turns','160','-q','task']
        self.assertEqual(guard.expected_arguments(args),self.expected)
        for bad in [args+['-z','task'],args+['--reasoning','high'],args[1:]]:
            with self.assertRaises(ValueError):guard.expected_arguments(bad)

    def test_new_audits_require_actual_policy_without_rewriting_historical_proofs(self):
        import audit
        from test_acceptance import fixture
        request,evidence,_=fixture()
        request.update(effective_model_policy=guard.POLICY, budget={'max_turns':160},
                       model_profile='chatgpt-sol',model='gpt-5.6-sol',reasoning_effort='low')
        evidence['reasoning_effort']='low'
        evidence['process']['usage']['model']='gpt-5.6-sol'
        proof={'policy':guard.POLICY,'expected':self.expected,'constructor_verified':True,
               'wire_requests_verified':2,'blocked':False}
        evidence['effective_model_policy']=proof
        self.assertTrue(audit.approved_model(request,evidence))
        for change in [dict(constructor_verified=False),dict(wire_requests_verified=0),
                       dict(blocked=True),dict(expected={**self.expected,'reasoning_effort':'medium'})]:
            bad=copy.deepcopy(evidence);bad['effective_model_policy'].update(change)
            self.assertFalse(audit.approved_model(request,bad))

if __name__=='__main__':unittest.main()
