import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from scenario_profile import effective_profile, hermes_command, openrouter_connection


class ProfileTests(unittest.TestCase):
    def test_acceptance_plan_refuses_missing_or_unverified_effective_profile(self):
        from scenario_audit_plan import build_plan
        for evidence in ({}, {'effective_profile': {'status': 'UNVERIFIED'}}):
            with self.assertRaisesRegex(ValueError, 'Effective Xiaomi/MiMo/medium profile unverified'):
                build_plan({'phase': 'acceptance'}, evidence)

    def test_command_uses_normal_native_cli_and_keeps_prompt_in_file(self):
        argv=hermes_command(Path('/bin/hermes'),Path('/tmp/input with spaces.txt'),120)
        self.assertEqual(argv[1],'chat');self.assertNotIn('-z',argv)
        self.assertEqual(argv[argv.index('--reasoning')+1],'medium')
        self.assertEqual(argv[argv.index('--query-file')+1],'/tmp/input with spaces.txt')
        self.assertEqual(argv[argv.index('--max-turns')+1],'120')

    def test_effective_profile_requires_all_persisted_sessions(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp)
            self.assertEqual(effective_profile(home)['status'],'UNVERIFIED')
            with sqlite3.connect(home/'state.db') as db:
                db.execute('CREATE TABLE sessions(id TEXT,model TEXT,billing_provider TEXT,model_config TEXT,system_prompt TEXT)')
                db.execute('INSERT INTO sessions VALUES(?,?,?,?,?)',('s','mimo-v2.5','xiaomi',json.dumps({'reasoning_config':{'enabled':True,'effort':'medium'}}),'private'))
            result=effective_profile(home);self.assertEqual(result['status'],'VERIFIED');self.assertNotIn('private',str(result))
            from evidence import clean
            sanitized=clean(result,[])
            self.assertEqual(sanitized['sessions'][0]['reasoning_effort'],'medium')
            self.assertIs(sanitized['sessions'][0]['reasoning_enabled'],True)
            for provider,model,reasoning in [('xiaomi','mimo-v2.5',None),('other','mimo-v2.5',{'enabled':True,'effort':'medium'}),('xiaomi','other',{'enabled':True,'effort':'medium'}),('xiaomi','mimo-v2.5',{'enabled':True,'effort':'high'})]:
                with sqlite3.connect(home/'state.db') as db:
                    db.execute('INSERT OR REPLACE INTO sessions VALUES(?,?,?,?,?)',('bad',model,provider,json.dumps({'reasoning_config':reasoning}),'private'))
                self.assertEqual(effective_profile(home)['status'],'UNVERIFIED')
                with sqlite3.connect(home/'state.db') as db:db.execute("DELETE FROM sessions WHERE id='bad'")

class LingProfileTests(unittest.TestCase):
    def test_exact_deepseek_command_without_fallback(self):
        model='deepseek/deepseek-v4.1-flash'
        args=hermes_command(Path('/hermes'),Path('/prompt'),120,provider='openrouter',model=model)
        self.assertEqual(args[args.index('--model')+1],model)
        for provider,other in [('openrouter',model+':free'),('xiaomi',model)]:
            with self.assertRaises(ValueError):
                hermes_command(Path('/h'),Path('/p'),1,provider=provider,model=other)

    def test_exact_ling_command_no_free_or_other_profile(self):
        args=hermes_command(Path('/hermes'),Path('/prompt'),120,provider='openrouter',model='inclusionai/ling-3.0-flash-fin')
        self.assertEqual(args[args.index('--model')+1],'inclusionai/ling-3.0-flash-fin')
        self.assertEqual(args[args.index('--provider')+1],'openrouter')
        for provider,model in [('openrouter','inclusionai/ling-3.0-flash-fin:free'),('xiaomi','inclusionai/ling-3.0-flash-fin')]:
            with self.assertRaises(ValueError):hermes_command(Path('/h'),Path('/p'),1,provider=provider,model=model)

    def test_only_requested_hermes_key_is_read_without_expansion(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);(home/'.env').write_text('UNRELATED_KEY=hidden\nOPENROUTER_API_KEY="fixture-$LITERAL"\n')
            self.assertEqual(openrouter_connection(home),{'OPENROUTER_API_KEY':'fixture-$LITERAL'})
            (home/'.env').write_text('OPENROUTER_API_KEY=one\nOPENROUTER_API_KEY=two\n')
            with self.assertRaises(ValueError):openrouter_connection(home)

    def test_ling_effective_identity_and_reasoning(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp)
            with sqlite3.connect(home/'state.db') as db:
                db.execute('CREATE TABLE sessions(id TEXT,model TEXT,billing_provider TEXT,model_config TEXT)')
                db.execute('INSERT INTO sessions VALUES(?,?,?,?)',('s','inclusionai/ling-3.0-flash-fin','openrouter',json.dumps({'reasoning_config':{'enabled':True,'effort':'medium'}})))
            self.assertEqual(effective_profile(home,provider='openrouter',model='inclusionai/ling-3.0-flash-fin')['status'],'VERIFIED')
            self.assertEqual(effective_profile(home)['status'],'UNVERIFIED')

if __name__=='__main__':unittest.main()
