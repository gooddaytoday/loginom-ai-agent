import { setTimeout } from 'node:timers/promises';

async function withWindow(page, unavailable, action) {
  if (!page || page.isClosed()) return 'no-window';
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
    const {windowId, bounds} = await cdp.send('Browser.getWindowForTarget');
    return await action(cdp, windowId, bounds);
  } catch {
    return page.isClosed() ? 'no-window' : unavailable;
  } finally {
    await cdp?.detach().catch(() => undefined);
  }
}

export async function showBrowserWindow(page, platform = process.platform) {
  return withWindow(page, 'manual', async (cdp, windowId, bounds) => {
    if (bounds.windowState === 'minimized')
      await cdp.send('Browser.setWindowBounds', {windowId, bounds:{windowState:'normal'}});
    await cdp.send('Page.bringToFront');
    const focused = await page.waitForFunction(() => document.hasFocus(), undefined, {timeout:500});
    await focused.dispose();
    if (platform === 'win32') {
      const browser = await page.context().browser()?.newBrowserCDPSession();
      if (!browser) return 'manual';
      try {
        const {processInfo} = await browser.send('SystemInfo.getProcessInfo');
        const pid = processInfo.find(process => process.type === 'browser')?.id;
        return Number.isSafeInteger(pid) && pid > 0 ? {pid} : 'manual';
      } finally {
        await browser.detach().catch(() => undefined);
      }
    }
    return 'focused';
  });
}

const geometry = ['left', 'top', 'width', 'height'];
const matches = (observed, expected, tolerance = 1) => observed.windowState === expected.windowState &&
  geometry.every(key => Math.abs(observed[key] - expected[key]) <= tolerance);
export const validWindowBounds = rect => rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) &&
  rect.width > 0 && rect.height > 0;

export function readWindowBounds(page) {
  return withWindow(page, undefined, (_cdp, _id, bounds) => bounds).then(bounds => bounds === 'no-window' ? undefined : bounds);
}

export async function prepareBrowserWindow(page, rect) {
  const initial = await readWindowBounds(page);
  if (!rect || (initial?.windowState === 'normal' && initial.width > rect.width &&
      initial.left + initial.width === rect.x + rect.width && initial.top === rect.y && initial.height === rect.height)) return initial;
  await placeBrowserWindow(page, rect);
  return readWindowBounds(page);
}

export function placeBrowserWindow(page, rect, baseline) {
  if (!validWindowBounds(rect)) return 'layout-unavailable';
  return withWindow(page, 'layout-unavailable', async (cdp, windowId, bounds) => {
    if (baseline && !matches(bounds, baseline, 0)) return 'unchanged';
    const requested = {left:rect.x, top:rect.y, width:rect.width, height:rect.height};
    const expected = {...requested, windowState:'normal'};
    if (matches(bounds, expected)) return 'placed';
    const waitForBounds = async (matches) => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const reply = await cdp.send('Browser.getWindowBounds', {windowId});
        if (matches(reply.bounds)) return true;
        await setTimeout(35);
      }
      return false;
    };
    if (bounds.windowState !== 'normal') {
      await cdp.send('Browser.setWindowBounds', {windowId, bounds:{windowState:'normal'}});
      if (!await waitForBounds(bounds => bounds.windowState === 'normal')) return 'layout-unavailable';
    }
    await cdp.send('Browser.setWindowBounds', {windowId, bounds:requested});
    const placed = await waitForBounds(observed => matches(observed, expected));
    return placed ? 'placed' : 'layout-unavailable';
  });
}
