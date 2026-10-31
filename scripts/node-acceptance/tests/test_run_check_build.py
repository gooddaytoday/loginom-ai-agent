import importlib.util
import json
import multiprocessing
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
            build = cache / 'cli'
            build.mkdir()
            runner.write(build / 'cli-manifest.json', {'metadata': {'sourceCommit': head, 'sourceDirty': False}})

    instance.phase = phase
    git = runner.git
    try:
        with patch.object(runner, 'git', side_effect=lambda *args, cwd=repo: git(*args, cwd=cwd)), \
             patch.object(runner.Path, 'home', return_value=home):
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

    def test_install_cannot_hide_content_changes(self):
        out = multiprocessing.get_context('fork').Queue()
        prepare(self.repo, self.home, self.head, out, mutate=True)
        self.assertEqual(out.get(timeout=1), 'Dependencies modified tracked source')


if __name__ == '__main__':
    unittest.main()
