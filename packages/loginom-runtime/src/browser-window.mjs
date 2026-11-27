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

export function showBrowserWindow(page) {
  return withWindow(page, 'focus-unconfirmed', async (cdp, windowId, bounds) => {
    if (bounds.windowState === 'minimized')
      await cdp.send('Browser.setWindowBounds', {windowId, bounds:{windowState:'normal'}});
    await cdp.send('Page.bringToFront');
    const focused = await page.waitForFunction(() => document.hasFocus(), undefined, {timeout:500});
    await focused.dispose();
    return 'focused';
  });
}

export function placeBrowserWindow(page, rect) {
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) ||
      rect.width <= 0 || rect.height <= 0) return 'layout-unavailable';
  return withWindow(page, 'layout-unavailable', async (cdp, windowId, bounds) => {
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
    const requested = {left:rect.x, top:rect.y, width:rect.width, height:rect.height};
    await cdp.send('Browser.setWindowBounds', {windowId, bounds:requested});
    const placed = await waitForBounds(bounds => bounds.windowState === 'normal' &&
      Object.entries(requested).every(([key, value]) => Math.abs(bounds[key] - value) <= 1));
    return placed ? 'placed' : 'layout-unavailable';
  });
}
