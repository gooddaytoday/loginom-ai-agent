import { createHash, randomUUID } from "node:crypto"
import { once } from "node:events"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { productChannel, productSlug } from "@loginom-ai-agent/product"
import type { Embed, Plugin, ServerEndpoint } from "@opencode/plugin/gui/main"
import { Schema } from "effect"
import { app, screen, session, WebContentsView, type BrowserWindow, type Rectangle } from "electron"
import { DashboardPreview, Focus, LoginomWindow, type WindowFeedback } from "./contract"
import { chromiumBounds, equal } from "./layout"
import { windowFeedback, windowPlacement } from "./window-placement"

const Placement = Schema.Literals(["placed", "unchanged", "layout-unavailable", "starting", "no-window"])

const ListenerAddress = Schema.Struct({ port: Schema.Number })

const output = Schema.decodeUnknownSync(Schema.Struct({ output: Schema.Unknown }))

const chatKey = (id: string) => createHash("sha256").update(id).digest("hex")

type WindowRequest = { sessionID: string; bounds?: Rectangle }

async function request<S extends typeof Placement | typeof Focus>(
  endpoint: ServerEndpoint,
  method: "place" | "show",
  input: WindowRequest,
  schema: S,
  signal: AbortSignal,
): Promise<S["Type"] | undefined> {
  try {
    const response = await fetch(new URL(`/api/rpc/loginom.window/${method}`, endpoint.url), {
      method: "POST",
      headers: { ...endpoint.headers, "content-type": "application/json" },
      body: JSON.stringify({ input }),
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
    })

    if (response.ok) return Schema.decodeUnknownSync(schema)(output(await response.json()).output)
    await response.body?.cancel()
  } catch {}
}

const supported = () =>
  process.platform !== "linux" ||
  !(
    app.commandLine.getSwitchValue("ozone-platform") === "wayland" ||
    (!!process.env.WAYLAND_DISPLAY && (process.env.XDG_SESSION_TYPE === "wayland" || !process.env.DISPLAY))
  )

function snapshot(window: BrowserWindow) {
  const app = window.getBounds()
  const display = screen.getDisplayMatching(app)

  return {
    app,
    restored: window.getNormalBounds(),
    display,
    others: screen.getAllDisplays().filter((other) => other.id !== display.id),
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
    minimumWidth: window.getMinimumSize()[0] ?? 0,
  }
}

function toChromium(browser: Rectangle, target: Pick<Electron.Display, "id" | "scaleFactor" | "workArea">) {
  return chromiumBounds(browser, target, process.platform, (bounds) => screen.dipToScreenRect(null, bounds))
}

async function resize(window: BrowserWindow, bounds: Rectangle, signal: AbortSignal, restoreStarted: () => void) {
  if (window.isFullScreen()) {
    const leaving = once(window, "leave-full-screen", { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) })
    restoreStarted()
    window.setFullScreen(false)
    await leaving
  }

  if (window.isMaximized()) {
    const leaving = once(window, "unmaximize", { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) })
    restoreStarted()
    window.unmaximize()
    await leaving
  }

  if (window.isDestroyed() || signal.aborted) return false
  window.setBounds(bounds)

  return equal(window.getBounds(), bounds, 1)
}

const setupWindow: Plugin.MainSetup = (ctx) => {
  const tracked = new Map<number, string | false>()
  const watching = new WeakSet<BrowserWindow>()
  const placements = new WeakMap<BrowserWindow, ReturnType<typeof windowPlacement>>()
  const showing = new WeakMap<BrowserWindow, { sessionID: string; result: Promise<typeof WindowFeedback.Type> }>()

  function placementFor(window: BrowserWindow) {
    const current = placements.get(window) ?? windowPlacement()
    placements.set(window, current)

    return current
  }

  const file = join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    productSlug(productChannel(ctx.app.channel)),
    "loginom",
    "window-layout.json",
  )

  const token = randomUUID()

  const server = createServer((incoming, response) => {
    const chat = incoming.url?.slice(1)

    if (
      incoming.method !== "POST" ||
      incoming.headers.authorization !== `Bearer ${token}` ||
      !chat ||
      !/^[a-f0-9]{64}$/.test(chat)
    ) {
      response.writeHead(404).end()

      return
    }

    const windows = ctx.windows
      .list()
      .filter((window) => !window.isDestroyed() && window.isVisible() && !window.isMinimized())

    const active = ctx.windows.focused()
    const matches = windows.filter((window) => tracked.get(window.id) === chat)

    const window =
      active && matches.includes(active)
        ? active
        : (matches[0] ?? (active && windows.includes(active) && tracked.get(active.id) === false ? active : undefined))

    if (!window || !supported()) {
      response.writeHead(204).end()

      return
    }

    const plan = placementFor(window).startup(snapshot(window))

    if (!plan) return response.writeHead(204).end()
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(toChromium(plan.browser, plan.target)))
  })

  const temp = `${file}.${token}.tmp`

  const listening = (async () => {
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    const address = server.address()

    if (!Schema.is(ListenerAddress)(address)) return false
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
        ctx.onCleanup(() => {
          contents.removeListener("did-start-navigation", forget)
        })
      }

      if (session === null) tracked.delete(window.id)
      else tracked.set(window.id, session === false ? false : chatKey(session))
    },
    show(sessionID, caller): typeof WindowFeedback.Type | Promise<typeof WindowFeedback.Type> {
      const endpoint = ctx.serverEndpoints.get("sidecar")
      const window = ctx.windows.get(caller.window)
      const chat = chatKey(sessionID)

      if (!endpoint?.sameMachine || !window || tracked.get(window.id) !== chat) return { focus: "no-window" }
      const pending = showing.get(window)

      if (pending) return pending.sessionID === sessionID ? pending.result : { focus: "manual" }

      const result = (async () => {
        const layout = supported()
          ? await placementFor(window).show({
              sessionID,
              current: () =>
                !window.isDestroyed() && !caller.signal.aborted && tracked.get(window.id) === chat
                  ? snapshot(window)
                  : undefined,
              place: (plan) =>
                request(
                  endpoint,
                  "place",
                  { sessionID, bounds: toChromium(plan.browser, plan.target) },
                  Placement,
                  caller.signal,
                ),
              resize: (bounds, restoreStarted) => resize(window, bounds, caller.signal, restoreStarted),
            })
          : "layout-unavailable"

        const focus = (await request(endpoint, "show", { sessionID }, Focus, caller.signal)) ?? "manual"

        return windowFeedback(focus, layout)
      })().finally(() => showing.delete(window))

      showing.set(window, { sessionID, result })

      return result
    },
  })
}

const setup: Plugin.MainSetup = (ctx) => {
  setupWindow(ctx)
  const views = new Map<number, Embed>()
  const partition = "loginom-dashboard-preview"
  const previewSession = session.fromPartition(partition)
  previewSession.setPermissionRequestHandler((_contents, _permission, reply) => reply(false))
  previewSession.setPermissionCheckHandler(() => false)
  const stopDownload = (event: Electron.Event) => event.preventDefault()
  previewSession.on("will-download", stopDownload)

  ctx.provide(DashboardPreview, {
    async open({ url }, caller) {
      const target = URL.parse(url)
      const window = ctx.windows.get(caller.window)

      if (!window || !target || !/^http:\/\/localhost:[1-9]\d{0,4}\/[a-f0-9]{64}\/$/.test(url))
        throw Error("Invalid dashboard preview")
      caller.signal.throwIfAborted()
      views.get(caller.window)?.dispose()

      const view = new WebContentsView({
        webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false },
      })

      const contents = view.webContents
      contents.setWindowOpenHandler(() => ({ action: "deny" }))
      contents.on("will-navigate", (event) => event.preventDefault())
      contents.on("will-redirect", (event) => event.preventDefault())
      const embed = ctx.embeds.create(view, window)
      views.set(caller.window, embed)

      const stop = () => {
        if (views.get(caller.window) === embed) views.delete(caller.window)
        embed.dispose()
      }

      caller.signal.addEventListener("abort", stop, { once: true })

      try {
        await contents.loadURL(target.href)
        caller.signal.throwIfAborted()
        embed.show(true)

        return { id: embed.id }
      } catch (error) {
        stop()
        throw error
      } finally {
        caller.signal.removeEventListener("abort", stop)
      }
    },
    close({ id }, caller) {
      const embed = views.get(caller.window)

      if (embed?.id !== id) return
      views.delete(caller.window)
      embed.dispose()
    },
  })
  ctx.windows.on("close", (window) => {
    views.get(window.id)?.dispose()
    views.delete(window.id)
  })
  ctx.onCleanup(() => {
    previewSession.off("will-download", stopDownload)
    views.forEach((embed) => embed.dispose())
    views.clear()
  })
}

export default setup
