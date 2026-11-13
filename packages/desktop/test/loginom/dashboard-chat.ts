// Run with Node 24 against a built Desktop; uses an isolated profile.
import { createRequire } from "node:module"
import { mkdtemp } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { mockOpenCodeServer } from "../../../app/e2e/utils/mock-server.ts"
import { fixture, pageMessages } from "../../../app/e2e/performance/timeline/session-timeline-stress.fixture.ts"

const require = createRequire(new URL("../../../app/package.json", import.meta.url))
const { _electron, expect } = require("@playwright/test") as typeof import("@playwright/test")
const directory = resolve(import.meta.dirname, "../..")
const executablePath =
  process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ?? resolve(directory, "node_modules/electron/dist/electron")
const evidence = await mkdtemp(join(tmpdir(), "dashboard-chat-"))
const dashboard = join(evidence, "dashboards", "campaign-fixture", "work")
const first = "9465655a-84c2-4fd3-bcfe-a2c4024168e2"
const second = "9465655a-84c2-4fd3-bcfe-a2c4024168e3"
const notConfigured = "9465655a-84c2-4fd3-bcfe-a2c4024168e5"
const application = await _electron.launch({
  executablePath,
  args: process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ? [] : [directory],
  cwd: directory,
  env: {
    ...process.env,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
    LOGINOM_AI_AGENT_TEST_ROOT: join(evidence, "profile"),
    LOGINOM_AI_AGENT_PURE: "1",
  },
  timeout: 120_000,
})

try {
  const page = await application.firstWindow()
  page.setDefaultTimeout(30_000)
  const init = await page.evaluate(() => window.api.awaitInitialization())
  process.env.PLAYWRIGHT_SERVER_PORT = new URL(init.url).port
  const requestedDirectories: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    const directory = url.searchParams.get("directory")
    if (url.origin === new URL(init.url).origin && directory) requestedDirectories.push(directory)
  })
  await mockOpenCodeServer(page, {
    provider: fixture.provider,
    directory: fixture.directory,
    project: fixture.project,
    sessions: fixture.sessions,
    pageMessages,
    sessionStatus: { [fixture.sourceID]: { type: "busy" } },
  })
  // Snapshot and Loginom readiness are fixtures; routing, drafts and IPC are real.
  await application.evaluate(
    ({ ipcMain }, { first, second, notConfigured, directory }) => {
      ipcMain.removeHandler("get-dashboard-target")
      ipcMain.handle("get-dashboard-target", (_event, id: string) => {
        if (id === notConfigured) throw new Error("DASHBOARD_NOT_CONFIGURED")
        if (id !== first && id !== second) throw new Error("Snapshot unavailable")
        return {
          directory,
          nodeName: id === first ? "Existing dashboard" : "New dashboard",
          action: id === first ? "edit" : "create",
          fresh: true,
        }
      })
      ipcMain.removeHandler("check-dashboard-target")
      ipcMain.handle("check-dashboard-target", (_event, id: string) => id === first || id === second)
      ipcMain.removeHandler("loginom-read")
      ipcMain.handle("loginom-read", () => ({ generation: 1, state: "ready" }))
    },
    { first, second, notConfigured, directory: dashboard },
  )
  await page.evaluate(async (directory) => {
    await window.api.finishFirstLaunchOnboarding(false)
    await window.api.storeSet("loginom-ai-agent.global.dat", "language", JSON.stringify({ locale: "en" }))
    await window.api.storeSet(
      "loginom-ai-agent.global.dat",
      "server",
      JSON.stringify({
        projects: { local: [{ worktree: directory, expanded: true }] },
        lastProject: { local: directory },
      }),
    )
  }, fixture.directory)
  const renderer = process.env.LOGINOM_AI_AGENT_TEST_RENDERER
  if (renderer)
    await application.evaluate(
      ({ protocol, net }, file) => {
        protocol.unhandle("loginom-ai-agent-app")
        protocol.handle("loginom-ai-agent-app", (request) =>
          net.fetch(new URL(new URL(request.url).pathname.slice(1), file).href),
        )
      },
      pathToFileURL(resolve(renderer)).href,
    )
  await page.goto(page.url() + "?dashboard-chat-test")
  await page.locator('[data-component="home-session-row"]').filter({ hasText: fixture.expected.sourceTitle }).click()
  const editor = page.locator('[data-component="prompt-input"][contenteditable="true"]')
  await expect(editor).toBeEditable()
  await expect(page.getByRole("button", { name: /^(Stop|Остановить)$/ })).toBeVisible()
  const original = page.locator('[data-slot="titlebar-tabs"] a').filter({ hasText: fixture.expected.sourceTitle })
  await expect(original).toBeVisible()
  await editor.fill("Keep this draft for the existing dashboard")

  const open = (id: string, action: "create" | "edit") =>
    application.evaluate(({ app }, url) => {
      app.emit("second-instance", {}, ["loginom-ai-agent", url], "")
    }, `loginom-ai-agent://dashboard?id=${id}&action=${action}`)
  const drafts = page.locator('[data-slot="titlebar-tabs"] a[href^="/new-session?draftId="]')
  await open(first, "edit")
  await expect(drafts).toHaveCount(1)
  await expect(page.getByText("Dashboard edit “Existing dashboard”", { exact: true })).toBeVisible()
  await expect(editor).toHaveText("")
  // Project display names come from fixtures; the backend request carries the selected folder.
  await expect.poll(() => requestedDirectories).toContain(dashboard)
  await open(second, "create")
  await expect(drafts).toHaveCount(2)
  await expect(page.getByText("Dashboard draft for node “New dashboard”", { exact: true })).toBeVisible()
  await expect(editor).toHaveText("")
  await original.click()
  await expect(editor).toHaveText("Keep this draft for the existing dashboard")
  await expect(page.getByText("Dashboard edit “Existing dashboard”", { exact: true })).toHaveCount(0)
  // With draft text the composer shows Send; Stop is exposed when it is empty.
  await editor.fill("")
  await expect(page.getByRole("button", { name: /^(Stop|Остановить)$/ })).toBeVisible()
  await editor.fill("Keep this draft for the existing dashboard")
  await page.screenshot({ path: join(evidence, "original-preserved.png") })
  const created = drafts.nth(1)
  const href = await created.getAttribute("href")
  await created.click()
  await editor.fill("Keep the new dashboard draft too")
  await open(second, "edit")
  await expect(drafts).toHaveCount(3)
  await expect(page.getByText("Dashboard edit “New dashboard”", { exact: true })).toBeVisible()
  await expect(editor).toHaveText("")
  await open(first, "create")
  await expect(drafts).toHaveCount(4)
  await expect(page.getByText("Dashboard draft for node “Existing dashboard”", { exact: true })).toBeVisible()
  await page.locator(`[data-slot="titlebar-tabs"] a[href="${href}"]`).click()
  await expect(editor).toHaveText("Keep the new dashboard draft too")
  await expect(page.getByText("Dashboard draft for node “New dashboard”", { exact: true })).toBeVisible()
  await open("9465655a-84c2-4fd3-bcfe-a2c4024168e4", "create")
  await expect(
    page.getByText(
      "The snapshot was already used, has expired or belongs to another stand. Press the button in Studio again.",
      { exact: true },
    ),
  ).toBeVisible()
  await expect(drafts).toHaveCount(4)
  await expect(editor).toHaveText("Keep the new dashboard draft too")
  await open(notConfigured, "create")
  await expect(page.getByText("Connect a Loginom stand in settings first.", { exact: true })).toBeVisible()
  await expect(drafts).toHaveCount(4)
  await expect(editor).toHaveText("Keep the new dashboard draft too")
  console.log(
    JSON.stringify({
      status: "PASS",
      evidence,
      busyChatPreserved: true,
      separateCreateDraft: true,
      separateEditDraft: true,
      dashboardFolder: true,
      repeatedCreate: true,
      snapshotFailurePreserved: true,
      notConfiguredPreserved: true,
    }),
  )
} catch (error) {
  console.error("Dashboard chat regression failed; evidence:", evidence)
  await application
    .firstWindow()
    .then((page) => page.screenshot({ path: join(evidence, "failure.png") }))
    .catch(() => undefined)
  throw error
} finally {
  await application.close()
}
