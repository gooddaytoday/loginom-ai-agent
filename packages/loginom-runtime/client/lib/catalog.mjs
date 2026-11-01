import { createHash } from 'node:crypto';
import { createRedactor } from './redact.mjs';

export function catalogStartup({ signal, deadline = Date.now() + 120000, onFailure } = {}) {
  const bounded = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(Math.max(0, deadline - Date.now()))]);
  let retried = false;
  return { signal: bounded, async read(phase, operation) {
    for (;;) {
      bounded.throwIfAborted();
      if (Date.now() >= deadline) throw Error('LOGINOM_RUNTIME_TIMEOUT');
      try { return await operation(bounded, deadline - Date.now()); }
      catch (error) {
        const retry = !retried && !bounded.aborted && Date.now() < deadline && transientCatalogError(error);
        // Claim synchronously: parallel manifest reads share this one allowance.
        if (retry) retried = true;
        try { await onFailure?.(error, { phase, retry }); } catch { /* Diagnostics cannot change admission. */ }
        if (!retry) throw error;
      }
    }
  } };
}

function transientCatalogError(error) {
  const seen = new Set();
  for (let item = error; item && !seen.has(item); item = item.cause) {
    seen.add(item);
    if ([401, 403].includes(item.code ?? item.status)) return false;
    if ([502, 503, 504, -32001].includes(item.code ?? item.status)
      || ['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
        'ERR_SSL_UNEXPECTED_EOF_WHILE_READING'].includes(item.code)
      || item.name === 'TimeoutError' || /\bTLS\b[^\n]*(?:\bEOF\b|unexpected eof)/i.test(item.message ?? '')) return true;
  }
  return false;
}

// Private startup evidence only. Never export a stack, headers, URL query or raw Error over IPC.
export function startupDiagnostic(error, knownSecrets = []) {
  const redactor = createRedactor();
  const seen = new Set();
  const clean = value => {
    // Remove URL tails before replacing even one-character passwords, which
    // could otherwise corrupt a URL scheme and defeat query removal.
    let text = redactor.text(String(value)).replace(/\b(?:https?|wss?):\/\/[^\r\n]*/gi, raw => {
      try { const url = new URL(raw); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href; }
      catch { return '[URL omitted]'; }
    });
    for (const secret of knownSecrets.filter(value => typeof value === 'string' && value.length))
      for (const variant of new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]))
        text = text.replaceAll(variant, '[redacted]');
    return text.slice(0, 1024);
  };
  function record(item, depth = 0) {
    if (!item || seen.has(item) || depth > 2) return undefined;
    seen.add(item);
    const fields = redactor.redact({ name: String(item.name ?? 'Error'), code: String(item.code ?? item.status ?? ''),
      message: String(item.message ?? item) });
    return { name: clean(fields.name ?? 'Error'), code: clean(fields.code ?? ''), message: clean(fields.message ?? '[diagnostic unavailable]'),
      ...(item.cause ? { cause: record(item.cause, depth + 1) } : {}) };
  }
  return record(error);
}

export async function connectRemote(create, { signal, startup = catalogStartup({ signal }) } = {}) {
  return startup.read('initialize', async (signal, remaining) => {
    const { client, transport } = create();
    try {
      await client.connect(transport, { timeout: Math.min(25000, remaining), signal });
      return client;
    } catch (error) {
      await client.close().catch(() => {});
      throw error;
    }
  });
}

export async function readCatalog(client, { signal, startup } = {}) {
  const tools = [];
  const seen = new Set();
  let cursor;
  do {
    signal?.throwIfAborted();
    const page = startup
      ? await startup.read('listTools', (signal, remaining) => client.listTools(cursor ? { cursor } : {}, { signal, timeout: Math.min(60000, remaining) }))
      : await client.listTools(cursor ? { cursor } : {}, signal ? { signal } : undefined);
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
