import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  class ExternalClient {
    constructor(identity) { this.browser = identity.name === 'loginom-dock-browser'; }
    async connect(transport) { this.transport = transport; }
    async close() { this.transport?.onclose?.(); }
    async listTools() {
      return { tools: (this.browser ? ['browser_run_code_unsafe'] : ['read']).map(name => ({ name, inputSchema: { type: 'object' } })) };
    }
    async callTool(request) {
      reads.push(request.arguments?.uris?.[0]);
      return { content: [{ type: 'text', text: served.files.get(request.arguments?.uris?.[0]) ?? '' }] };
    }
  }
  class ExternalTransport {}
  t.mock.module('@modelcontextprotocol/sdk/client/index.js', { namedExports: { Client: ExternalClient } });
  t.mock.module('@modelcontextprotocol/sdk/client/stdio.js', { namedExports: { StdioClientTransport: ExternalTransport, getDefaultEnvironment: () => ({}) } });
  t.mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', { namedExports: { StreamableHTTPClientTransport: ExternalTransport } });
  const { createBridge } = await import('../../lib/bridge.mjs');
  const session = { directory, browserCli: '/external/browser', browserConfig: '/external/config', browserRoot: '/external/browsers',
    artifactStore: await createArtifactStore({ directory: join(directory, 'input') }),
    metadata: { client: 'unit-test', clientRevision: 'd'.repeat(64), sessionId: 'user-session' }, async save() {} };
  const release = JSON.parse(await readFile(new URL('../../../../product/loginom-release.json', import.meta.url), 'utf8'));
  const config = { resources: resources.resources, endpoint: 'https://dock.invalid/mcp', apiKey: 'UNIT-NONSECRET',
    loginomUrl: 'https://loginom.invalid/?testable=true', mode: 'executor-replay', resultProfile: 'user-v1',
    actionManifestUri: release.actionManifestUri, actionManifestSha256: release.actionManifestSha256, bundledCatalog: true };
  const options = () => ({ browserTransport: new ExternalTransport() });
  await assert.rejects(createBridge({ ...config, bundledCatalog: 'true' }, session, options()), /Invalid bundled action catalog policy/);
  await assert.rejects(createBridge({ ...config, mode: 'executor-preview' }, session, options()), /Invalid bundled action catalog policy/);
  await assert.rejects(createBridge({ ...config, actionManifestUri: served.manifestUri, actionManifestSha256: served.manifestSha256 },
    session, options()), /is not bundled/);
  const bridge = await createBridge(config, session, options());
  try {
    assert.equal(session.metadata.actionManifestDigest, release.actionManifestSha256);
    assert.equal(session.metadata.catalogLifecycleStatus, 'candidate');
    assert.deepEqual(reads, []);
  } finally { await bridge.close(); }
});
