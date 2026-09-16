import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("dock_native_diagnostics", ROOT / "plugins/loginom-dock-hermes/__init__.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class Context:
    def __init__(self):
        self.hooks = {}

    def register_hook(self, name, callback):
        self.hooks.setdefault(name, []).append(callback)

    def register_skill(self, *args, **kwargs):
        pass

    def register_system_prompt_section(self, *args, **kwargs):
        pass


class NativeDiagnosticsTest(unittest.TestCase):
    def test_current_text_prefix_excludes_attached_content_and_resolves_only_whole_files(self):
        text = '@file:"data 1.csv"'
        ref = types.SimpleNamespace(kind='file', target='data 1.csv', start=0, end=len(text), line_start=None, line_end=None)
        seen=[]
        parser=types.SimpleNamespace(parse_context_references=lambda message: seen.append(message) or [ref])
        with patch.dict(sys.modules, {'agent.context_references':parser}):
            message=[{'type':'text','text':text+'\n\n--- Attached Context ---\n\n@file:/secret.csv'}, {'type':'image_url','image_url':{'url':'ignored'}}]
            self.assertEqual(native.native_input_paths(message,'/workspace'),['/workspace/data 1.csv'])
            self.assertEqual(seen,[text])
            self.assertEqual(native.native_input_paths(text,None),[])
            ref.line_start=1
            self.assertEqual(native.native_input_paths(text,'/workspace'),[])

    def test_native_tokens_are_current_turn_only_and_model_tokens_are_blocked(self):
        ctx=Context()
        with patch.object(native,'install_usage_presence'), patch.object(native,'input_host_environment',return_value=(None,None,True)), patch.object(native.subprocess,'run',return_value=types.SimpleNamespace(returncode=0,stdout=json.dumps({'token':'a'*64}))):
            native.register(ctx)
            capture=ctx.hooks['pre_llm_call'][0]; prepare=ctx.hooks['pre_tool_call'][0]
            capture(session_id='one',turn_id='t1',user_message='Read /explicit/data.csv')
            self.assertEqual(prepare(session_id='one',turn_id='t1',tool_name='loginom_dock_prepare',args={})['args']['host_context_token'],'a'*64)
            for missing_turn in (None, ''):
                self.assertEqual(prepare(session_id='one',turn_id=missing_turn,tool_name='loginom_dock_prepare',args={'host_context_token':'a'*64})['action'],'block')
            self.assertEqual(prepare(session_id='one',turn_id='t2',tool_name='loginom_dock_prepare',args={'host_context_token':'a'*64})['action'],'block')
            self.assertEqual(prepare(session_id='two',turn_id='t1',tool_name='loginom_dock_prepare',args={'host_context_token':'a'*64})['action'],'block')
            capture(session_id='one',turn_id='t2',user_message='New task without a file')
            self.assertEqual(prepare(session_id='one',turn_id='t2',tool_name='loginom_dock_prepare',args={})['args'], {'_dock_session_token':'a'*64})

    def test_every_call_uses_its_native_task_even_without_an_attachment(self):
        ctx=Context()
        def run(argv, **kwargs):
            payload=json.loads(kwargs['input'])
            if argv[1]=='context':
                token=('a' if payload['session_id']=='A' else 'b')*64
                return types.SimpleNamespace(returncode=0,stdout=json.dumps({'token':token}))
            return types.SimpleNamespace(returncode=0,stdout='{}')
        with patch.object(native,'install_usage_presence'), patch.object(native,'input_host_environment',return_value=(None,None,True)), patch.object(native.subprocess,'run',side_effect=run):
            native.register(ctx)
            capture=ctx.hooks['pre_llm_call'][0]; hook=ctx.hooks['pre_tool_call'][0]
            for session in ['A','B']:
                capture(session_id=session,turn_id='one',user_message='Continue',platform='desktop')
            for session in ['A','B','A']:
                value=hook(session_id=session,turn_id='one',tool_name='mcp_loginom_dock_dock_diagnostics',args={'_dock_session_token':'forged'})
                self.assertEqual(value['args'],{'_dock_session_token':('a' if session=='A' else 'b')*64})
            self.assertEqual(hook(session_id='C',turn_id='one',tool_name='mcp_loginom_dock_dock_diagnostics',args={})['action'],'block')

    def test_native_attachment_does_not_capture_server_output_paths(self):
        text='@file:/local/input.csv'
        ref=types.SimpleNamespace(kind='file',target='/local/input.csv',start=0,end=len(text),line_start=None,line_end=None)
        parser=types.SimpleNamespace(parse_context_references=lambda message:[ref])
        with patch.dict(sys.modules, {'agent.context_references':parser}):
            message=text+' Save package to /orcestrator/result.lgp and CSV to "/orcestrator/result.csv".'
            self.assertEqual(native.native_input_paths(message,'/workspace'),['/local/input.csv'])

    def test_remote_workspace_does_not_authorize_a_matching_local_path(self):
        ctx=Context()
        with patch.object(native,'install_usage_presence'), patch.object(native,'input_host_environment',return_value=('/remote',Path('/profile/attachments'),False)), patch.object(native.subprocess,'run',return_value=types.SimpleNamespace(returncode=0,stdout=json.dumps({'token':'a'*64}))) as run:
            native.register(ctx)
            ctx.hooks['pre_llm_call'][0](session_id='one',turn_id='t1',user_message='Read /remote/data.csv and /profile/attachments/file.csv')
            ctx.hooks['pre_tool_call'][0](session_id='one',turn_id='t1',tool_name='loginom_dock_prepare',args={})
            payload=next(json.loads(call.kwargs['input']) for call in run.call_args_list if call.args[0][1]=='input')
            self.assertEqual(payload['paths'],['/profile/attachments/file.csv'])

    def test_presence_distinguishes_zero_and_missing_without_copying_secrets(self):
        self.assertEqual(native.usage_presence({"prompt_tokens_details": {"cached_tokens": 0}, "authorization": "hidden"}),
                         {"cache_read_tokens": True, "cache_write_tokens": False})
        self.assertEqual(native.usage_presence({"cache_creation_input_tokens": 0}),
                         {"cache_read_tokens": False, "cache_write_tokens": True})
        self.assertEqual(native.usage_presence(None), {"cache_read_tokens": False, "cache_write_tokens": False})

    def test_host_input_and_usage_use_normal_native_hooks(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"LOGINOM_DOCK_HOME": directory}):
            root = Path(directory)
            (root / "profiles").mkdir()
            (root / "profiles/hermes-user.json").write_text(json.dumps({"hermes_profile": {"input_upload_directory": "/explicit/input"}}))
            csv = root / "my sales.csv"
            csv.write_text("product,quantity\nA,2\n")
            ctx = Context()
            with patch.object(native, "install_usage_presence"), patch.object(native, "input_host_environment", return_value=(None,None,True)), patch.object(native.subprocess, "run", return_value=types.SimpleNamespace(returncode=0, stdout=json.dumps({"token":"a"*64}))) as run:
                native.register(ctx)
                ctx.hooks["pre_api_request"][0](session_id="session", turn_id="turn", api_request_id="r1", user_message=f'Analyse "{csv}"',
                                                system_prompt="DO NOT LOG", request_messages=["HIDDEN"], started_at=1)
                technical = json.loads(run.call_args.kwargs['input'])
                self.assertEqual(technical['events'][0]['event'], 'model.start')
                self.assertNotIn(str(csv), json.dumps(technical))
                self.assertNotIn('user_message', json.dumps(technical))
                args = ctx.hooks["pre_tool_call"][0](session_id="session", turn_id="turn", tool_name="mcp_loginom_dock_dock_prepare", args={})
                self.assertEqual(args["action"], "modify")
                token = args["args"]["host_context_token"]
                self.assertEqual(token, "a"*64)
                ticket = next(json.loads(call.kwargs['input']) for call in run.call_args_list if call.args[0][1] == 'input')
                self.assertEqual(ticket, {"session_id":"session", "turn_id":"turn", "paths":[str(csv)]})
                self.assertNotIn("DO NOT LOG", json.dumps(ticket))
                ctx.hooks["post_tool_call"][0](session_id="session", tool_name="mcp_loginom_dock_dock_prepare", tool_call_id="tool1",
                                              result={"prepared": True, "sessionId": "dock-session"})
                ctx.hooks["post_api_request"][0](session_id="session", api_request_id="r1", api_duration=1.2,
                    usage={"input_tokens": 2, "output_tokens": 3, "cache_read_tokens": 0, "cache_write_tokens": 0, "total_tokens": 5,
                           "dock_reported": {"cache_read_tokens": True, "cache_write_tokens": False}},
                    response={"raw": "DO NOT LOG"}, assistant_message={"reasoning": "HIDDEN"})
                batches = [json.loads(call.kwargs["input"]) for call in run.call_args_list]
                content = json.dumps(batches)
                self.assertNotIn("DO NOT LOG", content)
                self.assertNotIn("HIDDEN", content)
                end = batches[-1]["events"][-1]
                self.assertEqual(end["duration_ms"], 1200)
                self.assertEqual(end["reported"], {"cache_read": True, "cache_write": False})
                self.assertEqual(end['usage']['cache_read_tokens'], 0)
                self.assertIsNone(end['usage']['cache_write_tokens'])
                self.assertNotIn('user_message', json.dumps(batches[0]))
                prepared = next(e for batch in batches for e in batch.get('events', []) if e['event'] == 'task.prepared')
                self.assertEqual(prepared["user_message"], f'Analyse "{csv}"')

    def test_model_supplied_path_does_not_create_a_host_ticket(self):
        ctx = Context()
        with patch.object(native, "install_usage_presence"):
            native.register(ctx)
        with patch.object(native.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)):
            self.assertEqual(ctx.hooks["pre_tool_call"][0](session_id="session", tool_name="mcp_loginom_dock_dock_prepare",
                                                           args={"sourcePath": "/private/secret.csv"})["action"], "block")

    def test_nested_api_error_keeps_type_and_duration_without_network_body(self):
        ctx = Context()
        with patch.object(native, "install_usage_presence"), patch.object(native.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)) as run:
            native.register(ctx)
            ctx.hooks['post_tool_call'][0](session_id='session', tool_name='mcp_loginom_dock_dock_prepare', result={'prepared': True, 'sessionId': 'dock-session'})
            ctx.hooks['api_request_error'][0](session_id='session', api_request_id='failed', api_duration=0.25,
                error={'type': 'CancelledError', 'message': 'RAW NETWORK BODY'}, request={'body': 'SECRET'}, response='RAW RESPONSE')
            batch = json.loads(run.call_args.kwargs['input'])
            event = batch['events'][-1]
            self.assertEqual(event['error_type'], 'CancelledError')
            self.assertEqual(event['duration_ms'], 250)
            self.assertNotIn('RAW', json.dumps(batch))
            self.assertNotIn('SECRET', json.dumps(batch))

    def test_failure_before_prepare_is_persisted_without_task_content(self):
        ctx = Context()
        with patch.object(native, "install_usage_presence"), patch.object(native.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)) as run:
            native.register(ctx)
            ctx.hooks['on_session_start'][0](session_id='failed-start', user_message='PRIVATE TASK')
            self.assertTrue(json.loads(run.call_args.kwargs['input'])['prune'])
            ctx.hooks['pre_api_request'][0](session_id='failed-start', api_request_id='one', user_message='PRIVATE TASK')
            ctx.hooks['api_request_error'][0](session_id='failed-start', api_request_id='one', error={'type':'AuthenticationError','message':'SECRET'},api_duration=0.1)
            batches=[json.loads(call.kwargs['input']) for call in run.call_args_list]
            self.assertEqual([e['event'] for b in batches for e in b['events']], ['task.start','model.start','model.error'])
            self.assertNotIn('PRIVATE TASK', json.dumps(batches))
            self.assertNotIn('SECRET', json.dumps(batches))


if __name__ == "__main__":
    unittest.main()
