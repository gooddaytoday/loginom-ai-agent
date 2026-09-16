#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../lib/config.mjs';
import { createSession } from '../lib/session.mjs';
import { createBridge } from '../lib/bridge.mjs';
import { admitStartupArtifacts } from '../lib/artifacts.mjs';
import { installManagedShutdown } from '../lib/managed-shutdown.mjs';
import { observeMcpTransport } from '../lib/mcp-origin.mjs';

process.umask(0o077);
let bridge, shutdownController;
try {
  const { values } = parseArgs({ options: {
    config: { type: 'string' }, 'state-dir': { type: 'string' },
    agent: { type: 'string' }, 'adapter-revision': { type: 'string' },
    mode: { type: 'string' },
    'action-manifest-uri': { type: 'string' }, 'action-manifest-sha256': { type: 'string' },
    'replay-login-user': { type: 'string' },
    'replay-loginom-url': { type: 'string' },
    'replay-bootstrap': { type: 'boolean', default: false },
    'acceptance-cleanup-package': { type: 'string' },
    'input-artifact': { type: 'string', multiple: true },
    headless: { type: 'boolean', default: false },
  } });
  const config = await loadConfig({
    configPath: values.config || process.env.LOGINOM_DOCK_CONFIG,
    stateDir: values['state-dir'], agent: values.agent, adapterRevision: values['adapter-revision'],
    mode: values.mode || process.env.LOGINOM_DOCK_MODE,
    actionManifestUri: values['action-manifest-uri'], actionManifestSha256: values['action-manifest-sha256'],
    replayBootstrap: values['replay-bootstrap'], replayLoginUser: values['replay-login-user'] ?? null,
    replayLoginomUrl: values['replay-loginom-url'] ?? null,
    acceptanceCleanupPackage: values['acceptance-cleanup-package'] ?? null,
  });
  const session = await createSession(config, { headless: values.headless });
  if (values['input-artifact']?.length && !['executor-preview','executor-replay'].includes(config.mode)) {
    throw new Error('Input artifacts require executor mode');
  }
  await admitStartupArtifacts(session.artifactStore, (values['input-artifact'] ?? []).map(value => {
    if (value.length>8192) throw new Error('Input artifact argument is too large');
    return JSON.parse(value);
  }));
  bridge = await createBridge(config, session);
  shutdownController = installManagedShutdown({ close: () => bridge.close() });
  await bridge.server.connect(observeMcpTransport(new StdioServerTransport(), session));
} catch {
  // Config parsing and upstream failures may embed secrets. Startup logs are fixed.
  process.stderr.write('Loginom Dock could not start. Check its explicit config, pinned runtime, browser installation and server availability.\n');
  process.exitCode = 1;
  if (shutdownController) await shutdownController.shutdown(1);
  else await bridge?.close();
}
