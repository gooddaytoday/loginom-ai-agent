import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('run_check', Path(__file__).resolve().parents[1] / 'run-check.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def prepare(repo, home, head, out, started=None, mutate=False, builds=None):
    instance = runner.Runner.__new__(runner.Runner)
    instance.options = {'build': None}
    instance.report = {'head': head}
    instance.env = {}
    instance.deadline = time.time() + 10
    instance.save = lambda: None

    def phase(name, command, cache, **kwargs):
        if name == 'dependencies':
            # A real competing process must never see an in-progress install.
            busy = cache.parent / 'installing'
            with busy.open('x'):
                if started: started.set()
                time.sleep(.3)
                (cache / 'install-env.json').write_text(json.dumps(kwargs['env']))
                path = kwargs['cwd'] / 'packages/cli/bin/lildax.cjs'
                path.chmod(0o755)
                if mutate: path.write_text('changed by install\n')
            busy.unlink()
        if name == 'build':
            if builds: builds.wait(timeout=5)
            source = kwargs['cwd'].parents[1]
            assert not runner.git('status', '--porcelain', cwd=source)
            # Builds need no stand key and must not embed one.
            assert 'LOGINOM_MCP_API_KEY' not in kwargs['env']
            assert 'LOGINOM_DOCK_API_KEY' not in kwargs['env']
            assert not any('stand-key' in str(part) for part in command)
            build = cache / 'cli'
            (build / 'resources/loginom').mkdir(parents=True)
            assert not (build / 'resources/loginom/knowledge-key').exists()
            runner.write(build / 'cli-manifest.json', {'metadata': {'sourceCommit': head, 'sourceDirty': False}})

    instance.phase = phase
    git = runner.git
    try:
        with patch.object(runner, 'git', side_effect=lambda *args, cwd=repo: git(*args, cwd=cwd)), \
             patch.object(runner.Path, 'home', return_value=home), \
             patch.object(runner, 'KNOWLEDGE_KEY', home / '.config/loginom-ai-agent/mcp-api-key'), \
             patch.dict(runner.os.environ, {k: v for k, v in os.environ.items() if k != 'LOGINOM_MCP_API_KEY'}, clear=True):
            instance.build()
        out.put(None)
    except Exception as error:
        out.put(str(error))


class BuildPreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo, self.home = self.root / 'repo', self.root / 'home'
        self.repo.mkdir()
        (self.home / '.cache/loginom-bootstrap/node/pinned/bin').mkdir(parents=True)
        (self.home / '.cache/loginom-bootstrap/node/pinned/bin/node').touch()
        (self.home / '.config/loginom-ai-agent').mkdir(parents=True)
        for args in [('init', '-q'), ('config', 'user.name', 'Test'), ('config', 'user.email', 'test@example.invalid')]:
            runner.git(*args, cwd=self.repo)
        (self.repo / 'packages/cli/bin').mkdir(parents=True)
        (self.repo / 'packages/loginom-host').mkdir()
        (self.repo / 'packages/cli/bin/lildax.cjs').write_text('original\n')
        (self.repo / 'other.txt').write_text('other\n')
        runner.git('add', '.', cwd=self.repo)
        runner.git('commit', '-qm', 'fixture', cwd=self.repo)
        self.head = runner.git('rev-parse', 'HEAD', cwd=self.repo)
        self.cache = self.home / '.cache/loginom-run-check' / runner.socket.gethostname() / self.head

    def source(self):
        self.cache.mkdir(parents=True)
        source = self.cache / 'source'
        runner.git('worktree', 'add', '--detach', str(source), self.head, cwd=self.repo)
        return source

    def test_parallel_preparations_share_only_a_completed_build(self):
        context = multiprocessing.get_context('fork')
        out, started = context.Queue(), context.Event()
        processes = [context.Process(target=prepare, args=(self.repo, self.home, self.head, out, started)) for _ in range(2)]
        for index, process in enumerate(processes):
            process.start()
            if index == 0: self.assertTrue(started.wait(5))
        for process in processes:
            process.join(12)
            if process.is_alive():
                process.terminate(); process.join()
                self.fail('preparation did not finish')
            self.assertEqual(process.exitcode, 0)
        self.assertEqual([out.get(timeout=1) for _ in processes], [None, None])

    def test_host_install_lock_serializes_two_shas_but_not_their_builds(self):
        (self.repo / 'other.txt').write_text('second revision\n')
        runner.git('commit', '-qam', 'second fixture', cwd=self.repo)
        other = runner.git('rev-parse', 'HEAD', cwd=self.repo)
        context = multiprocessing.get_context('fork')
        out, started, builds = context.Queue(), context.Event(), context.Barrier(2)
        processes = [context.Process(target=prepare, args=(self.repo, self.home, head, out, started),
                                     kwargs={'builds': builds}) for head in [self.head, other]]
        for index, process in enumerate(processes):
            process.start()
            if index == 0: self.assertTrue(started.wait(5))
        for process in processes:
            process.join(12)
            if process.is_alive():
                process.terminate(); process.join()
                self.fail('preparation did not finish')
            self.assertEqual(process.exitcode, 0)
        self.assertEqual([out.get(timeout=1) for _ in processes], [None, None])
        for head in [self.head, other]:
            env = runner.read(self.cache.parent / head / 'install-env.json')
            self.assertNotIn('BUN_INSTALL_CACHE_DIR', env)

    def test_permissions_recovered_but_changed_content_is_rejected(self):
        source = self.source()
        for path in ['packages/cli/bin/lildax.cjs', 'other.txt']:
            (source / path).chmod(0o755)
        out = multiprocessing.get_context('fork').Queue()
        prepare(self.repo, self.home, self.head, out)
        self.assertIsNone(out.get(timeout=1))
        self.assertEqual(runner.git('status', '--porcelain', cwd=source), '')
        # Invalidate only this fixture's build, then retain a real source edit.
        (self.cache / 'cli/cli-manifest.json').unlink()
        (source / 'other.txt').write_text('changed contents\n')
        prepare(self.repo, self.home, self.head, out)
        self.assertEqual(out.get(timeout=1), 'Dirty build source')

    def test_build_succeeds_without_the_stand_knowledge_key(self):
        out = multiprocessing.get_context('fork').Queue()
        prepare(self.repo, self.home, self.head, out)
        self.assertIsNone(out.get(timeout=1))
        self.assertFalse((self.cache / 'cli/resources/loginom/knowledge-key').exists())

    def test_install_cannot_hide_content_changes(self):
        out = multiprocessing.get_context('fork').Queue()
        prepare(self.repo, self.home, self.head, out, mutate=True)
        self.assertEqual(out.get(timeout=1), 'Dependencies modified tracked source')


class SetupBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        runner.write(self.root / 'results.json', {'started': time.time(), 'runs': [{'scenario': 'C1', 'status': 'PENDING'}]})
        runner.write(self.root / 'request.json', {'pair': str(self.root), 'cold': False, 'cases': str(self.root / 'cases')})
        (self.root / 'cases/C1').mkdir(parents=True)
        (self.root / 'cases/C1/task.md').write_text('Synthetic fixture only')
        runner.write(self.root / 'worker.json', {'url': 'https://loginom.test/app/', 'username': 'fixture-user',
                                              'password': 'password-canary', 'package_directory': '/fixtures'})

    def test_setup_uses_custom_stand_key_only_through_stdin(self):
        self.setup_boundary('https://stand.test/mcp')

    def test_setup_keeps_the_default_dock_endpoint(self):
        self.setup_boundary()

    def setup_boundary(self, endpoint=None):
        env = dict(LOGINOM_DOCK_API_KEY='stand-canary')
        if endpoint: env['LOGINOM_DOCK_ENDPOINT'] = endpoint
        with patch.dict(os.environ, env, clear=True):
            instance = runner.Runner(self.root)
            instance.save = lambda: runner.write(self.root / 'results.json', instance.report)
            instance.build = lambda: self.root / 'build'
            calls = []

            def phase(name, command, folder, **kwargs):
                calls.append(name)
                instance.report['phase'] = name
                self.assertEqual(name, 'setup')
                body = json.loads(kwargs['stdin'])
                self.assertEqual(body, dict(mode='custom', endpoint=endpoint or 'https://mcp.loginom.ai/mcp', apiKey='stand-canary',
                                           url='https://loginom.test/app/', username='fixture-user', password='password-canary'))
                self.assertFalse(any('stand-canary' in str(value) for value in command))
                self.assertFalse('LOGINOM_DOCK_API_KEY' in kwargs['env'])
                runner.write(folder / 'setup.stdout', {'browser': {'state': 'verified'}})
                (folder / 'profile/data').mkdir(parents=True)
                (folder / 'profile/config').mkdir()

            def model(*args):
                calls.append('model')
                raise RuntimeError('MODEL_BOUNDARY_REACHED')

            instance.phase, instance.model = phase, model
            instance.run()
        self.assertEqual(instance.report['runs'][0]['detail'], 'MODEL_BOUNDARY_REACHED')
        self.assertEqual(calls, ['setup', 'model'])
        for file in self.root.rglob('*'):
            if file.is_file() and not file.is_symlink():
                self.assertFalse('stand-canary' in file.read_text())

    def test_missing_key_fails_before_setup_or_model_and_prepare_only_succeeds(self):
        with patch.dict(os.environ, {'LOGINOM_MCP_API_KEY': 'legacy-unused-canary'}, clear=True), \
             patch.object(runner, 'KNOWLEDGE_KEY', self.root / 'missing-private-key'):
            instance = runner.Runner(self.root)
            instance.report['phase'] = 'prepared'
            instance.save = lambda: runner.write(self.root / 'results.json', instance.report)
            instance.build = lambda: self.root / 'build'
            calls = []
            instance.phase = lambda *args, **kwargs: calls.append('setup')
            instance.model = lambda *args: calls.append('model')
            instance.run()
            self.assertEqual(calls, [])
            self.assertIn('required for setup', instance.report['runs'][0]['detail'])
            self.assertEqual(instance.report['runs'][0]['status'], 'FAIL')
            self.assertFalse('legacy-unused-canary' in json.dumps(instance.report))
            instance.report['runs'] = [{'scenario': 'C1', 'status': 'PENDING'}]
            instance.options['prepare_only'] = True
            instance.run()
            self.assertEqual(calls, [])
            self.assertEqual(instance.report['runs'][0]['reason'], 'PREPARE_ONLY')

    def test_private_file_is_setup_input_and_new_environment_key_takes_priority(self):
        private = self.root / 'stand-key'
        private.write_text('private-file-canary\n')
        private.chmod(0o600)
        with patch.dict(os.environ, {}, clear=True), patch.object(runner, 'KNOWLEDGE_KEY', private):
            self.assertEqual(runner.stand_knowledge_key(), 'private-file-canary')
            with patch.dict(os.environ, {'LOGINOM_DOCK_API_KEY': 'environment-canary'}):
                self.assertEqual(runner.stand_knowledge_key(), 'environment-canary')

    def test_child_environment_omits_stand_keys_and_preserves_provider_environment(self):
        with patch.dict(os.environ, {'LOGINOM_MCP_API_KEY': 'legacy-canary', 'LOGINOM_DOCK_API_KEY': 'stand-canary',
                                     'OPENAI_API_KEY': 'provider-canary'}, clear=True):
            instance = runner.Runner(self.root)
        self.assertFalse('LOGINOM_MCP_API_KEY' in instance.env)
        self.assertFalse('LOGINOM_DOCK_API_KEY' in instance.env)
        self.assertEqual(instance.env['OPENAI_API_KEY'], 'provider-canary')


if __name__ == '__main__':
    unittest.main()
