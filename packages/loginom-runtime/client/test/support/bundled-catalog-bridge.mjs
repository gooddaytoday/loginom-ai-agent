import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createArtifactStore } from '../../lib/artifacts.mjs';
import { createBundledSkillFixture } from './bundled-skill-fixture.mjs';
import { createActionCatalogFixture } from './action-catalog-fixture.mjs';

test('the managed bridge pins the bundled catalog without reading it from the knowledge service', async t => {
  const resources = await createBundledSkillFixture(t);
  const directory = await mkdtemp(join(tmpdir(), 'loginom-bundled-catalog-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // The knowledge service could serve this other release; a bundled pin must still refuse it.
  const served = await createActionCatalogFixture();
  const reads = [];
  const browserCalls = [];
  class ExternalClient {
    constructor(identity) {
      this.browser = identity.name === 'loginom-dock-browser';
      if (!this.browser) throw Error('Remote Dock must not start');
    }
    async connect(transport) { this.transport = transport; }
    async close() { this.transport?.onclose?.(); }
    async listTools() {
      return { tools: (this.browser ? ['browser_run_code_unsafe'] : ['read']).map(name => ({ name, inputSchema: { type: 'object' } })) };
    }
    async callTool(request) {
      if (!this.browser) reads.push(request.arguments?.uris?.[0]);
      assert.equal(request.name, 'browser_run_code_unsafe');
      browserCalls.push(request);
      if (request.arguments.code.includes('async function observeGeometry('))
        return { content: [{ type: 'text', text: JSON.stringify({ version: 1,
          source: 'prepare_same_browser_page', observed: { document_id: 'local-document' } }) }] };
      const identity = request.arguments.code.includes('"identityOnly":true');
      return { content: [{ type: 'text', text: JSON.stringify({
        status: identity ? 'BOUND' : 'READY', target, authenticated: true, created_draft: !identity,
        effect_possible: !identity, document_id: 'local-document', target_verified: true,
        operation_id: 'prepare', loginom_account: 'user', package_ref: { path: null, persisted: false },
        workflow_ref: { tab_tid: 'local-tab', prefix: 'local-prefix', workflow_id: 'local-workflow', navigation_path: [] },
      }) }] };
    }
  }
  class ExternalTransport {}
  t.mock.module('@modelcontextprotocol/sdk/client/index.js', { namedExports: { Client: ExternalClient } });
  t.mock.module('@modelcontextprotocol/sdk/client/stdio.js', { namedExports: { StdioClientTransport: ExternalTransport, getDefaultEnvironment: () => ({}) } });
  t.mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', { namedExports: { StreamableHTTPClientTransport: ExternalTransport } });
  t.mock.module(new URL('../../lib/diagnostics.mjs', import.meta.url).href, {
    namedExports: { diagnoseConnection() { throw Error('Remote diagnostics must not start'); } },
  });
  const { createBridge } = await import('../../lib/bridge.mjs');
  const session = { directory, browserCli: '/external/browser', browserConfig: '/external/config', browserRoot: '/external/browsers',
    artifactStore: await createArtifactStore({ directory: join(directory, 'input') }),
    metadata: { client: 'unit-test', clientRevision: 'd'.repeat(64), sessionId: 'user-session' }, async save() {} };
  const release = JSON.parse(await readFile(new URL('../../../../product/loginom-release.json', import.meta.url), 'utf8'));
  const target = JSON.parse(await readFile(new URL(`../../../executor/catalog-releases/${release.actionManifestUri.split('/').at(-2)}/manifest.json`, import.meta.url), 'utf8')).compatibility;
  const config = { resources: resources.resources,
    loginomUrl: 'https://loginom.invalid/?testable=true', mode: 'executor-replay', resultProfile: 'user-v1',
    actionManifestUri: release.actionManifestUri, actionManifestSha256: release.actionManifestSha256, bundledCatalog: true };
  const options = () => ({ browserTransport: new ExternalTransport() });
  await assert.rejects(createBridge({ ...config, bundledCatalog: 'true' }, session, options()), /Invalid bundled action catalog policy/);
  await assert.rejects(createBridge({ ...config, mode: 'executor-preview' }, session, options()), /Invalid bundled action catalog policy/);
  await assert.rejects(createBridge({ ...config, actionManifestUri: served.manifestUri, actionManifestSha256: served.manifestSha256 },
    session, options()), /is not bundled/);
  const bridge = await createBridge(config, session, options());
  const client = new Client({ name: 'unit-agent', version: '1' });
  try {
    assert.equal(session.metadata.actionManifestDigest, release.actionManifestSha256);
    assert.equal(session.metadata.catalogLifecycleStatus, 'candidate');
    assert.deepEqual(reads, []);
    const [agent, server] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(agent), bridge.server.connect(server)]);
    assert.equal((await client.listTools()).tools.some(tool => tool.name === 'read'), false);
    await assert.rejects(client.callTool({ name: 'read', arguments: {} }), /Unknown Dock tool/);
    const prepared = await client.callTool({ name: 'dock_prepare', arguments: {} });
    assert.notEqual(prepared.isError, true, JSON.stringify(prepared));
    assert.equal(JSON.parse(prepared.content[0].text).prepared, true);
    assert.ok(browserCalls.length > 0);
    const diagnostics = await client.callTool({ name: 'dock_diagnostics', arguments: {} });
    assert.notEqual(diagnostics.isError, true, JSON.stringify(diagnostics));
    assert.equal(JSON.parse(diagnostics.content[0].text).connection, null);
    assert.deepEqual(reads, []);
  } finally { await client.close(); await bridge.close(); }
});
