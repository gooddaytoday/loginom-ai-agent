// Run with Node 24 against a built Desktop; uses an isolated profile.
import { createRequire } from "node:module"
import { mkdir, mkdtemp } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { mockOpenCodeServer } from "../../../app/e2e/utils/mock-server.ts"
import { fixture, pageMessages } from "../../../app/e2e/performance/timeline/session-timeline-stress.fixture.ts"

const require = createRequire(new URL("../../../app/package.json", import.meta.url))
const { _electron, expect: playwrightExpect } = require("@playwright/test") as typeof import("@playwright/test")
const expect = playwrightExpect.configure({ timeout: 30_000 })
const directory = resolve(import.meta.dirname, "../..")
const executablePath =
  process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ?? resolve(directory, "node_modules/electron/dist/electron")
const evidence = await mkdtemp(join(tmpdir(), "dashboard-chat-"))
const projectA = join(evidence, "project-a")
const projectB = join(evidence, "ordinary", "dashboards", "project-b", "work")
const first = "9465655a-84c2-4fd3-bcfe-a2c4024168e2"
const second = "9465655a-84c2-4fd3-bcfe-a2c4024168e3"
const notConfigured = "9465655a-84c2-4fd3-bcfe-a2c4024168e5"
const historicalDashboard = "Dashboard opened from history"
const launch = () =>
  _electron.launch({
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

const sessions = fixture.sessions.map((session) =>
  session.id === fixture.targetID
    ? { ...session, directory: projectB, projectID: "proj_desktop_b" }
    : { ...session, directory: projectA },
)
const requestedDirectories: string[] = []

async function setup(application: Awaited<ReturnType<typeof launch>>, firstLaunch: boolean) {
  const page = await application.firstWindow({ timeout: 120_000 })
  page.setDefaultTimeout(30_000)
  const channel = await application.evaluate(() => process.env.LOGINOM_AI_AGENT_CHANNEL)
  const slug = channel === "prod" ? "loginom-ai-agent" : `loginom-ai-agent-${channel}`
  const dashboard = join(evidence, "profile", "data", slug, "dashboards", "campaign-fixture", "work")
  await mkdir(dashboard, { recursive: true })
  await mkdir(projectA, { recursive: true })
  await mkdir(projectB, { recursive: true })
  if (firstLaunch) {
    sessions.push({
      ...fixture.sessions[0]!,
      id: "ses_dashboard_from_history",
      directory: dashboard,
      title: historicalDashboard,
    })
  }
  const init = await page.evaluate(() => window.api.awaitInitialization())
  process.env.PLAYWRIGHT_SERVER_PORT = new URL(init.url).port
  page.on("request", (request) => {
    const url = new URL(request.url())
    const directory = url.searchParams.get("directory")
    if (url.origin === new URL(init.url).origin && directory) requestedDirectories.push(directory)
  })
  await mockOpenCodeServer(page, {
    provider: fixture.provider,
    directory: projectA,
    project: { ...fixture.project, worktree: projectA },
    sessions,
    pageMessages,
    sessionStatus: { [fixture.sourceID]: { type: "busy" } },
  })
  await page.route(
    (url) => url.origin === new URL(init.url).origin && url.pathname === "/session",
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      const session = {
        ...fixture.sessions[0]!,
        id: `ses_dashboard_test_${sessions.length}`,
        directory: new URL(route.request().url()).searchParams.get("directory") ?? "",
        title: `Submitted chat ${sessions.length}`,
      }
      sessions.push(session)
      await route.fulfill({ json: session, headers: { "access-control-allow-origin": "*" } })
    },
  )
  // Snapshot and Loginom readiness are fixtures; routing, drafts and IPC are real.
  await application.evaluate(
    ({ ipcMain }, { first, second, notConfigured, directory }) => {
      ipcMain.removeHandler("get-dashboard-target")
      ipcMain.handle("get-dashboard-target", (_event, id: string) => {
        if (id === notConfigured) throw new Error("DASHBOARD_NOT_CONFIGURED")
        if (id !== first && id !== second) throw new Error("DASHBOARD_SNAPSHOT_UNAVAILABLE")
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
  if (firstLaunch) {
    await page.evaluate(
      async ({ directory, projectB }) => {
        await window.api.finishFirstLaunchOnboarding(false)
        await window.api.storeSet("loginom-ai-agent.global.dat", "language", JSON.stringify({ locale: "en" }))
        await window.api.storeSet(
          "loginom-ai-agent.global.dat",
          "server",
          JSON.stringify({
            projects: {
              local: [
                { worktree: directory, expanded: true },
                { worktree: projectB, expanded: true },
              ],
            },
            lastProject: { local: directory },
          }),
        )
      },
      { directory: projectA, projectB },
    )
  }
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
  return { page, dashboard, origin: new URL(init.url).origin }
}

let application = await launch()
try {
  const initial = await setup(application, true)
  const dashboard = initial.dashboard
  let page = initial.page
  let origin = initial.origin
  await page.locator('[data-component="home-session-row"]').filter({ hasText: fixture.expected.sourceTitle }).click()
  const getEditor = () => page.locator('[data-component="prompt-input"][contenteditable="true"]')
  const editor = getEditor()
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
  const editHref = await drafts.getAttribute("href")
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

  await page.getByRole("button", { name: "Home", exact: true }).click()
  await page.locator('[data-component="home-session-row"]').filter({ hasText: fixture.expected.targetTitle }).click()
  const otherProject = page.locator('[data-slot="titlebar-tabs"] a').filter({ hasText: fixture.expected.targetTitle })
  await expect(otherProject).toBeVisible()
  await expect(editor).toBeEditable()
  await editor.fill("Stay in project B")
  const tabAt = (href: string | null) => page.locator(`[data-slot="titlebar-tabs"] a[href="${href}"]`)
  const activeTab = () => page.locator('[data-titlebar-tab-slot][data-active="true"]')
  const activeLink = () => activeTab().locator("a[data-titlebar-tab-link]")
  const plus = () => page.getByRole("button", { name: "New session", exact: true })
  const chip = () => page.getByText("Dashboard edit “Existing dashboard”", { exact: true })
  const closeActive = () => activeTab().getByRole("button", { name: "Close tab", exact: true }).click()
  const submit = async (message: string, expectedDirectory: string, dashboardContext = false) => {
    const request = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return url.origin === origin && url.pathname === "/session" && request.method() === "POST"
    })
    const sent = page.waitForRequest((request) => {
      return new URL(request.url()).pathname.endsWith("/prompt_async") && request.method() === "POST"
    })
    await getEditor().fill(message)
    await getEditor().press("Enter")
    expect(new URL((await request).url()).searchParams.get("directory")).toBe(expectedDirectory)
    const submitted = (await sent).postDataJSON() as { parts: { synthetic?: boolean }[] }
    expect(submitted.parts).toHaveLength(dashboardContext ? 2 : 1)
    expect(submitted.parts.some((part) => part.synthetic === true)).toBe(dashboardContext)
    const session = sessions.at(-1)!
    const tab = activeTab().locator(`a[href$="/session/${session.id}"]`)
    await expect(tab).toBeVisible()
    return tab.getAttribute("href")
  }

  const expectNewChat = async (from: string | null, folder: string) => {
    await tabAt(from).click()
    await expect(activeLink()).toHaveAttribute("href", from!)
    await plus().click()
    await expect(activeLink()).toHaveAttribute("href", /^\/new-session\?draftId=/)
    await expect(activeLink()).not.toHaveAttribute("href", from!)
    await expect(getEditor()).toBeEditable()
    await expect(getEditor()).toHaveText("")
    await expect(chip()).toHaveCount(0)
    await submit("Check the project of this new chat", folder)
    await closeActive()
  }

  await open(first, "edit")
  await expect(drafts).toHaveCount(5)
  await expect(chip()).toBeVisible()
  const fromB = await activeLink().getAttribute("href")
  await expectNewChat(editHref, projectA)
  await expectNewChat(fromB, projectB)
  await expectNewChat(await otherProject.getAttribute("href"), projectB)
  await expectNewChat(href, projectA)
  await tabAt(href).click()
  await expect(editor).toHaveText("Keep the new dashboard draft too")
  await expect(page.getByText("Dashboard draft for node “New dashboard”", { exact: true })).toBeVisible()

  await tabAt(editHref).click()
  await expect(chip()).toBeVisible()
  const promotedA = await submit("Start editing the dashboard from project A", dashboard, true)
  await tabAt(fromB).click()
  await expect(chip()).toBeVisible()
  const promotedB = await submit("Start editing the dashboard from project B", dashboard, true)
  await expectNewChat(promotedA, projectA)
  await expectNewChat(promotedB, projectB)

  await application.close()
  application = await launch()
  const restored = await setup(application, false)
  page = restored.page
  origin = restored.origin
  await expectNewChat(promotedA, projectA)
  await expectNewChat(promotedB, projectB)

  await application.evaluate(({ dialog }, projectB) => {
    const results = [null, null, projectB]
    dialog.showOpenDialog = async () => {
      const result = results.shift()
      console.log("Dashboard test: native project picker opened")
      return { canceled: !result, filePaths: result ? [result] : [] }
    }
  }, projectB)
  const waitPicker = () =>
    application.waitForEvent("console", (message) => message.text() === "Dashboard test: native project picker opened")
  const home = () => page.getByRole("button", { name: "Home", exact: true }).click()
  const historyRow = () => page.locator('[data-component="home-session-row"]').filter({ hasText: historicalDashboard })
  await home()
  await historyRow().click()
  await expect(activeLink().locator("[data-titlebar-tab-title]")).toHaveText(historicalDashboard)
  const fromHistory = waitPicker()
  await plus().click()
  await fromHistory
  await expect(activeLink().locator("[data-titlebar-tab-title]")).toHaveText(historicalDashboard)

  // With no project selected on Home, Studio cannot supply an originating project.
  await home()
  await expect(historyRow()).toBeVisible()
  await open(first, "edit")
  await expect(chip()).toBeVisible()
  const unknown = await activeLink().getAttribute("href")
  const cancelled = waitPicker()
  await plus().click()
  await cancelled
  await expect(activeLink()).toHaveAttribute("href", unknown!)
  await expect(chip()).toBeVisible()
  const picked = waitPicker()
  await plus().click()
  await picked
  await expect(chip()).toHaveCount(0)
  await expect(getEditor()).toHaveText("")
  await submit("Check the project selected in the picker", projectB)
  await tabAt(unknown).click()
  await expect(chip()).toBeVisible()
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
      newChatInOriginProject: true,
      bothOriginsPreservedAfterPromotionAndRestart: true,
      unknownOriginUsesProjectPicker: true,
    }),
  )
} catch (error) {
  console.error("Dashboard chat regression failed; evidence:", evidence)
  await application
    .windows()[0]
    ?.screenshot({ path: join(evidence, "failure.png") })
    .catch(() => undefined)
  throw error
} finally {
  await application.close()
}
