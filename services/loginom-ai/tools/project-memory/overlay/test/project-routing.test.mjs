import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, realpathSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Adapter, CAPABILITY, resolveContext, routeCall } from '../adapter.mjs';
import { deriveWorkspacePeerId } from '../vendor/workspace-peer.mjs';
import { validateProjectRouting, loadProjectRouting, resolveProjectRoute, makeRoutingReceipt,
  routingReceiptPath, readRouteReceipt, readMappedState, activationPath, DEFAULT_LEGACY_STATE_DIR } from '../project-routing.mjs';

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'project-memory-routing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const projectRoot = join(root, 'project'), pluginRoot = join(root, 'plugin');
  const stateDir = join(root, 'state');
  for (const path of [projectRoot, pluginRoot, stateDir, join(stateDir, 'routing-receipts'), join(stateDir, 'routing-activations'),
    join(pluginRoot, '.codex-plugin'), join(pluginRoot, 'hooks'), join(pluginRoot, 'scripts')]) mkdirSync(path, { mode: 0o700 });
  writeFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ version: '0.8.1' }));
  writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), '{}');
  for (const name of ['session-start-commit', 'auto-recall', 'auto-capture', 'pre-compact-capture', 'session-end', 'config'])
    writeFileSync(join(pluginRoot, 'scripts', `${name}.mjs`), '// fixture\n');
  const workspaces = [11,12,13,14].map(n => { const path = join(projectRoot, `node-${n}`); mkdirSync(path); return path; });
  const raw = { version: 1, projects: [{ projectRoot, workspaces, pluginRoot, stateDir, generation: '20260913.1' }] };
  const configPath = join(root, 'routing.json');
  const saveConfig = value => writeFileSync(configPath, JSON.stringify(value), { mode: 0o600 });
  saveConfig(raw);
  const config = loadProjectRouting(configPath), route = config.projects[0];
  const meta = (n = 0) => ({ threadId: `node-${11+n}`, [CAPABILITY]: { sandboxCwd: pathToFileURL(workspaces[n]).href } });
  const context = n => ({ threadId: `node-${11+n}`, cwd: workspaces[n] });
  const statePath = n => join(stateDir, `${context(n).threadId}.json`);
  const receiptPath = n => routingReceiptPath(route, context(n).threadId);
  const state = n => ({ codexSessionId: context(n).threadId, workspacePeerId: '', ovSessionId: `cx-${context(n).threadId}`, capturedTurnCount: 4 });
  for (let n = 0; n < 4; n++) {
    writeFileSync(statePath(n), JSON.stringify(state(n)), { mode: 0o600 });
    writeFileSync(receiptPath(n), JSON.stringify(makeRoutingReceipt(context(n), route)), { mode: 0o600 });
    writeFileSync(activationPath(context(n), route), JSON.stringify({ version: 1, ...context(n), routeHash: route.routeHash,
      generation: route.generation, sourceStateDir: DEFAULT_LEGACY_STATE_DIR, originalStateRetired: true,
      originalProjectHooksDisabled: true, verifiedAt: '2026-09-13T00:00:00Z', disablementMethod: 'project-hook-config' }), { mode: 0o600 });
  }
  return { root, projectRoot, workspaces, pluginRoot, stateDir, raw, config, route, configPath,
    saveConfig, meta, context, state, statePath, receiptPath };
}

test('four exact workspaces use one canonical memory Peer and four task sessions', t => {
  const f = fixture(t);
  const contexts = f.workspaces.map((_, n) => resolveContext(f.meta(n), undefined, f.config));
  assert.deepEqual(new Set(contexts.map(c => c.peerId)), new Set([deriveWorkspacePeerId(f.projectRoot)]));
  assert.equal(new Set(contexts.map(c => c.sessionId)).size, 4);
  for (const c of contexts) assert.equal(c.workspacePeerId, deriveWorkspacePeerId(c.cwd));
});

test('unmapped paths and subdirectories keep original workspace routing; no prefix widening', t => {
  const f = fixture(t);
  for (const cwd of [f.projectRoot, `${f.workspaces[0]}/subdir`, `${f.workspaces[0]}-other`, '/unrelated/project']) {
    assert.equal(resolveProjectRoute(cwd, f.config), null);
    const c = resolveContext({ threadId: 'new-task', [CAPABILITY]: { sandboxCwd: pathToFileURL(cwd).href } }, join(f.root, 'absent-state'), f.config);
    assert.equal(c.peerId, deriveWorkspacePeerId(cwd));
  }
});

test('protected mapping file optional when absent, fails on corrupt JSON, loose mode or symlink', t => {
  const f = fixture(t);
  assert.deepEqual(loadProjectRouting(join(f.root, 'missing.json')), { version: 1, projects: [] });
  chmodSync(f.configPath, 0o644); assert.throws(() => loadProjectRouting(f.configPath), /0600/);
  chmodSync(f.configPath, 0o600); writeFileSync(f.configPath, '{broken'); assert.throws(() => loadProjectRouting(f.configPath), /JSON/);
  f.saveConfig(f.raw);
  const link = join(f.root, 'link.json'); symlinkSync(f.configPath, link); assert.throws(() => loadProjectRouting(link), /regular|symlink/);
});

test('invalid routing cannot introduce arbitrary peers, wildcard/prefix paths, duplicate or foreign projects', t => {
  const f = fixture(t);
  const invalid = [
    { ...f.raw, actor_peer_id: 'global' },
    { version: 2, projects: [] },
    { version: 1, projects: [{ ...f.raw.projects[0], canonicalPeerId: 'foreign' }] },
    { version: 1, projects: [{ ...f.raw.projects[0], generation: '' }] },
    { version: 1, projects: [{ ...f.raw.projects[0], workspaces: [f.pluginRoot] }] },
    { version: 1, projects: [{ ...f.raw.projects[0], workspaces: [f.workspaces[0], f.workspaces[0]] }] },
    { version: 1, projects: [{ ...f.raw.projects[0], workspaces: [`${f.projectRoot}/*`] }] },
    { version: 1, projects: [{ ...f.raw.projects[0], workspaces: [`${f.projectRoot}/../project/node-11`] }] },
  ];
  for (const raw of invalid) assert.throws(() => validateProjectRouting(raw));
  chmodSync(f.stateDir, 0o755); assert.throws(() => validateProjectRouting(f.raw), /0700/);
});

test('symlink workspace or changed physical path cannot inherit an authorized route', t => {
  const f = fixture(t);
  const link = join(f.projectRoot, 'alias'); symlinkSync(f.workspaces[0], link);
  assert.throws(() => validateProjectRouting({ version: 1, projects: [{ ...f.raw.projects[0], workspaces: [link] }] }), /symlink/);
  rmSync(f.workspaces[0], { recursive: true }); symlinkSync(f.workspaces[1], f.workspaces[0]);
  assert.throws(() => resolveProjectRoute(f.workspaces[0], f.config), /symlink/);
});

test('receipt missing, loose mode, wrong thread/cwd/Peer/hash/plugin/generation fails closed', t => {
  const f = fixture(t), correct = makeRoutingReceipt(f.context(0), f.route);
  for (const [field, value] of Object.entries({ threadId: 'node-12', cwd: f.workspaces[1],
    workspacePeerId: 'foreign', effectivePeerId: 'foreign', routeHash: 'old',
    stateDir: f.pluginRoot, pluginRoot: f.projectRoot, generation: 'old' })) {
    writeFileSync(f.receiptPath(0), JSON.stringify({ ...correct, [field]: value }));
    assert.throws(() => resolveContext(f.meta(), undefined, f.config), /receipt/);
  }
  writeFileSync(f.receiptPath(0), JSON.stringify(correct)); chmodSync(f.receiptPath(0), 0o644);
  assert.throws(() => readRouteReceipt(f.context(0), f.route), /0600/);
  unlinkSync(f.receiptPath(0)); assert.throws(() => resolveContext(f.meta(), undefined, f.config), /missing/);
});

test('mapped state requires same task, unchanged nonnegative cursor and explicit-Peer state', t => {
  const f = fixture(t);
  for (const change of [{ codexSessionId: 'node-12' }, { workspacePeerId: deriveWorkspacePeerId(f.workspaces[0]) },
    { workspacePeerId: undefined }, { ovSessionId: 'cx-node-12' }, { capturedTurnCount: -1 }, { capturedTurnCount: 1.2 }]) {
    writeFileSync(f.statePath(0), JSON.stringify({ ...f.state(0), ...change }));
    assert.throws(() => readMappedState(f.context(0), f.route), /disagrees/);
  }
  writeFileSync(f.statePath(0), JSON.stringify({ ...f.state(0), ovSessionId: null }));
  assert.equal(resolveContext(f.meta(), undefined, f.config).sessionId, 'cx-node-11');
  chmodSync(f.statePath(0), 0o644); assert.throws(() => readMappedState(f.context(0), f.route), /0600/);
});

test('host metadata remains mandatory, model arguments cannot override route or broaden writes', t => {
  const f = fixture(t);
  for (const meta of [{}, { threadId: '../escape' }, { threadId: 'node-11', [CAPABILITY]: { sandboxCwd: 'https://invalid/' } }])
    assert.throws(() => resolveContext(meta, undefined, f.config), /Codex/);
  const ctx = resolveContext(f.meta(), undefined, f.config);
  const call = routeCall({ name: 'write', arguments: { uri: 'fixture', content: 'x', peerId: 'foreign', cwd: '/foreign', _meta: f.meta(1) } }, ctx);
  assert.equal(call.peerId, f.route.canonicalPeerId);
  assert.throws(() => routeCall({ name: 'write', arguments: { peer_scope: 'all' } }, ctx), /not writes/);
  assert.throws(() => routeCall({ name: 'search', arguments: { session_id: 'cx-node-12' } }, ctx), /different task/);
});

test('mapped calls require reviewed activation and reject duplicate original state or end markers', t => {
  const f = fixture(t), activationFile = activationPath(f.context(0), f.route);
  const activation = JSON.parse(readFileSync(activationFile, 'utf8'));
  writeFileSync(activationFile, JSON.stringify({ ...activation, originalProjectHooksDisabled: false }));
  assert.throws(() => resolveContext(f.meta(), undefined, f.config), /activation/);
  writeFileSync(activationFile, JSON.stringify(activation));
  chmodSync(join(f.stateDir, 'routing-activations'), 0o755);
  assert.throws(() => resolveContext(f.meta(), undefined, f.config), /0700/);
  chmodSync(join(f.stateDir, 'routing-activations'), 0o700);
  const legacy = join(f.root, 'legacy'); mkdirSync(legacy, { mode: 0o700 });
  writeFileSync(activationFile, JSON.stringify({ ...activation, sourceStateDir: legacy }));
  for (const suffix of ['.json', '.lock', '.ended.123456']) {
    const file = join(legacy, `node-11${suffix}`); writeFileSync(file, '{}');
    assert.throws(() => resolveContext(f.meta(), legacy, f.config), /original hook/);
    unlinkSync(file);
  }
  assert.equal(resolveContext(f.meta(), legacy, f.config).peerId, f.route.canonicalPeerId);
  unlinkSync(activationFile); assert.throws(() => resolveContext(f.meta(), legacy, f.config), /activation/);
});

test('changed official code invalidates loaded route and prior activation receipts', t => {
  const f = fixture(t);
  writeFileSync(join(f.pluginRoot, 'scripts', 'auto-capture.mjs'), '// changed\n');
  assert.throws(() => resolveProjectRoute(f.workspaces[0], f.config), /revision changed/);
  const changed = loadProjectRouting(f.configPath);
  assert.notEqual(changed.projects[0].routeHash, f.route.routeHash);
  assert.throws(() => resolveContext(f.meta(), undefined, changed), /activation/);
});

test('concurrent mapped read/write calls use common actor and distinct immutable MCP sessions', async t => {
  const f = fixture(t), sessions = new Map(), calls = [];
  let nextSession = 0;
  const fetchImpl = async (url, options) => {
    const result = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/health')) return result({ role: 'USER', account_id: 'fixture', user_id: 'tester' });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    const message = JSON.parse(options.body), peer = options.headers['X-OpenViking-Actor-Peer'] || '';
    if (message.method === 'initialize') {
      const sessionId = `s${++nextSession}`; sessions.set(sessionId, peer);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: {} } }),
        { headers: { 'content-type': 'application/json', 'mcp-session-id': sessionId } });
    }
    if (!Object.hasOwn(message, 'id')) return new Response(null, { status: 202 });
    const sid = options.headers['Mcp-Session-Id']; assert.equal(sessions.get(sid), peer);
    if (message.method === 'tools/list') return result({ jsonrpc: '2.0', id: message.id,
      result: { tools: ['read', 'write'].map(name => ({ name, inputSchema: { type: 'object', properties: {} } })) } });
    calls.push({ sid, peer, name: message.params.name });
    return result({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'fixture' }] } });
  };
  const adapter = new Adapter({ routing: () => f.config, fetchImpl,
    credentials: () => ({ baseUrl: 'https://fixture.invalid', apiKey: 'fixture', fingerprint: 'test', timeoutMs: 1000 }) });
  try {
    const replies = await Promise.all(f.workspaces.map((_, n) => adapter.handle({ jsonrpc: '2.0', id: n, method: 'tools/call',
      params: { name: n % 2 ? 'read' : 'write', arguments: { uri: 'fixture', content: 'test' }, _meta: f.meta(n) } })));
    replies.forEach(reply => assert.ok(reply.result, JSON.stringify(reply)));
    assert.equal(new Set(calls.map(call => call.sid)).size, 4);
    assert.deepEqual(new Set(calls.map(call => call.peer)), new Set([f.route.canonicalPeerId]));
  } finally { await adapter.close(); }
});
