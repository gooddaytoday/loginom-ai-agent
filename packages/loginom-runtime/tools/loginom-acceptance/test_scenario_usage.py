import sqlite3
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from scenario_usage import session_usage, recover_completed_run


class SessionUsageTests(unittest.TestCase):
    def test_interrupted_session_counters_are_recovered_without_sensitive_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory);db=sqlite3.connect(home/'state.db')
            db.execute('create table sessions (id text, model text, billing_provider text, ended_at real, api_call_count integer, input_tokens integer, output_tokens integer, cache_read_tokens integer, system_prompt text, reasoning_content text)')
            db.executemany('insert into sessions values (?,?,?,?,?,?,?,?,?,?)',[
                ('task','mimo-v2.5','xiaomi',None,3,10,5,200,'PRIVATE PROMPT','PRIVATE REASONING'),
                ('other','mimo-v2.5','xiaomi',1,99,999,999,999,'OTHER','OTHER')]);db.commit();db.close()
            connect=sqlite3.connect
            def guarded(*args,**kwargs):
                connection=connect(*args,**kwargs)
                connection.set_authorizer(lambda action,table,column,*rest:sqlite3.SQLITE_DENY
                    if action==sqlite3.SQLITE_READ and column in ('system_prompt','reasoning_content') else sqlite3.SQLITE_OK)
                return connection
            with patch('scenario_usage.sqlite3.connect',guarded):
                result=session_usage(home,['task'],provider='xiaomi',model='mimo-v2.5')
            self.assertEqual(result['status'],'RECOVERED');self.assertFalse(result['sessions_finalized'])
            self.assertEqual(result['usage']['api_calls'],3);self.assertEqual(result['usage']['input_tokens'],10)
            self.assertEqual(result['usage']['cache_read_tokens'],200);self.assertIsNone(result['usage']['total_tokens'])
            self.assertIsNone(result['usage']['reasoning_tokens']);self.assertNotIn('PRIVATE',str(result))
            self.assertEqual(session_usage(home,['missing'],provider='xiaomi',model='mimo-v2.5')['status'],'UNAVAILABLE')
            self.assertEqual(session_usage(home,['task'],provider='other',model='mimo-v2.5')['status'],'UNAVAILABLE')

    def test_unknown_schema_and_empty_identity_do_not_fabricate_zero_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory)
            self.assertEqual(session_usage(home,[],provider='xiaomi',model='mimo-v2.5')['status'],'UNAVAILABLE')
            db=sqlite3.connect(home/'state.db');db.execute('create table sessions (id text)');db.commit();db.close()
            self.assertIsNone(session_usage(home,['task'],provider='xiaomi',model='mimo-v2.5')['usage'])

    def test_completed_backfill_is_append_only_and_preserves_numeric_counters(self):
        with tempfile.TemporaryDirectory() as directory:
            run=Path(directory)
            (run/'evidence.json').write_text(json.dumps(dict(export_complete=True,process=dict(returncode=-15))))
            (run/'request.json').write_text(json.dumps(dict(provider='xiaomi',model='mimo-v2.5')))
            with patch('evidence.export_history',return_value=([dict(session_id='s')],[])), patch('scenario_usage.session_usage',side_effect=lambda *a,**k:dict(status='RECOVERED',usage=dict(input_tokens=42,total_tokens=None))):
                recover_completed_run(run)
                original=(run/'usage-recovery.json').read_bytes()
                self.assertEqual(json.loads(original)['process']['usage']['input_tokens'],42)
                with self.assertRaises(FileExistsError):recover_completed_run(run)
                self.assertEqual((run/'usage-recovery.json').read_bytes(),original)
            (run/'evidence.json').write_text(json.dumps(dict(export_complete=False,process={})))
            with self.assertRaises(ValueError):recover_completed_run(run)


if __name__=='__main__':unittest.main()
