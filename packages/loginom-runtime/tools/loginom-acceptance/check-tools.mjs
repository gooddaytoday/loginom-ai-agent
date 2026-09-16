#!/usr/bin/env node
// MCP initialize/list_tools only. No model, prepare, browser action, or UI call.
import { readFile, readdir } from 'node:fs/promises';
import { Client } from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const selected = config.mcp_servers['loginom-dock'];
const stateDir = selected.args[selected.args.indexOf('--state-dir') + 1];
if (!selected.args.includes('--state-dir')) throw new Error('Explicit state directory required');
const sessionsDir = join(stateDir, 'sessions');
const before = new Set(await readdir(sessionsDir).catch(() => []));
let output;
const client = new Client({ name: 'loginom-acceptance-tool-precheck', version: '1' });
const transport = new StdioClientTransport({ command: selected.command, args: selected.args,
  env: { ...getDefaultEnvironment(), ...selected.env }, stderr: 'pipe' });
transport.stderr?.on('data', () => {});
try {
  await client.connect(transport, { timeout: 180000 });
  const names = new Set(); let cursor;
  do {
    const result = await client.listTools(cursor ? { cursor } : {});
    result.tools.forEach(tool => names.add(tool.name)); cursor = result.nextCursor;
  } while (cursor);
  const required = ['dock_prepare','dock_action_describe','dock_action_run','dock_workspace_observe',
    'dock_operation_inspect','dock_operation_recover','dock_ui_action','find','read','grep','glob'];
  const missing = required.filter(name => !names.has(name));
  output = { available: missing.length === 0, required, missing, tools: [...names].sort(),
    scope: 'MCP initialize/list_tools only; no model, prepare or browser actions' };
  if (missing.length) process.exitCode = 1;
} catch {
  output = { available: false, error: 'MCP_TOOL_PRECHECK_FAILED',
    scope: 'MCP initialize/list_tools only; no model, prepare or browser actions' };
  process.exitCode = 1;
} finally {
  const pid = transport.pid;
  await client.close().catch(() => {});
  try {
    const added = (await readdir(sessionsDir)).filter(id => !before.has(id));
    if (added.length !== 1) throw new Error('Unique precheck session required');
    const sessionId = added[0], dir = join(sessionsDir, sessionId);
    const originBytes = await readFile(join(dir, 'mcp-origin.json'));
    const origin = JSON.parse(originBytes);
    if (origin.pid !== pid || origin.session_id !== sessionId || origin.closed !== true
        || origin.initialized_client !== 'loginom-acceptance-tool-precheck/1'
        || origin.overflow !== false || origin.methods[0] !== 'initialize'
        || origin.methods.filter(x => x === 'initialize').length !== 1
        || !origin.methods.includes('tools/list')
        || origin.methods.some(x => !['initialize','notifications/initialized','tools/list'].includes(x)))
      throw new Error('Precheck protocol origin unverified');
    output.provenance = { version: 1, session_id: sessionId, pid,
      origin_sha256: createHash('sha256').update(originBytes).digest('hex'),
      metadata_sha256: createHash('sha256').update(await readFile(join(dir, 'session.json'))).digest('hex') };
  } catch { output.available = false; output.error = 'MCP_PRECHECK_ORIGIN_UNVERIFIED'; process.exitCode = 1; }
  process.stdout.write(JSON.stringify(output) + '\n');
}
