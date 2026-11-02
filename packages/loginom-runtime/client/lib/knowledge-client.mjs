import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { catalogStartup, combineCatalogs, connectRemote, readCatalog } from './catalog.mjs';

const names = new Set(['find', 'search', 'read', 'grep', 'glob', 'list', 'tree']);

export async function createKnowledgeClient({ endpoint, apiKey }, signal, startupOptions = {}) {
  const started = performance.now();
  signal?.throwIfAborted();
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw Error('LOGINOM_CONFIG_REQUIRED');
  const startup = catalogStartup({ ...startupOptions, signal });
  const remote = await connectRemote(() => ({
    client: new Client({ name: 'loginom-ai-agent-knowledge', version: '0.1.0' }),
    transport: new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` }, redirect: 'error' },
    }),
  }), { startup }).catch(error => {
    signal?.throwIfAborted();
    throw Object.assign(Error([401, 403].includes(error?.code ?? error?.status)
      ? 'LOGINOM_KNOWLEDGE_AUTH_FAILED' : 'LOGINOM_KNOWLEDGE_UNAVAILABLE', { cause: error }), {
      startupFailure: knowledgeStartupFailure(error, 'connect_initialize', performance.now() - started, false),
    });
  });
  try {
    const catalog = combineCatalogs({ remote: (await readCatalog(remote, { startup })).filter(tool => names.has(tool.name)) });
    if (catalog.tools.length !== names.size) throw Error('LOGINOM_KNOWLEDGE_CATALOG_INVALID');
    const state = { closed: false, closing: undefined };
    const pending = new Map();
    return {
      tools: catalog.tools,
      catalogSha256: catalog.sha256,
      async call(input, signal) {
        if (state.closed) throw Error('LOGINOM_KNOWLEDGE_CLOSED');
        const key = knowledgeRequestKey(input);
        if (!catalog.routes.has(input.name)) throw Error('LOGINOM_KNOWLEDGE_TOOL_DENIED');
        signal?.throwIfAborted();
        if (pending.has(key)) throw Error('LOGINOM_KNOWLEDGE_REQUEST_BUSY');
        const entry = { run: input.run, id: input.id, controller: new AbortController(), promise: undefined };
        pending.set(key, entry);
        try {
          entry.promise = remote.callTool({ name: input.name, arguments: input.arguments ?? {} }, CallToolResultSchema,
            { signal: AbortSignal.any([entry.controller.signal, ...(signal ? [signal] : [])]), timeout: 60000 });
          return await entry.promise;
        } catch (error) {
          entry.controller.signal.throwIfAborted();
          signal?.throwIfAborted();
          throw error;
        } finally { pending.delete(key); }
      },
      interrupt(input) {
        const all = validateKnowledgeInterrupt(input);
        for (const entry of pending.values())
          if (all || (entry.run === input.run && (input.id === undefined || input.id === entry.id)))
            entry.controller.abort(Error('LOGINOM_KNOWLEDGE_INTERRUPTED'));
      },
      close() {
        state.closed = true;
        return state.closing ??= (async () => {
          for (const entry of pending.values()) entry.controller.abort(Error('LOGINOM_KNOWLEDGE_CLOSED'));
          await Promise.allSettled([...pending.values()].map(entry => entry.promise));
          await remote.close();
        })();
      },
    };
  } catch (error) {
    if (error && typeof error === 'object')
      error.startupFailure = knowledgeStartupFailure(error, 'catalog', performance.now() - started, signal?.aborted === true);
    await remote.close();
    signal?.throwIfAborted();
    throw error;
  }
}

export function knowledgeStartupFailure(error, stage, elapsed, aborted) {
  const queue = [error];
  const errors = [];
  while (queue.length && errors.length < 16) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || errors.includes(current)) continue;
    errors.push(current);
    if (current.cause) queue.push(current.cause);
    if (current instanceof AggregateError) queue.push(...current.errors.slice(0, 8));
  }
  const allowed = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
    'EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_HANDSHAKE_TIMEOUT', 'ERR_SSL_WRONG_VERSION_NUMBER',
    'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA', 'ABORT_ERR']);
  const codes = [...new Set(errors.map(item => item.code).filter(code => allowed.has(code)))];
  const code = errors.flatMap(item => [item.code, item.status])
    .find(value => Number.isSafeInteger(value) && value >= -32768 && value <= 599) ?? null;
  return {
    stage, error_class: ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'TimeoutError',
      'AggregateError', 'McpError', 'SseError', 'StreamableHTTPError'].includes(error?.name) ? error.name : 'Unknown',
    code, cause_codes: codes, aborted: aborted || errors.some(item => item.name === 'AbortError' || item.code === 'ABORT_ERR'),
    timeout: errors.some(item => item.name === 'TimeoutError' || item.code === -32001)
      || codes.some(code => code === 'ETIMEDOUT' || code.endsWith('TIMEOUT')),
    elapsed_ms: Math.max(0, Math.round(elapsed)),
  };
}

export function knowledgeRequestKey(input) {
  if (!input || typeof input.run !== 'string' || !input.run || typeof input.id !== 'string' || !input.id)
    throw Error('LOGINOM_KNOWLEDGE_REQUEST_INVALID');
  return JSON.stringify([input.run, input.id]);
}

export function validateKnowledgeInterrupt(input) {
  const all = input?.all === true && Object.keys(input).length === 1;
  if (!input || (input.all !== undefined && !all) || (!all && (typeof input.run !== 'string' || !input.run
    || (input.id !== undefined && (typeof input.id !== 'string' || !input.id)))))
    throw Error('LOGINOM_KNOWLEDGE_REQUEST_INVALID');
  return all;
}
