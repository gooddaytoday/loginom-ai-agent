import test from 'node:test';
import assert from 'node:assert/strict';
import { registerNative, restoreNative, unregisterNative, validateNativeInstall, nativeCommand } from '../lib/native.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('an unset Hermes config key is recoverable; other CLI failures still abort installation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-native-command-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'hermes'), '#!/bin/sh\nprintf "Config key not set: %s\\n" "$3" >&2\nexit 1\n', { mode: 0o700 });
  const env = { ...process.env, PATH: directory + ':' + process.env.PATH };
  const args = ['config', 'get', 'mcp_servers.loginom-dock', '--json'];
  assert.match(nativeCommand('hermes', args, env, { capture: true, allowMissing: true }), /not set/);
  assert.throws(() => nativeCommand('hermes', args, env, { capture: true }), /failed/);
  await writeFile(join(directory, 'hermes'), '#!/bin/sh\necho "Database failed"\nexit 1\n', { mode: 0o700 });
  assert.throws(() => nativeCommand('hermes', args, env, { capture: true, allowMissing: true }), /failed/);
});

test('failed Codex source update restores the former source and keeps unrelated plugin registrations', async () => {
  let root = '/releases/old', installed = true, fail = true;
  const unrelated = { pluginId: 'other@other', marketplaceName: 'other' };
  const run = (command, args) => {
    assert.equal(command, 'codex');
    if (args.join(' ') === 'plugin marketplace list --json') return JSON.stringify({ marketplaces: root ? [{ name: 'loginom-dock', root, marketplaceSource: { sourceType: 'local', source: root } }] : [] });
    if (args.join(' ') === 'plugin list --json') return JSON.stringify({ installed: [unrelated, ...(installed ? [{ pluginId: 'loginom-dock@loginom-dock', marketplaceName: 'loginom-dock' }] : [])] });
    if (args[1] === 'marketplace' && args[2] === 'remove') { assert.equal(args[3], 'loginom-dock'); root = null; }
    else if (args[1] === 'marketplace' && args[2] === 'add') root = args[3];
    else if (args[1] === 'add') { if (fail) { fail = false; throw new Error('Interrupted installation'); } installed = true; }
    else if (args[1] === 'remove') { assert.equal(args[2], 'loginom-dock@loginom-dock'); installed = false; }
    else throw new Error('Unexpected mutation');
    return '';
  };
  const before = { marketplace: { root, marketplaceSource: { sourceType: 'local', source: root } }, installed: true };
  await assert.rejects(registerNative({ agent: 'codex', destination: '/releases/new', manifest: {}, before, env: {}, run }), /Interrupted/);
  assert.equal(root, '/releases/new');
  await restoreNative({ agent: 'codex', before, env: {}, run });
  assert.equal(root, '/releases/old'); assert.equal(installed, true);
  await unregisterNative({ agent: 'codex', env: {}, run });
  assert.equal(installed, false); assert.equal(root, null);
  assert.deepEqual(unrelated, { pluginId: 'other@other', marketplaceName: 'other' });
});

test('Hermes refuses unrecoverable source revisions and verifies its exact MCP setting after native installation', async () => {
  const manifest = { sourceCommit: 'a'.repeat(40), sourceDirty: false, adapterRevision: '0.1.0' };
  assert.throws(() => validateNativeInstall('hermes', { ...manifest, sourceDirty: true }, {}), /clean/);
  assert.throws(() => validateNativeInstall('hermes', manifest, { package: { pinned: false } }), /recovery/);
  const calls = [];
  const run = (command, args) => { calls.push([command, args]); return args[1] === 'get' ? '{}' : ''; };
  await assert.rejects(registerNative({ agent: 'hermes', root: '/dock', manifest, env: {}, before: {}, run }), /not saved/);
  assert.equal(calls[0][1].includes('--force'), true);
  assert.equal(calls[0][1].includes('--enable'), true);
  assert.deepEqual(calls[1][1].slice(0, 3), ['config', 'set', 'mcp_servers.loginom-dock']);
  assert.deepEqual(JSON.parse(calls[1][1][3]).args, ['mcp', 'hermes', '0.1.0']);
});
