// Isolated shutdown regression using the actual MCP bridge and kernel lease.
// No real browser, system clipboard, configured lease port, server or model is used.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client as ProtocolClient } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as clipboard from '../../lib/clipboard.mjs';

test('clipboard shutdown retains uncertain leases on browser close failure and releases on success', async t => {
  let outcome, browserCloseCalls, port, retainedLease;
  class ExternalClient {
    constructor(identity) { this.browser = identity.name === 'loginom-dock-browser'; }
    async connect(transport) { this.transport = transport; }
    async close() {
      if (this.browser) browserCloseCalls++;
      if ((this.browser && outcome === 'browser-failure') || (!this.browser && outcome === 'remote-failure'))
        throw new Error('Injected transport shutdown failure');
      if (outcome !== 'missing-exit-event') this.transport?.onclose?.();
    }
    async listTools() { return { tools: this.browser ? [{ name: 'browser_run_code_unsafe', inputSchema: { type: 'object' } }] : [] }; }
    async callTool() { return { isError: true, content: [{ type: 'text', text: 'Injected unconfirmed paste' }] }; }
  }
  class ExternalTransport {}
  mock.module('@modelcontextprotocol/sdk/client/index.js', { namedExports: { Client: ExternalClient } });
  mock.module('@modelcontextprotocol/sdk/client/stdio.js', { namedExports: { StdioClientTransport: ExternalTransport, getDefaultEnvironment: () => ({}) } });
  mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', { namedExports: { StreamableHTTPClientTransport: ExternalTransport } });
  mock.module(new URL('../../lib/clipboard.mjs', import.meta.url).href, { namedExports: { ...clipboard,
    runClipboardTransfer: options => clipboard.runClipboardTransfer({ ...options, acquire: async () => {
      retainedLease = await clipboard.acquireClipboard({ port: 0 }); port = retainedLease.port; return retainedLease;
    } }),
  } });
  const { createBridge } = await import('../../lib/bridge.mjs');
  for (const scenario of ['browser-failure', 'success', 'remote-failure', 'missing-exit-event']) await t.test(scenario, async () => {
    outcome = scenario; browserCloseCalls = 0; retainedLease = null;
    const directory = await mkdtemp(join(tmpdir(), 'dock-p4-shutdown-'));
    let bridge, client, contender, uploadReleases = 0;
    try {
      bridge = await createBridge({ endpoint: 'https://dock.invalid/mcp', apiKey: 'fixture-nonsecret', mode: 'classic' }, {
        directory, async save() {}, metadata: { client: 'fixture', clientRevision: 'fixture', sessionId: 'fixture' },
        browserCli: '/fixture/not-launched', browserConfig: '/fixture/not-read', browserRoot: '/fixture',
        artifactStore: { async releaseUploads() { uploadReleases++; } },
      });
      client = new ProtocolClient({ name: 'isolated-p4-diagnostic', version: '1' });
      const [agentTransport, bridgeTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([bridge.server.connect(bridgeTransport), client.connect(agentTransport)]);
      const reply = await client.callTool({ name: 'dock_clipboard_transfer', arguments: {
        copy: 'async () => {}', paste: 'async () => {}', confirm: 'async () => false',
      } });
      assert.equal(reply.isError, true);
      await assert.rejects(clipboard.acquireClipboard({ port, timeoutMs: 20 }), /holds the clipboard/);
      const close = await bridge.close();
      assert.equal(browserCloseCalls, 1);
      const closed = !['browser-failure','missing-exit-event'].includes(scenario);
      assert.deepEqual(close, { browser_transport_closed: closed, browser_process_terminated: closed, clipboard_leases_retained: closed ? 0 : 1 });
      assert.equal(uploadReleases, closed ? 1 : 0);
      if (closed) contender = await clipboard.acquireClipboard({ port, timeoutMs: 20 });
      else await assert.rejects(clipboard.acquireClipboard({ port, timeoutMs: 20 }), /holds the clipboard/);
      assert.deepEqual(await bridge.close(), close);
      assert.equal(browserCloseCalls, 1, 'repeated close does not repeat the unknown shutdown');
    } finally {
      await contender?.release();
      await retainedLease?.release();
      await client?.close();
      await bridge?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
