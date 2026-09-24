"""Offline real-Git/TOML checks; uses an assembled runtime, no app task or network."""
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

DEFINITION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEFINITION))
from project_context import GENERATION, deployment, locations, project_root
from prepare_project_memory import prepare as prepare_project
SOURCE_ROOT = project_root()
SPEC = importlib.util.spec_from_file_location('prepare_memory', DEFINITION / 'prepare_task_memory.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PreparationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='memory-git-preparation-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / 'project'
        self.home = self.base / 'home'
        self.root.mkdir()
        self.home.mkdir()
        self.addCleanup(patch.stopall)
        patch.object(MODULE, 'ROOT', self.root).start()
        patch.object(MODULE.Path, 'home', return_value=self.home).start()
        self.git('init', '-q')
        (self.root / 'fixture.txt').write_text('fixture')
        self.git('add', 'fixture.txt')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@local', '-c', 'commit.gpgsign=false',
                 '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture')
        self.sha = self.git('rev-parse', 'HEAD').strip()
        self.cwd = self.root / '.worktrees/node-21-fixture'
        self.cwd.parent.mkdir()
        self.branch = 'node-21-fixture'
        self.git('worktree', 'add', '-qb', self.branch, str(self.cwd), self.sha)
        runtime, rollout = locations(self.root)
        source_runtime = Path(os.environ.get('PROJECT_MEMORY_TEST_RUNTIME', str(locations(SOURCE_ROOT)[0])))
        shutil.copytree(source_runtime, runtime)
        (runtime / 'deployment.json').write_text(json.dumps(deployment(self.root)))
        self.plugin = self.base / 'plugin'
        for folder in ('.codex-plugin', 'hooks', 'scripts'):
            (self.plugin / folder).mkdir(parents=True)
        (self.plugin / '.codex-plugin/plugin.json').write_text('{"version":"0.8.1"}')
        (self.plugin / 'hooks/hooks.json').write_text('{}')
        for name in ('session-start-commit', 'auto-recall', 'auto-capture', 'pre-compact-capture', 'session-end', 'config'):
            (self.plugin / 'scripts' / (name + '.mjs')).write_text('// fixture\n')
        self.node = Path(shutil.which('node')).resolve()
        prepare_project(self.root, self.node, self.plugin, install=True)
        self.rollout = rollout
        (self.home / '.openviking/project-memory-routing.json').write_text('{"projects":[]}')
        (self.cwd / '.codex').mkdir()
        self.config = self.cwd / '.codex/config.toml'
        self.original = b'[mcp_servers.loginom-dock]\ncommand="fixture-node"\nargs=["source.mjs"]\n[plugins."loginom-dock@loginom-dock"]\nenabled=false\n'
        self.config.write_bytes(self.original)

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], text=True, stderr=subprocess.DEVNULL)

    def test_preview_install_idempotency_and_preserved_dock_config(self):
        preview = MODULE.prepare(self.cwd, self.branch, self.sha)
        self.assertEqual(preview['status'], 'preview')
        self.assertEqual(self.config.read_bytes(), self.original)
        first = MODULE.prepare(self.cwd, self.branch, self.sha, True)
        self.assertEqual(first['status'], 'prepared')
        self.assertTrue(self.config.read_bytes().startswith(self.original))
        parsed = MODULE.tomllib.loads(self.config.read_text())
        self.assertFalse(parsed['plugins']['openviking-memory@openviking']['enabled'])
        self.assertEqual(parsed['mcp_servers']['loginom-dock']['command'], 'fixture-node')
        second = MODULE.prepare(self.cwd, self.branch, self.sha, True)
        self.assertEqual(second['status'], 'already-prepared')
        self.assertEqual(first['registrationId'], second['registrationId'])
        self.assertEqual(self.config.stat().st_mode & 0o777, 0o600)

    def test_wrong_base_existing_memory_and_changed_config_are_not_overwritten(self):
        with self.assertRaises(ValueError): MODULE.prepare(self.cwd, self.branch, '0' * 40, True)
        self.config.write_bytes(self.original + b'\n[mcp_servers.openviking]\nenabled=true\n')
        with self.assertRaises(ValueError): MODULE.prepare(self.cwd, self.branch, self.sha, True)
        self.config.write_bytes(self.original)
        MODULE.prepare(self.cwd, self.branch, self.sha, True)
        self.config.write_text('changed')
        with self.assertRaises(ValueError): MODULE.prepare(self.cwd, self.branch, self.sha, True)
        self.assertEqual(self.config.read_text(), 'changed')

    def test_existing_legacy_workspace_is_rejected(self):
        (self.home / '.openviking/project-memory-routing.json').write_text(json.dumps({'projects':[{'workspaces':[str(self.cwd)]}]}))
        with self.assertRaises(ValueError): MODULE.prepare(self.cwd, self.branch, self.sha, True)
        self.assertEqual(self.config.read_bytes(), self.original)

    def test_main_and_external_worktrees_are_never_registered(self):
        with self.assertRaises(ValueError): MODULE.prepare(self.root, 'master', self.sha, True)
        outside = self.base / 'external-worktree'
        self.git('worktree', 'add', '-qb', 'external', str(outside), self.sha)
        with self.assertRaises(ValueError): MODULE.prepare(outside, 'external', self.sha, True)
        self.assertFalse((outside / '.codex/config.toml').exists())

    def test_preview_does_not_write_registration_and_missing_legacy_registry_is_ok(self):
        (self.home / '.openviking/project-memory-routing.json').unlink()
        before = sorted(self.home.rglob('*'))
        MODULE.prepare(self.cwd, self.branch, self.sha)
        self.assertEqual(before, sorted(self.home.rglob('*')))

    def test_new_project_hooks_do_not_require_or_change_legacy_rollout(self):
        hooks = json.loads((self.root / '.codex/hooks.json').read_text())
        self.assertEqual(len(hooks['hooks']), 5)
        for groups in hooks['hooks'].values():
            self.assertEqual(len(groups), 1)
            self.assertTrue(groups[0]['hooks'][0]['command'].endswith('--enrollments-only'))
        self.assertFalse((self.root / '.codex/config.toml').exists())
        legacy = self.home / '.openviking/project-memory-routing.json'
        before = legacy.read_bytes()
        prepare_project(self.root, self.node, self.plugin, install=True)
        self.assertEqual(legacy.read_bytes(), before)

    def test_unrelated_existing_hooks_are_not_overwritten(self):
        path = self.root / '.codex/hooks.json'
        path.write_text('{"other":"hooks"}')
        with self.assertRaises(ValueError): prepare_project(self.root, self.node, self.plugin, install=True)
        self.assertEqual(path.read_text(), '{"other":"hooks"}')


if __name__ == '__main__': unittest.main()
