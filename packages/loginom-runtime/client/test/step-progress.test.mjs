import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createNodeOperationRunner } from '../lib/node-operation-runner.mjs';
import { observeLoginomReplies, stepPhase, withStepProgress } from '../lib/step-progress.mjs';

test('coalesces progress and reports inactivity without changing the original call result', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1000 });
  const clock = t.mock.timers;
  const updates = [];
  let lastReplyAt = null;
  const signal = new AbortController().signal;
  const result = { content: [{ type: 'text', text: 'original result' }] };
  assert.equal(await withStepProgress({ name: 'dock_prepare', signal, lastReply: () => lastReplyAt,
    send: update => updates.push(update) }, async () => {
    clock.tick(1499);
    assert.equal(updates.length, 0);
    stepPhase('configuring', 'transform.group_data', { kind: 'fields', index: 1, total: 3 });
    stepPhase('configuring', 'transform.group_data', { kind: 'fields', index: 2, total: 3 });
    lastReplyAt = Date.now();
    clock.tick(1);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0], { version: 1, phase: 'configuring', nodeType: 'transform.group_data',
      substep: { kind: 'fields', index: 2, total: 3 }, startedAt: 1000, lastReplyAt: 2499, stalledSince: null });
    clock.tick(58500);
    assert.equal(updates.length, 1);
    clock.tick(1500);
    assert.equal(updates[1].stalledSince, 2499);
    lastReplyAt = Date.now();
    clock.tick(1500);
    assert.equal(updates[2].lastReplyAt, lastReplyAt);
    assert.equal(updates[2].stalledSince, null);
    return result;
  }), result);
  lastReplyAt = Date.now();
  clock.tick(3000);
  assert.equal(updates.length, 3);
});

test('a wait observes its original worker after the start call resolves', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1000 });
  const executing = Promise.withResolvers();
  const finished = Promise.withResolvers();
  const jobs = createNodeOperationRunner({ validate: () => '1', progress: () => null,
    run: async () => {
      await executing.promise;
      stepPhase('executing', 'transform.group_data');
      await finished.promise;
      return { status: 'SUCCEEDED' };
    } });
  const updates = [];
  const progress = { signal: new AbortController().signal, lastReply: () => null, send: event => updates.push(event) };
  const start = await withStepProgress({ ...progress, name: 'dock_node_apply' }, () => jobs.start({ operation_id: 'fixture' }));
  assert.equal(start.state, 'running');
  t.mock.timers.tick(3000);
  assert.deepEqual(updates, []);
  const wait = withStepProgress({ ...progress, name: 'dock_node_wait' }, () => jobs.wait('fixture', { timeoutMs: 60000 }));
  executing.resolve();
  await executing.promise;
  t.mock.timers.tick(1500);
  assert.equal(updates[0].phase, 'executing');
  assert.equal(updates[0].startedAt, 1000);
  finished.resolve();
  assert.equal((await wait).outcome.status, 'SUCCEEDED');
});

test('only Loginom HTTP responses and incoming WebSocket frames update the reply clock', () => {
  const page = new EventEmitter();
  const context = Object.assign(new EventEmitter(), { pages: () => [page] });
  let replies = 0;
  observeLoginomReplies(context, 'https://loginom.example', () => replies++);
  const response = (url, serviceWorker = false) => ({ url: () => url, fromServiceWorker: () => serviceWorker });
  const socket = url => Object.assign(new EventEmitter(), { url: () => url });
  const loginom = socket('wss://loginom.example/ws');
  const external = socket('wss://other.example/ws');
  page.emit('websocket', loginom);
  page.emit('websocket', external);
  loginom.emit('framesent');
  external.emit('framereceived');
  context.emit('response', response('https://other.example/'));
  context.emit('response', response('https://loginom.example/', true));
  assert.equal(replies, 0);
  loginom.emit('framereceived');
  context.emit('response', response('https://loginom.example/'));
  assert.equal(replies, 2);
});
