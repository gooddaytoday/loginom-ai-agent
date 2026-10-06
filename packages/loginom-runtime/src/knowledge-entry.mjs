import { createKnowledgeClient } from '../client/lib/knowledge-client.mjs';

process.umask(0o077);
const state = { client: undefined, closing: undefined, controller: new AbortController() };
const requests = new Set();
const send = (message, disconnect = false) => {
  if (process.connected) process.send(message, () => {
    if (disconnect && process.connected) process.disconnect();
  });
};

function close() {
  return state.closing ??= (async () => {
    state.controller.abort(Error('LOGINOM_KNOWLEDGE_CLOSED'));
    const client = await state.client?.catch(() => undefined);
    await client?.close();
    await Promise.allSettled([...requests]);
  })();
}

const stop = () => {
  void close().then(() => process.exit(0), () => process.exit(1));
};
process.on('disconnect', stop);
process.on('SIGTERM', stop);
process.on('message', message => {
  const request = handle(message);
  // A close request must not wait for its own handler to settle.
  if (message?.operation === 'close') return;
  requests.add(request);
  void request.finally(() => requests.delete(request)).catch(() => { process.exitCode = 1; });
});

async function handle(message) {
  if (!message || typeof message !== 'object' || typeof message.id !== 'string') return;
  try {
    if (state.closing && message.operation !== 'close') throw Error('LOGINOM_KNOWLEDGE_CLOSED');
    if (message.operation === 'start') {
      if (state.client) throw Error('LOGINOM_ALREADY_STARTED');
      const input = message.input;
      if (!input || input.protocol !== 1 || !Number.isSafeInteger(input.generation) || input.generation < 1
        || typeof input.endpoint !== 'string' || !URL.canParse(input.endpoint) || typeof input.apiKey !== 'string'
        || Object.keys(input).some(key => !['protocol', 'generation', 'endpoint', 'apiKey'].includes(key)))
        throw Error('LOGINOM_START_INVALID');
      const endpoint = new URL(input.endpoint);
      if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash)
        throw Error('LOGINOM_START_INVALID');
      state.client = createKnowledgeClient(input, state.controller.signal);
      // Readiness is observed through list; admission of start does not wait for the network.
      void state.client.catch(() => {});
      send({ id: message.id, result: { protocol: 1, generation: input.generation, started: true } });
      return;
    }
    if (message.operation === 'close') {
      await close();
      send({ id: message.id, result: { closed: true } }, true);
      return;
    }
    if (!state.client) throw Error('LOGINOM_NOT_READY');
    if (message.operation === 'list') {
      const client = await state.client;
      send({ id: message.id, result: { tools: client.tools, catalogSha256: client.catalogSha256 } });
      return;
    }
    if (message.operation === 'call') {
      const client = await state.client;
      send({ id: message.id, result: await client.call(message.input) });
      return;
    }
    if (message.operation === 'interrupt') {
      const client = await state.client;
      client.interrupt(message.input);
      send({ id: message.id, result: { interrupted: true } });
      return;
    }
    throw Error('LOGINOM_REQUEST_INVALID');
  } catch (error) {
    const code = /^LOGINOM_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'LOGINOM_KNOWLEDGE_FAILED';
    send({ id: message.id, error: code }, message.operation === 'close');
  }
}
