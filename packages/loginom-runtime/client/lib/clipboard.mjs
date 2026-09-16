import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';

// A kernel-owned, host-wide lease: no payload protocol, credentials or stale PID
// files. All Dock sessions use this one port; process death releases it.
export const CLIPBOARD_LOCK_PORT = 46419;

export async function acquireClipboard({ signal, timeoutMs = 60000, port = CLIPBOARD_LOCK_PORT } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    signal?.throwIfAborted();
    const server = net.createServer(socket => socket.destroy());
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
      });
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        await new Promise(resolve => server.close(resolve));
      };
      if (signal?.aborted) { await release(); signal.throwIfAborted(); }
      return { release, port: server.address().port };
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (Date.now() >= deadline) throw new Error('Another Dock session holds the clipboard, or its lock port is occupied');
      await delay(Math.min(100, deadline - Date.now()), undefined, { signal });
    }
  }
}

export function makeClipboardCode(args) {
  for (const name of ['copy', 'paste', 'confirm']) {
    if (typeof args?.[name] !== 'string' || !args[name].trim() || args[name].length > 20000) {
      throw new Error('Clipboard transfer requires copy, paste and confirm Playwright functions');
    }
  }
  const token = randomUUID();
  return { token, code: `async (page) => {
    await (${args.copy})(page);
    await (${args.paste})(page);
    if (await (${args.confirm})(page) !== true) throw new Error('Dock paste was not confirmed in the target');
    return { dockClipboardConfirmation: ${JSON.stringify(token)} };
  }` };
}

export function hasClipboardConfirmation(result, token) {
  if (result.isError) return false;
  for (const block of result.content || []) {
    if (block.type !== 'text') continue;
    const match = block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/);
    if (!match) continue;
    try { if (JSON.parse(match[1]).dockClipboardConfirmation === token) return true; } catch {}
  }
  return false;
}

// An answered tool call can still leave paste unconfirmed. Keep its lease until
// browser shutdown unless the actual target confirmation was received.
export async function runClipboardTransfer({ execute, token, leases, onUncertain, signal, acquire = acquireClipboard }) {
  const lease = await acquire({ signal });
  leases.add(lease);
  let confirmed = false;
  try {
    const result = await execute();
    confirmed = hasClipboardConfirmation(result, token);
    return confirmed;
  } finally {
    if (confirmed) { await lease.release(); leases.delete(lease); }
    else onUncertain();
  }
}

export function createSerialGate() {
  let tail = Promise.resolve();
  return operation => {
    const current = tail.then(operation);
    tail = current.catch(() => {});
    return current;
  };
}

export const clipboardTool = {
  name: 'dock_clipboard_transfer',
  description: 'Run a complete copy/paste operation under the host-wide Dock clipboard lock. Supply three async (page) => ... functions: copy, paste, and confirm. confirm must wait for the target DOM and return true only after the pasted result appears. All Dock clipboard operations must use this tool.',
  inputSchema: { type: 'object', properties: {
    copy: { type: 'string', minLength: 1, maxLength: 20000 },
    paste: { type: 'string', minLength: 1, maxLength: 20000 },
    confirm: { type: 'string', minLength: 1, maxLength: 20000 },
  }, required: ['copy', 'paste', 'confirm'], additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
};
