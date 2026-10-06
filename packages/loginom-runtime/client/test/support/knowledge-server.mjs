import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

export async function knowledgeServer(t, options = {}) {
  const state = { requests: [], sessions: new Map(), calls: [],
    tools: (options.names ?? ['find', 'search', 'read', 'grep', 'glob', 'list', 'tree', 'write']).map(name => ({
      name, description: `Real remote ${name} schema`, inputSchema: {
        type: 'object', properties: { uri: { type: 'string' } }, required: ['uri'], additionalProperties: false,
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
      let session = state.sessions.get(request.headers['mcp-session-id']);
      if (!session && isInitializeRequest(body)) {
        const protocol = new Server({ name: 'knowledge-fixture', version: '1.0.0' }, { capabilities: { tools: {} } });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true,
          onsessioninitialized: id => state.sessions.set(id, { protocol, transport }),
        });
        protocol.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: state.tools }));
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
