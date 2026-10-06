import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { knowledgeServer } from '../client/test/support/knowledge-server.mjs';

function entry(t) {
  const child = fork(fileURLToPath(new URL('../src/knowledge-entry.mjs', import.meta.url)), [], {
    execPath: process.execPath,
    execArgv: ['--import', fileURLToPath(new URL('./support/knowledge-no-browser.mjs', import.meta.url))],
    env: {}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
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

test('start acknowledges locally while Help initialization is blocked, and close cancels startup', async t => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  t.after(() => release.resolve());
  const server = await knowledgeServer(t, { initialize: () => {
    entered.resolve(); return release.promise;
  } });
  const runtime = entry(t);
  assert.deepEqual(await runtime.request('start', {
    protocol: 1, generation: 17, endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET',
  }), { protocol: 1, generation: 17, started: true });
  await entered.promise;
  const listing = runtime.request('list');
  listing.catch(() => {});
  assert.deepEqual(await runtime.request('close'), { closed: true });
  await assert.rejects(listing, /LOGINOM_KNOWLEDGE_CLOSED/);
  assert.deepEqual(await runtime.exited, [0, null]);
});

test('private entry returns real Help schemas and calls only the read-only catalog', async t => {
  const server = await knowledgeServer(t);
  const runtime = entry(t);
  await runtime.request('start', { protocol: 1, generation: 8, endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  const catalog = await runtime.request('list');
  assert.deepEqual(catalog.tools.map(tool => tool.name).sort(), ['find', 'glob', 'grep', 'list', 'read', 'search', 'tree']);
  assert.deepEqual(catalog.tools.find(tool => tool.name === 'read').inputSchema,
    server.tools.find(tool => tool.name === 'read').inputSchema);
  assert.match(catalog.catalogSha256, /^[a-f0-9]{64}$/);
  const input = { run: 'chat-A-run-1', id: 'read-1', name: 'read', arguments: { uri: 'Help/nodes.md' } };
  const result = await runtime.request('call', input);
  assert.deepEqual(JSON.parse(result.content[0].text), { name: 'read', arguments: input.arguments });
  for (const name of ['write', 'dock_prepare', 'browser_navigate'])
    await assert.rejects(runtime.request('call', { ...input, name }), /LOGINOM_KNOWLEDGE_TOOL_DENIED/);
  assert.equal(server.calls.length, 1);
  assert.deepEqual(await runtime.request('close'), { closed: true });
  assert.deepEqual(await runtime.exited, [0, null]);
});

test('concurrent Help calls are cancelled by request or run without disturbing another owner', async t => {
  const entered = Promise.withResolvers();
  const gates = new Map(['A1', 'A2', 'B1'].map(id => [id, Promise.withResolvers()]));
  t.after(() => { for (const gate of gates.values()) gate.resolve({ content: [] }); });
  const server = await knowledgeServer(t, { call: params => {
    if (server.calls.length === 3) entered.resolve();
    return gates.get(params.arguments.uri).promise;
  } });
  const runtime = entry(t);
  await runtime.request('start', { protocol: 1, generation: 9, endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  await runtime.request('list');
  const input = id => ({ run: id.startsWith('A') ? 'run-A' : 'run-B', id, name: 'read', arguments: { uri: id } });
  const first = runtime.request('call', input('A1'));
  const second = runtime.request('call', input('A2'));
  const other = runtime.request('call', input('B1'));
  [first, second, other].forEach(promise => promise.catch(() => {}));
  await entered.promise;
  await assert.rejects(runtime.request('call', input('A1')), /LOGINOM_KNOWLEDGE_REQUEST_BUSY/);
  assert.deepEqual(await runtime.request('interrupt', { run: 'run-A', id: 'A1' }), { interrupted: true });
  await assert.rejects(first, /LOGINOM_KNOWLEDGE_INTERRUPTED/);
  gates.get('A2').resolve({ content: [{ type: 'text', text: 'A2 survived' }] });
  assert.equal((await second).content[0].text, 'A2 survived');
  assert.deepEqual(await runtime.request('interrupt', { run: 'run-B' }), { interrupted: true });
  await assert.rejects(other, /LOGINOM_KNOWLEDGE_INTERRUPTED/);
  assert.equal(server.calls.length, 3);
  assert.deepEqual(await runtime.request('close'), { closed: true });
  assert.deepEqual(await runtime.exited, [0, null]);
});

test('malformed call and interrupt requests fail locally with a stable private error', async t => {
  const server = await knowledgeServer(t);
  const runtime = entry(t);
  await runtime.request('start', { protocol: 1, generation: 2, endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  await runtime.request('list');
  for (const input of [undefined, null, {}, { run: '', id: 'id', name: 'read' }]) {
    await assert.rejects(runtime.request('call', input), /LOGINOM_KNOWLEDGE_REQUEST_INVALID/);
    await assert.rejects(runtime.request('interrupt', input), /LOGINOM_KNOWLEDGE_REQUEST_INVALID/);
  }
  assert.equal(server.calls.length, 0);
});

test('startup rejects password-bearing payloads and malformed endpoints before network access', async t => {
  const server = await knowledgeServer(t);
  const runtime = entry(t);
  const valid = { protocol: 1, generation: 3, endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' };
  for (const input of [
    { ...valid, password: 'PRIVATE-NONSECRET-PASSWORD' }, { ...valid, connection: { password: 'PRIVATE-NONSECRET-PASSWORD' } },
    { ...valid, protocol: 2 }, { ...valid, generation: 0 },
    { ...valid, endpoint: 'file:///tmp/private' }, { ...valid, endpoint: 'invalid' },
    { ...valid, endpoint: 'http://user:secret@127.0.0.1/mcp' },
  ]) await assert.rejects(runtime.request('start', input), /LOGINOM_START_INVALID/);
  assert.equal(server.requests.length, 0);
  await runtime.request('start', valid);
  await runtime.request('list');
  await assert.rejects(runtime.request('start', valid), /LOGINOM_ALREADY_STARTED/);
});

test('close drains a blocked catalog read with the local cancellation code', async t => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  t.after(() => release.resolve({ tools: server.tools }));
  const server = await knowledgeServer(t, { list: () => { entered.resolve(); return release.promise; } });
  const runtime = entry(t);
  await runtime.request('start', { protocol: 1, generation: 4, endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  await entered.promise;
  const listing = runtime.request('list');
  listing.catch(() => {});
  assert.deepEqual(await runtime.request('close'), { closed: true });
  await assert.rejects(listing, /LOGINOM_KNOWLEDGE_CLOSED/);
  assert.deepEqual(await runtime.exited, [0, null]);
});

for (const mode of ['close', 'owner-disconnect']) test(`${mode} cancels active Help and exits without a signal`, async t => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  t.after(() => release.resolve({ content: [] }));
  const server = await knowledgeServer(t, { call: () => { entered.resolve(); return release.promise; } });
  const runtime = entry(t);
  await runtime.request('start', { protocol: 1, generation: 5, endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  const call = runtime.request('call', { run: 'run', id: 'active', name: 'read', arguments: { uri: 'slow-help' } });
  call.catch(() => {});
  await entered.promise;
  if (mode === 'close') {
    assert.deepEqual(await runtime.request('close'), { closed: true });
    await assert.rejects(call, /LOGINOM_KNOWLEDGE_CLOSED/);
  }
  if (mode === 'owner-disconnect') {
    runtime.child.disconnect();
    await assert.rejects(call, /ENTRY_DISCONNECTED/);
  }
  assert.deepEqual(await runtime.exited, [0, null]);
  assert.equal(server.calls.length, 1);
});

test('private errors conceal remote secrets and missing-key startup does not use the network', async t => {
  const server = await knowledgeServer(t, { call: () => { throw Error('PRIVATE-NONSECRET-CREDENTIAL'); } });
  const empty = entry(t);
  await empty.request('start', { protocol: 1, generation: 6, endpoint: server.endpoint, apiKey: '' });
  await assert.rejects(empty.request('list'), { message: 'LOGINOM_CONFIG_REQUIRED' });
  assert.equal(server.requests.length, 0);
  const runtime = entry(t);
  await runtime.request('start', { protocol: 1, generation: 7, endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  await assert.rejects(runtime.request('call', { run: 'run', id: 'read', name: 'read', arguments: { uri: 'help' } }),
    { message: 'LOGINOM_KNOWLEDGE_FAILED' });
});
