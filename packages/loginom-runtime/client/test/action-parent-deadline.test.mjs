import test from 'node:test';
import assert from 'node:assert/strict';
import {actions, linkPage, runtime} from './support/executor-fixture.mjs';

const parameters = {path: '/user/data/packages/bounded-save.lgp', conflict_policy: 'fail'};

test('save preflight and mutation share the absolute parent ceiling', async () => {
  const page = linkPage(), deadlineAt = page.clock + 10000, calls = [], records = [];
  const timeouts = [];
  const engine = runtime(page, {execute: async (code, options) => { calls.push(code); timeouts.push(options.timeout); return page.execute(code); },
    onRecord: async row => { records.push(row); }});
  const result = await engine.run('package.save_checkpoint', parameters, {operationId: 'bounded', deadlineAt});
  assert.equal(result.status, 'SUCCEEDED', JSON.stringify(result));
  assert.equal(calls.length, 2);
  for (const code of calls) assert.ok(code.includes('"deadline_at":' + deadlineAt));
  assert.ok(records.every(row => row.deadline_at === deadlineAt));
  assert.ok(timeouts.every(timeout => timeout > 0 && timeout <= 15000));
  assert.ok(timeouts[1] <= timeouts[0]);
  assert.ok(page.storage.has(parameters.path));
  await assert.rejects(engine.run('package.save_checkpoint', parameters,
    {operationId: 'bounded', deadlineAt: deadlineAt + 1}), /different parent deadline/);
  const replay = await engine.run('package.save_checkpoint', parameters, {operationId: 'bounded', deadlineAt});
  assert.equal(replay.status, 'SUCCEEDED');
  assert.equal(calls.length, 2);
});

test('long parent allowance cannot enlarge the action limit', async () => {
  const page = linkPage(), original = page.clock, calls = [];
  const engine = runtime(page, {execute: async code => { calls.push(code); return page.execute(code); }});
  const result = await engine.run('package.save_checkpoint', parameters, {deadlineAt: original + 1000000});
  assert.equal(result.status, 'SUCCEEDED');
  const expected = original + actions.get('package.save_checkpoint').timeout_ms;
  for (const code of calls) assert.ok(code.includes('"deadline_at":' + expected));
});

for (const phase of ['preflight', 'evidence']) test('deadline consumed by ' + phase + ' prevents mutation', async () => {
  const page = linkPage(), deadlineAt = page.clock + 10000, calls = [];
  const engine = runtime(page, {execute: async code => {
    calls.push(code);
    const result = await page.execute(code);
    if (phase === 'preflight') page.clock = deadlineAt;
    return result;
  }, onRecord: async row => { if (phase === 'evidence' && row.phase === 'prepared') page.clock = deadlineAt; }});
  await assert.rejects(engine.run('package.save_checkpoint', parameters, {deadlineAt}), /expired before mutation/);
  assert.equal(calls.length, 1);
  assert.equal(page.storage.size, 0);
  assert.equal(page.dialog, null);
});

test('browser enforces original ceiling when transport arrives late', async () => {
  const page = linkPage(), deadlineAt = page.clock + 10000;
  let calls = 0;
  const engine = runtime(page, {execute: async code => {
    if (++calls === 2) page.clock = deadlineAt;
    return page.execute(code);
  }});
  const result = await engine.run('package.save_checkpoint', parameters, {deadlineAt});
  assert.notEqual(result.status, 'SUCCEEDED');
  assert.equal(result.effect_possible, false);
  assert.equal(page.storage.size, 0);
});

test('invalid parent deadline never invokes browser', async () => {
  const page = linkPage();
  let calls = 0;
  const engine = runtime(page, {execute: async code => { calls++; return page.execute(code); }});
  for (const deadlineAt of [null, Infinity, NaN, '10000', page.clock, page.clock - 1, page.clock + 0.5])
    await assert.rejects(engine.run('package.save_checkpoint', parameters, {deadlineAt}), /future safe integer/);
  assert.equal(calls, 0);
});

test('omitted ceiling keeps existing save behavior', async () => {
  const page = linkPage();
  const result = await runtime(page).run('package.save_checkpoint', parameters);
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(page.storage.has(parameters.path), true);
});
