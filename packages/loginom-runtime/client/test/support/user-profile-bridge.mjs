import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createArtifactStore } from '../../lib/artifacts.mjs';
import { createBundledSkillFixture } from './bundled-skill-fixture.mjs';
import { createActionCatalogFixture } from './action-catalog-fixture.mjs';

test('managed user preparation returns local pins and dynamic knowledge without static workflow instructions', async t => {
  const resources = await createBundledSkillFixture(t);
  const directory = await mkdtemp(join(tmpdir(), 'loginom-user-bridge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const compatibility = { profile_id: 'unit-linux-chromium', loginom_build: '7.4.2', platform: 'linux', browser: 'chromium' };
  const catalog = await createActionCatalogFixture(compatibility);
  class ExternalClient {
    constructor(identity) { this.browser = identity.name === 'loginom-dock-browser'; }
    async connect(transport) { this.transport = transport; }
    async close() { this.transport?.onclose?.(); }
    async listTools() { return { tools: [{ name: this.browser ? 'browser_run_code_unsafe' : 'read', inputSchema: { type: 'object' } }] }; }
    async callTool(request) {
      if (!this.browser) {
        assert.equal(request.name, 'read');
        const text = catalog.files.get(request.arguments.uris[0]);
        assert.equal(typeof text, 'string');
        return { content: [{ type: 'text', text }] };
      }
      assert.equal(request.name, 'browser_run_code_unsafe');
      const code = request.arguments.code;
      const output = code.includes('async function prepareWorkspace(')
        ? { status: 'READY', target: compatibility, authenticated: true, created_draft: true,
          effect_possible: true, document_id: 'fixture-document', target_verified: true,
          package_ref: { path: null, persisted: false },
          workflow_ref: { tab_tid: 'fixture-tab', prefix: 'fixture-prefix', workflow_id: 'fixture-workflow', navigation_path: [] } }
        : { version: 1, source: 'prepare_same_browser_page', observed: { document_id: 'fixture-document' }, fixture: true };
      assert.ok(code.includes('async function prepareWorkspace(') || code.includes('async function observeGeometry('));
      return { content: [{ type: 'text', text: JSON.stringify(output) }] };
    }
  }
  class ExternalTransport {}
  mock.module('@modelcontextprotocol/sdk/client/index.js', { namedExports: { Client: ExternalClient } });
  mock.module('@modelcontextprotocol/sdk/client/stdio.js', { namedExports: { StdioClientTransport: ExternalTransport, getDefaultEnvironment: () => ({}) } });
  mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', { namedExports: { StreamableHTTPClientTransport: ExternalTransport } });
  const { createBridge } = await import('../../lib/bridge.mjs');
  const session = { directory, browserCli: '/external/browser', browserConfig: '/external/config', browserRoot: '/external/browsers',
    artifactStore: await createArtifactStore({ directory: join(directory, 'input') }),
    metadata: { client: 'unit-test', clientRevision: 'd'.repeat(64), sessionId: 'user-session' }, async save() {} };
  const config = { resources: resources.resources, endpoint: 'https://dock.invalid/mcp', apiKey: 'UNIT-NONSECRET',
    loginomUrl: 'https://loginom.invalid/?testable=true', mode: 'executor-replay', resultProfile: 'user-v1',
    actionManifestUri: catalog.manifestUri, actionManifestSha256: catalog.manifestSha256 };
  const bridge = await createBridge(config, session);
  const client = new Client({ name: 'unit-agent', version: '1' });
  try {
    const [agent, server] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(agent), bridge.server.connect(server)]);
    const reply = await client.callTool({ name: 'dock_prepare', arguments: {} });
    assert.notEqual(reply.isError, true, JSON.stringify(reply));
    assert.equal(reply.content.length, 1);
    const result = JSON.parse(reply.content[0].text);
    assert.equal(result.prepared, true);
    assert.equal(result.result_version, 'user-v1');
    assert.equal(result.source, 'bundled');
    assert.match(result.skillRevision, /^[a-f0-9]{64}$/);
    assert.equal(session.metadata.skillPath, resources.directory);
    assert.equal(Object.hasOwn(result, 'instructions'), false);
    assert.deepEqual(result.input_artifacts, []);
    assert.ok(result.knowledge.node_types.length > 0);
    assert.ok(result.knowledge.actions.some(action => action.action_key === 'package.save_checkpoint'));
  } finally { await client.close(); await bridge.close(); }
});
