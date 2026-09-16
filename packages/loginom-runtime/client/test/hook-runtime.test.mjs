import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { installBundle } from '../lib/install.mjs';
import { pinnedHook } from '../lib/hook-runtime.mjs';
import { openArchive } from '../lib/archive.mjs';
import { readRuntimePointer } from '../lib/platform.mjs';

test('an activated conversation keeps its hook runtime across updates; new prepare chooses its own runtime and tampering fails closed', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'dock-hook-runtime-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const stateDir = join(temp, 'home');
  async function bundle(version) {
    const root = join(temp, version); await mkdir(root);
    const bytes = Buffer.from(version);
    await writeFile(join(root, 'payload'), bytes);
    await writeFile(join(root, 'release.json'), JSON.stringify({ version, adapterRevision: version,
      platform: `${process.platform}-${process.arch}`, node: process.versions.node,
      files: [{ path: 'payload', sha256: createHash('sha256').update(bytes).digest('hex') }] }));
    return installBundle(root, stateDir);
  }
  const old = await bundle('0.1.0'), latest = await bundle('0.2.0');
  const config = { stateDir, agent: 'codex', adapterRevision: '0.2.0', apiKey: 'test-key' };
  const sessionId = randomUUID(), skillRevision = 'a'.repeat(64);
  const metadata = { agent: 'codex', sessionId, skillRevision, runtimeRelease: old.manifest.id,
    adapterRevision: '0.1.0', node: process.versions.node };
  const queue = await openArchive(config);
  queue.activate({ agent: 'codex', conversation: 'conversation', turn: 'turn', metadata });
  queue.close();
  const input = { session_id: 'conversation', hook_event_name: 'Stop' };
  const selected = await pinnedHook(config, input, latest.destination);
  assert.equal(selected.root, old.destination);
  assert.equal(selected.adapterRevision, '0.1.0');
  assert.equal(await readRuntimePointer(stateDir), join('releases', latest.manifest.id));
  assert.equal(await pinnedHook(config, input, old.destination), null);
  assert.equal(await pinnedHook(config, { session_id: 'unrelated' }, latest.destination), null);

  const directory = join(stateDir, 'sessions', sessionId); await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'session.json'), JSON.stringify(metadata), { mode: 0o600 });
  const prepared = { session_id: 'new-conversation', tool_name: 'mcp__loginom_dock__dock_prepare',
    tool_response: { prepared: true, sessionId, skillRevision } };
  assert.equal((await pinnedHook(config, prepared, latest.destination)).root, old.destination);
  await writeFile(join(old.destination, 'payload'), 'corrupted');
  await assert.rejects(pinnedHook(config, input, latest.destination), /checksum/);
  await rm(old.destination, { recursive: true });
  await symlink(latest.destination, old.destination);
  await assert.rejects(pinnedHook(config, input, latest.destination), /Unsafe/);
});
