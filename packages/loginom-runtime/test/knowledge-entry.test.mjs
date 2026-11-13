import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP_URI } from '../client/lib/knowledge-client.mjs';
import { helpFixture } from '../client/test/support/help-fixture.mjs';

function entry(t, held) {
  const child = fork(fileURLToPath(new URL('../src/knowledge-entry.mjs', import.meta.url)), [], {
    execPath: process.execPath,
    execArgv: ['--experimental-test-module-mocks', '--import', new URL('./support/knowledge-no-browser.mjs', import.meta.url).href],
    env: { ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}),
      ...(held ? { LOGINOM_TEST_HELD_HELP_MANIFEST: held.manifest } : {}) },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const requests = new Map();
  const exited = once(child, 'exit');
  child.on('message', message => {
    const request = requests.get(message.id);
    if (!request) return;
    requests.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(Error(message.error));
    else request.resolve(message.result);
  });
  child.on('disconnect', () => {
    for (const request of requests.values()) {
      clearTimeout(request.timer); request.reject(Error('ENTRY_DISCONNECTED'));
    }
    requests.clear();
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    if (child.connected) child.send({ id: randomUUID(), operation: 'close' });
    await exited; clearTimeout(timer);
  });
  return {
    child, exited,
    request(operation, input, timeout = 2000) {
      if (!child.connected) return Promise.reject(Error('ENTRY_DISCONNECTED'));
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { requests.delete(id); reject(Error('ENTRY_TIMEOUT')); }, timeout);
        requests.set(id, { resolve, reject, timer });
        child.send({ id, operation, input });
      });
    },
  };
}

test('private entry serves shipped Help through the read-only catalog', async t => {
  const runtime = entry(t);
  assert.deepEqual(await runtime.request('start', { protocol: 1, generation: 8, helpRoot: await helpFixture(t) }),
    { protocol: 1, generation: 8, started: true });
  const catalog = await runtime.request('list');
  assert.deepEqual(catalog.tools.map(tool => tool.name).sort(), ['find', 'glob', 'grep', 'list', 'read', 'search', 'tree']);
  assert.match(catalog.catalogSha256, /^[a-f0-9]{64}$/);
  const input = { run: 'chat-A-run-1', id: 'read-1', name: 'read', arguments: { uris: `${HELP_URI}/data/processors/integration/rest-request.html` } };
  const result = await runtime.request('call', input);
  assert.match(result.content[0].text, /# REST-запрос/);
  for (const name of ['write', 'dock_prepare', 'browser_navigate'])
    await assert.rejects(runtime.request('call', { ...input, name }), /LOGINOM_KNOWLEDGE_TOOL_DENIED/);
  assert.deepEqual(await runtime.request('close'), { closed: true });
  assert.deepEqual(await runtime.exited, [0, null]);
});

test('malformed call and interrupt requests fail locally with a stable private error', async t => {
  const runtime = entry(t);
  await runtime.request('start', { protocol: 1, generation: 2, helpRoot: await helpFixture(t) });
  await runtime.request('list');
  for (const input of [undefined, null, {}, { run: '', id: 'id', name: 'read' }]) {
    await assert.rejects(runtime.request('call', input), /LOGINOM_KNOWLEDGE_REQUEST_INVALID/);
    await assert.rejects(runtime.request('interrupt', input), /LOGINOM_KNOWLEDGE_REQUEST_INVALID/);
  }
  for (const input of [{ all: 'true' }, { all: true, run: 'A' }])
    await assert.rejects(runtime.request('interrupt', input), /LOGINOM_KNOWLEDGE_REQUEST_INVALID/);
  assert.deepEqual(await runtime.request('interrupt', { all: true }), { interrupted: true });
});

test('startup accepts only an absolute Help directory and no credentials', async t => {
  const runtime = entry(t);
  const valid = { protocol: 1, generation: 3, helpRoot: await helpFixture(t) };
  for (const input of [
    { ...valid, password: 'PRIVATE-NONSECRET-PASSWORD' }, { ...valid, apiKey: 'UNIT-NONSECRET' },
    { ...valid, endpoint: 'https://mcp.loginom.ai/mcp' }, { ...valid, protocol: 2 }, { ...valid, generation: 0 },
    { ...valid, helpRoot: 'relative/help' }, { protocol: 1, generation: 3 },
  ]) await assert.rejects(runtime.request('start', input), /LOGINOM_START_INVALID/);
  await runtime.request('start', valid);
  await runtime.request('list');
  await assert.rejects(runtime.request('start', valid), /LOGINOM_ALREADY_STARTED/);
});

test('missing or changed Help fails the catalog with a private code and startup evidence', async t => {
  const runtime = entry(t);
  await runtime.request('start', { protocol: 1, generation: 4, helpRoot: await helpFixture(t, { tamper: 'data/README.md' }) });
  await assert.rejects(runtime.request('list'), /LOGINOM_KNOWLEDGE_UNAVAILABLE/);
  await assert.rejects(runtime.request('call', { run: 'A', id: '1', name: 'read', arguments: { uris: 'README.md' } }),
    /LOGINOM_KNOWLEDGE_UNAVAILABLE/);
  assert.deepEqual(await runtime.request('close'), { closed: true });
  assert.deepEqual(await runtime.exited, [0, null]);
});

// Hold the actual manifest read at the filesystem boundary. POSIX FIFOs are
// not readable as pipes by native Windows Node.
async function heldHelp(t) {
  const helpRoot = await helpFixture(t);
  const manifest = join(helpRoot, 'help-manifest.json');
  return { helpRoot, manifest, release: child => new Promise((resolve, reject) =>
    child.send({ fixture_release_help: true }, error => error ? reject(error) : resolve())) };
}

test('interrupting a call waiting for startup leaves other runs and initialization intact', async t => {
  const held = await heldHelp(t);
  const runtime = entry(t, held);
  await runtime.request('start', { protocol: 1, generation: 22, helpRoot: held.helpRoot });
  const first = runtime.request('call', { run: 'A', id: 'queued', name: 'read', arguments: { uris: 'README.md' } });
  const other = runtime.request('call', { run: 'B', id: 'queued', name: 'read', arguments: { uris: 'processors/integration/rest-request.md' } });
  [first, other].forEach(call => call.catch(() => {}));
  await assert.rejects(runtime.request('call', { run: 'B', id: 'queued', name: 'read', arguments: { uris: 'README.md' } }),
    /LOGINOM_KNOWLEDGE_REQUEST_BUSY/);
  assert.deepEqual(await runtime.request('interrupt', { run: 'A' }), { interrupted: true });
  await assert.rejects(first, /LOGINOM_KNOWLEDGE_INTERRUPTED/);
  await held.release(runtime.child);
  assert.match((await other).content[0].text, /# REST-запрос/);
});

test('private owner shutdown can interrupt every run without closing the knowledge client', async t => {
  const held = await heldHelp(t);
  const runtime = entry(t, held);
  await runtime.request('start', { protocol: 1, generation: 21, helpRoot: held.helpRoot });
  const calls = ['A', 'B'].map(run => runtime.request('call', { run, id: 'pending', name: 'read', arguments: { uris: 'README.md' } }));
  calls.forEach(call => call.catch(() => {}));
  assert.deepEqual(await runtime.request('interrupt', { all: true }), { interrupted: true });
  for (const call of calls) await assert.rejects(call, /LOGINOM_KNOWLEDGE_INTERRUPTED/);
  await held.release(runtime.child);
  assert.match((await runtime.request('call', { run: 'next', id: 'after', name: 'read', arguments: { uris: 'README.md' } })).content[0].text,
    /# Loginom — руководство пользователя/);
});
