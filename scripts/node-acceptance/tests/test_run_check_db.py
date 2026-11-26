import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import textwrap
import time
import unittest
from unittest.mock import patch
from urllib.parse import quote


spec = importlib.util.spec_from_file_location('run_check', Path(__file__).resolve().parents[1] / 'run-check.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class DatabasePromptTests(unittest.TestCase):
    def test_config_is_literal_and_invalid_lines_preserve_privacy(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            config = home / '.config/loginom-run-check/db-test.conf'
            config.parent.mkdir(parents=True)
            with patch.object(runner.Path, 'home', return_value=home):
                self.assertEqual(runner.DatabasePrompt().render('Обычное задание'), 'Обычное задание')
                with self.assertRaisesRegex(ValueError, 'DB_CONFIG_UNREADABLE'):
                    runner.DatabasePrompt().render('[[DB:DB_HOST]]')
                config.write_text('DB_USER=\'$(echo wrong) # =\'\nDB_HOST=unresolved.example\n', encoding='utf-8')
                db = runner.DatabasePrompt()
                self.assertEqual(db.render('[[DB:DB_HOST]] ([[DB:DB_USER]])'), 'unresolved.example ($(echo wrong) # =)')
                with self.assertRaisesRegex(ValueError, 'DB_CONFIG_MISSING_FIELD: DB_PASSWORD'):
                    db.render('[[DB:DB_PASSWORD]]')
                invalid = 'synthetic-secret-without-a-key'
                config.write_text(invalid + '\n', encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'DB_CONFIG_INVALID') as error:
                    runner.DatabasePrompt().render('[[DB:DB_HOST]]')
                self.assertNotIn(invalid, str(error.exception))

    def test_failed_model_reads_password_from_stdin_and_masks_run_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / '.config/loginom-run-check/db-test.conf'
            config.parent.mkdir(parents=True)
            password = 'fake-Секрет"\\=value'
            config.write_text(f'DB_HOST=db.example\nDB_PASSWORD={password}\n', encoding='utf-8')
            case = root / 'cases/bh-test'
            case.mkdir(parents=True)
            source_task = case / 'task.md'
            source_task.write_text('Сервер [[DB:DB_HOST]], пароль [[DB:DB_PASSWORD]].', encoding='utf-8')
            runner.write(case / 'expected.json', {
                'nodes': [], 'outputs': [], 'graph': {'nodes': [{'id': 'query', 'type': 'imports.database'}]},
            })
            build = root / 'build'
            cli = build / 'bin/loginom-ai-agent-cli'
            cli.parent.mkdir(parents=True)
            cli.write_text(f'#!{sys.executable}\n' + textwrap.dedent('''
                import json, os, sys
                from pathlib import Path
                from urllib.parse import quote

                profile = Path(os.environ['LOGINOM_AI_AGENT_CLI_PROFILE'])
                if sys.argv[1] == 'loginom':
                    (profile / 'data').mkdir(parents=True)
                    (profile / 'config').mkdir()
                    print('{"browser":{"state":"verified"}}')
                    sys.exit(0)
                assert '--' not in sys.argv
                prompt = sys.stdin.read()
                assert 'db.example' in prompt and '[[DB:' not in prompt
                secret = prompt.split('пароль ', 1)[1].split('.', 1)[0]
                node_log = profile / 'execution-events.jsonl'
                node_log.write_text(json.dumps({'phase': 'example', 'detail': secret}) + '\\n')
                (profile / 'data/loginom-ai-agent.db').write_text(prompt)
                print(json.dumps({'part': {'state': {'output': json.dumps({'detail': secret})}}}))
                print('connection failed: ' + quote(secret, safe=''), file=sys.stderr)
                sys.exit(17)
            '''), encoding='utf-8')
            cli.chmod(0o700)
            pair = root / 'pair'
            pair.mkdir()
            runner.write(pair / 'worker.json', dict(loginom=dict(url='https://example.invalid', username='demo', password='setup'),
                                                   package_directory='/owned'))
            run = root / 'run'
            run.mkdir()
            runner.write(run / 'request.json', dict(cases=str(case.parent), pair=str(pair), host_load_max=1000000, spacing=0))
            runner.write(run / 'results.json', dict(head='sha', tree='tree', started=time.time(), phase='build',
                                                  runs=[dict(scenario='bh-test', status='PENDING')]))
            with patch.object(runner.Path, 'home', return_value=root):
                instance = runner.Runner(run)
                with patch.object(instance, 'build', return_value=build):
                    instance.run()
            scenario = run / 'bh-test'
            turn = scenario / 'bh-test'
            self.assertNotIn(password, source_task.read_text(encoding='utf-8'))
            self.assertIn('db.example, пароль [REDACTED]', (turn / 'task.md').read_text(encoding='utf-8'))
            output = runner.read(turn / 'model.stdout')
            self.assertEqual(json.loads(output['part']['state']['output']), {'detail': '[REDACTED]'})
            self.assertIn('connection failed: [REDACTED]', (turn / 'model.stderr').read_text(encoding='utf-8'))
            self.assertEqual(runner.read(scenario / 'profile/execution-events.jsonl')['detail'], '[REDACTED]')
            self.assertFalse((scenario / 'profile/data/loginom-ai-agent.db').exists())
            result = runner.read(run / 'results.json')['runs'][0]
            self.assertEqual(result['status'], 'FAIL')
            self.assertTrue(result['detail'].startswith('model exit=17:'))
            variants = [password, quote(password, safe=''), json.dumps(password)[1:-1]]
            for evidence in (turn / 'task.md', turn / 'model.stdout', turn / 'model.stderr',
                             scenario / 'profile/execution-events.jsonl', scenario / 'bh-test-checks.jsonl',
                             run / 'results.json', run / 'summary.md'):
                contents = evidence.read_text(encoding='utf-8')
                for variant in variants:
                    self.assertNotIn(variant, contents, evidence.name)


if __name__ == '__main__':
    unittest.main()
