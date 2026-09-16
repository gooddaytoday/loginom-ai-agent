import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireClipboard, makeClipboardCode, hasClipboardConfirmation, createSerialGate, runClipboardTransfer } from '../lib/clipboard.mjs';

test('serializes separate processes and releases the kernel lease after a crash', async (t) => {
  const first = await acquireClipboard({ port: 0 });
  t.after(() => first.release());
  const module = new URL('../lib/clipboard.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { acquireClipboard } from ${JSON.stringify(module)};
    await acquireClipboard({port:${first.port}});
    process.stdout.write('acquired');
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  let acquired = false;
  child.stdout.on('data', () => { acquired = true; });
  await delay(150);
  assert.equal(acquired, false, 'second process must wait through the first operation');
  const ready = once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
  await first.release();
  await ready;
  await assert.rejects(acquireClipboard({ port: first.port, timeoutMs: 50 }), /holds the clipboard/);
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  const next = await acquireClipboard({ port: first.port, timeoutMs: 1000 });
  await next.release();
});

test('cancelling a waiter leaves the current owner locked', async () => {
  const owner = await acquireClipboard({ port: 0 });
  try {
    await assert.rejects(acquireClipboard({ port: owner.port, signal: AbortSignal.timeout(50) }));
    await assert.rejects(acquireClipboard({ port: owner.port, timeoutMs: 50 }), /holds the clipboard/);
  } finally { await owner.release(); }
});

test('requires the actual confirmation result, never a token echoed in code', () => {
  const { code, token } = makeClipboardCode({ copy: 'async p => {}', paste: 'async p => {}', confirm: 'async p => true' });
  assert.equal(hasClipboardConfirmation({ content: [{ type: 'text', text: '### Ran Playwright code\n' + code }] }, token), false);
  const result = { content: [{ type: 'text', text: '### Result\n' + JSON.stringify({ dockClipboardConfirmation: token }) + '\n### Ran Playwright code\n' + code }] };
  assert.equal(hasClipboardConfirmation(result, token), true);
  assert.equal(hasClipboardConfirmation({ ...result, isError: true }, token), false);
  assert.throws(() => makeClipboardCode({ copy: 'async p => {}' }), /requires/);
});

test('serializes browser operations even when the previous operation fails', async () => {
  const gate = createSerialGate();
  const events = [];
  const a = gate(async () => { events.push('copy'); await delay(20); events.push('paste'); throw new Error('unconfirmed'); });
  const b = gate(async () => { events.push('next'); });
  await assert.rejects(a, /unconfirmed/);
  await b;
  assert.deepEqual(events, ['copy', 'paste', 'next']);
});


test('unconfirmed paste retains the host lease until browser shutdown, including completed tool errors', async () => {
  for (const outcome of ['unconfirmed', 'tool-error', 'transport-error', 'confirmed']) {
    const leases = new Set(); let port, uncertain = false;
    const execute = async () => {
      if (outcome === 'transport-error') throw new Error('connection interrupted');
      return { isError: outcome === 'tool-error', content: [{ type: 'text', text: '### Result\n' + JSON.stringify({ dockClipboardConfirmation: outcome === 'unconfirmed' ? 'other' : 'expected' }) }] };
    };
    const operation = runClipboardTransfer({ execute, token: 'expected', leases,
      onUncertain: () => { uncertain = true; },
      acquire: async () => { const lease = await acquireClipboard({ port: 0 }); port = lease.port; return lease; },
    });
    try {
      if (outcome === 'transport-error') await assert.rejects(operation, /interrupted/);
      else assert.equal(await operation, outcome === 'confirmed');
      assert.equal(uncertain, outcome !== 'confirmed');
      if (outcome !== 'confirmed') {
        assert.equal(leases.size, 1);
        await assert.rejects(acquireClipboard({ port, timeoutMs: 40 }), /holds the clipboard/);
      } else assert.equal(leases.size, 0);
    } finally { await Promise.all([...leases].map(lease => lease.release())); }
    const next = await acquireClipboard({ port, timeoutMs: 100 });
    await next.release();
  }
});
