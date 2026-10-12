import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

WORKSPACE = '11111111-1111-4111-8111-111111111111'
OWNER = '22222222-2222-4222-8222-222222222222'
ISSUE = '33333333-3333-4333-8333-333333333333'
REVIEWER = '44444444-4444-4444-8444-444444444444'
TASK = '55555555-5555-4555-8555-555555555555'


class ArtifactsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.state = self.root / 'state'
        self.native = self.root / 'native'
        self.native.mkdir()
        self.owner = OWNER
        self.workspace = WORKSPACE
        self.environment = {k: v for k, v in os.environ.items() if not k.startswith('MULTICA_')}
        self.environment.update(MULTICA_SERVER_URL='http://127.0.0.1:1', MULTICA_TOKEN='test-only')

    def tearDown(self):
        self.temporary.cleanup()

    def cli(self, *args, owner=None, environment=None):
        return subprocess.run([sys.executable, str(Path(__file__).with_name('artifacts.py')),
            '--owner', owner or self.owner, '--workspace', self.workspace, '--state-root', str(self.state),
            '--workspaces-root', str(self.native), *args], env=environment or self.environment,
            capture_output=True, text=True)

    def successful(self, *args, **options):
        result = self.cli(*args, **options)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def build(self, name='candidate'):
        path = Path(self.successful('allocate', '--issue', ISSUE, '--name', name)['destination'])
        path.mkdir()
        files = []
        for relative in ['bin/loginom-ai-agent-cli', 'resources/loginom/host/node-host.mjs',
                         'resources/loginom/resource-manifest.json', 'resources/loginom/bin/node',
                         'resources/loginom/runtime/client/node_modules/example/index.js']:
            file = path / relative
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('immutable payload ' + relative)
            files.append({'path': relative, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                          'mode': file.stat().st_mode & 0o7777})
        metadata = {'version': '0.0.0-test', 'channel': 'dev', 'platform': 'linux', 'arch': 'x64',
                    'sourceCommit': 'a' * 40, 'sourceTreeSha256': 'b' * 64, 'sourceDirty': False,
                    'capabilities': ['shared-oauth-v1'], 'dependencies': {'node': '24.19.0', 'bun': '1.3.14'}}
        (path / 'cli-manifest.json').write_text(json.dumps({'format': 'loginom-cli-artifact-v1',
            'metadata': metadata, 'files': files}))
        return path

    def register(self, path, *extra):
        return self.successful('register', '--issue', ISSUE, '--path', str(path), '--kind', 'build', *extra)

    def catalog(self):
        return self.state / WORKSPACE / OWNER / 'catalog.json'

    def age(self, artifact, days=2):
        path = self.catalog()
        data = json.loads(path.read_text())
        data['records'][artifact]['retired_at'] = time.time() - days * 86400
        path.write_text(json.dumps(data))

    def test_complete_payload_is_registered_and_identity_is_stable(self):
        path = self.build()
        first = self.register(path)
        self.assertEqual(first['id'], self.register(path)['id'])
        self.assertEqual(self.catalog().stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.successful('use', '--id', first['id'])['path'], str(path))

    def test_missing_bundled_dependency_and_changed_payload_refuse_reuse(self):
        path = self.build()
        artifact = self.register(path)['id']
        (path / 'resources/loginom/runtime/client/node_modules/example/index.js').unlink()
        self.assertNotEqual(self.cli('use', '--id', artifact).returncode, 0)
        self.assertNotEqual(self.cli('register', '--issue', ISSUE, '--path', str(path), '--kind', 'build').returncode, 0)

    def test_exact_input_mismatch_and_uninventoried_file_are_refused(self):
        path = self.build()
        artifact = self.register(path)['id']
        expected = json.loads((path / 'cli-manifest.json').read_text())['metadata']
        expected['sourceCommit'] = 'c' * 40
        file = self.root / 'expected.json'
        file.write_text(json.dumps(expected))
        self.assertNotEqual(self.cli('use', '--id', artifact, '--expected', str(file)).returncode, 0)
        (path / 'unexpected').write_text('foreign data')
        self.assertNotEqual(self.cli('use', '--id', artifact).returncode, 0)

    def test_foreign_owner_and_task_impersonation_are_refused(self):
        artifact = self.register(self.build())['id']
        self.assertNotEqual(self.cli('retire', '--id', artifact, '--reason', 'unused', owner=REVIEWER).returncode, 0)
        environment = dict(self.environment, MULTICA_TOKEN='mat_test', MULTICA_AGENT_ID=REVIEWER,
                           MULTICA_TASK_ID=TASK, MULTICA_WORKSPACE_ID=WORKSPACE)
        result = self.cli('cleanup', '--apply', environment=environment)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('mat_test', result.stderr)
        environment.pop('MULTICA_AGENT_ID')
        environment.pop('MULTICA_TASK_ID')
        self.assertNotEqual(self.cli('cleanup', '--apply', environment=environment).returncode, 0)

    def test_dirty_manifest_and_symlink_path_are_refused(self):
        path = self.build()
        alias = self.root / 'alias'
        alias.symlink_to(path, target_is_directory=True)
        self.assertNotEqual(self.cli('register', '--issue', ISSUE, '--path', str(alias), '--kind', 'build').returncode, 0)
        manifest = json.loads((path / 'cli-manifest.json').read_text())
        manifest['metadata']['sourceDirty'] = True
        (path / 'cli-manifest.json').write_text(json.dumps(manifest))
        self.assertNotEqual(self.cli('register', '--issue', ISSUE, '--path', str(path), '--kind', 'build').returncode, 0)

    def test_protection_and_pending_handoff_prevent_retirement(self):
        artifact = self.register(self.build(), '--protect', 'current')['id']
        self.assertNotEqual(self.cli('retire', '--id', artifact, '--reason', 'old').returncode, 0)
        self.successful('protect', '--id', artifact, '--remove', 'current', '--add', 'unresolved')
        self.assertNotEqual(self.cli('retire', '--id', artifact, '--reason', 'old').returncode, 0)
        self.successful('protect', '--id', artifact, '--remove', 'unresolved')
        data = json.loads(self.catalog().read_text())
        data['records'][artifact]['pins']['pending'] = {'agent': REVIEWER}
        self.catalog().write_text(json.dumps(data))
        self.assertNotEqual(self.cli('retire', '--id', artifact, '--reason', 'old').returncode, 0)

    @unittest.skipUnless(sys.platform == 'linux', 'MAS cleanup uses Linux process/mount evidence')
    def test_dry_run_retention_apply_and_exact_retry(self):
        path = self.build()
        artifact = self.register(path)['id']
        self.successful('retire', '--id', artifact, '--reason', 'verified unused candidate')
        self.assertEqual(self.successful('cleanup')['items'][0]['reason'], 'not_released_or_retention')
        self.age(artifact)
        self.assertEqual(self.successful('cleanup')['items'][0]['status'], 'eligible')
        self.assertTrue(path.exists())
        self.assertEqual(self.successful('cleanup', '--apply')['items'][0]['status'], 'deleted')
        self.assertFalse(path.exists())
        self.assertEqual(self.successful('cleanup', '--apply')['items'][0]['status'], 'already_deleted')

    @unittest.skipUnless(sys.platform == 'linux', 'MAS cleanup uses Linux process/mount evidence')
    def test_active_consumer_shared_lock_survives_then_releases(self):
        path = self.build()
        artifact = self.register(path)['id']
        ready = self.root / 'ready'
        stop = self.root / 'stop'
        command = [sys.executable, '-c',
            'import pathlib,time;pathlib.Path(__import__("sys").argv[1]).touch();'
            '\nwhile not pathlib.Path(__import__("sys").argv[2]).exists(): time.sleep(.02)', str(ready), str(stop)]
        process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('artifacts.py')),
            '--owner', OWNER, '--workspace', WORKSPACE, '--state-root', str(self.state),
            '--workspaces-root', str(self.native), 'use', '--id', artifact, '--', *command],
            env=self.environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            for _ in range(100):
                if ready.exists():
                    break
                time.sleep(.02)
            self.assertTrue(ready.exists())
            self.successful('retire', '--id', artifact, '--reason', 'retired after earlier handoff')
            self.age(artifact)
            self.assertEqual(self.successful('cleanup', '--apply')['items'][0]['reason'], 'active_lease')
            self.assertTrue(path.exists())
            stop.touch()
            output, error = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0, error)
            self.assertEqual(self.successful('cleanup', '--apply')['items'][0]['status'], 'deleted')
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate()

    @unittest.skipUnless(sys.platform == 'linux', 'MAS cleanup uses Linux process/mount evidence')
    def test_process_outside_wrapper_with_artifact_cwd_is_protected(self):
        path = self.build()
        artifact = self.register(path)['id']
        self.successful('retire', '--id', artifact, '--reason', 'old')
        self.age(artifact)
        process = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(30)'], cwd=path)
        try:
            result = self.successful('cleanup', '--apply')['items'][0]
            self.assertEqual(result['status'], 'retained')
            self.assertEqual(result['reason'], 'Active artifact consumers')
            self.assertTrue(path.exists())
        finally:
            process.terminate()
            process.wait(timeout=5)

    @unittest.skipUnless(sys.platform == 'linux', 'MAS cleanup uses Linux process/mount evidence')
    def test_crash_after_removal_reconciles_persisted_intent(self):
        path = self.build()
        artifact = self.register(path)['id']
        self.successful('retire', '--id', artifact, '--reason', 'old')
        self.age(artifact)
        data = json.loads(self.catalog().read_text())
        data['records'][artifact]['deletion_started_at'] = time.time()
        self.catalog().write_text(json.dumps(data))
        import shutil
        shutil.rmtree(path)
        self.assertEqual(self.successful('cleanup', '--apply')['items'][0]['status'], 'already_removed_after_intent')
        self.assertEqual(self.successful('cleanup', '--apply')['items'][0]['status'], 'already_deleted')

    def test_native_registration_requires_both_owner_markers_and_legacy_reconciliation(self):
        root = self.native / ('lab-' + WORKSPACE[-12:]) / 'task'
        path = root / 'workdir/evidence'
        path.mkdir(parents=True)
        (path / 'report.txt').write_text('verified successful intermediate result')
        (root / '.managed_env.json').write_text(json.dumps({'managed_by': 'multica-daemon-managed-env', 'workspace_id': WORKSPACE, 'agent_id': OWNER, 'issue_id': ISSUE}))
        (root / '.task_owner').write_text(json.dumps({'workspace_id': WORKSPACE, 'task_id': TASK}))
        item = self.successful('register', '--issue', ISSUE, '--path', str(path), '--kind', 'evidence', '--sha', 'a' * 40)
        self.assertIn('legacy-unreconciled', item['protections'])
        self.assertNotEqual(self.cli('protect', '--id', item['id'], '--remove', 'legacy-unreconciled').returncode, 0)
        (root / '.task_owner').unlink()
        self.assertNotEqual(self.cli('register', '--issue', ISSUE, '--path', str(path), '--kind', 'evidence').returncode, 0)

    def repository(self):
        origin = self.root / 'origin.git'
        subprocess.run(['git', 'init', '--bare', str(origin)], check=True, capture_output=True)
        path = Path(self.successful('allocate', '--issue', ISSUE, '--name', 'source')['destination'])
        subprocess.run(['git', 'clone', str(origin), str(path)], check=True, capture_output=True)
        for key, value in [('user.email', 'test@example.invalid'), ('user.name', 'Test')]:
            subprocess.run(['git', '-C', str(path), 'config', key, value], check=True)
        (path / 'source').write_text('published source')
        (path / 'packages/example').mkdir(parents=True)
        (path / 'packages/example/source.ts').write_text('published nested source')
        (path / '.gitignore').write_text('node_modules/\nprivate-ignored*\n')
        subprocess.run(['git', '-C', str(path), 'add', 'source', '.gitignore', 'packages/example/source.ts'], check=True)
        subprocess.run(['git', '-C', str(path), 'commit', '-m', 'published'], check=True, capture_output=True)
        subprocess.run(['git', '-C', str(path), 'push', 'origin', 'HEAD'], check=True, capture_output=True)
        return path

    def test_dirty_and_unpublished_git_are_refused(self):
        path = self.repository()
        args = ('register', '--issue', ISSUE, '--path', str(path), '--kind', 'source')
        self.successful(*args)
        (path / 'source').write_text('unfinished user change')
        self.assertNotEqual(self.cli(*args).returncode, 0)
        subprocess.run(['git', '-C', str(path), 'commit', '-am', 'unpublished'], check=True, capture_output=True)
        self.assertNotEqual(self.cli(*args).returncode, 0)
        # Returning HEAD to its published value must not discard the private
        # commit still present in the checkout's reflog.
        subprocess.run(['git', '-C', str(path), 'reset', '--hard', 'HEAD~1'], check=True, capture_output=True)
        self.assertNotEqual(self.cli(*args).returncode, 0)

    def test_nested_dependencies_are_regenerable_but_unknown_ignored_files_are_protected(self):
        path = self.repository()
        dependency = path / 'packages/example/node_modules/library'
        dependency.mkdir(parents=True)
        (dependency / 'index.js').write_text('dependency')
        args = ('register', '--issue', ISSUE, '--path', str(path), '--kind', 'source')
        self.successful(*args)
        (path / 'private-ignored-data').write_text('retained private evidence')
        self.assertNotEqual(self.cli(*args).returncode, 0)

    def test_published_git_recovery_refs_are_protected(self):
        path = self.repository()
        args = ('register', '--issue', ISSUE, '--path', str(path), '--kind', 'source')
        artifact = self.successful(*args)['id']
        self.successful('retire', '--id', artifact, '--reason', 'completed source stage')
        self.age(artifact)
        subprocess.run(['git', '-C', str(path), 'update-ref', 'refs/cleanup/test/retained', 'HEAD'], check=True)
        result = self.cli(*args)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Git recovery history is protected', result.stderr)
        self.successful('cleanup', '--apply')
        self.assertTrue(path.exists())
        self.assertTrue(subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'refs/cleanup/test/retained'], text=True))

    @unittest.skipUnless(sys.platform == 'linux', 'MAS cleanup uses Linux process/mount evidence')
    def test_registered_worktree_removed_through_git_and_primary_survives(self):
        primary = self.repository()
        path = Path(self.successful('allocate', '--issue', ISSUE, '--name', 'review')['destination'])
        subprocess.run(['git', '-C', str(primary), 'worktree', 'add', '--detach', str(path), 'HEAD'], check=True, capture_output=True)
        artifact = self.successful('register', '--issue', ISSUE, '--path', str(path), '--kind', 'source')['id']
        self.successful('retire', '--id', artifact, '--reason', 'completed independent source inspection')
        self.age(artifact)
        self.assertEqual(self.successful('cleanup', '--apply')['items'][0]['status'], 'deleted')
        self.assertTrue(primary.exists())
        result = subprocess.run(['git', '-C', str(primary), 'worktree', 'list', '--porcelain'], capture_output=True, text=True, check=True)
        self.assertNotIn(str(path), result.stdout)

    def test_atomic_selection_preserves_final_and_find_requires_all_inputs(self):
        first = self.build('first')
        second = self.build('second')
        a = self.register(first, '--protect', 'final')['id']
        b = self.register(second)['id']
        self.successful('select', '--current', b, '--previous', a)
        data = json.loads(self.catalog().read_text())['records']
        self.assertEqual(set(data[a]['protections']), {'previous', 'final'})
        self.assertEqual(data[b]['protections'], ['current'])
        self.assertNotEqual(self.cli('protect', '--id', a, '--remove', 'final').returncode, 0)
        expected = self.root / 'expected.json'
        expected.write_text(json.dumps(json.loads((first / 'cli-manifest.json').read_text())['metadata']))
        self.assertEqual(len(self.successful('find', '--expected', str(expected))['matches']), 2)
        expected.write_text(json.dumps({'sourceCommit': 'a' * 40}))
        self.assertNotEqual(self.cli('find', '--expected', str(expected)).returncode, 0)

    @unittest.skipUnless(sys.platform == 'linux', 'Actual Linux mount inventory')
    def test_actual_mount_is_detected(self):
        import artifacts
        self.assertTrue(artifacts.mounted(Path('/proc')))

    def test_overlapping_paths_and_escaping_manifest_link_are_refused(self):
        path = self.build()
        self.register(path)
        child = path / 'reports'
        child.mkdir()
        self.assertNotEqual(self.cli('register', '--issue', ISSUE, '--path', str(child), '--kind', 'evidence', '--sha', 'a' * 40).returncode, 0)
        other = self.build('linked')
        entry = other / 'resources/loginom/bin/node'
        entry.unlink()
        entry.symlink_to(path / 'resources/loginom/bin/node')
        self.assertNotEqual(self.cli('register', '--issue', ISSUE, '--path', str(other), '--kind', 'build').returncode, 0)

    @unittest.skipUnless(sys.platform == 'linux', 'Migration checks Linux process evidence')
    def test_closed_native_build_migrates_whole_and_reuses_the_same_bytes(self):
        path = self.build()
        native = self.native / ('lab-' + WORKSPACE[-12:]) / 'task'
        destination = native / 'workdir/candidate'
        destination.parent.mkdir(parents=True)
        (native / '.managed_env.json').write_text(json.dumps({'managed_by': 'multica-daemon-managed-env',
            'workspace_id': WORKSPACE, 'agent_id': OWNER, 'issue_id': ISSUE}))
        (native / '.task_owner').write_text(json.dumps({'workspace_id': WORKSPACE, 'task_id': TASK}))
        os.rename(path, destination)
        item = self.register(destination, '--protect', 'current')
        proof = {k: item[k] for k in ('owner', 'workspace', 'issue', 'path')}
        proof.update(all_consumers_released=True, unresolved=False, evidence=['own resources closed'])
        file = self.root / 'proof.json'
        file.write_text(json.dumps(proof))
        self.successful('protect', '--id', item['id'], '--remove', 'legacy-unreconciled', '--confirmation', str(file))
        result = self.successful('migrate', '--id', item['id'])
        self.assertFalse(destination.exists())
        self.assertTrue(Path(result['path']).is_dir())
        self.assertEqual(self.successful('use', '--id', item['id'])['build'], item['build'])
        self.assertTrue(self.successful('migrate', '--id', item['id'])['already_persistent'])
        self.assertEqual(json.loads(self.catalog().read_text())['records'][item['id']]['protections'], ['current'])


if __name__ == '__main__':
    unittest.main()
