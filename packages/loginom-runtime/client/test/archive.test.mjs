import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openArchive } from '../lib/archive.mjs';
import { createRedactor } from '../lib/redact.mjs';

test('redaction removes known credentials, fields, URLs, private keys, binaries and hidden reasoning', () => {
  const r = createRedactor(['known-control-secret']);
  const input = { apiKey: 'discovered-control-secret', nested: { accessToken: 'access-control-secret' },
    output: 'known-control-secret discovered-control-secret access-control-secret',
    url: 'https://user:pass@example.test/path?accessToken=url-control-secret&plain=ok',
    header: 'Authorization: Bearer bearer-control-secret\nCookie: sid=cookie-control-secret',
    privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nprivate-control-secret\n-----END OPENSSH PRIVATE KEY-----',
    reasoning: 'hidden-control-secret', system_prompt: 'system-control-secret',
    image: { type: 'image', data: 'image-control-secret' },
    browser: { element: 'Password', text: 'typed-control-secret' },
    valid: 'Useful result with 42 rows' };
  const result = JSON.stringify(r.redact(input));
  for (const secret of ['known', 'discovered', 'access', 'url', 'bearer', 'cookie', 'private', 'hidden', 'system', 'image', 'typed']) {
    assert.ok(!result.includes(secret + '-control-secret'), secret);
  }
  assert.ok(result.includes(input.valid));
  assert.ok(result.includes('plain=ok'));
  assert.ok(!result.includes('user:pass'));
  const cycle = {}; cycle.self = cycle;
  assert.equal(r.redact(cycle).type, 'redaction_failure');
});

test('only activated sessions enqueue sanitized events; activation and delivery identity survive reopening', async t => {
  const stateDir = await mkdtemp(join(tmpdir(), 'dock-archive-'));
  const config = { stateDir, apiKey: 'queue-control-secret', endpoint: 'https://dock.example/mcp' };
  const event = { agent: 'codex', conversation: 'chat-1', turn: 'turn-1', event: 'message-1', role: 'user', parts: [{ type: 'text', text: 'Task queue-control-secret' }] };
  let q = await openArchive(config);
  assert.equal(q.enqueue(event), false);
  const activation = q.activate({ ...event, metadata: { skillRevision: 'fixture' } });
  q.enqueue(event); q.enqueue(event);
  assert.equal(q.pending().length, 1);
  assert.ok(!JSON.stringify(q.pending()).includes(config.apiKey));
  const id = q.pending()[0].deduplication_key;
  q.close(); q = await openArchive(config);
  t.after(async () => { q.close(); await rm(stateDir, { recursive: true, force: true }); });
  assert.equal(q.active('codex', 'chat-1').server_session, activation.server_session);
  q.enqueue(event);
  assert.equal(q.pending()[0].deduplication_key, id);
  assert.equal(q.active('hermes', 'chat-1'), undefined);
  assert.ok(!(await readFile(join(stateDir, 'archive/queue.sqlite'))).includes(Buffer.from(config.apiKey)));
});

test('uncertain acknowledgement retries the same delivery identity and never uses personal queues', async t => {
  const stateDir = await mkdtemp(join(tmpdir(), 'dock-retry-'));
  const config = { stateDir, apiKey: 'wire-control-secret', endpoint: 'https://dock.example/mcp' };
  const q = await openArchive(config, { deliveryPort: 0 });
  t.after(async () => { q.close(); await rm(stateDir, { recursive: true, force: true }); });
  const event = { agent: 'hermes', conversation: 'chat-2', turn: 'turn-2', event: 'call-1', role: 'assistant', createdAt: new Date(Date.now() - 60000).toISOString(), parts: [{ type: 'text', text: 'Useful wire-control-secret' }] };
  q.activate({ ...event, metadata: {} }); q.enqueue(event);
  q.requestCommit(event.agent, event.conversation);
  let loseReply = true;
  let wrongPolicy = false;
  let commits = 0;
  let session;
  const delivered = new Set();
  const fetcher = async (url, options) => {
    assert.equal(url.origin, 'https://dock.example');
    assert.equal(options.redirect, 'error');
    assert.ok(!options.body?.includes(config.apiKey));
    if (url.pathname === '/openapi.json') return Response.json({ components: { schemas: { AddMessageRequest: { properties: { deduplication_key: {} } } } } });
    if (url.pathname === '/api/v1/sessions') {
      if (session) return Response.json({}, { status: 409 });
      session = JSON.parse(options.body);
      // OpenViking expands the experiences alias into its native subtypes.
      session.memory_policy.memory_types = ['cases', 'events', 'experiences', 'trajectories'];
    }
    if (options.method === undefined && url.pathname === '/api/v1/sessions/' + session?.session_id) return Response.json({ result: wrongPolicy
      ? { ...session, memory_policy: { ...session.memory_policy, peer: { enabled: true } } } : session });
    if (url.pathname.endsWith('/batch')) {
      for (const message of JSON.parse(options.body).messages) delivered.add(message.deduplication_key);
      if (loseReply) throw new Error('Network failed after server append');
    }
    if (url.pathname.endsWith('/commit')) commits++;
    return Response.json({ result: {} });
  };
  assert.equal((await q.flush(fetcher)).sent, 0);
  assert.equal(q.pending().length, 1);
  assert.equal(commits, 0);
  const waiting = q.deliveryStatus(q.active(event.agent, event.conversation).server_session);
  assert.equal(waiting.pending_events, 1);
  assert.ok(waiting.oldest_event_age_seconds >= 60);
  loseReply = false;
  wrongPolicy = true;
  assert.equal((await q.flush(fetcher)).sent, 0);
  assert.equal(q.pendingCount(), 1);
  assert.equal(commits, 0);
  wrongPolicy = false;
  assert.equal((await q.flush(fetcher)).sent, 1);
  assert.equal(q.pending().length, 0);
  const confirmed = q.deliveryStatus(q.active(event.agent, event.conversation).server_session);
  assert.equal(confirmed.pending_events, 0);
  assert.equal(confirmed.oldest_event_age_seconds, null);
  assert.equal(delivered.size, 1);
  assert.equal(commits, 1);
  assert.equal(q.workRemaining(), 0);
  await q.flush(fetcher);
  assert.equal(commits, 1);
});
