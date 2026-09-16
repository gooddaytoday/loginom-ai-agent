"""Run the normal Hermes CLI with authentication and effective-model checks.

Hermes 0.21's top-level -z path drops reasoning/max-turns. This adapter does
not change model settings: it rejects mismatches before inference and records
only policy/usage metadata, never request contents or reasoning.
"""
import functools
import json
import os
from pathlib import Path
import sys
from hermes_auth_guard import install as install_auth, record

POLICY = 'effective-hermes-cli-model-v1'

def expected_arguments(argv):
    def one(flag):
        if argv.count(flag) != 1:
            raise ValueError('Exactly one '+flag+' is required')
        i=argv.index(flag)
        if i+1 >= len(argv):raise ValueError('Missing '+flag)
        return argv[i+1]
    result={'provider':one('--provider'),'model':one('--model'),
            'reasoning_effort':one('--reasoning'),'max_turns':int(one('--max-turns'))}
    if result['provider']!='openai-codex' or result['model']!='gpt-5.6-sol' or result['reasoning_effort']!='low' or result['max_turns']<=0:
        raise ValueError('Unapproved acceptance model policy')
    if not argv or argv[0]!='chat' or '-z' in argv:
        raise ValueError('Normal Hermes chat CLI is required')
    return result

def install_runtime(agent_class, transport_class, expected, on_change, on_usage, *, probe=False):
    state={'policy':POLICY,'expected':expected,'constructor_verified':False,'wire_requests_verified':0,'blocked':False}
    def reject(message):
        state['blocked']=True;on_change(state);raise RuntimeError(message)
    original_init=agent_class.__init__
    @functools.wraps(original_init)
    def guarded_init(self,*args,**kwargs):
        observed={'provider':kwargs.get('provider'),'model':kwargs.get('model'),
                  'reasoning_effort':(kwargs.get('reasoning_config') or {}).get('effort'),
                  'max_turns':kwargs.get('max_iterations')}
        if observed!=expected:reject('Hermes constructor does not match approved model/budget')
        state['constructor_verified']=True;on_change(state)
        if probe:raise SystemExit(0)
        original_init(self,*args,**kwargs)
    agent_class.__init__=guarded_init
    original_build=transport_class.build_kwargs
    @functools.wraps(original_build)
    def guarded_build(self,*args,**kwargs):
        result=original_build(self,*args,**kwargs)
        if not state['constructor_verified'] or result.get('model')!=expected['model'] or (result.get('reasoning') or {}).get('effort')!=expected['reasoning_effort']:
            reject('Hermes outbound model/reasoning does not match approved policy')
        state['wire_requests_verified']+=1;on_change(state)
        return result
    transport_class.build_kwargs=guarded_build
    original_run=agent_class.run_conversation
    @functools.wraps(original_run)
    def guarded_run(self,*args,**kwargs):
        result=original_run(self,*args,**kwargs)
        keys=('api_calls','completed','failed','input_tokens','output_tokens','total_tokens',
              'cache_read_tokens','cache_write_tokens','reasoning_tokens')
        on_usage({**{k:result.get(k) for k in keys},'model':expected['model'],'provider':expected['provider']})
        return result
    agent_class.run_conversation=guarded_run
    return state

def main():
    source,auth_receipt,policy_receipt,usage_file,*argv=sys.argv[1:]
    expected=expected_arguments(argv)
    sys.path.insert(0,str(Path(source).resolve()))
    from hermes_cli import auth
    state=install_auth(auth,sys.modules.get('hermes_cli.auth_codex'),lambda v:record(auth_receipt,v))
    record(auth_receipt,state,initial=True)
    import run_agent
    from agent.transports.codex import ResponsesApiTransport
    state=install_runtime(run_agent.AIAgent,ResponsesApiTransport,expected,
                          lambda v:record(policy_receipt,v),lambda v:record(usage_file,v),
                          probe=os.environ.get('DOCK_ACCEPTANCE_PROBE_ONLY')=='1')
    record(policy_receipt,state,initial=True)
    sys.argv=[str(Path(source)/'hermes'),*argv]
    from hermes_cli.main import main as hermes_main
    hermes_main()

if __name__=='__main__':main()
