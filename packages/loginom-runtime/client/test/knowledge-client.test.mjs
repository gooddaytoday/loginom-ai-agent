import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { knowledgeServer } from './support/knowledge-server.mjs';

test('knowledge reads real authenticated MCP schemas and Help without browser modules or a child process', async t => {
  const server = await knowledgeServer(t);
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (/playwright|^(?:node:)?child_process$/.test(specifier)
      || /(?:^|\/)lib\/(?:bridge|session)\.mjs$/.test(specifier))
      throw Error('BROWSER_DEPENDENCY_FORBIDDEN');
    return next(specifier, context);
  } });
  t.after(() => hooks.deregister());
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  const knowledge = await createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  t.after(() => knowledge.close());
  assert.deepEqual(knowledge.tools.map(tool => tool.name).toSorted(), ['find', 'glob', 'grep', 'list', 'read', 'search', 'tree']);
  assert.deepEqual(knowledge.tools.find(tool => tool.name === 'read'), server.tools.find(tool => tool.name === 'read'));
  const uri = 'viking://resources/loginom-dock/sources/loginom-help/README.md';
  const reply = await knowledge.call({ run: 'run-a', id: 'read-1', name: 'read', arguments: { uri } });
  assert.deepEqual(JSON.parse(reply.content[0].text), { name: 'read', arguments: { uri } });
  assert.equal(server.calls.length, 1);
  assert.ok(server.requests.every(request => request.authorization === 'Bearer UNIT-NONSECRET'));
  assert.match(knowledge.catalogSha256, /^[a-f0-9]{64}$/);
});

test('knowledge refuses requests after close with its own lifecycle error', async t => {
  const server = await knowledgeServer(t);
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  const knowledge = await createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  await knowledge.close();
  await assert.rejects(() => knowledge.call({ run: 'run-a', id: 'later', name: 'read', arguments: { uri: 'help' } }),
    /LOGINOM_KNOWLEDGE_CLOSED/);
  assert.equal(server.calls.length, 0);
});

test('interrupting one run cancels its concurrent Help request and leaves the other run intact', async t => {
  const started = new Map(['a', 'b'].map(name => [name, Promise.withResolvers()]));
  const finished = new Map(['a', 'b'].map(name => [name, Promise.withResolvers()]));
  const server = await knowledgeServer(t, { call: async request => {
    const name = request.arguments.uri;
    started.get(name).resolve();
    return finished.get(name).promise;
  } });
  t.after(() => { for (const gate of finished.values()) gate.resolve({ content: [] }); });
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  const knowledge = await createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  t.after(() => knowledge.close());
  const a = knowledge.call({ run: 'run-a', id: 'same-id', name: 'read', arguments: { uri: 'a' } });
  const rejected = assert.rejects(a, /LOGINOM_KNOWLEDGE_INTERRUPTED/);
  void rejected.catch(() => {});
  const b = knowledge.call({ run: 'run-b', id: 'same-id', name: 'read', arguments: { uri: 'b' } });
  void b.catch(() => {});
  await Promise.all([...started.values()].map(gate => gate.promise));
  knowledge.interrupt({ run: 'run-a' });
  await rejected;
  const result = { content: [{ type: 'text', text: 'Run B Help' }] };
  finished.get('b').resolve(result);
  assert.deepEqual(await b, result);
  assert.equal(server.calls.length, 2);
  finished.get('a').resolve({ content: [] });
});

test('close aborts and drains the active Help request before resolving', async t => {
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const server = await knowledgeServer(t, { call: async () => {
    started.resolve();
    return finish.promise;
  } });
  t.after(() => finish.resolve({ content: [] }));
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  const knowledge = await createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  t.after(() => knowledge.close());
  const call = knowledge.call({ run: 'run-a', id: 'request-a', name: 'read', arguments: { uri: 'help' } });
  const rejected = assert.rejects(call, /LOGINOM_KNOWLEDGE_CLOSED/);
  void rejected.catch(() => {});
  await started.promise;
  await knowledge.close();
  await rejected;
  assert.equal(server.calls.length, 1);
});

test('a missing Help API key is rejected before any network request', async t => {
  const server = await knowledgeServer(t);
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  await assert.rejects(() => createKnowledgeClient({ endpoint: server.endpoint, apiKey: '' }), /LOGINOM_CONFIG_REQUIRED/);
  assert.equal(server.requests.length, 0);
});

test('a partial remote Help catalog cannot become ready', async t => {
  const server = await knowledgeServer(t, { names: ['read', 'write'] });
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  await assert.rejects(async () => {
    const knowledge = await createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
    await knowledge.close();
  },
    /LOGINOM_KNOWLEDGE_CATALOG_INVALID/);
  assert.equal(server.calls.length, 0);
});

test('unknown, mutable catalog and browser tool names cannot reach the remote service', async t => {
  const server = await knowledgeServer(t);
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  const knowledge = await createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  t.after(() => knowledge.close());
  knowledge.tools.push(server.tools.find(tool => tool.name === 'write'));
  for (const name of ['write', 'dock_prepare', 'browser_navigate', 'READ'])
    await assert.rejects(() => knowledge.call({ run: 'run-a', id: name, name, arguments: { uri: 'help' } }),
      /LOGINOM_KNOWLEDGE_TOOL_DENIED/);
  assert.equal(server.calls.length, 0);
});

test('an already aborted request never reaches the remote service', async t => {
  const server = await knowledgeServer(t);
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  const knowledge = await createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  t.after(() => knowledge.close());
  const controller = new AbortController();
  controller.abort(Error('PRE_ABORTED'));
  await assert.rejects(() => knowledge.call({ run: 'run-a', id: 'read', name: 'read', arguments: { uri: 'help' } },
    controller.signal), /PRE_ABORTED/);
  assert.equal(server.calls.length, 0);
});

test('a concurrent duplicate request id cannot overwrite the first cancellation owner', async t => {
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const server = await knowledgeServer(t, { call: async () => { started.resolve(); return finish.promise; } });
  t.after(() => finish.resolve({ content: [] }));
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  const knowledge = await createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' });
  t.after(() => knowledge.close());
  const input = { run: 'run-a', id: 'duplicate', name: 'read', arguments: { uri: 'help' } };
  const active = knowledge.call(input);
  const rejected = assert.rejects(active, /LOGINOM_KNOWLEDGE_INTERRUPTED/);
  void rejected.catch(() => {});
  await started.promise;
  await assert.rejects(() => knowledge.call(input), /LOGINOM_KNOWLEDGE_REQUEST_BUSY/);
  knowledge.interrupt({ run: 'run-a', id: 'duplicate' });
  await rejected;
  assert.equal(server.calls.length, 1);
});

test('startup cancellation interrupts a pending remote catalog read', async t => {
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const server = await knowledgeServer(t, { list: async () => {
    started.resolve();
    return finish.promise;
  } });
  t.after(() => finish.resolve({ tools: server.tools }));
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  const controller = new AbortController();
  const starting = createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' }, controller.signal);
  void starting.then(knowledge => knowledge.close(), () => {});
  const rejected = assert.rejects(starting, /STARTUP_STOPPED/);
  void rejected.catch(() => {});
  await started.promise;
  controller.abort(Error('STARTUP_STOPPED'));
  await rejected;
});

test('startup cancellation also interrupts a pending MCP initialization', async t => {
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const server = await knowledgeServer(t, { initialize: async () => {
    started.resolve();
    await finish.promise;
  } });
  t.after(() => finish.resolve());
  const { createKnowledgeClient } = await import('../lib/knowledge-client.mjs');
  const controller = new AbortController();
  const starting = createKnowledgeClient({ endpoint: server.endpoint, apiKey: 'UNIT-NONSECRET' }, controller.signal);
  void starting.then(knowledge => knowledge.close(), () => {});
  const rejected = assert.rejects(starting, /INITIALIZATION_STOPPED/);
  void rejected.catch(() => {});
  await started.promise;
  controller.abort(Error('INITIALIZATION_STOPPED'));
  await rejected;
  assert.equal(server.calls.length, 0);
});
