import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createArtifactStore } from '../../lib/artifacts.mjs';
import { createBundledSkillFixture, refreshSkillFixtureManifest } from './bundled-skill-fixture.mjs';

class ExternalClient {
  constructor(identity) { this.browser = identity.name === 'loginom-dock-browser'; }
  async connect(transport) { this.transport = transport; }
  async close() { this.transport?.onclose?.(); }
  async listTools() { return { tools: [{ name: this.browser ? 'browser_run_code_unsafe' : 'read', inputSchema: { type: 'object' } }] }; }
  async callTool() { throw Error('Classic preparation must not request a remote skill or browser operation'); }
}
class ExternalTransport {}
mock.module('@modelcontextprotocol/sdk/client/index.js', { namedExports: { Client: ExternalClient } });
mock.module('@modelcontextprotocol/sdk/client/stdio.js', { namedExports: { StdioClientTransport: ExternalTransport, getDefaultEnvironment: () => ({}) } });
mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', { namedExports: { StreamableHTTPClientTransport: ExternalTransport } });
const { createBridge } = await import('../../lib/bridge.mjs');

for (const missing of [false, true]) test(`classic local prepare with required reference ${missing ? 'missing' : 'present'}`, async t => {
  const resources = await createBundledSkillFixture(t);
  if (missing) {
    await rm(join(resources.directory, 'references/workflow.md'));
    await refreshSkillFixtureManifest(resources.resources);
  }
  const directory = await mkdtemp(join(tmpdir(), 'loginom-classic-skill-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const session = { directory, browserCli: '/external/browser', browserConfig: '/external/config', browserRoot: '/external/browsers',
    artifactStore: await createArtifactStore({ directory: join(directory, 'input') }),
    metadata: { client: 'unit-test', clientRevision: 'd'.repeat(64), sessionId: 'classic-session' }, async save() {} };
  const bridge = await createBridge({ resources: resources.resources, endpoint: 'https://dock.invalid/mcp',
    apiKey: 'UNIT-NONSECRET', mode: 'classic' }, session);
  const client = new Client({ name: 'unit-agent', version: '1' });
  try {
    const [agent, server] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(agent), bridge.server.connect(server)]);
    assert.match(client.getInstructions(), /activate.*loginom-automation/i);
    assert.match(client.getInstructions(), /Help, diagnostics, and package reports do not require/i);
    const reply = await client.callTool({ name: 'dock_prepare', arguments: {} });
    if (missing) {
      assert.equal(reply.isError, true);
      assert.match(JSON.stringify(reply), /LOGINOM_SKILL_REQUIRED_RESOURCE_MISSING/);
      return;
    }
    assert.notEqual(reply.isError, true, JSON.stringify(reply));
    assert.equal(reply.content.length, 1);
    const result = JSON.parse(reply.content[0].text);
    assert.equal(result.prepared, true);
    assert.equal(result.source, 'bundled');
    assert.match(result.skillRevision, /^[a-f0-9]{64}$/);
    assert.equal(result.skillPath, resources.directory);
    assert.equal(Object.hasOwn(result, 'instructions'), false);
  } finally { await client.close(); await bridge.close(); }
});
