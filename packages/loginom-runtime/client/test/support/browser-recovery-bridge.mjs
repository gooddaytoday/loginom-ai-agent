import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createArtifactStore } from '../../lib/artifacts.mjs';
import { createBundledSkillFixture } from './bundled-skill-fixture.mjs';
import { createActionCatalogFixture } from './action-catalog-fixture.mjs';

for (const capability of [false, true])
test('browser recovery tools follow the private capability through the managed bridge: ' + capability, async t => {
  const resources = await createBundledSkillFixture(t);
  const directory = await mkdtemp(join(tmpdir(), 'loginom-recovery-bridge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const compatibility = { profile_id: 'unit-linux-chromium', loginom_build: '7.4.2', platform: 'linux', browser: 'chromium' };
  const catalog = await createActionCatalogFixture(compatibility);
  const browserCalls = [];
  class ExternalClient {
    constructor(identity) { this.browser = identity.name === 'loginom-dock-browser'; }
    async connect(transport) { this.transport = transport; }
    async close() { this.transport?.onclose?.(); }
    async listTools() {
      return { tools: (this.browser ? ['browser_run_code_unsafe', 'browser_click', 'browser_navigate', 'browser_snapshot'] : ['read'])
        .map(name => ({ name, inputSchema: { type: 'object' } })) };
    }
    async callTool(request) {
      if (!this.browser) return { content: [{ type: 'text', text: catalog.files.get(request.arguments.uris[0]) }] };
      browserCalls.push(request.name);
      const code = request.arguments.code ?? '';
      const output = code.includes('async function prepareWorkspace(')
        ? { status: 'READY', target: compatibility, authenticated: true, created_draft: true,
          effect_possible: true, document_id: 'fixture-document', target_verified: true,
          package_ref: { path: null, persisted: false },
          workflow_ref: { tab_tid: 'fixture-tab', prefix: 'fixture-prefix', workflow_id: 'fixture-workflow', navigation_path: [] } }
        : { version: 1, source: 'prepare_same_browser_page', observed: { document_id: 'fixture-document' }, fixture: true };
      return { content: [{ type: 'text', text: JSON.stringify(output) }] };
    }
  }
  class ExternalTransport {}
  t.mock.module('@modelcontextprotocol/sdk/client/index.js', { namedExports: { Client: ExternalClient } });
  t.mock.module('@modelcontextprotocol/sdk/client/stdio.js', { namedExports: { StdioClientTransport: ExternalTransport, getDefaultEnvironment: () => ({}) } });
  t.mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', { namedExports: { StreamableHTTPClientTransport: ExternalTransport } });
  const { createBridge } = await import('../../lib/bridge.mjs?capability=' + capability);
  const session = { directory, browserCli: '/external/browser', browserConfig: '/external/config', browserRoot: '/external/browsers',
    artifactStore: await createArtifactStore({ directory: join(directory, 'input') }),
    metadata: { client: 'unit-test', clientRevision: 'd'.repeat(64), sessionId: 'user-session' }, async save() {} };
  const config = { resources: resources.resources, endpoint: 'https://dock.invalid/mcp', apiKey: 'UNIT-NONSECRET',
    loginomUrl: 'https://loginom.invalid/?testable=true', mode: 'executor-replay', resultProfile: 'user-v1',
    actionManifestUri: catalog.manifestUri, actionManifestSha256: catalog.manifestSha256, browserRecovery: capability };
  await assert.rejects(createBridge({ ...config, browserRecovery: 'true' }, session, { browserTransport: new ExternalTransport() }),
    /Invalid private browser recovery policy/);
  if (capability) await assert.rejects(createBridge({ ...config, mode: 'executor-preview' }, session,
    { browserTransport: new ExternalTransport() }), /Invalid private browser recovery policy/);
  const bridge = await createBridge(config, session, { browserTransport: new ExternalTransport() });
  const client = new Client({ name: 'unit-agent', version: '1' });
  try {
    const [agent, server] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(agent), bridge.server.connect(server)]);
    const prepared = await client.callTool({ name: 'dock_prepare', arguments: {} });
    assert.notEqual(prepared.isError, true, JSON.stringify(prepared));
    const tools = (await client.listTools()).tools.map(tool => tool.name);
    assert.equal(tools.includes('dock_browser_recovery'), capability);
    for (const name of ['browser_click', 'browser_navigate', 'browser_snapshot', 'browser_run_code_unsafe'])
      assert.equal(tools.includes(name), false, name);
    // Known names outside the browser phase are refused before any browser call.
    const before = browserCalls.length;
    // Unknown names are protocol errors; known names outside the phase are tool errors.
    const call = request => client.callTool(request).catch(error => ({ isError: true, content: [{ type: 'text', text: error.message }] }));
    const click = await call({ name: 'browser_click', arguments: { target: 'e1' } });
    assert.equal(click.isError, true);
    if (capability) assert.match(click.content[0].text, /only during the browser phase/);
    const navigate = await call({ name: 'browser_navigate', arguments: { url: 'https://example.test' } });
    assert.equal(navigate.isError, true);
    if (capability) {
      const start = await call({ name: 'dock_browser_recovery', arguments: { action: 'start', operation_id: 'unknown-op' } });
      assert.equal(start.isError, true);
    }
    assert.equal(browserCalls.length, before);
  } finally { await client.close(); await bridge.close(); }
});
