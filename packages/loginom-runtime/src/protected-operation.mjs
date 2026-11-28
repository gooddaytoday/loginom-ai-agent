import { randomUUID } from 'node:crypto';

const warning = 'Агент работает в окне Loginom — не меняйте схему до конца шага';
const paintTimeoutMs = 250;

function showWarning({ id, origin, text }) {
  if (location.origin !== origin || !document.documentElement || document.getElementById(id)) return;
  const layer = document.createElement('div');
  layer.id = id;
  layer.inert = true;
  layer.style.cssText = 'all:initial;position:fixed;inset:12px 12px auto auto;z-index:2147483647;pointer-events:none';
  const label = document.createElement('div');
  label.setAttribute('role', 'status');
  label.style.cssText = 'font:14px system-ui;color:#23200e;background:#fff4cb;border:1px solid #d1b36d;border-radius:6px;padding:8px 12px;max-width:min(430px,calc(100vw - 52px));pointer-events:none';
  label.textContent = text;
  layer.attachShadow({ mode: 'closed' }).append(label);
  document.documentElement.append(layer);
}

function removeWarning({ id, origin }) {
  if (location.origin === origin) document.getElementById(id)?.remove();
}

export function createProtectedOperation(page, origin) {
  const windowId = randomUUID();
  const listeners = new Set();
  let current;
  const publish = snapshot => {
    current = snapshot;
    for (const listener of listeners) listener(snapshot);
  };
  return {
    snapshot: () => current,
    subscribe(listener) {
      if (current?.active) listener(current);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async begin(operationId) {
      if (current?.active) throw Error('A protected Loginom operation is already active');
      const started = { version: 1, windowId, operationId, active: true };
      const id = 'loginom-agent-busy-' + randomUUID();
      publish(started);
      let ended = false;
      const remove = async () => page?.evaluate(removeWarning, { id, origin });
      const paint = async () => {
        await page?.evaluate(showWarning, { id, origin, text: warning }).catch(() => undefined);
        if (ended) void remove().catch(() => undefined);
      };
      const repaint = () => { void paint().catch(() => undefined); };
      if (page) {
        page.on('domcontentloaded', repaint);
        let timer;
        try {
          await Promise.race([paint(), new Promise(resolve => { timer = setTimeout(resolve, paintTimeoutMs); })]);
        } finally { clearTimeout(timer); }
      }
      return () => {
        if (ended) return;
        ended = true;
        page?.off('domcontentloaded', repaint);
        publish({ ...started, active: false });
        void remove().catch(() => undefined);
      };
    },
  };
}
