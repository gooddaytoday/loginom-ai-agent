import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { expect, type Page, type TestInfo } from "@playwright/test"
import { Schema } from "effect"
import type { GateScenario } from "../../../server/test/fixture/loginom-gate-scenarios"
import { seed, sessionHref } from "./app"
import { APP_READY_TIMEOUT, expectSessionTitle } from "./waits"

const server = fileURLToPath(new URL("../../../server/test/fixture/loginom-gate-server.ts", import.meta.url))

// The standalone runtime client and the Host pin the same YAML dependency.
const runtimeDependencies = fileURLToPath(new URL("../../../loginom-host/node_modules", import.meta.url))

const readReady = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      origin: Schema.String,
      session: Schema.String,
      title: Schema.String,
      modelName: Schema.String,
    }),
  ),
)

const readStatus = Schema.decodeUnknownSync(
  Schema.Struct({ waitingRead: Schema.Boolean, calls: Schema.Array(Schema.String) }),
)

export async function withLoginomGate(
  input: { page: Page; baseURL: string; scenario: GateScenario; info: TestInfo },
  run: (gate: Awaited<ReturnType<typeof openGate>>) => Promise<void>,
) {
  const { page, baseURL, scenario, info } = input
  const root = await mkdtemp(path.join(tmpdir(), "loginom-gate-"))

  try {
    const directories = {
      HOME: path.join(root, "home"),
      USERPROFILE: path.join(root, "home"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_STATE_HOME: path.join(root, "state"),
      XDG_RUNTIME_DIR: path.join(root, "run"),
      TMPDIR: path.join(root, "tmp"),
      APPDATA: path.join(root, "appdata"),
      LOCALAPPDATA: path.join(root, "localappdata"),
    }

    await Promise.all(Object.values(directories).map((dir) => mkdir(dir, { recursive: true })))

    const appOrigin = new URL(baseURL).origin

    const child = spawn("bun", [server, scenario, root, appOrigin, "test/gate"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        NODE_PATH: runtimeDependencies,
        TEMP: directories.TMPDIR,
        TMP: directories.TMPDIR,
        ...directories,
      },
    })

    const closed = once(child, "close")
    // Handle spawn errors even if they arrive before the startup reader is ready.
    void closed.catch(() => {})

    const logs: string[] = []
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => logs.push(chunk))
    const lines = createInterface({ input: child.stdout })
    const ready = Promise.withResolvers<ReturnType<typeof readReady>>()
    lines.on("line", (line) => {
      if (!line.startsWith("GATE_READY ")) {
        logs.push(line + "\n")

        return
      }

      try {
        ready.resolve(readReady(line.slice("GATE_READY ".length)))
      } catch (error) {
        ready.reject(error)
      }
    })

    let timer: ReturnType<typeof setTimeout> | undefined

    try {
      const service = await Promise.race([
        ready.promise,
        closed.then(([code]) => {
          throw new Error(`Gate service exited during startup (${code})`)
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Gate service did not start within 30 seconds")), 30_000)
        }),
      ])

      clearTimeout(timer)
      await run(await openGate(page, service, appOrigin))
    } catch (error) {
      await info.attach("gate-service.log", { body: logs.join(""), contentType: "text/plain" })

      throw error
    } finally {
      clearTimeout(timer)
      lines.close()
      child.stdout.resume()
      child.kill()
      await closed.catch(() => {})
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function openGate(page: Page, ready: ReturnType<typeof readReady>, appOrigin: string) {
  const local = [appOrigin, ready.origin].map((origin) => RegExp.escape(origin)).join("|")
  await page.route(new RegExp(`^(?!(?:${local})/)https?://`), (route) => route.abort("blockedbyclient"))
  await seed(page, {
    servers: [ready.origin],
    tabs: [{ session: ready.session, server: ready.origin }],
    settings: { general: { followUpBehavior: "queue" } },
  })
  await page.goto(sessionHref(ready.session, ready.origin))
  await expectSessionTitle(page, ready.title)
  const composer = page.locator('[data-component="composer"]')
  const editor = composer.locator('[data-component="composer-editor"]')
  await expect(editor).toBeEditable({ timeout: APP_READY_TIMEOUT })
  const model = composer.locator('[data-action="composer-model"]')
  await expect(model).toContainText(ready.modelName)

  return {
    editor,
    model,
    submit: page.locator('[data-action="composer-submit"]:visible'),
    async status() {
      const response = await page.request.get(ready.origin + "/__gate")
      await expect(response).toBeOK()

      return readStatus(await response.json())
    },
    async releaseRead() {
      await expect(await page.request.post(ready.origin + "/__gate/release")).toBeOK()
    },
  }
}

export async function gateScreenshot(page: Page, info: TestInfo, name: string) {
  const filename = `${name}-${page.viewportSize()?.width}.png`
  const target = info.outputPath(filename)
  await page.screenshot({ path: target, animations: "disabled" })
  await info.attach(filename, { path: target, contentType: "image/png" })
}
