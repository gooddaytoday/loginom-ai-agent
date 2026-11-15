import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CallToolRequest, CallToolResult, ListToolsRequest, ListToolsResult, Tool } from '@modelcontextprotocol/sdk/types.js';

export function knowledgeServer(t: { after(callback: () => void | Promise<void>): void }, options?: {
  apiKey?: string;
  names?: string[];
  request?: (body: unknown, request: IncomingMessage, response: ServerResponse) => Promise<boolean>;
  initialize?: () => Promise<void>;
  list?: (params: ListToolsRequest['params']) => Promise<ListToolsResult>;
  call?: (params: CallToolRequest['params'], extra: { signal: AbortSignal }) => Promise<CallToolResult>;
}): Promise<{
  endpoint: string;
  tools: Tool[];
  calls: CallToolRequest['params'][];
  requests: { method: string; authorization: string | undefined }[];
}>;
