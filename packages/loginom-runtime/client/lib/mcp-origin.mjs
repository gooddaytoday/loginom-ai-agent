import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

// Positive local protocol provenance; deliberately stores no arguments, output,
// prompts, credentials or model text. Recording failure stops message dispatch.
export function observeMcpTransport(transport, session, { source = 'official_stdio_transport' } = {}) {
  if (!['official_stdio_transport', 'native_hermes_router'].includes(source))
    throw new Error('Unknown MCP transport origin');
  const receipt = { version: 1, source,
    session_id: session.metadata.sessionId, pid: process.pid,
    runtime_revision: session.metadata.clientRevision,
    manifest_sha256: session.metadata.actionManifestDigest ?? null,
    initialized_client: null, methods: [], overflow: false, closed: false };
  const path = join(session.directory, 'mcp-origin.json');
  let pending = Promise.resolve(), closing;
  const save = () => {
    const value = JSON.stringify(receipt, null, 2) + '\n';
    return writeFile(path + '.tmp', value, { mode: 0o600 }).then(() => rename(path + '.tmp', path));
  };
  const wrapper = {
    async start() {
      transport.onmessage = (message, extra) => {
        pending = pending.then(async () => {
          if (typeof message.method === 'string') {
            const method = ['initialize', 'notifications/initialized', 'tools/list', 'tools/call'].includes(message.method)
              ? message.method : 'other';
            if (receipt.methods.length < 4096) receipt.methods.push(method); else receipt.overflow = true;
            if (method === 'initialize') receipt.initialized_client =
              message.params?.clientInfo?.name === 'loginom-acceptance-tool-precheck'
                && message.params?.clientInfo?.version === '1' ? 'loginom-acceptance-tool-precheck/1' : 'other';
            await save();
          }
          wrapper.onmessage?.(message, extra);
        }).catch(error => { wrapper.onerror?.(error); void wrapper.close(); });
      };
      transport.onerror = error => wrapper.onerror?.(error);
      transport.onclose = () => wrapper.onclose?.();
      await transport.start();
    },
    send: message => transport.send(message),
    close() {
      closing ??= (async () => {
        await transport.close();
        await pending;
        receipt.closed = true;
        await save();
      })();
      return closing;
    },
  };
  return wrapper;
}
