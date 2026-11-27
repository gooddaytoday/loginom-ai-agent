export async function showBrowserWindow(page) {
  if (!page || page.isClosed()) return 'no-window';
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
    const {windowId} = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {windowId, bounds:{windowState:'normal'}});
    await cdp.send('Page.bringToFront');
    const focused = await page.waitForFunction(() => document.hasFocus(), undefined, {timeout:500});
    await focused.dispose();
    return 'focused';
  } catch {
    return page.isClosed() ? 'no-window' : 'focus-unconfirmed';
  } finally {
    await cdp?.detach().catch(() => undefined);
  }
}
