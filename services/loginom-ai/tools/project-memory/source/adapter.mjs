import { Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenVikingMcpProxy } from './vendor/mcp-proxy-core.mjs';
import { resolveOpenVikingCredentials } from './vendor/credentials.mjs';
import { deriveWorkspacePeerId } from './vendor/workspace-peer.mjs';
import { loadProjectRouting, resolveProjectRoute, readRouteReceipt, readMappedState, validateActivation } from './project-routing.mjs';
import { loadEnrollment, requireEnrolledTask } from './enrollment-routing.mjs';

export const CAPABILITY = 'codex/sandbox-state-meta';
export const SCOPED_TOOLS = new Set(['find', 'search', 'read', 'list', 'tree', 'grep', 'glob']);
export class AdapterError extends Error {
  constructor(message, code = -32001) { super(message); this.code = code; }
}

export function resolveContext(meta, stateDir = join(homedir(), '.openviking', 'codex-plugin-state'), routing,
  enrollmentLoader = loadEnrollment, requireEnrollment = false) {
  const threadId = meta?.threadId;
  if (typeof threadId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(threadId))
    throw new AdapterError('Codex did not provide a valid host threadId.');
  let cwd;
  try {
    const uri = new URL(meta?.[CAPABILITY]?.sandboxCwd);
    if (uri.protocol !== 'file:' || uri.search || uri.hash) throw new Error();
    cwd = fileURLToPath(uri);
  } catch { throw new AdapterError('Codex did not provide a valid host sandboxCwd file URI.'); }
  const workspacePeerId = deriveWorkspacePeerId(cwd);
  try {
    const enrollment = enrollmentLoader(cwd);
    if (requireEnrollment && !enrollment) throw new AdapterError('Required project memory registration is missing.');
    const legacyRoute = resolveProjectRoute(cwd, routing ?? loadProjectRouting());
    if (enrollment && legacyRoute) throw new AdapterError('Workspace has conflicting memory routes.');
    requireEnrolledTask(enrollment, threadId);
    const route = enrollment?.route || legacyRoute;
    if (route) {
      const context = { threadId, cwd };
      validateActivation(context, route, stateDir);
      readRouteReceipt(context, route);
      const state = readMappedState(context, route);
      return { ...context, workspacePeerId, peerId: route.canonicalPeerId,
        sessionId: state.ovSessionId || `cx-${threadId}`, routeHash: route.routeHash };
    }
  } catch (error) { throw new AdapterError(error.message); }
  // Legacy helper compatibility only. The production entrypoint requires enrollment.
  let state;
  try { state = JSON.parse(readFileSync(join(stateDir, `${threadId}.json`), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new AdapterError('Invalid legacy task state.'); }
  if (state && (state.codexSessionId !== threadId || state.workspacePeerId !== workspacePeerId ||
    (state.ovSessionId && state.ovSessionId !== `cx-${threadId}`))) throw new AdapterError('Legacy task state disagrees with Codex.');
  return { threadId, cwd, workspacePeerId, peerId: workspacePeerId, sessionId: state?.ovSessionId || `cx-${threadId}` };
}

export function routeCall(params, context) {
  if (!params || typeof params.name !== 'string' || (params.arguments !== undefined &&
    (!params.arguments || typeof params.arguments !== 'object' || Array.isArray(params.arguments))))
    throw new AdapterError('Invalid tool parameters.', -32602);
  const args = { ...params.arguments };
  for (const key of ['peerId', 'peer_id', 'actor_peer_id', 'cwd', 'threadId', '_meta']) delete args[key];
  if (args.session_id && args.session_id !== context.sessionId)
    throw new AdapterError('Cannot use the session of a different task.');
  if (SCOPED_TOOLS.has(params.name)) {
    if (args.peer_scope !== undefined && !['actor', 'all'].includes(args.peer_scope))
      throw new AdapterError('Invalid peer_scope.', -32602);
    if (params.name === 'search') args.peer_scope ??= 'actor';
    else if (args.peer_scope === 'all') throw new AdapterError('Broad reads require the search tool.');
    else delete args.peer_scope;
  } else if (args.peer_scope !== undefined) {
    throw new AdapterError('peer_scope is supported for reads, not writes.');
  }
  if (params.name === 'search') args.session_id = context.sessionId;
  for (const key of ['uri', 'uris', 'target_uri', 'to', 'to_uri', 'parent', 'exclude_uris']) {
    for (const uri of [args[key]].flat().filter(value => typeof value === 'string')) {
      const peer = uri.match(/^viking:\/\/(?:user|agent)\/[^/]+\/peers\/([^/]+)/)?.[1];
      if (peer && peer !== context.peerId && !(params.name === 'search' && args.peer_scope === 'all'))
        throw new AdapterError('URI belongs to a different project Peer.');
      const session = uri.match(/^viking:\/\/session\/([^/]+)/)?.[1];
      if (session && session !== context.sessionId) throw new AdapterError('URI belongs to a different task session.');
    }
  }
  return { name: params.name, arguments: args, peerId: context.peerId };
}

export function loadCredentials() {
  const cfg = resolveOpenVikingCredentials();
  if (!cfg.apiKey) throw new AdapterError('OpenViking credentials are unavailable.');
  return { baseUrl: cfg.baseUrl, mcpUrl: cfg.mcpUrl, apiKey: cfg.apiKey, account: cfg.account,
    user: cfg.user, configuredPeer: cfg.peerId, timeoutMs: Number(process.env.OPENVIKING_TIMEOUT_MS) || 15000 };
}

// One immutable transport per credential identity + task + route. Never mutate
// process.env or reuse a transport after changing its actor/session identity.
function transport(cfg, peerId, fetchImpl) {
  const pending = new Map();
  let sequence = 0;
  const proxy = createOpenVikingMcpProxy({
    readConfig: () => ({ ...cfg, mcpUrl: cfg.mcpUrl || `${cfg.baseUrl.replace(/\/+$/, '')}/mcp`,
      peerId, watchedPaths: [], userAgent: 'loginom-project-memory/20260926.2' }),
    loggerFactory: () => ({ log() {}, logError() {} }), fetchImpl,
    stdout: new Writable({ write(chunk, encoding, done) {
      for (const line of chunk.toString().trim().split('\n')) {
        const reply = JSON.parse(line);
        pending.get(reply.id)?.(reply);
      }
      done();
    } }),
  });
  async function request(method, params) {
    const id = ++sequence;
    let reply;
    pending.set(id, value => { reply = value; });
    try {
      await proxy.handleMessage({ jsonrpc: '2.0', id, method, params });
      if (!reply || reply.error) throw new AdapterError('OpenViking transport request failed; no automatic write replay.', -32003);
      return reply.result;
    } finally { pending.delete(id); }
  }
  const ready = request('initialize', { protocolVersion: '2025-06-18', capabilities: {},
    clientInfo: { name: 'loginom-project-memory', version: '20260926.2' } }).then(() =>
    proxy.handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  return { ready, async request(method, params) { await ready; return request(method, params); },
    async close() { await ready.catch(() => {}); await proxy.closeSession(); } };
}

export class Adapter {
  constructor({ credentials = loadCredentials, stateDir, routing = loadProjectRouting, requireEnrollment = false,
    fetchImpl = globalThis.fetch, observe = () => {} } = {}) {
    this.load = credentials; this.stateDir = stateDir; this.routing = routing;
    this.requireEnrollment = requireEnrollment; this.fetch = fetchImpl; this.observe = observe;
    this.pools = new Map(); this.catalogs = new Map(); this.closed = false;
  }
  pool(cfg, context) {
    const key = createHash('sha256').update(JSON.stringify([cfg, context])).digest('hex');
    if (!this.pools.has(key)) {
      if (this.pools.size >= 64) throw new AdapterError('Adapter transport limit reached; restart at an idle boundary.');
      const pool = transport(cfg, context.peerId, this.fetch);
      this.pools.set(key, pool);
      pool.ready.catch(async () => {
        if (this.pools.get(key) === pool) this.pools.delete(key);
        await pool.close();
      });
    }
    return this.pools.get(key);
  }
  async catalog(cfg) {
    const key = createHash('sha256').update(JSON.stringify(cfg)).digest('hex');
    if (!this.catalogs.has(key)) {
      const catalog = (async () => {
        const tools = [], cursors = new Set();
        let cursor;
        do {
          const page = await this.pool(cfg, { catalog: true, peerId: '' }).request('tools/list', cursor ? { cursor } : {});
          if (!Array.isArray(page.tools) || tools.length > 1000) throw new AdapterError('Invalid tool catalog.');
          tools.push(...page.tools);
          if (page.nextCursor && (cursors.has(page.nextCursor) || cursors.size >= 32)) throw new AdapterError('Invalid catalog cursor.');
          cursor = page.nextCursor;
          if (cursor) cursors.add(cursor);
        } while (cursor);
        return tools;
      })();
      this.catalogs.set(key, catalog);
      catalog.catch(() => this.catalogs.delete(key));
    }
    return this.catalogs.get(key);
  }
  async handle(message) {
    const id = message?.id ?? null;
    try {
      if (this.closed || !message || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
        (Object.hasOwn(message, 'id') && !['string', 'number'].includes(typeof message.id)))
        throw new AdapterError('Invalid JSON-RPC request.', -32600);
      if (!Object.hasOwn(message, 'id')) return null;
      let result;
      if (message.method === 'initialize') result = { protocolVersion: '2025-06-18',
        capabilities: { tools: {}, experimental: { [CAPABILITY]: {} } },
        serverInfo: { name: 'loginom-project-memory', version: '20260926.2' } };
      else if (message.method === 'ping') result = {};
      else if (message.method === 'tools/list') result = { tools: await this.catalog(await this.load()) };
      else if (message.method === 'tools/call') {
        this.observe({ stage: 'host-context', threadId: message.params?._meta?.threadId,
          sandboxCwd: message.params?._meta?.[CAPABILITY]?.sandboxCwd, metaKeys: Object.keys(message.params?._meta || {}) });
        const context = resolveContext(message.params?._meta, this.stateDir, this.routing(), loadEnrollment, this.requireEnrollment);
        const cfg = await this.load();
        if (cfg.configuredPeer && cfg.configuredPeer !== context.peerId)
          throw new AdapterError('Configured Peer conflicts with the registered project.');
        if (!(await this.catalog(cfg)).some(tool => tool.name === message.params.name))
          throw new AdapterError('Unknown OpenViking tool.', -32602);
        const call = routeCall(message.params, context);
        result = await this.pool(cfg, context).request('tools/call', { name: call.name, arguments: call.arguments });
        this.observe({ stage: 'routed-call', threadId: context.threadId, cwd: context.cwd,
          peerId: context.peerId, sessionId: context.sessionId, name: call.name, isError: result?.isError === true });
      } else throw new AdapterError('Method not found.', -32601);
      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      return { jsonrpc: '2.0', id, error: { code: error instanceof AdapterError ? error.code : -32603,
        message: error instanceof AdapterError ? error.message : 'Adapter internal error.' } };
    }
  }
  async close() { this.closed = true; await Promise.all([...this.pools.values()].map(pool => pool.close())); }
}
