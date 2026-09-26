import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../review_hooks.mjs', import.meta.url));

// This transport fixture exercises the review CLI without writing actual Codex trust.
function fixture(t, pluginId) {
  const root = mkdtempSync(join(tmpdir(), 'memory-hook-review-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'node-js');
  mkdirSync(workspace);
  const events = { SessionStart: 'sessionStart', UserPromptSubmit: 'userPromptSubmit',
    Stop: 'stop', PreCompact: 'preCompact', SessionEnd: 'sessionEnd' };
  const canonical = join(root, 'hooks.json');
  const hooks = Object.fromEntries(Object.keys(events).map(event => [event,
    [{ hooks: [{ type: 'command', command: `fixture ${event}`, timeout: 30 }] }]]));
  for (const name of ['hooks.json', 'hooks.json.pending'])
    writeFileSync(join(root, name), JSON.stringify({ hooks }));
  const manifest = join(root, 'manifest.json');
  writeFileSync(manifest, JSON.stringify({ generation: 'test', deployment: { projectRoot: root, generation: 'test' },
    expected_hook_count: 5, canonical_hooks_path: canonical, tasks: [{ cwd: workspace }] }));
  const inventory = Object.entries(events).map(([event, eventName]) => ({ eventName, source: 'project',
    sourcePath: canonical, isManaged: false, enabled: true, handlerType: 'command', async: false,
    command: `fixture ${event}`, timeoutSec: 30, currentHash: `sha256:${'a'.repeat(64)}`, key: event }));
  if (pluginId) inventory.push({ pluginId, eventName: 'stop', enabled: true });
  const data = join(root, 'inventory.json');
  writeFileSync(data, JSON.stringify(inventory));
  const executable = join(root, 'codex-fixture');
  writeFileSync(executable, `#!${process.execPath}
const fs = require('node:fs');
let trusted = false;
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  let result = {};
  if (m.method === 'config/batchWrite') trusted = true;
  if (m.method === 'hooks/list') result = {data:m.params.cwds.map(cwd => ({cwd, errors:[], warnings:[],
    hooks: JSON.parse(fs.readFileSync(${JSON.stringify(data)}, 'utf8')).map(h => ({...h, trustStatus:trusted?'trusted':'untrusted'}))}))};
  process.stdout.write(JSON.stringify({id:m.id,result})+'\\n');
});
`, { mode: 0o700 });
  return { root, manifest, executable, data };
}

test('requires an explicit installed Codex executable instead of a macOS path', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Pass --codex/);
});

test('either original marketplace still present in a worktree blocks bootstrap review', t => {
  for (const pluginId of ['openviking-memory@openviking', 'openviking-memory@loginom-dock']) {
    const f = fixture(t, pluginId);
    const output = join(f.root, 'receipt.json');
    const result = spawnSync(process.execPath, [script, '--codex', f.executable, '--manifest', f.manifest,
      '--trust', '--output', output], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Original memory plugin hooks remain/);
    assert.throws(() => readFileSync(output), { code: 'ENOENT' });
  }
});

test('verified inventories produce a receipt identifying the explicit executable', t => {
  const f = fixture(t);
  const output = join(f.root, 'receipt.json');
  const result = spawnSync(process.execPath, [script, '--codex', f.executable, '--manifest', f.manifest,
    '--trust', '--output', output], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(receipt.codexExecutable, f.executable);
  assert.equal(receipt.trusted_hooks, 5);
  assert.equal(receipt.workspaces.length, 2);
  for (const workspace of receipt.workspaces) assert.deepEqual(workspace.originalMemoryHooks, []);
});

test('changed hook commands fail before trust or receipt creation', t => {
  const f = fixture(t);
  const inventory = JSON.parse(readFileSync(f.data, 'utf8'));
  inventory[0].command = 'unexpected command';
  writeFileSync(f.data, JSON.stringify(inventory));
  const result = spawnSync(process.execPath, [script, '--codex', f.executable, '--manifest', f.manifest,
    '--trust'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /does not match its approved hook/);
  assert.throws(() => readFileSync(join(f.root, 'hooks-trust-verified.json')), { code: 'ENOENT' });
});
