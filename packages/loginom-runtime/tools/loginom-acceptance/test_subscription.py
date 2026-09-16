"""Hermetic subscription selection; no real credentials or network."""
import base64
import json
from pathlib import Path
import tempfile
import time
import unittest
import audit
import run
from test_acceptance import fixture

class SubscriptionTest(unittest.TestCase):
    def test_only_approved_provider_is_copied_and_expiry_is_required(self):
        with tempfile.TemporaryDirectory() as root:
            home=Path(root)
            payload=base64.urlsafe_b64encode(json.dumps({'exp':time.time()+5000}).encode()).decode().rstrip('=')
            state={'providers':{'openai-codex':{'auth_mode':'chatgpt','tokens':{'access_token':'fixture.'+payload+'.signature','refresh_token':'fixture-refresh'}},'other':{'secret':'excluded'}},'credential_pool':{'other':['excluded']}}
            (home/'auth.json').write_text(json.dumps(state))
            copied=run.connection(home)
            self.assertEqual(list(copied['providers']),['openai-codex'])
            self.assertNotIn('excluded',json.dumps(copied))
            state['providers']['openai-codex']['tokens']['access_token']='bad'
            (home/'auth.json').write_text(json.dumps(state))
            with self.assertRaises(ValueError):run.connection(home)
    def test_missing_connection_never_uses_env_or_personal_codex(self):
        with tempfile.TemporaryDirectory() as root:
            home=Path(root);(home/'auth.json').write_text('{}')
            with self.assertRaises(ValueError):run.connection(home)
    def test_auditor_rejects_wrong_provider_model_or_reasoning(self):
        for key,value in [('provider','xiaomi'),('model','mimo-v2.5')]:
            request,evidence,prompt=fixture();evidence['process']['usage'][key]=value
            self.assertFalse(audit.audit(request,evidence,prompt)['all_assertions_passed'])
        request,evidence,prompt=fixture();request['reasoning_effort']='high'
        self.assertFalse(audit.audit(request,evidence,prompt)['all_assertions_passed'])

if __name__=='__main__':unittest.main()

class XiaomiProfileTest(unittest.TestCase):
    def test_only_xiaomi_key_is_selected_without_interpolation(self):
        with tempfile.TemporaryDirectory() as root:
            home=Path(root)
            (home/'.env').write_text('OPENAI_API_KEY=excluded\nexport XIAOMI_API_KEY="fixture-$LITERAL"\nOTHER_KEY=excluded\n')
            endpoint='https://token-plan-sgp.xiaomimimo.com/v1'
            (home/'auth.json').write_text(json.dumps({'credential_pool':{'xiaomi':[{'source':'env:XIAOMI_API_KEY','base_url':endpoint}]}}))
            self.assertEqual(run.xiaomi_connection(home),{'XIAOMI_API_KEY':'fixture-$LITERAL','XIAOMI_BASE_URL':endpoint})
            for content in ('OTHER_KEY=x','XIAOMI_API_KEY=','XIAOMI_API_KEY=a\nXIAOMI_API_KEY=b','XIAOMI_API_KEY="a b"'):
                (home/'.env').write_text(content)
                with self.assertRaises(ValueError):run.xiaomi_connection(home)
    def test_exact_profile_and_effective_usage_are_required(self):
        request,evidence,_=fixture()
        request.update(model_profile='xiaomi-mimo',goal_id='data-pipeline',provider='xiaomi',model='mimo-v2.5')
        evidence['process']['usage'].update(provider='xiaomi',model='mimo-v2.5')
        self.assertTrue(audit.approved_model(request,evidence))
        for field,value in [('provider','openai-codex'),('model','mimo-v2.5-pro')]:
            original=evidence['process']['usage'][field];evidence['process']['usage'][field]=value
            self.assertFalse(audit.approved_model(request,evidence));evidence['process']['usage'][field]=original
        evidence['process']['timed_out']=True;self.assertFalse(audit.approved_model(request,evidence))
        evidence['process']['timed_out']=False
        request['model_profile']='chatgpt-luna';self.assertFalse(audit.approved_model(request,evidence))
        request['model_profile']='xiaomi-mimo';request['goal_id']='basic-graph'
        self.assertFalse(audit.approved_model(request,evidence))

class XiaomiSubscriptionEndpointTest(unittest.TestCase):
    def test_missing_ambiguous_or_non_subscription_endpoint_never_falls_back(self):
        with tempfile.TemporaryDirectory() as root:
            home=Path(root);(home/'.env').write_text('XIAOMI_API_KEY=fixture\n')
            entry={'source':'env:XIAOMI_API_KEY','base_url':'https://token-plan-sgp.xiaomimimo.com/v1'}
            invalid=[[],[entry,entry]]
            for url in ['https://api.xiaomimimo.com/v1','http://token-plan-sgp.xiaomimimo.com/v1',
                        'https://token-plan-sgp.xiaomimimo.com.evil.test/v1',
                        'https://name:secret@token-plan-sgp.xiaomimimo.com/v1',
                        'https://token-plan-sgp.xiaomimimo.com/v1?token=secret']:
                invalid.append([{**entry,'base_url':url}])
            for pool in invalid:
                (home/'auth.json').write_text(json.dumps({'credential_pool':{'xiaomi':pool}}))
                with self.assertRaises(ValueError):run.xiaomi_connection(home)
