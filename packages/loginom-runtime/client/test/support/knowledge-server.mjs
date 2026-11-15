import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

export async function knowledgeServer(t, options = {}) {
  const inputs = {
    find: { properties: { query: { type: 'string' }, target_uri: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
    search: { properties: { query: { type: 'string' }, target_uri: { type: 'string' }, mode: { type: 'string', enum: ['list', 'context'], default: 'list' } }, required: ['query'] },
    read: { properties: { uris: { type: 'array', items: { type: 'string' } } }, required: ['uris'] },
    list: { properties: { uri: { type: 'string' }, recursive: { type: 'boolean' } }, required: ['uri'] },
    tree: { properties: { uri: { type: 'string', default: 'viking://' }, level_limit: { type: 'integer' }, node_limit: { type: 'integer' }, include_abstract: { type: 'boolean' } } },
    grep: { properties: { uri: { type: 'string' }, pattern: { type: 'array', items: { type: 'string' } }, case_insensitive: { type: 'boolean' }, node_limit: { type: 'integer' } }, required: ['uri', 'pattern'] },
    glob: { properties: { uri: { type: 'string', default: 'viking://' }, pattern: { type: 'string' }, node_limit: { type: 'integer' } }, required: ['pattern'] },
  };
  const state = { requests: [], sessions: new Map(), calls: [],
    tools: (options.names ?? ['find', 'search', 'read', 'grep', 'glob', 'list', 'tree', 'write']).map(name => ({
      name, description: `Real remote ${name} schema`, inputSchema: {
        type: 'object', ...(inputs[name] ?? { properties: { uri: { type: 'string' } }, required: ['uri'] }), additionalProperties: false,
      },
    })),
  };
  const http = createServer(async (request, response) => {
    try {
      state.requests.push({ method: request.method, authorization: request.headers.authorization });
      if (request.headers.authorization !== `Bearer ${options.apiKey ?? 'UNIT-NONSECRET'}`) {
        response.writeHead(401); response.end('Unauthorized'); return;
      }
      let body;
      if (request.method === 'POST') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        body = JSON.parse(Buffer.concat(chunks).toString());
      }
      if (await options.request?.(body, request, response)) return;
      let session = state.sessions.get(request.headers['mcp-session-id']);
      if (!session && isInitializeRequest(body)) {
        if (options.initialize) await options.initialize();
        if (response.destroyed) return;
        const protocol = new Server({ name: 'knowledge-fixture', version: '1.0.0' }, { capabilities: { tools: {} } });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true,
          onsessioninitialized: id => state.sessions.set(id, { protocol, transport }),
        });
        protocol.setRequestHandler(ListToolsRequestSchema, async request =>
          options.list ? options.list(request.params) : { tools: state.tools });
        protocol.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
          state.calls.push(request.params);
          return options.call ? options.call(request.params, extra)
            : { content: [{ type: 'text', text: JSON.stringify(request.params) }] };
        });
        await protocol.connect(transport);
        session = { protocol, transport };
      }
      if (!session) { response.writeHead(400); response.end('Unknown session'); return; }
      await session.transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await Promise.all([...state.sessions.values()].map(session => session.protocol.close()));
    http.closeAllConnections();
    await new Promise(resolve => http.close(resolve));
  });
  return { ...state, endpoint: `http://127.0.0.1:${http.address().port}/mcp` };
}
