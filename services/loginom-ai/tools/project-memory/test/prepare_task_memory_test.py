"""Offline real-Git/TOML checks; uses an assembled runtime, no app task or network."""
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE_ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('prepare_memory', SOURCE_ROOT / 'tools/project-memory/prepare_task_memory.py')
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
        self.branch = 'codex/node-21-fixture'
        self.git('worktree', 'add', '-qb', self.branch, str(self.cwd), self.sha)
        runtime = self.root / '.dock/shared-project-memory/runtime/20260913.5'
        shutil.copytree(SOURCE_ROOT / '.dock/shared-project-memory/runtime/20260913.5', runtime)
        old = SOURCE_ROOT / '.dock/shared-project-memory/rollout-20260913.5'
        rollout = self.root / '.dock/shared-project-memory/rollout-20260913.5'
        rollout.mkdir()
        manifest = json.loads((old / 'manifest.json').read_text())
        state = self.home / '.openviking/project-states/loginom-dock'
        state.mkdir(parents=True, mode=0o700)
        manifest['new_task_route'].update(projectRoot=str(self.root), stateDir=str(state))
        (rollout / 'manifest.json').write_text(json.dumps(manifest))
        hooks = (old / 'hooks.json.pending').read_bytes()
        (rollout / 'hooks.json.pending').write_bytes(hooks)
        (self.root / '.codex').mkdir()
        (self.root / '.codex/hooks.json').write_bytes(hooks)
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


if __name__ == '__main__': unittest.main()
