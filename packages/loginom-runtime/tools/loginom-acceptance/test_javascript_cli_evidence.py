"""Transport tests use real SQLite and the source-defined v1 public event shape."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from javascript_cli_evidence import read_cli_session, verify_cli_delivery


class StandaloneJavascriptEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.profile = Path(self.temporary.name).resolve()
        data = self.profile/'data'
        data.mkdir()
        auth = data/'auth.json'
        auth.write_text(json.dumps(dict(openai=dict(type='oauth',access='SECRET_ACCESS',refresh='SECRET_REFRESH'))))
        auth.chmod(0o600)
        self.database = data/'loginom-ai-agent.db'
        self.session = 'own-session'
        self.directory = self.profile/'model'
        self.connection = sqlite3.connect(self.database)
        self.addCleanup(self.connection.close)
        self.connection.executescript('''
            create table session(id text primary key,directory text,parent_id text);
            create table message(id text primary key,session_id text,time_created integer,data text);
            create table part(id text primary key,message_id text,session_id text,data text);
        ''')
        self.connection.execute('insert into session values(?,?,?)',(self.session,str(self.directory),None))
        user = dict(role='user',model=dict(providerID='openai',modelID='gpt-6.1-sol',variant='low'),time=dict(created=1000))
        assistant = dict(role='assistant',providerID='openai',modelID='gpt-6.1-sol',variant='low',
            parentID='user',time=dict(created=1100,completed=1400))
        for identifier,info in [('user',user),('assistant',assistant)]:
            self.connection.execute('insert into message values(?,?,?,?)',(identifier,self.session,info['time']['created'],json.dumps(info)))
        self.expected = []
        for identifier,filename,content in [('file-task','task.md',b'Use the attached input.'),('file-csv','sales.csv',b'Qty\n1\n')]:
            snapshot = dict(type='file',mime='text/plain',filename=filename,url='data:text/plain;base64,'+base64.b64encode(content).decode())
            self.part(identifier,'user',snapshot)
            self.expected.append(dict(filename=filename,bytes=len(content),sha256=hashlib.sha256(content).hexdigest()))
        self.part('prompt','user',dict(type='text',text='Create and save the scenario.'))
        self.part('preview','user',dict(type='text',synthetic=True,text='SECRET_SYNTHETIC_PREVIEW'))
        self.part('hidden','assistant',dict(type='reasoning',text='SECRET_HIDDEN_REASONING'))
        self.tool = dict(id='tool',messageID='assistant',sessionID=self.session,type='tool',callID='call',tool='loginom_dock_prepare',
            state=dict(status='completed',input={},output='Public verified preparation',time=dict(start=1200,end=1300),metadata=dict(truncated=False)))
        self.part('tool','assistant',{k:v for k,v in self.tool.items() if k not in ('id','messageID','sessionID')})
        self.events = [dict(type='step_start',timestamp=1100,sessionID=self.session,part=dict(type='step-start',id='start',messageID='assistant',sessionID=self.session)),
            dict(type='tool_use',timestamp=1301,sessionID=self.session,part=copy.deepcopy(self.tool)),
            dict(type='step_finish',timestamp=1401,sessionID=self.session,part=dict(type='step-finish',id='finish',messageID='assistant',sessionID=self.session))]
        self.connection.commit()

    def part(self,identifier,message_id,value):
        self.connection.execute('insert into part values(?,?,?,?)',(identifier,message_id,self.session,json.dumps(value)))

    def projection(self):
        return read_cli_session(self.profile,self.session)

    def audit(self,events=None,projection=None,expected=None):
        return verify_cli_delivery(self.events if events is None else events,self.projection() if projection is None else projection,
            self.expected if expected is None else expected,submitted_at=1000,deadline_at=1801000,directory=self.directory)

    def test_actual_sqlite_projection_and_event_delivery_pass_only_transport_scope(self):
        before = self.database.read_bytes()
        projection = self.projection()
        proof = self.audit(projection=projection)
        self.assertTrue(proof['passed'],proof)
        self.assertEqual(proof['terminal_tools'],1)
        self.assertEqual(self.database.read_bytes(),before)
        rendered = json.dumps(projection)
        for secret in ('SECRET_ACCESS','SECRET_REFRESH','SECRET_HIDDEN_REASONING','SECRET_SYNTHETIC_PREVIEW','Create and save','Public verified preparation'):
            self.assertNotIn(secret,rendered)
        for field in ('oauth_transport_verified','native_admission_verified','candidate_verified','knowledge_verified','package_persistence_verified','cleanup_verified','cli_acceptance_verified'):
            self.assertIs(proof[field],False)

    def test_other_session_never_supplies_own_model_or_parts(self):
        self.connection.execute('insert into session values(?,?,?)',('foreign','foreign',None))
        self.connection.execute('insert into message values(?,?,?,?)',('foreign-message','foreign',0,json.dumps(dict(role='assistant',modelID='wrong',providerID='wrong'))))
        self.connection.execute('insert into part values(?,?,?,?)',('foreign-part','foreign-message','foreign',json.dumps(dict(type='text',text='SECRET_FOREIGN'))))
        self.connection.commit()
        self.assertTrue(self.audit()['passed'])
        self.assertNotIn('SECRET_FOREIGN',json.dumps(self.projection()))

    def test_active_profile_missing_session_and_missing_database_refuse(self):
        (self.profile/'.writer').mkdir()
        with self.assertRaisesRegex(ValueError,'not_settled'):self.projection()
        (self.profile/'.writer').rmdir()
        with self.assertRaisesRegex(ValueError,'fresh_root'):read_cli_session(self.profile,'missing')
        self.connection.close()
        self.database.unlink()
        with self.assertRaisesRegex(ValueError,'missing_or_unsafe'):self.projection()
        self.assertFalse(self.database.exists())

    def test_api_key_or_unsafe_auth_permissions_refuse(self):
        auth = self.profile/'data/auth.json'
        auth.chmod(0o644)
        with self.assertRaisesRegex(ValueError,'unsafe'):self.projection()
        auth.chmod(0o600)
        auth.write_text(json.dumps(dict(openai=dict(type='api',key='SECRET_API'))))
        with self.assertRaisesRegex(ValueError,'oauth_required'):self.projection()

    def test_non_snapshot_attachment_and_column_owner_refuse(self):
        original = self.connection.execute('select data from part where id=?',('file-csv',)).fetchone()[0]
        for url in ('file:///tmp/sales.csv','data:application/octet-stream;base64,AA==','data:text/plain;base64,!invalid!'):
            value = json.loads(original)
            value['url'] = url
            self.connection.execute('update part set data=? where id=?',(json.dumps(value),'file-csv'))
            self.connection.commit()
            with self.subTest(url=url):
                with self.assertRaises(ValueError):self.projection()
        self.connection.execute('update part set data=? where id=?',(original,'file-csv'))
        value = json.loads(original)
        value['sessionID'] = 'foreign'
        self.connection.execute('update part set data=? where id=?',(json.dumps(value),'file-csv'))
        self.connection.commit()
        with self.assertRaisesRegex(ValueError,'column_identity'):self.projection()

    def test_model_provider_variant_and_completion_deadline_refuse(self):
        original = self.projection()
        for key,value in [('provider_id','other'),('model_id','gpt-6-astra'),('variant','high'),('error_present',True),('parent_id','foreign')]:
            projection = copy.deepcopy(original)
            projection['models'][-1][key] = value
            with self.subTest(key=key):self.assertFalse(self.audit(projection=projection)['passed'])
        projection = copy.deepcopy(original)
        projection['models'][-1]['time']['completed'] = 1801001
        self.assertFalse(self.audit(projection=projection)['passed'])

    def test_input_files_must_match_hash_size_names_and_count(self):
        for key,value in [('sha256','0'*64),('bytes',1),('filename','expected.json')]:
            expected = copy.deepcopy(self.expected)
            expected[0][key] = value
            with self.subTest(key=key):self.assertFalse(self.audit(expected=expected)['passed'])
        self.assertFalse(self.audit(expected=self.expected[:1])['passed'])

    def test_previous_sol_model_in_actual_sqlite_cannot_supply_current_acceptance(self):
        originals={identifier:json.loads(value) for identifier,value in
            self.connection.execute('select id,data from message')}
        for changed in [('user',),('assistant',),('user','assistant')]:
            for identifier,original in originals.items():
                value=copy.deepcopy(original)
                if identifier in changed:
                    model=value['model'] if identifier=='user' else value
                    model['modelID']='gpt-6-sol'
                self.connection.execute('update message set data=? where id=?',(json.dumps(value),identifier))
            self.connection.commit()
            with self.subTest(changed=changed):
                proof=self.audit()
                self.assertFalse(proof['passed'],proof)
                self.assertIn('cli_actual_model_variant_or_deadline',proof['failures'])

    def test_missing_foreign_hidden_truncated_or_changed_events_refuse(self):
        for case in ('missing','foreign_session','wrong_call','wrong_message','hidden','hidden_part','truncated','changed_output','wrong_input','late_tool','event_order','before_assistant','after_assistant','future_tool'):
            events = copy.deepcopy(self.events)
            if case == 'missing':events.pop(1)
            if case == 'foreign_session':events[1]['sessionID'] = 'foreign'
            if case == 'wrong_call':events[1]['part']['callID'] = 'foreign'
            if case == 'wrong_message':events[1]['part']['messageID'] = 'foreign'
            if case == 'hidden':events[1]['type'] = 'reasoning'
            if case == 'hidden_part':events[0]['part']['type'] = 'reasoning'
            if case == 'truncated':events[1]['part']['state']['metadata']['truncated'] = True
            if case == 'changed_output':events[1]['part']['state']['output'] = 'different'
            if case == 'wrong_input':events[1]['part']['state']['input'] = dict(injected=True)
            if case == 'late_tool':events[1]['part']['state']['time']['end'] = 1801001
            if case == 'event_order':events[1]['timestamp'] = 999
            if case == 'before_assistant':events[1]['part']['state']['time']['start'] = 1001
            if case == 'after_assistant':events[1]['part']['state']['time']['end'] = 1401
            if case == 'future_tool':events[1]['part']['state']['time']['end'] = 1302
            with self.subTest(case=case):
                self.assertNotEqual(events,self.events)
                self.assertFalse(self.audit(events=events)['passed'])

    def test_exact_repeated_terminal_delivery_is_not_an_extra_tool_call(self):
        events = copy.deepcopy(self.events)
        duplicate = copy.deepcopy(events[1])
        duplicate['timestamp'] += 1
        events.insert(2,duplicate)
        proof = self.audit(events=events)
        self.assertTrue(proof['passed'],proof)
        self.assertEqual(proof['terminal_tools'],1)
        self.assertEqual(proof['repeated_identical_deliveries'],1)
        duplicate['part']['state']['output'] = 'changed terminal value'
        self.assertIn('cli_changed_terminal_delivery',self.audit(events=events)['failures'])

    def test_projection_never_exports_extra_time_payload(self):
        value = json.loads(self.connection.execute('select data from message where id=?',('assistant',)).fetchone()[0])
        value['time']['extra'] = 'SECRET_MESSAGE_TIME'
        self.connection.execute('update message set data=? where id=?',(json.dumps(value),'assistant'))
        part = json.loads(self.connection.execute('select data from part where id=?',('tool',)).fetchone()[0])
        part['state']['time']['extra'] = 'SECRET_TOOL_TIME'
        self.connection.execute('update part set data=? where id=?',(json.dumps(part),'tool'))
        self.connection.commit()
        projection = self.projection()
        self.assertNotIn('SECRET_',json.dumps(projection))
        events = copy.deepcopy(self.events)
        events[1]['part']['state']['time']['extra'] = 'SECRET_TOOL_TIME'
        self.assertTrue(self.audit(events=events,projection=projection)['passed'])
        self.assertFalse(self.audit(projection=projection)['passed'])

    def test_malformed_auth_and_message_shapes_refuse_without_payload_export(self):
        auth = self.profile/'data/auth.json'
        original_auth = auth.read_text()
        for value in ([],None,dict(openai=[]),dict(openai=None)):
            auth.write_text(json.dumps(value))
            with self.subTest(auth=value):
                with self.assertRaisesRegex(ValueError,'oauth'):self.projection()
        auth.write_text(original_auth)
        original = self.connection.execute('select data from message where id=?',('user',)).fetchone()[0]
        for value in ([],None,dict(role='user',model=[],time={}),dict(role='user',model={},time=[])):
            self.connection.execute('update message set data=? where id=?',(json.dumps(value),'user'))
            self.connection.commit()
            with self.subTest(message=value):
                with self.assertRaisesRegex(ValueError,'shape'):self.projection()
        self.connection.execute('update message set data=? where id=?',(original,'user'))
        self.connection.commit()

    def test_actual_error_tool_delivery_is_recorded_for_later_native_recovery_audit(self):
        part = json.loads(self.connection.execute('select data from part where id=?',('tool',)).fetchone()[0])
        part['state'] = dict(status='error',input={},error='A recoverable native refusal',time=dict(start=1200,end=1300))
        self.connection.execute('update part set data=? where id=?',(json.dumps(part),'tool'))
        self.connection.commit()
        events = copy.deepcopy(self.events)
        events[1]['part']['state'] = copy.deepcopy(part['state'])
        proof = self.audit(events=events)
        self.assertTrue(proof['passed'],proof)
        self.assertIs(proof['cli_acceptance_verified'],False)
        for value in (None,[],dict(status='error',input={},error=None,time=dict(start=1200,end=1300)),
                dict(status='completed',input={},output='output',time=dict(start=1200,end=1300),metadata=[])):
            part['state'] = value
            self.connection.execute('update part set data=? where id=?',(json.dumps(part),'tool'))
            self.connection.commit()
            with self.subTest(state=value):
                with self.assertRaisesRegex(ValueError,'cli_terminal_'):self.projection()

    def test_late_stdout_flush_does_not_extend_model_completion(self):
        events = copy.deepcopy(self.events)
        for event in events:event['timestamp'] += 1800000
        self.assertTrue(self.audit(events=events)['passed'])
        events[-1] = dict(type='error',timestamp=1801500,sessionID=self.session,error=dict(name='CLI_CANCELLED'))
        self.assertFalse(self.audit(events=events)['passed'])


if __name__ == '__main__':
    unittest.main()
