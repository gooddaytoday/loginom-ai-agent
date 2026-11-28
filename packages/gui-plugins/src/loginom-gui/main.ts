import { createHash, randomUUID } from "node:crypto"
import { once } from "node:events"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { productChannel, productSlug } from "@loginom-ai-agent/product"
import type { Plugin, ServerEndpoint } from "@opencode/plugin/gui/main"
import { Schema } from "effect"
import { app, screen, type BrowserWindow, type Rectangle } from "electron"
import { LoginomWindow, Status } from "./contract"
import { chromiumBounds, equal, layout } from "./layout"

const Placement = Schema.Literals(["placed", "unchanged", "layout-unavailable", "starting", "no-window"])
const output = Schema.decodeUnknownSync(Schema.Struct({ output: Schema.Unknown }))
const chatKey = (id: string) => createHash("sha256").update(id).digest("hex")

async function request<S extends typeof Placement | typeof Status>(
  endpoint: ServerEndpoint,
  method: "place" | "show",
  input: object,
  schema: S,
  signal: AbortSignal,
): Promise<S["Type"] | undefined> {
  try {
    const response = await fetch(new URL(`/api/rpc/loginom.window/${method}`, endpoint.url), {
      method: "POST", headers: { ...endpoint.headers, "content-type": "application/json" },
      body: JSON.stringify({ input }), redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
    })
    if (response.ok) return Schema.decodeUnknownSync(schema)(output(await response.json()).output)
    await response.body?.cancel()
  } catch {}
}

const supported = () => process.platform !== "linux" ||
  !(app.commandLine.getSwitchValue("ozone-platform") === "wayland" ||
    (!!process.env.WAYLAND_DISPLAY && (process.env.XDG_SESSION_TYPE === "wayland" || !process.env.DISPLAY)))

function snapshot(window: BrowserWindow) {
  const app = window.getBounds()
  const display = screen.getDisplayMatching(app)
  return { app, display, others: screen.getAllDisplays().filter((other) => other.id !== display.id),
    maximized: window.isMaximized(), fullscreen: window.isFullScreen(), minimumWidth: window.getMinimumSize()[0] ?? 0 }
}

function toChromium(browser: Rectangle, target: Pick<Electron.Display, "id" | "scaleFactor" | "workArea">) {
  return chromiumBounds(browser, target, process.platform, (bounds) => screen.dipToScreenRect(null, bounds))
}

async function resize(window: BrowserWindow, bounds: Rectangle, signal: AbortSignal) {
  if (window.isFullScreen()) {
    const leaving = once(window, "leave-full-screen", { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) })
    window.setFullScreen(false)
    await leaving
  }
  if (window.isMaximized()) {
    const leaving = once(window, "unmaximize", { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) })
    window.unmaximize()
    await leaving
  }
  if (window.isDestroyed() || signal.aborted) return false
  window.setBounds(bounds)
  return equal(window.getBounds(), bounds, 1)
}

const setup: Plugin.MainSetup = (ctx) => {
  const tracked = new Map<number, string | false>()
  const watching = new WeakSet<BrowserWindow>()
  const original = new WeakMap<BrowserWindow, ReturnType<typeof snapshot>>()
  const changed = new WeakSet<BrowserWindow>()
  const showing = new WeakMap<BrowserWindow, { sessionID: string; result: Promise<typeof Status.Type> }>()
  function same(before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>) {
    return equal(before.app, after.app) && before.display.id === after.display.id &&
      before.maximized === after.maximized && before.fullscreen === after.fullscreen
  }

  const file = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    productSlug(productChannel(ctx.app.channel)), "loginom", "window-layout.json")
  const token = randomUUID()
  const server = createServer((incoming, response) => {
    const chat = incoming.url?.slice(1)
    if (incoming.method !== "POST" || incoming.headers.authorization !== `Bearer ${token}` || !chat || !/^[a-f0-9]{64}$/.test(chat)) {
      response.writeHead(404).end()
      return
    }
    const windows = ctx.windows.list().filter((window) => !window.isDestroyed() && window.isVisible() && !window.isMinimized())
    const active = ctx.windows.focused()
    const matches = windows.filter((window) => tracked.get(window.id) === chat)
    const window = active && matches.includes(active) ? active : matches[0] ??
      (active && windows.includes(active) && tracked.get(active.id) === false ? active : undefined)
    if (!window || !supported()) {
      response.writeHead(204).end()
      return
    }
    const current = snapshot(window)
    const before = original.get(window)
    if (before && !same(before, current)) changed.add(window)
    if (!before) original.set(window, current)
    const plan = layout(current, "startup")
    if (!plan) return response.writeHead(204).end()
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(toChromium(plan.browser, plan.target)))
  })
  const temp = `${file}.${token}.tmp`
  const listening = (async () => {
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    const address = server.address()
    if (!address || typeof address === "string") return false
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    await writeFile(temp, JSON.stringify({ port: address.port, token }), { mode: 0o600 })
    await rename(temp, file)
    return true
  })().catch(() => false)
  server.unref()
  ctx.onCleanup(async () => {
    const published = await listening
    server.close()
    await rm(published ? file : temp, { force: true }).catch(() => undefined)
  })
  ctx.windows.on("close", (window) => tracked.delete(window.id))
  ctx.provide(LoginomWindow, {
    track(session, caller) {
      const window = ctx.windows.get(caller.window)
      if (!window || caller.signal.aborted) return
      if (!watching.has(window)) {
        watching.add(window)
        const contents = window.webContents
        const forget = (event: Electron.Event<{ isMainFrame: boolean; isSameDocument: boolean }>) => {
          if (event.isMainFrame && !event.isSameDocument) tracked.delete(caller.window)
        }
        contents.on("did-start-navigation", forget)
        ctx.onCleanup(() => { contents.removeListener("did-start-navigation", forget) })
      }
      if (session === null) tracked.delete(window.id)
      else tracked.set(window.id, session === false ? false : chatKey(session))
    },
    show(sessionID, caller) {
      const endpoint = ctx.serverEndpoints.get("sidecar")
      const window = ctx.windows.get(caller.window)
      if (!endpoint?.sameMachine || !window || tracked.get(window.id) !== chatKey(sessionID)) return "no-window"
      const pending = showing.get(window)
      if (pending) return pending.sessionID === sessionID ? pending.result : "manual"
      const result = (async () => {
        let unavailable = !supported()
        if (!unavailable) {
          const current = snapshot(window)
          const before = original.get(window)
          if (before && !same(before, current)) changed.add(window)
          const plan = changed.has(window) ? undefined : layout(current, "show")
          if (plan) {
            const placed = await request(endpoint, "place", { sessionID, bounds: toChromium(plan.browser, plan.target) }, Placement, caller.signal)
            unavailable = placed === undefined || placed === "layout-unavailable"
            if (placed === "placed" && plan.kind === "split" && !window.isDestroyed() && !caller.signal.aborted &&
                tracked.get(window.id) === chatKey(sessionID) && same(current, snapshot(window))) {
              unavailable = !(await resize(window, plan.app, caller.signal).catch(() => false))
              if (!unavailable) original.set(window, snapshot(window))
            }
          }
        }
        const focus = await request(endpoint, "show", { sessionID }, Status, caller.signal) ?? "manual"
        return focus === "focused" && unavailable ? "layout-unavailable" : focus
      })().finally(() => showing.delete(window))
      showing.set(window, { sessionID, result })
      return result
    },
  })
}

export default setup
