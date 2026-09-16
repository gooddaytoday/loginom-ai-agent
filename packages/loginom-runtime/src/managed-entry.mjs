import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { verifyResources } from './resources.mjs';
import { loginBrowser, checkConnection } from './connection-check.mjs';
import { createSession } from '../client/lib/session.mjs';
import { createBridge } from '../client/lib/bridge.mjs';

const require = createRequire(new URL('../client/package.json', import.meta.url));
process.umask(0o077);
const state = { starting: false, bridge: undefined, client: undefined, controller: undefined };
const send = message => { if (process.connected) process.send(message); };
async function close() {
  state.controller?.abort();
  await state.client?.close().catch(() => undefined);
  await state.bridge?.close().catch(() => undefined);
  process.disconnect?.();
}
process.on('disconnect', () => { close().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { close().finally(() => process.exit(0)); });
process.on('message', async message => {
  if (!message || typeof message !== 'object' || typeof message.id !== 'string') return;
  try {
    if (message.operation === 'start') {
      if (state.starting) throw Error('LOGINOM_ALREADY_STARTED');
      state.starting = true;
      const input = message.input;
      if (input.protocol !== 1 || !Number.isSafeInteger(input.generation) || input.generation < 1
        || typeof input.chat !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.chat)
        || !isAbsolute(input.stateDir)) throw Error('LOGINOM_START_INVALID');
      const resources = await verifyResources(input.resources);
      const directory = join(input.stateDir, 'generations', String(input.generation), 'chats', input.chat);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const login = { browserPath: resources.browserPath, profile: join(directory, 'browser-profile'), candidate: input.connection, headless: input.headless === true };
      if (input.validation === true) {
        await checkConnection({ ...login, endpoint: input.endpoint });
        send({ id: message.id, result: { checked: true, protocol: 1, generation: input.generation } });
        return;
      }
      await loginBrowser(login);
      const config = {
        endpoint: input.endpoint, apiKey: input.connection.apiKey, loginomUrl: input.connection.url,
        stateDir: input.stateDir, agent: 'loginom-ai-agent', adapterRevision: '1',
        mode: 'executor-replay', resultProfile: 'user-v1',
        actionManifestUri: input.actionManifestUri, actionManifestSha256: input.actionManifestSha256,
        replayBootstrap: false, replayLoginUser: null,
        storageDirectories: { inputs: `/${input.connection.username}`, outputs: `/${input.connection.username}`, packages: `/${input.connection.username}` },
        inputUploadDirectory: `/${input.connection.username}`,
      };
      const session = await createSession(config, { headless: input.headless === true, managed: { directory, browserPath: resources.browserPath, browserRoot: resources.browserRoot } });
      state.bridge = await createBridge(config, session);
      const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
      const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      state.client = new Client({ name: 'loginom-ai-agent-host', version: '0.1.0' });
      await state.bridge.server.connect(serverTransport);
      await state.client.connect(clientTransport);
      send({ id: message.id, result: { ready: true, protocol: 1, generation: input.generation, chat: input.chat,
        manifestHash: resources.manifestHash, browserHash: resources.browserHash, clientRevision: session.metadata.clientRevision } });
      return;
    }
    if (message.operation === 'close') {
      send({ id: message.id, result: { closed: true } });
      await close();
      return;
    }
    if (!state.client) throw Error('LOGINOM_NOT_READY');
    if (message.operation === 'list') {
      send({ id: message.id, result: await state.client.listTools() });
      return;
    }
    if (message.operation === 'interrupt') {
      state.controller?.abort();
      send({ id: message.id, result: { interrupted: true } });
      return;
    }
    if (message.operation !== 'call' || state.controller) throw Error('LOGINOM_REQUEST_INVALID');
    const controller = new AbortController();
    state.controller = controller;
    try {
      const result = await state.client.callTool(message.input, undefined, { signal: controller.signal });
      send({ id: message.id, result });
    } finally { state.controller = undefined; }
  } catch (error) {
    const code = /^LOGINOM_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'LOGINOM_RUNTIME_FAILED';
    send({ id: message.id, error: code });
    if (message.operation === 'start') await close();
  }
});
