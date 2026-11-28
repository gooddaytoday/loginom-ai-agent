import { expect, type Page, type TestInfo } from "@playwright/test"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isolatedEnv } from "../../../cli/test/fixture/environment"
import { draftHref, seed } from "./app"
import { gatePassword, type GateScenario } from "./gate-scenarios"
import { APP_READY_TIMEOUT } from "./waits"

type Gate = { url: string; loginomURL: string; directory: string; requests: unknown[]; openedPackages: string[] }

export async function withGate(
  page: Page,
  renderer: string | undefined,
  scenario: GateScenario,
  run: (gate: Gate) => Promise<void>,
) {
  if (!renderer) throw Error("Expected the gate renderer URL")
  const root = await mkdtemp(path.join(os.tmpdir(), "loginom-gate-"))
  const directory = path.join(root, "work")
  try {
    const runtime = path.join(root, "runtime")
    await mkdir(runtime, { mode: 0o700 })
    const child = spawn("bun", [path.join(import.meta.dirname, "gate-backend.ts"), root, scenario], {
      cwd: root,
      env: isolatedEnv(root, {
        XDG_RUNTIME_DIR: runtime,
        LOGINOM_AI_AGENT_CLI_ROOT: undefined,
        LOGINOM_AI_AGENT_RESOURCES: undefined,
      }),
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    })
    const exited = once(child, "exit")
    let stderr = ""
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk
    })
    const requests: unknown[] = []
    const openedPackages: string[] = []
    const ready = Promise.withResolvers<Pick<Gate, "url" | "loginomURL">>()
    child.on("message", (message: unknown) => {
      if (typeof message !== "object" || !message || !("kind" in message)) return
      if (
        message.kind === "ready" &&
        "url" in message &&
        typeof message.url === "string" &&
        "loginomURL" in message &&
        typeof message.loginomURL === "string"
      ) {
        ready.resolve({ url: message.url, loginomURL: message.loginomURL })
      }
      if (message.kind === "model" && "body" in message) requests.push(message.body)
      if (message.kind === "package-opened" && "path" in message && typeof message.path === "string") {
        openedPackages.push(message.path)
      }
    })
    try {
      const { url, loginomURL } = await Promise.race([
        ready.promise,
        exited.then(([code]) => {
          throw Error(`Gate backend exited (${code})\n${stderr}`)
        }),
      ])
      await page.context().route(/^https?:\/\/(?!127\.0\.0\.1:\d+\/)/, (route) => route.abort())
      // Loginom settings use the serving origin. Put the built renderer on the isolated API server's origin.
      await page.context().route(
        (target) => target.origin === url && !target.pathname.startsWith("/api/"),
        async (route) => {
          const target = new URL(route.request().url())
          const response = await route.fetch({ url: new URL(target.pathname + target.search, renderer).href })
          await route.fulfill({ response })
        },
      )
      await seed(page, {
        locale: "ru",
        storage: {
          "opencode.global.dat:server": { list: [{ type: "http", http: { url, password: gatePassword } }] },
        },
        tabs: [{ draft: "gate", directory, server: url }],
      })
      await page.goto(new URL(draftHref("gate"), url).href)
      await run({ url, loginomURL, directory, requests, openedPackages })
    } finally {
      if (child.connected) child.disconnect()
      await exited
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

export function gateEditor(page: Page) {
  return page.locator('[data-component="composer-editor"]')
}

export async function sendGatePrompt(page: Page, prompt: string) {
  const editor = gateEditor(page)
  await expect(editor).toBeEditable({ timeout: APP_READY_TIMEOUT })
  await editor.fill(prompt)
  const send = page.locator('[data-action="composer-submit"]:visible')
  await expect(send).toBeEnabled()
  await send.click()
  await expect(page.getByText(prompt, { exact: true })).toBeVisible({ timeout: APP_READY_TIMEOUT })
}

export async function gateScreenshot(page: Page, info: TestInfo, name: string) {
  const filename = `${name}-${page.viewportSize()?.width}.png`
  const path = info.outputPath(filename)
  await page.screenshot({ path, animations: "disabled" })
  await info.attach(filename, { path, contentType: "image/png" })
}
