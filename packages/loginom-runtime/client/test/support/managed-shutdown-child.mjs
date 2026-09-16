// Child-process CLI fixture: actual signals/stdin/kernel lease; no browser/server.
import { mock } from 'node:test';
import { acquireClipboard } from '../../lib/clipboard.mjs';
const scenario = process.argv[2];
const lease = await acquireClipboard({ port: 0 });
let calls = 0;
const bridge = { server: { async connect() {} }, async close() {
  calls++;
  if (scenario === 'throw') throw new Error('Private injected failure must not reach stderr');
  if (scenario === 'success') await lease.release();
  return { browser_transport_closed: scenario === 'success', browser_process_terminated: scenario === 'success',
    clipboard_leases_retained: scenario === 'success' ? 0 : 1 };
} };
mock.module(new URL('../../lib/config.mjs', import.meta.url).href, { namedExports: { loadConfig: async () => ({}) } });
mock.module(new URL('../../lib/session.mjs', import.meta.url).href, { namedExports: { createSession: async () => ({
  directory: '/unit-session', metadata: {sessionId:'shutdown-fixture',clientRevision:'fixture'},
}) } });
mock.module(new URL('../../lib/bridge.mjs', import.meta.url).href, { namedExports: { createBridge: async () => bridge } });
process.argv = [process.execPath, new URL('../../bin/loginom-dock.mjs', import.meta.url).pathname];
process.on('message', () => { process.send({ kind: 'state', calls }); });
process.stdin.resume();
await import('../../bin/loginom-dock.mjs');
process.send({ kind: 'ready', port: lease.port });
