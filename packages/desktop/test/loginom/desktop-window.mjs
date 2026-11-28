import { execFile } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { after, before, test } from "node:test"
import { promisify } from "node:util"
import { _electron, expect } from "@playwright/test"

const desktop = resolve(import.meta.dirname, "../..")

const cli = resolve(desktop, "../cli")

const version = "2.3.0-test"

const startupFailure = "Test service could not initialize storage"

const timeout = 60_000

const expectWindow = expect.configure({ timeout })

const require = createRequire(import.meta.url)

let build

before(async () => {
  build = await mkdtemp(join(tmpdir(), "ld-"))
  await symlink(join(desktop, "node_modules"), join(build, "node_modules"), "dir")
  await mkdir(join(build, "cli", "src"), { recursive: true })
  await symlink(join(cli, "node_modules"), join(build, "cli/node_modules"), "dir")
  await copyFile(join(cli, "bunfig.toml"), join(build, "cli/bunfig.toml"))
  await writeFile(join(build, "cli/tsconfig.json"), JSON.stringify({ extends: join(cli, "tsconfig.json") }))
  await copyFile(join(import.meta.dirname, "fixtures/desktop-window-service.mjs"), join(build, "cli/src/index.ts"))
  await writeFile(join(build, "package.json"), JSON.stringify({ type: "module", main: "out/main/index.js", version }))

  try {
    await promisify(execFile)("bun", ["run", "electron-vite", "build", "--outDir", join(build, "out")], {
      cwd: desktop,
      env: {
        PATH: process.env.PATH,
        HOME: build,
        TMPDIR: build,
        LOGINOM_AI_AGENT_CHANNEL: "local",
        LOGINOM_AI_AGENT_VERSION: version,
      },
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch (error) {
    throw new Error(`Desktop test build failed\n${error.stdout ?? ""}\n${error.stderr ?? ""}`, { cause: error })
  }
})

after(async () => {
  if (build) await rm(build, { recursive: true, force: true })
})

async function launch(t, { failStartup = false, missingCli = false } = {}) {
  const profile = await mkdtemp(join(build, "p-"))
  const home = join(profile, "home")
  // Chromium places a Unix-domain socket below TMPDIR, so keep the path short.
  const tmp = join(profile, "t")
  const runtime = join(profile, "runtime")
  const userData = join(profile, "desktop")
  const servicePids = join(profile, "service-pids")
  await Promise.all([home, tmp, runtime, userData].map((directory) => mkdir(directory, { mode: 0o700 })))
  // An existing Desktop profile starts at Home instead of creating an onboarding draft.
  await writeFile(join(userData, "loginom-ai-agent.settings"), "{}")

  const app = await _electron.launch({
    executablePath: require("electron"),
    args: ["--disable-background-networking", build],
    cwd: home,
    env: {
      PATH: process.env.PATH,
      DISPLAY: process.env.DISPLAY,
      XAUTHORITY: process.env.XAUTHORITY,
      LANG: "C.UTF-8",
      // Sourcing a login shell can replace the isolated HOME and XDG paths.
      SHELL: "/bin/false",
      HOME: home,
      TMPDIR: tmp,
      XDG_RUNTIME_DIR: runtime,
      XDG_CONFIG_HOME: join(profile, "config"),
      XDG_DATA_HOME: join(profile, "data"),
      XDG_CACHE_HOME: join(profile, "cache"),
      XDG_STATE_HOME: join(home, ".local/state"),
      LOGINOM_AI_AGENT_DESKTOP_TEST_ROOT: profile,
      LOGINOM_AI_AGENT_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: "1",
      LOGINOM_AI_AGENT_DESKTOP_REMOTE_DEBUGGING_PORT: "0",
      ...(missingCli ? {} : { LOGINOM_AI_AGENT_DESKTOP_CLI_DEV: join(build, "cli") }),
      LOGINOM_AI_AGENT_VERSION: version,
      LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "1",
      LOGINOM_AI_AGENT_DISABLE_FREE_MODELS: "1",
      LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify({
        update: "disable",
        enabled_providers: ["test"],
        model: "test/test-model",
      }),
      DESKTOP_WINDOW_CLI_SOURCE: join(cli, "src/index.ts"),
      DESKTOP_WINDOW_SERVICE_PIDS: servicePids,
      DESKTOP_WINDOW_STARTUP_FAILURE: failStartup ? startupFailure : "",
    },
    timeout,
  })

  t.after(() => app.close())
  const page = await app.firstWindow({ timeout })
  page.setDefaultTimeout(timeout)

  return { app, page, home, servicePids }
}

test(
  "settings-ux: check and save Loginom settings",
  {
    skip: "LAB-2130 (C2.1): the Loginom settings page and connection RPC are still in review",
  },
  async (t) => {
    const { page } = await launch(t)
    const url = "https://loginom.example.invalid/"
    const rpc = "**/api/rpc/loginom.connection/*"
    let username = "user"
    let revision = 0

    const status = () => ({
      url,
      username,
      folder: `/${username}`,
      revision,
      generation: revision,
      state: revision ? "ready" : "unconfigured",
      hasPassword: false,
      failed: false,
    })

    await page.route(rpc, async (route) => {
      const request = route.request()

      if (request.method() !== "POST") return route.continue()
      const method = new URL(request.url()).pathname.split("/").at(-1)
      let value

      if (method === "status") value = status()
      else if (method === "check") {
        expect(request.postDataJSON()).toMatchObject({ input: { url, username: "analyst", revision: 0 } })
        value = { validationId: "checked", expiresAt: Date.now() + timeout }
      } else if (method === "save") {
        expect(request.postDataJSON()).toMatchObject({ input: { revision: 0, validationId: "checked" } })
        username = "analyst"
        revision = 1
        value = status()
      } else return route.abort()
      await route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        json: { output: { ok: true, value } },
      })
    })

    const openLoginom = async () => {
      await page.getByRole("button", { name: "Settings", exact: true }).click()
      await page.getByRole("tab", { name: "Loginom", exact: true }).click()

      return page.getByRole("tabpanel", { name: "Loginom", exact: true })
    }

    const settings = await openLoginom()
    const user = settings.getByRole("textbox", { name: "Username" })
    await expectWindow(user).toHaveValue("user")
    await user.fill("analyst")
    await settings.getByRole("button", { name: "Check", exact: true }).click()
    await expectWindow(settings.getByText("Checked, not yet saved")).toBeVisible()
    await settings.getByRole("button", { name: "Save", exact: true }).click()
    await expectWindow(settings.getByText("Connected as analyst · folder /analyst")).toBeVisible()
    await page.getByRole("button", { name: "Home", exact: true }).click()
    await expectWindow((await openLoginom()).getByRole("textbox", { name: "Username" })).toHaveValue("analyst")
  },
)

test("recovery-ui: the same window reconnects after the service crashes", async (t) => {
  const { page, servicePids } = await launch(t)
  const ready = page.getByText(/^(Create a session to get started|Создайте (сессию|разговор), чтобы начать)$/)
  await expectWindow(ready).toBeVisible()
  const pid = Number((await readFile(servicePids, "utf8")).trim().split("\n").at(-1))
  expect(Number.isSafeInteger(pid) && pid > 1).toBe(true)

  const reconnected = page.waitForResponse(
    async (response) => {
      const url = new URL(response.url())

      if (url.hostname !== "127.0.0.1" || url.pathname !== "/api/info" || !response.ok()) return false
      const info = await response.json()

      if (info.pid === pid) return false
      const owned = (await readFile(servicePids, "utf8")).trim().split("\n").map(Number)

      return owned.includes(info.pid)
    },
    { timeout },
  )

  await Promise.all([reconnected, Promise.resolve().then(() => process.kill(pid, "SIGKILL"))])
  await page.getByRole("button", { name: /^(Settings|Настройки)$/ }).click({ timeout })
  await expectWindow(page.getByTestId("settings-screen")).toBeVisible()
  await page.getByRole("button", { name: /^(Home|Главная)$/ }).click()
  await expectWindow(ready).toBeVisible()
})

test("startup-failure: the window explains why the local service did not start", async (t) => {
  const { page } = await launch(t, { failStartup: true })
  await expectWindow(
    page.getByText(/^(An error occurred while starting the local server|Произошла ошибка при запуске локального сервера)\.$/),
  ).toBeVisible()
  await expectWindow(page.getByRole("textbox", { name: /^(Error Details|Детали ошибки)$/ })).toHaveValue(
    new RegExp(startupFailure),
  )
})

test("the conversation command reaches Loginom through the Desktop window IPC", async (t) => {
  const { app, page, home } = await launch(t)
  const info = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/info")
  await page.reload()
  const request = await info
  const authorization = await request.headerValue("authorization")
  const title = "Loginom window IPC fixture"
  const response = await page.request.post(new URL("/api/session", request.url()).href, {
    headers: authorization ? { authorization } : {},
    data: { title, agent: "build", location: { directory: home } },
  })
  expect(response.ok()).toBe(true)
  const { data: conversation } = await response.json()

  await app.evaluate(() => {
    const fetchFromMain = globalThis.fetch
    globalThis.loginomWindowShows = []
    globalThis.fetch = async (input, options) => {
      const response = await fetchFromMain(input, options)
      const url = new URL(input instanceof Request ? input.url : input)
      if (url.pathname === "/api/rpc/loginom.window/show") {
        globalThis.loginomWindowShows.push({
          directory: url.searchParams.get("location[directory]"),
          input: JSON.parse(options.body).input,
          status: response.status,
        })
      }

      return response
    }
  })

  await page.getByRole("button", { name: title }).click()
  await expectWindow(page.getByRole("heading", { name: title })).toBeVisible()
  await page.keyboard.press("ControlOrMeta+Shift+P")
  const palette = page.getByRole("dialog")
  await palette.getByRole("combobox").fill("Loginom")
  await palette.getByRole("option", { name: /Show Loginom Window|Показать окно Loginom/ }).click()

  await expectWindow(
    page.getByText(/There is no Loginom window for this conversation yet|Для этого разговора пока нет окна Loginom/),
  ).toBeVisible()
  expect(await app.evaluate(() => globalThis.loginomWindowShows)).toEqual([
    { directory: home, input: { sessionID: conversation.id, location: { directory: home } }, status: 200 },
  ])
})

test("plugin inventory is available even when the local CLI cannot start", async (t) => {
  const { page } = await launch(t, { missingCli: true })
  await page.addInitScript(() => {
    window.pluginListReply = new Promise((resolve) => {
      window.addEventListener("message", ({ source, data, ports }) => {
        if (source !== window || data !== "desktop-rpc-port" || !ports[0]) return
        const port = ports[0]
        const id = "2147483647"
        port.addEventListener("message", ({ data: reply }) => {
          if (reply._tag === "Exit" && String(reply.requestId) === id) resolve(reply.exit)
        })
        port.start()
        port.postMessage({ _tag: "Request", id, tag: "PluginList", payload: null, headers: [] })
      })
    })
  })
  await page.reload()

  const reply = await page.evaluate(() =>
    Promise.race([
      window.pluginListReply,
      new Promise((_, reject) => setTimeout(() => reject(new Error("No PluginList reply")), 10_000)),
    ]),
  )
  expect(reply).toEqual({
    _tag: "Success",
    value: expect.arrayContaining([expect.objectContaining({ builtin: true, enabled: true })]),
  })
})
