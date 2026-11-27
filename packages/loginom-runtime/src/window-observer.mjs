export function observeLoginomWindow({ page, openedAt, busy, readPackage, publish, signal }, interval = 2_000) {
  if (page.isClosed() || signal.aborted) return
  let stopped = false
  let timer
  let cdp
  let minimized = false
  let packageInfo = null
  let previous

  function update() {
    if (stopped) return
    const snapshot = { openedAt, state: busy() ? "busy" : minimized ? "minimized" : "open", package: packageInfo }
    const current = JSON.stringify(snapshot)
    if (current === previous) return
    previous = current
    publish(snapshot)
  }

  function stop() {
    stopped = true
    clearTimeout(timer)
    page.off("close", stop)
    signal.removeEventListener("abort", stop)
    void cdp?.detach().catch(() => undefined)
    publish(null)
  }

  async function sample() {
    try {
      cdp ??= await page.context().newCDPSession(page)
      if (stopped) {
        await cdp.detach().catch(() => undefined)
        return
      }
      const { bounds } = await cdp.send("Browser.getWindowForTarget")
      minimized = bounds.windowState === "minimized"
      update()
    } catch {
      // A failed bounds read does not establish that Chromium closed.
      void cdp?.detach().catch(() => undefined)
      cdp = undefined
    }
    if (stopped) return
    if (!busy()) {
      packageInfo = await readPackage().catch(() => null)
      update()
    }
    if (!stopped) timer = setTimeout(sample, interval).unref()
  }

  page.once("close", stop)
  signal.addEventListener("abort", stop, { once: true })
  update()
  void sample()
  return update
}
