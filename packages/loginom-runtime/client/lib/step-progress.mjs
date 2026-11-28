import { AsyncLocalStorage } from 'node:async_hooks';

export const STEP_PROGRESS_INTERVAL_MS = 1500;
export const STEP_STALL_MS = { waiting: 30000, configuring: 60000, executing: 90000, reading: 45000 };

const scope = new AsyncLocalStorage();

export function stepPhase(phase, nodeType = null, substep = null) {
  scope.getStore()?.update(phase, nodeType, substep);
}

export function createStepState(phase, nodeType = null) {
  const startedAt = Date.now();
  let current = { phase, nodeType, substep: null, changedAt: startedAt, startedAt };
  const state = {
    read: () => current,
    update(phase, nodeType, substep) {
      current = { phase, nodeType, substep, changedAt: Date.now(), startedAt };
    },
    run: run => scope.run(state, run),
  };
  return state;
}

export function followStepProgress(step) {
  scope.getStore()?.follow?.(step);
}

export function observeLoginomReplies(context, origin, onReply) {
  const sameOrigin = (url, websocket = false) => {
    const address = new URL(url);
    if (websocket) address.protocol = address.protocol === 'wss:' ? 'https:' : 'http:';
    return address.origin === origin;
  };
  const observePage = page => page.on('websocket', socket => {
    if (sameOrigin(socket.url(), true)) socket.on('framereceived', onReply);
  });
  context.on('response', response => {
    if (!response.fromServiceWorker() && sameOrigin(response.url())) onReply();
  });
  context.on('page', observePage);
  context.pages().forEach(observePage);
}

export async function withStepProgress({ name, signal, send, lastReply }, run) {
  if (!send) return run();
  const local = createStepState(name === 'dock_node_read' ? 'reading' : 'waiting');
  let observed = local, previous;
  const emit = () => {
    if (signal.aborted) return;
    const { phase, nodeType, substep, changedAt, startedAt } = observed.read();
    const lastReplyAt = lastReply();
    const now = Date.now();
    const quietSince = Math.max(changedAt, lastReplyAt ?? 0);
    const stalled = now - quietSince >= STEP_STALL_MS[phase];
    const key = JSON.stringify([phase, nodeType, substep, lastReplyAt, stalled]);
    if (key === previous) return;
    previous = key;
    send({ version: 1, phase, nodeType, substep, startedAt, lastReplyAt,
      stalledSince: stalled ? quietSince : null });
  };
  const timer = setInterval(emit, STEP_PROGRESS_INTERVAL_MS);
  try {
    return await scope.run({ update: local.update, follow: step => { observed = step; } }, run);
  } finally {
    clearInterval(timer);
  }
}
