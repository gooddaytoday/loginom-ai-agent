import { randomUUID } from 'node:crypto';

const warning = 'Агент работает в окне Loginom — не меняйте схему до конца шага';

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

export function createProtectedOperation(context, origin) {
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
      const pages = context.pages().filter(page => !page.isClosed() && URL.parse(page.url())?.origin === origin);
      const page = pages.length === 1 ? pages[0] : undefined;
      let painting, ending;
      const paint = () => {
        if (!page) return;
        painting = page.evaluate(showWarning, { id, origin, text: warning }).catch(() => undefined);
      };
      page?.on('domcontentloaded', paint);
      paint();
      await painting;
      return () => ending ??= (async () => {
        page?.off('domcontentloaded', paint);
        await painting;
        await page?.evaluate(({ id, origin }) => {
          if (location.origin === origin) document.getElementById(id)?.remove();
        }, { id, origin }).catch(() => undefined);
        publish({ ...started, active: false });
      })();
    },
  };
}
