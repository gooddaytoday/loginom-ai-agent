import { createHash } from 'node:crypto';

export async function connectRemote(create) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { client, transport } = create();
    try {
      await client.connect(transport, { timeout: 25000 });
      return client;
    } catch (error) {
      await client.close().catch(() => {});
      const transient = (error instanceof TypeError && error.message === 'fetch failed')
        || [502, 503, 504].includes(error.code ?? error.status);
      if (attempt || !transient) throw error;
    }
  }
}

export async function readCatalog(client) {
  const tools = [];
  const seen = new Set();
  let cursor;
  do {
    const page = await client.listTools(cursor ? { cursor } : {});
    tools.push(...page.tools);
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('Repeated MCP tools cursor');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return tools;
}

export function combineCatalogs(groups) {
  const routes = new Map();
  const tools = [];
  for (const [owner, catalog] of Object.entries(groups)) {
    for (const original of catalog) {
      if (routes.has(original.name)) throw new Error(`MCP tool collision: ${original.name}`);
      routes.set(original.name, owner);
      tools.push(structuredClone(original));
    }
  }
  const serialized = JSON.stringify(tools);
  return { tools, routes, sha256: createHash('sha256').update(serialized).digest('hex') };
}

export function selectToolGroups(mode, { remoteTools, browserTools, commonLocalTools, executorLocalTools }) {
  if (['executor-preview', 'executor-replay'].includes(mode)) {
    return { remote: remoteTools, local: executorLocalTools };
  }
  if (!['classic', 'research'].includes(mode)) throw new Error(`Unknown Dock mode: ${mode}`);
  return { remote: remoteTools, browser: browserTools, local: commonLocalTools };
}
