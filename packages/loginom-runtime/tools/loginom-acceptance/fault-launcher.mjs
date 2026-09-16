// Operator-only entry gate. Never packaged in the client runtime.
import { Client } from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRedactor } from '../../client/lib/redact.mjs';

export function validateFaultContext({ variant, state, runDirectory, request, actualSha, expectedSha }) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha ?? '') || actualSha !== expectedSha
      || request.runtime_source_pin?.inputs?.['client/lib/executor.mjs'] !== actualSha) {
    throw new Error('Fault launcher requires exact preflight executor SHA');
  }
  if (!['rename', 'partial_link', 'position', 'lost_receipt', 'save_reopen'].includes(variant)
      || request.fault_injection !== variant || request.scope !== 'source_runtime'
      || !/^\d{8}-\d{6}-[a-f0-9]{8}$/.test(request.run_id ?? '')
      || !resolve(runDirectory).endsWith('/' + request.run_id)
      || resolve(state) !== join(resolve(runDirectory), 'private', 'dock-state')) {
    throw new Error('Fault launcher requires exact isolated run identity and declared variant');
  }
}

export async function launchFault(variant, wrap) {
  process.umask(0o077);
  const argument = name => {
    const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
    if (indexes.length !== 1 || !process.argv[indexes[0] + 1] || process.argv[indexes[0] + 1].startsWith('--')) {
      throw new Error('Missing or repeated fault launcher argument');
    }
    return process.argv[indexes[0] + 1];
  };
  const state = argument('--state-dir'), configPath = argument('--config');
  const runDirectory = process.env.DOCK_ACCEPTANCE_RUN_DIR;
  if (!runDirectory || await realpath(state) !== resolve(state) || await realpath(runDirectory) !== resolve(runDirectory)) {
    throw new Error('Fault run and state must be ordinary isolated directories');
  }
  const request = JSON.parse(await readFile(join(runDirectory, 'request.json'), 'utf8'));
  const source = await readFile(new URL('../../client/lib/executor.mjs', import.meta.url));
  const actualSha = createHash('sha256').update(source).digest('hex');
  validateFaultContext({ variant, state, runDirectory, request, actualSha,
    expectedSha: process.env.DOCK_ACCEPTANCE_EXECUTOR_SHA256 });
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const redactor = createRedactor([config.api_key]);
  Client.prototype.callTool = wrap(Client.prototype.callTool, async receipt => {
    await writeFile(join(state, 'fault-receipt.json'), JSON.stringify(redactor.redact({ ...receipt,
      executor_source_sha256: actualSha, run_id: request.run_id, variant }), null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  });
  await import('../../client/bin/loginom-dock.mjs');
}
