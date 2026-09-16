import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installation } from '../../landing/instructions.mjs';

const release = JSON.parse(await readFile(new URL('../../landing/release.json', import.meta.url)));
release.downloadBase = `${release.repository}/releases/download/${encodeURIComponent(release.tag)}`;

test('landing selection keeps the downloaded archive, extraction and checksum in sync', () => {
  for (const platform of Object.keys(release.platforms)) {
    const codex = installation(release, 'codex', platform);
    const hermes = installation(release, 'hermes', platform);
    for (const [agent, info] of [['codex', codex], ['hermes', hermes]]) {
      const download = new URL(info.url);
      assert.equal(download.origin, new URL(release.repository).origin);
      assert.equal(download.pathname.split('/').at(-1), info.filename);
      if (platform === 'win32-x64') {
        assert.match(info.install, /Expand-Archive/);
        assert.match(info.checksum, /Get-FileHash/);
      } else {
        assert.equal(info.install.split('\n')[0].slice('tar -xzf '.length), info.filename);
        assert.equal(info.checksum.split(' ').at(-1), info.filename);
      }
      assert.equal(info.sha256, release.platforms[platform].sha256);
      assert.ok(info.filename.includes(platform));
      for (const action of ['install', 'update', 'rollback', 'uninstall']) {
        assert.match(info[action], new RegExp(`--agent ${agent}(?: |$)`));
      }
    }
    assert.equal(codex.url, hermes.url, 'both agents use the shared platform bundle');
    assert.equal(codex.sha256, hermes.sha256);
    assert.notEqual(codex.install, hermes.install, 'agent registration must change');
  }
  assert.notEqual(installation(release, 'codex', 'darwin-arm64').url, installation(release, 'codex', 'linux-x64').url);
});

test('landing does not silently offer an unrelated platform or agent', () => {
  assert.throws(() => installation(release, 'codex', 'linux-arm64'));
  assert.throws(() => installation(release, 'unknown', 'darwin-arm64'));
});

test('Windows instructions keep zip, PowerShell and selected agent in one flow', () => {
  const info = installation(release, 'hermes', 'win32-x64');
  assert.match(info.filename, /win32-x64\.zip$/);
  assert.match(info.install, /install\.ps1 --agent hermes/);
  assert.doesNotMatch(info.update, /--config-from/, "the selected agent keeps its own existing profile");
  assert.match(info.rollback, /--agent hermes --rollback/);
});
