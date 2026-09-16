import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { acquireClipboard } from '../lib/clipboard.mjs';

async function childFixture(t, scenario) {
  const child = spawn(process.execPath, ['--experimental-test-module-mocks',
    fileURLToPath(new URL('./support/managed-shutdown-child.mjs', import.meta.url)), scenario],
  { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    }
  });
  let stderr = '';
  child.stderr.on('data', value => { stderr += value; });
  const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(5000) });
  assert.equal(ready.kind, 'ready');
  return { child, port: ready.port, stderr: () => stderr };
}

for (const [scenario, trigger] of [['failure','SIGTERM'], ['throw','SIGINT'], ['failure','EOF']]) {
  test(`managed ${trigger} preserves uncertain lease after ${scenario}; SIGKILL remains outside guarantee`, async t => {
    const f = await childFixture(t, scenario);
    const blocked = async () => assert.rejects(acquireClipboard({ port: f.port, timeoutMs: 30 }), /holds the clipboard/);
    await blocked();
    const diagnostic = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Missing managed shutdown diagnostic')), 5000);
      const listen = () => { if (f.stderr().includes('shutdown is unconfirmed')) { clearTimeout(timeout); f.child.stderr.off('data', listen); resolve(); } };
      f.child.stderr.on('data', listen); listen();
    });
    if (trigger === 'EOF') f.child.stdin.end(); else f.child.kill(trigger);
    await diagnostic;
    await blocked();
    for (const signal of ['SIGTERM', 'SIGINT']) {
      f.child.kill(signal);
      const reply = once(f.child, 'message', { signal: AbortSignal.timeout(5000) }); f.child.send('state');
      const [state] = await reply;
      assert.equal(state.calls, 1, 'signals must not retry unknown cleanup');
      assert.equal(f.child.exitCode, null);
      await blocked();
    }
    assert.equal(f.stderr().includes('Private injected failure'), false);
    const exited = once(f.child, 'exit'); f.child.kill('SIGKILL');
    assert.equal((await exited)[1], 'SIGKILL');
    const next = await acquireClipboard({ port: f.port, timeoutMs: 1000 }); await next.release();
  });
}

test('managed SIGTERM exits successfully after confirmed transport process termination and lease release', async t => {
  const f = await childFixture(t, 'success');
  const exited = once(f.child, 'exit', { signal: AbortSignal.timeout(5000) }); f.child.kill('SIGTERM');
  assert.deepEqual(await exited, [0, null]);
  assert.equal(f.stderr().includes('shutdown is unconfirmed'), false);
  const next = await acquireClipboard({ port: f.port, timeoutMs: 1000 }); await next.release();
});

test('pinned SDK preserves pre-connect onclose callback for actual child-process termination', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const serverModule = new URL('../node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js', import.meta.url).href;
  const transportModule = new URL('../node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js', import.meta.url).href;
  const code = `import { Server } from ${JSON.stringify(serverModule)}; import { StdioServerTransport } from ${JSON.stringify(transportModule)};
    const server = new Server({name:'shutdown-fixture',version:'1'},{capabilities:{}});
    await server.connect(new StdioServerTransport());`;
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--input-type=module', '-e', code], stderr: 'pipe' });
  let terminated = false;
  transport.onclose = () => { terminated = true; };
  const client = new Client({ name: 'shutdown-source-check', version: '1' });
  try {
    await client.connect(transport, { timeout: 5000 });
    assert.equal(terminated, false);
    await client.close();
    assert.equal(terminated, true, 'actual child close reaches the pre-connect callback');
  } finally { await client.close(); }
});
