#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { handleHook } from '../lib/hooks.mjs';
import { openArchive } from '../lib/archive.mjs';
import { acquireClipboard } from '../lib/clipboard.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { pinnedHook } from '../lib/hook-runtime.mjs';
import { codexDatasetContext } from '../lib/host-inputs.mjs';

process.umask(0o077);
try {
  const { values } = parseArgs({ options: {
    config: { type: 'string' }, 'state-dir': { type: 'string' }, agent: { type: 'string' },
    'adapter-revision': { type: 'string' }, flush: { type: 'boolean' },
  } });
  const config = await loadConfig({ configPath: values.config, stateDir: values['state-dir'],
    agent: values.agent, adapterRevision: values['adapter-revision'] });
  const knownSecrets = Object.entries(process.env).filter(([key]) => /KEY|TOKEN|SECRET|PASSWORD|COOKIE|AUTH/i.test(key)).map(([, value]) => value);
  if (values.flush) {
    // One bounded retry worker per host. The durable queue is also retried by
    // the next native hook, including SessionStart after an agent crash.
    const lease = await acquireClipboard({ port: 46421, timeoutMs: 1000 }).catch(() => null);
    if (lease) {
      const queue = await openArchive(config, { knownSecrets });
      try {
        for (let attempt = 0; attempt < 12; attempt++) {
          const result = await queue.flush().catch(() => ({ workRemaining: queue.workRemaining() }));
          if (!result.workRemaining) break;
          await delay(Math.min(60000, 1000 * 2 ** attempt));
        }
      } finally { queue.close(); await lease.release(); }
    }
  } else {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) throw new Error('Hook input limit');
      chunks.push(chunk);
    }
    const inputBytes = Buffer.concat(chunks);
    const input = JSON.parse(inputBytes.toString('utf8'));
    const pinned = await pinnedHook(config, input, fileURLToPath(new URL('../../', import.meta.url)));
    if (pinned) {
      if (process.env.LOGINOM_DOCK_PINNED_HOOK) throw new Error('Recursive Dock runtime routing');
      const code = await new Promise((resolve, reject) => {
        const child = spawn(pinned.node, ['--disable-warning=ExperimentalWarning', pinned.hook,
          '--config', values.config, '--state-dir', config.stateDir, '--agent', config.agent,
          '--adapter-revision', pinned.adapterRevision], {
          stdio: ['pipe', 'inherit', 'inherit'], env: { ...process.env, LOGINOM_DOCK_PINNED_HOOK: pinned.root },
        });
        for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
        child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
        child.stdin.on('error', reject); child.stdin.end(inputBytes);
      });
      process.exit(code);
    }
    // Local input admission precedes archive activation. Never send bytes to
    // the archive or network while producing an opaque dataset ticket.
    const datasetContext = config.agent === 'codex' ? await codexDatasetContext(config, input) : null;
    if (datasetContext) process.stdout.write(JSON.stringify(datasetContext) + '\n');
    await handleHook(config, input, { knownSecrets });
    const pending = await openArchive(config, { knownSecrets });
    const work = pending.workRemaining(); pending.close();
    if (work) {
      const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(import.meta.url),
        ...process.argv.slice(2), '--flush'], { detached: true, stdio: 'ignore' });
      child.on('error', () => {});
      child.unref();
    }
  }
} catch {
  // Hook input and exception bodies may contain credentials. Keep this fixed.
  process.stderr.write('Loginom Dock: архив ожидает восстановления связи или чтения истории.\n');
  process.exitCode = 1;
}
