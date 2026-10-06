import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { combineCatalogs, connectRemote, readCatalog } from './catalog.mjs';

const names = new Set(['find', 'search', 'read', 'grep', 'glob', 'list', 'tree']);

export async function createKnowledgeClient({ endpoint, apiKey }, signal) {
  signal?.throwIfAborted();
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw Error('LOGINOM_CONFIG_REQUIRED');
  const remote = await connectRemote(() => ({
    client: new Client({ name: 'loginom-ai-agent-knowledge', version: '0.1.0' }),
    transport: new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` }, redirect: 'error' },
    }),
  }), { signal });
  try {
    const catalog = combineCatalogs({ remote: (await readCatalog(remote, { signal })).filter(tool => names.has(tool.name)) });
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
    await remote.close();
    signal?.throwIfAborted();
    throw error;
  }
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
