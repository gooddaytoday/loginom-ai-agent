import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {ToolSchema} from '@modelcontextprotocol/sdk/types.js';
import {createConnection} from '@playwright/mcp';
import {RECOVERY_BROWSER_TOOLS, browserRecoveryTool, recoveryBrowserCatalog, admitRecoveryBrowserCall} from '../lib/browser-recovery.mjs';

async function pinnedBrowserTools() {
  const server = await createConnection({capabilities: ['core', 'vision'], snapshot: {mode: 'none'}}, async () => {
    throw Error('no browser');
  });
  const client = new Client({name: 'recovery-catalog-test', version: '1'});
  const [agentTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(agentTransport);
    return (await client.listTools()).tools;
  } finally {
    await client.close();
    await server.close();
  }
}

test('publishes exactly the 16 recovery tools from pinned MCP without filename', async () => {
  const browserTools = await pinnedBrowserTools();
  const published = recoveryBrowserCatalog(browserTools);
  assert.deepEqual(RECOVERY_BROWSER_TOOLS, [
    'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_click',
    'browser_hover', 'browser_type', 'browser_press_key', 'browser_fill_form',
    'browser_select_option', 'browser_drag', 'browser_mouse_click_xy',
    'browser_mouse_move_xy', 'browser_mouse_drag_xy', 'browser_mouse_wheel',
    'browser_handle_dialog', 'browser_wait_for',
  ]);
  assert.equal(Object.isFrozen(RECOVERY_BROWSER_TOOLS), true);
  assert.deepEqual(published.map(tool => tool.name).sort(), [...RECOVERY_BROWSER_TOOLS].sort());
  for (const tool of published) {
    assert.deepEqual(Object.keys(tool.inputSchema.properties).filter(key => key !== 'filename').sort(),
      Object.keys(browserTools.find(original => original.name === tool.name).inputSchema.properties).filter(key => key !== 'filename').sort());
    assert.equal('filename' in tool.inputSchema.properties, false);
  }
  assert.deepEqual(Object.keys(published.find(tool => tool.name === 'browser_snapshot').inputSchema.properties).sort(), ['boxes', 'depth', 'target']);
  assert.equal('filename' in browserTools.find(tool => tool.name === 'browser_snapshot').inputSchema.properties, true);
  assert.deepEqual(published.find(tool => tool.name === 'browser_take_screenshot').inputSchema.required, ['scale']);
  assert.deepEqual(Object.keys(published.find(tool => tool.name === 'browser_find').inputSchema.properties).sort(), ['regex', 'text']);
  assert.equal(browserRecoveryTool.name, 'dock_browser_recovery');
  assert.doesNotThrow(() => ToolSchema.parse(browserRecoveryTool));
  assert.equal(browserRecoveryTool.inputSchema.oneOf.length, 3);
  for (const branch of browserRecoveryTool.inputSchema.oneOf) assert.equal(branch.additionalProperties, false);
  assert.deepEqual(browserRecoveryTool.inputSchema.oneOf.map(branch => branch.properties.action.const), ['start', 'finish', 'stop']);
  assert.deepEqual(browserRecoveryTool.inputSchema.oneOf.map(branch => branch.required),
    [['action', 'operation_id'], ['action', 'report'], ['action', 'reason']]);
  assert.equal(browserRecoveryTool.inputSchema.oneOf[2].properties.reason.maxLength, 1000);
  assert.deepEqual(browserRecoveryTool.inputSchema.oneOf.find(branch => branch.properties.action.const === 'finish').properties.report,
    {type: 'object', additionalProperties: false, required: ['actions', 'result', 'settings'], properties: {
      actions: {type: 'array', maxItems: 30, items: {type: 'string', maxLength: 500}},
      result: {type: 'string', maxLength: 2000},
      settings: {type: 'array', maxItems: 50, items: {type: 'string', maxLength: 500}},
    }});
});

test('refuses a pinned catalog missing any recovery tool', async () => {
  const browserTools = await pinnedBrowserTools();
  for (const name of RECOVERY_BROWSER_TOOLS) {
    assert.throws(() => recoveryBrowserCatalog(browserTools.filter(tool => tool.name !== name)),
      error => error.message.includes(name));
  }
});

test('refuses forbidden tool names and unpublished arguments before a browser call', async () => {
  const browserTools = await pinnedBrowserTools();
  const published = recoveryBrowserCatalog(browserTools);
  for (const tool of browserTools.filter(tool => !RECOVERY_BROWSER_TOOLS.includes(tool.name))) {
    assert.throws(() => admitRecoveryBrowserCall(tool.name, {}, published), /BROWSER_RECOVERY_TOOL_FORBIDDEN/);
  }
  for (const name of ['browser_press_sequentially', 'browser_check', 'browser_uncheck', 'browser_webmcp_anything']) {
    assert.throws(() => admitRecoveryBrowserCall(name, {}, published), /BROWSER_RECOVERY_TOOL_FORBIDDEN/);
  }
  assert.throws(() => admitRecoveryBrowserCall('browser_find', {text: 'Node'},
    published.filter(tool => tool.name !== 'browser_find')), /BROWSER_RECOVERY_TOOL_FORBIDDEN/);
  for (const tool of published) {
    assert.throws(() => admitRecoveryBrowserCall(tool.name, {unpublished: true}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  }
  assert.throws(() => admitRecoveryBrowserCall('browser_snapshot', {filename: 'page.yml'}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.throws(() => admitRecoveryBrowserCall('browser_take_screenshot', {filename: 'page.png', scale: 'css'}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.throws(() => admitRecoveryBrowserCall('browser_take_screenshot', {}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.throws(() => admitRecoveryBrowserCall('browser_take_screenshot', {scale: 'large'}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.throws(() => admitRecoveryBrowserCall('browser_snapshot', null, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.deepEqual(admitRecoveryBrowserCall('browser_snapshot', {target: 'e12', depth: 3}, published), {target: 'e12', depth: 3});
  assert.deepEqual(admitRecoveryBrowserCall('browser_find', {text: 'Node'}, published), {text: 'Node'});
  assert.deepEqual(admitRecoveryBrowserCall('browser_find', {regex: '/node/i'}, published), {regex: '/node/i'});
  assert.deepEqual(admitRecoveryBrowserCall('browser_take_screenshot', {scale: 'css'}, published), {scale: 'css'});
});
