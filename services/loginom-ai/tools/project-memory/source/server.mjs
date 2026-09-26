#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { openSync, writeSync, closeSync, fstatSync, realpathSync } from 'node:fs';
import { constants } from 'node:fs';
import { Adapter } from './adapter.mjs';

process.umask(0o077);
const auditPath = process.env.OPENVIKING_ADAPTER_AUDIT_PATH;
const audit = auditPath ? openSync(auditPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600) : null;
if (audit !== null && ((fstatSync(audit).mode & 0o777) !== 0o600 || fstatSync(audit).uid !== process.getuid() || realpathSync(auditPath) !== auditPath))
  throw new Error('Audit must be a private canonical file.');
const adapter = new Adapter({ requireEnrollment: true, routing: () => ({ projects: [] }),
  observe: event => { if (audit !== null) writeSync(audit, JSON.stringify(event) + '\n'); } });
const active = new Set();
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  if (Buffer.byteLength(line) > 8 * 1024 * 1024 || active.size >= 64) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Input limit exceeded.' } }) + '\n');
    return;
  }
  const work = (async () => {
    let message;
    try { message = JSON.parse(line); }
    catch { return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } }; }
    return adapter.handle(message);
  })().then(reply => { if (reply) process.stdout.write(JSON.stringify(reply) + '\n'); });
  active.add(work);
  work.finally(() => active.delete(work));
});
input.on('close', async () => {
  await Promise.allSettled([...active]); await adapter.close(); if (audit !== null) closeSync(audit);
});
