import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createArtifactStore } from '../../lib/artifacts.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client as ProtocolClient } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as actionCatalog from '../../lib/action-catalog.mjs';
import * as skill from '../../lib/skill.mjs';
import * as workspace from '../../lib/workspace.mjs';
import { actions, selectors, build, Page, nodeParameters } from './executor-fixture.mjs';

// Exercise the actual bridge request handler and MCP Server/Client protocol.
// Only external services, catalog delivery and browser transport are replaced;
// no localhost listener, real browser, credentials or model is involved.
test('MCP application refusals remain typed normal content and the same connection can create a node afterwards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-bridge-contract-'));
  const page = new Page(); let browserCalls = 0;
  const compatibility = { profile_id: 'unit-macos-chromium', loginom_build: build, platform: 'macos', browser: 'chromium' };
  const pinned = { actions, selectors, pins: {}, compatibility, manifest: { compatibility } };
  class ExternalClient {
    constructor(identity) { this.browser = identity.name === 'loginom-dock-browser'; }
    async connect(transport) { this.transport = transport; }
    async close() { this.transport?.onclose?.(); }
    async listTools() { return { tools: [{ name: this.browser ? 'browser_run_code_unsafe' : 'read', inputSchema: { type: 'object', additionalProperties: true } }] }; }
    async callTool(request) {
      assert.equal(this.browser, true);
      assert.equal(request.name, 'browser_run_code_unsafe');
      browserCalls++;
      const code = request.arguments.code;
      const output = code.includes('async function prepareWorkspace(')
        ? { status: 'READY', target: compatibility, authenticated: true, created_draft: true, effect_possible: true, document_id: 'fixture-document', target_verified: true, package_ref: {path:null,persisted:false}, workflow_ref: { tab_tid: page.tabTid, prefix: page.prefix, workflow_id: 'fixture-workflow', navigation_path: [] } }
        : code.includes('async function observeGeometry(')
        ? { version:1, source:'prepare_same_browser_page', observed:{document_id:'fixture-document'}, fixture:true }
        : await page.execute(code);
      return { content: [{ type: 'text', text: JSON.stringify(output) }] };
    }
  }
  let browserEnvironment;
  class ExternalTransport { constructor(options) { if (options?.env) browserEnvironment = options.env; } }
  mock.module('@modelcontextprotocol/sdk/client/index.js', { namedExports: { Client: ExternalClient } });
  mock.module('@modelcontextprotocol/sdk/client/stdio.js', { namedExports: { StdioClientTransport: ExternalTransport, getDefaultEnvironment: () => ({}) } });
  mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', { namedExports: { StreamableHTTPClientTransport: ExternalTransport } });
  mock.module(new URL('../../lib/action-catalog.mjs', import.meta.url).href, { namedExports: { ...actionCatalog, pinActionCatalog: async () => pinned } });
  // The external browser fixture represents the pinned Mac target even when
  // this protocol test runs on the Linux build host. Keep real preparation and
  // target validation; supply only that explicit simulated client platform.
  mock.module(new URL('../../lib/workspace.mjs', import.meta.url).href, { namedExports: { ...workspace,
    makeWorkspacePrepareCode: options => workspace.makeWorkspacePrepareCode({ ...options, platform: 'darwin' }),
  } });
  mock.module(new URL('../../lib/skill.mjs', import.meta.url).href, { namedExports: { ...skill,
    skillTransport: () => ({}), createSkillLoader: () => ({ prepare: async () => ({ main: '/unit/skill', directory: '/unit/skill',
      detail: { revision: 'unit-skill', source: 'unit-source', content: 'Legacy skill context without the new recovery tools.' } }) }),
  } });
  const { createBridge } = await import('../../lib/bridge.mjs');
  const session = { directory, browserCli: '/unit/browser.mjs', browserConfig: '/unit/browser.json', browserRoot: '/unit/browser',
    metadata: { client: '0.1.0-test', clientRevision: 'd'.repeat(64), sessionId: 'unit-bridge-session' }, async save() {} };
  const config = { endpoint: 'https://dock.invalid/mcp', apiKey: 'UNIT-NONSECRET', loginomUrl: 'https://loginom.invalid/?testable=true', mode: 'executor-replay' };
  let bridge, client;
  try {
    session.artifactStore=await createArtifactStore({directory:join(directory,'input')});
    const sourcePath=join(directory,'private-source.csv');await writeFile(sourcePath,'abc');
    const admitted=await session.artifactStore.admit({sourcePath,name:'sales.csv',bytes:3,
      sha256:createHash('sha256').update('abc').digest('hex')});
    bridge = await createBridge(config, session);
    for (const key of ['DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP']) {
      if (process.platform === 'linux' && process.env[key] && !process.env[key].startsWith('()'))
        assert.equal(browserEnvironment[key], process.env[key]);
      else assert.equal(Object.hasOwn(browserEnvironment, key), false);
    }
    assert.equal(browserEnvironment.PLAYWRIGHT_BROWSERS_PATH, session.browserRoot);
    assert.equal(browserEnvironment.DOCK_TEST_SECRET, undefined);
    client = new ProtocolClient({ name: 'test-agent', version: '1.0.0' });
    const [agentTransport, bridgeTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([bridge.server.connect(bridgeTransport), client.connect(agentTransport)]);
    const listed = await client.listTools();
    assert.ok(listed.tools.some(tool => tool.name === 'dock_operation_recover'));
    assert.ok(listed.tools.some(tool => tool.name === 'dock_artifact_upload'));
    assert.ok(listed.tools.some(tool => tool.name === 'dock_artifact_verify'));
    for(const name of ['dock_node_apply','dock_node_resume','dock_node_status','dock_node_wait','dock_node_cancel','dock_node_stop',
      'dock_artifact_deliver','dock_artifact_delivery_status','dock_artifact_delivery_resume'])
      assert.ok(listed.tools.some(tool=>tool.name===name),name);
    const rejectedVerify=await client.callTool({name:'dock_artifact_verify',arguments:{operation_id:'u',verification_id:'v',
      observation_id:'o',file_ref:'r',download_path:'/private/replaced'}});
    assert.equal(JSON.parse(rejectedVerify.content[0].text).error.code,'REQUEST_REJECTED');
    assert.equal(browserCalls,0);
    const rejectedUpload=await client.callTool({name:'dock_artifact_upload',arguments:{artifact_id:'a',upload_grant_id:'g',
      observation_id:'o',operation_id:'u',destination:'/other'}});
    assert.equal(JSON.parse(rejectedUpload.content[0].text).error.code,'REQUEST_REJECTED');
    assert.equal(browserCalls,0);
    const available = await client.callTool({ name: 'dock_action_describe', arguments: {} });
    assert.notEqual(available.isError, true);
    assert.deepEqual(JSON.parse(available.content[0].text).available_actions, ['node.add', 'link.create', 'package.save_as', 'node.configure_text_import', 'package.save_checkpoint']);
    assert.equal(browserCalls, 0);

    const bootstrap = await client.callTool({ name: 'dock_workspace_observe', arguments: { scope: 'bootstrap' } });
    const initial = JSON.parse(bootstrap.content[0].text);
    assert.equal(initial.status, 'SUCCEEDED');
    assert.equal(initial.output.bootstrap, true);
    assert.equal(initial.effect_possible, false);
    assert.equal(browserCalls, 1);
    assert.equal(session.metadata.workspaceReady, undefined);
    assert.equal(session.metadata.archiveActive, undefined);
    assert.equal(page.drops, 0);
    const premature = await client.callTool({ name: 'dock_workspace_observe', arguments: { scope: 'graph' } });
    assert.equal(JSON.parse(premature.content[0].text).status, 'FAILED');
    assert.equal(browserCalls, 1);

    const invalidPreparation = await client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:'../bad.lgp'}});
    assert.equal(invalidPreparation.isError,true);
    assert.equal(session.metadata.workspacePreparation,undefined);
    assert.equal(browserCalls,1);
    const prepared = await client.callTool({ name: 'dock_prepare', arguments: {} });
    assert.notEqual(prepared.isError, true);
    const metadata = JSON.parse(prepared.content[0].text);
    assert.equal(metadata.prepared, true);
    assert.equal(metadata.workspace.browser_geometry.source,'prepare_same_browser_page');
    assert.deepEqual(metadata.input_artifacts,[admitted]);
    assert.equal(JSON.stringify(metadata.input_artifacts).includes(sourcePath),false);
    assert.deepEqual(metadata.executor.available_actions, ['node.add', 'link.create', 'package.save_as', 'node.configure_text_import', 'package.save_checkpoint']);
    assert.ok(prepared.content.some(block => block.type === 'text' && block.text.includes('dock_ui_action') && block.text.includes('supersede')));
    const beforeInvalid = browserCalls;
    assert.ok(metadata.executor.candidate_operation_tools.includes('dock_node_apply'));
    assert.ok(metadata.executor.candidate_operation_tools.includes('dock_artifact_deliver'));
    const cards=await client.callTool({name:'dock_action_describe',arguments:{node_types:['imports.text','transform.calculator']}});
    const nodeCards=JSON.parse(cards.content[0].text).node_types;
    assert.equal(nodeCards[0].candidate_node_apply_available,true);
    assert.equal(nodeCards[0].full_node_apply_available,false);
    assert.equal(nodeCards[1].candidate_node_apply_available,true);
    assert.equal(nodeCards[1].full_node_apply_available,false);
    assert.deepEqual(nodeCards[1].parameter_schema.required,['expressions']);
    for(const [name,args] of [['dock_node_apply',{}],['dock_node_wait',{operation_id:'missing',timeout_ms:0}],
      ['dock_artifact_deliver',{operation_id:'test',artifact_id:admitted.artifact_id,upload_grant_id:'missing',budget_ms:1000}]]) {
      const response=await client.callTool({name,arguments:args});
      assert.equal(JSON.parse(response.content[0].text).request_rejected,true);
    }
    assert.equal(browserCalls,beforeInvalid);
    for (const key of ['canvas.add_node', 'node.rename', 'workflow.create']) {
      const response = await client.callTool({ name: 'dock_action_run', arguments: { action_key: key, parameters: {} } });
      assert.notEqual(response.isError, true);
      const outcome = JSON.parse(response.content[0].text);
      assert.equal(outcome.status, 'FAILED');
      assert.equal(outcome.error.code, 'REQUEST_REJECTED');
      assert.equal(outcome.request_rejected, true);
      assert.equal(outcome.effect_possible, false);
      assert.equal(response.content.length, 2);
      assert.equal(response.content[1].type, 'text');
      assert.equal(Object.hasOwn(outcome, 'knowledge_context'), false);
      assert.deepEqual(outcome.output.available_actions, ['node.add', 'link.create', 'package.save_as', 'node.configure_text_import', 'package.save_checkpoint']);
    }
    assert.equal(browserCalls, beforeInvalid);
    const succeeded = await client.callTool({ name: 'dock_action_run', arguments: { action_key: 'node.add', parameters: nodeParameters, operation_id: 'after-three-refusals' } });
    assert.notEqual(succeeded.isError, true);
    assert.equal(JSON.parse(succeeded.content[0].text).status, 'SUCCEEDED');
    assert.equal(succeeded.content.length, 2);
    const verification = JSON.parse(succeeded.content[1].text);
    assert.equal(verification.kind, 'dock_outcome_verification');
    assert.equal(verification.operation_id, 'after-three-refusals');
    assert.equal(verification.domain_effect.state, 'verified');
    assert.equal(verification.goal.state, 'not_verified');
    assert.equal(page.drops, 1);
    assert.deepEqual(page.nodes.map(node => node.label), ['Источник']);
    const observed = await client.callTool({ name: 'dock_workspace_observe', arguments: { scope: 'roots' } });
    const observedReceipt = JSON.parse(observed.content[0].text);
    const observedUsage = JSON.parse(observed.content[1].text);
    assert.equal(observedReceipt.status, 'SUCCEEDED');
    assert.equal(observedUsage.kind, 'dock_observation_usage');
    assert.equal(observedUsage.observation_id, observedReceipt.output.observation_id);
    assert.notEqual(observedUsage.observation_id, observedReceipt.operation_id);
    assert.equal(JSON.parse(observed.content[2].text).kind, 'dock_outcome_verification');
    for (const args of observedUsage.root_read_arguments ?? []) {
      assert.ok(observedReceipt.output.ui.elements.some(e => e.ref === args.root_ref && e.kind === 'region' && e.allowed_actions.length === 0));
      assert.equal(args.observation_id, observedReceipt.output.observation_id);
    }
  } finally {
    await client?.close();
    await bridge?.close();
    mock.restoreAll();
    await rm(directory, { recursive: true, force: true });
  }
});
