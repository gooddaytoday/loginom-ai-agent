import { addAbortListener } from 'node:events';
import { setTimeout } from 'node:timers/promises';

function deadline(shutdown) {
  const timeout = AbortSignal.timeout(1800);
  return shutdown ? AbortSignal.any([shutdown, timeout]) : timeout;
}

async function within(signal, start) {
  signal.throwIfAborted();
  let listener;
  try {
    return await Promise.race([start(), new Promise((_resolve, reject) => {
      listener = addAbortListener(signal, () => reject(signal.reason));
    })]);
  } finally {
    listener?.[Symbol.dispose]();
  }
}

async function detach(session) {
  try { await session.detach(); } catch {}
}

async function withCDP(signal, attach, action) {
  let session;
  try {
    await within(signal, async () => {
      const acquired = await attach();
      if (signal.aborted) void detach(acquired);
      else session = acquired;
    });
    const send = (...args) => within(signal, () => session.send(...args));
    return await action(send);
  } finally {
    if (session) {
      const detached = detach(session);
      await within(signal, () => detached).catch(() => undefined);
    }
  }
}

async function withWindow(page, unavailable, action, signal) {
  if (!page || page.isClosed()) return 'no-window';
  try {
    return await withCDP(signal, () => page.context().newCDPSession(page), async send => {
      const {windowId, bounds} = await send('Browser.getWindowForTarget');
      return action(send, windowId, bounds);
    });
  } catch {
    return page.isClosed() ? 'no-window' : unavailable;
  }
}

export async function showBrowserWindow(page, platform = process.platform, shutdown) {
  const signal = deadline(shutdown);
  return withWindow(page, 'manual', async (send, windowId, bounds) => {
    if (bounds.windowState === 'minimized')
      await send('Browser.setWindowBounds', {windowId, bounds:{windowState:'normal'}});
    await send('Page.bringToFront');
    await within(signal, async () => {
      const focused = await page.waitForFunction(() => document.hasFocus(), undefined, {timeout:500});
      await focused.dispose();
    });
    if (platform === 'win32') {
      const browser = page.context().browser();
      if (!browser) return 'manual';
      return withCDP(signal, () => browser.newBrowserCDPSession(), async send => {
        const {processInfo} = await send('SystemInfo.getProcessInfo');
        const pid = processInfo.find(process => process.type === 'browser')?.id;
        return Number.isSafeInteger(pid) && pid > 0 ? {pid} : 'manual';
      });
    }
    return 'focused';
  }, signal);
}

const geometry = ['left', 'top', 'width', 'height'];
const matches = (observed, expected, tolerance = 1) => observed.windowState === expected.windowState &&
  geometry.every(key => Math.abs(observed[key] - expected[key]) <= tolerance);
export const validWindowBounds = rect => rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) &&
  rect.width > 0 && rect.height > 0;

export function readWindowBounds(page, signal = deadline()) {
  return withWindow(page, undefined, (_send, _id, bounds) => bounds, signal).then(bounds => bounds === 'no-window' ? undefined : bounds);
}

export async function prepareBrowserWindow(page, rect, shutdown) {
  const signal = deadline(shutdown);
  const initial = await readWindowBounds(page, signal);
  if (!rect || (initial?.windowState === 'normal' && initial.width > rect.width &&
      initial.left + initial.width === rect.x + rect.width && initial.top === rect.y && initial.height === rect.height)) return initial;
  await placeBrowserWindow(page, rect, { shutdown: signal });
  return readWindowBounds(page, signal);
}

export function placeBrowserWindow(page, rect, { baseline, confirmed, attempted, onBaseline, onAttempt, mayPlace, shutdown } = {}) {
  if (!validWindowBounds(rect)) return 'layout-unavailable';
  const signal = deadline(shutdown);
  return withWindow(page, 'layout-unavailable', async (send, windowId, bounds) => {
    const requested = {left:rect.x, top:rect.y, width:rect.width, height:rect.height};
    const expected = {...requested, windowState:'normal'};
    const previous = confirmed ?? baseline;
    if (!baseline) onBaseline?.(bounds);
    const recovered = !confirmed && attempted && matches(bounds, attempted);
    if (!recovered && previous && !matches(bounds, previous, 0)) return 'moved';
    if (mayPlace && !mayPlace()) return 'unchanged';
    if (matches(bounds, expected)) return bounds;
    if (confirmed || recovered) return 'unchanged';
    const waitForBounds = async (matches) => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const reply = await send('Browser.getWindowBounds', {windowId});
        if (matches(reply.bounds)) return reply.bounds;
        await setTimeout(35, undefined, {signal});
      }
    };
    if (bounds.windowState !== 'normal') {
      await send('Browser.setWindowBounds', {windowId, bounds:{windowState:'normal'}});
      if (!await waitForBounds(bounds => bounds.windowState === 'normal')) return 'layout-unavailable';
    }
    signal.throwIfAborted();
    onAttempt?.(expected);
    await send('Browser.setWindowBounds', {windowId, bounds:requested});
    return await waitForBounds(observed => matches(observed, expected)) ?? 'layout-unavailable';
  }, signal);
}
