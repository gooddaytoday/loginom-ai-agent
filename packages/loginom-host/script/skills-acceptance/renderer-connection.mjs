export async function allowLocalGuiWithUnconfiguredHost(application, page) {
  const connection = await page.evaluate(() => window.api.loginom.read())
  if (connection.generation || connection.state !== "unconfigured") throw Error("UNCONFIGURED_STATE_REQUIRED")
  // These tests need the local UI and an unconfigured real Host. Override only
  // the renderer's startup read in the isolated, Playwright-owned process.
  await application.evaluate(({ ipcMain }, view) => {
    ipcMain.removeHandler("loginom-read")
    ipcMain.handle("loginom-read", () => ({ ...view, generation: 1, revision: 1, state: "ready" }))
  }, connection)
  await page.reload()
}
