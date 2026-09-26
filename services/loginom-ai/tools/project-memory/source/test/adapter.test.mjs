import test from 'node:test';
import assert from 'node:assert/strict';
import { Adapter, CAPABILITY, routeCall, resolveContext } from '../adapter.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fetchWithRetry } from '../vendor/http-fetch.mjs';

const context = { peerId: 'project', sessionId: 'cx-own' };
test('host capability advertised; notifications and unsupported methods do not reach network', async () => {
  const adapter = new Adapter({ fetchImpl() { throw new Error('unexpected network'); } });
  assert.deepEqual((await adapter.handle({ jsonrpc: '2.0', id: 1, method: 'initialize' })).result.capabilities.experimental, { [CAPABILITY]: {} });
  assert.equal(await adapter.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await adapter.handle({ jsonrpc: '2.0', id: 2, method: 'resources/read' })).error.code, -32601);
  await adapter.close();
});
test('strict production context rejects missing registration before accessing credentials or network', async () => {
  const adapter = new Adapter({ requireEnrollment: true, routing: () => ({ projects: [] }), credentials() { throw new Error('unexpected credentials'); } });
  for (const meta of [undefined, { threadId: 'own', [CAPABILITY]: { sandboxCwd: 'file:///tmp/unregistered-memory-fixture' } }]) {
    const reply = await adapter.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'health', _meta: meta } });
    assert.equal(reply.error.code, -32001);
  }
  for (const value of ['file:///tmp?a=b', 'file:///tmp#x', 'https://host/a', 'file://other/a'])
    assert.throws(() => resolveContext({ threadId: 'own', [CAPABILITY]: { sandboxCwd: value } }), /Codex/);
  await adapter.close();
});
test('routing removes caller identity, defaults reads to actor and binds contextual search', () => {
  assert.deepEqual(routeCall({ name: 'search', arguments: { query: 'x', peer_id: 'foreign', actor_peer_id: 'foreign', _meta: {}, threadId: 'foreign' } }, context),
    { name: 'search', peerId: 'project', arguments: { query: 'x', peer_scope: 'actor', session_id: 'cx-own' } });
  assert.throws(() => routeCall({ name: 'search', arguments: { session_id: 'cx-foreign' } }, context), /different task/);
  assert.throws(() => routeCall({ name: 'write', arguments: { peer_scope: 'all' } }, context), /not writes/);
  assert.throws(() => routeCall({ name: 'read', arguments: [] }, context), /Invalid/);
});
test('vendored modules retain exact provenance', () => {
  const provenance = JSON.parse(readFileSync(new URL('../vendor/provenance.json', import.meta.url)));
  for (const [file, hash] of Object.entries(provenance.files))
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../vendor/${file}`, import.meta.url))).digest('hex'), hash, file);
});
test('an ambiguous write is never retried; one transient read retry shares its deadline', async () => {
  let attempts = 0;
  const fetchImpl = async () => { attempts++; throw Object.assign(new Error('dropped'), { code: 'ECONNRESET' }); };
  await assert.rejects(fetchWithRetry('https://fixture.invalid', { method: 'POST' }, { fetchImpl, readOnly: false }));
  assert.equal(attempts, 1);
  attempts = 0;
  await assert.rejects(fetchWithRetry('https://fixture.invalid', { method: 'POST' }, { fetchImpl, readOnly: true }));
  assert.equal(attempts, 2);
});
test('read/write schemas do not receive unsupported scope, foreign URIs cannot select identity', () => {
  assert.deepEqual(routeCall({ name: 'read', arguments: { uris: ['viking://~/memories/a.md'] } }, context).arguments,
    { uris: ['viking://~/memories/a.md'] });
  for (const name of ['read', 'write'])
    assert.throws(() => routeCall({ name, arguments: { uri: 'viking://user/test/peers/foreign/memories/a.md' } }, context), /different project/);
  assert.throws(() => routeCall({ name: 'read', arguments: { uris: ['viking://session/cx-foreign/messages.jsonl'] } }, context), /different task/);
});
test('failed initialization is evicted; next explicit request can recover without write replay', async () => {
  let attempts = 0;
  const adapter = new Adapter({ credentials: () => ({ baseUrl: 'https://fixture.invalid', timeoutMs: 1000 }),
    fetchImpl: async (url, options) => {
      const message = JSON.parse(options.body);
      if (message.method === 'initialize' && ++attempts === 1) return new Response('unavailable', { status: 503 });
      if (!Object.hasOwn(message, 'id')) return new Response(null, { status: 202 });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: message.method === 'tools/list' ? { tools: [] } : { protocolVersion: '2025-06-18' } }), { headers: { 'content-type': 'application/json' } });
    } });
  assert.equal((await adapter.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).error.code, -32003);
  assert.deepEqual((await adapter.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools, []);
  assert.equal(attempts, 2);
  await adapter.close();
});
