import { createHash, randomUUID } from "node:crypto"
import { once } from "node:events"
import { mkdir, rename, unlink, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { dirname } from "node:path"
import { app, screen, type BrowserWindow } from "electron"
import type { Plugin } from "@opencode/plugin/gui/main"
import { LoginomWindow } from "./contract"
import { windowLayout } from "./layout"

export function loginomWindowMain(ownerFile: () => string): Plugin.MainSetup {
  return (ctx) => {
    const tracked = new Map<number, string>()
    const watched = new WeakSet<BrowserWindow>()
    const attempted = new Set<string>()
    const listeners = new Map<string, Promise<void>>()

    // A service adopted after an Electron restart reads the new endpoint at the same path.
    function listen(file: string) {
      const existing = listeners.get(file)
      if (existing) return existing
      const token = randomUUID()
      const server = createServer(async (request, response) => {
        const chat = request.url?.slice(1)
        if (
          request.method !== "POST" ||
          request.headers.authorization !== "Bearer " + token ||
          !chat ||
          !/^[a-f0-9]{64}$/.test(chat)
        ) {
          response.writeHead(404).end()
          return
        }
        const result = await place(chat, () => !response.destroyed).catch(() => ({ kind: "unavailable" }))
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result))
      })
      const started = (async () => {
        server.listen(0, "127.0.0.1")
        await once(server, "listening")
        const address = server.address()
        if (!address || typeof address === "string") throw new Error("Loginom window listener has no port")
        const temp = file + "." + process.pid + ".tmp"
        await mkdir(dirname(file), { recursive: true, mode: 0o700 })
        await writeFile(temp, JSON.stringify({ port: address.port, token }), { mode: 0o600 })
        await rename(temp, file)
        server.unref()
      })().catch((error: unknown) => {
        listeners.delete(file)
        server.close()
        throw error
      })
      listeners.set(file, started)
      ctx.onCleanup(async () => {
        if (
          !(await started.then(
            () => true,
            () => false,
          ))
        )
          return
        server.close()
        await unlink(file).catch(() => undefined)
      })
      return started
    }

    async function place(chat: string, connected: () => boolean) {
      if (
        process.platform === "linux" &&
        (app.commandLine.getSwitchValue("ozone-platform") === "wayland" ||
          process.env.XDG_SESSION_TYPE === "wayland" ||
          (process.env.WAYLAND_DISPLAY && !process.env.DISPLAY))
      )
        return { kind: "unsupported" }

      if (attempted.has(chat) || !connected()) return { kind: "unavailable" }
      attempted.add(chat)
      const windows = [...tracked.entries()].flatMap(([id, session]) => {
        const win = session === chat ? ctx.windows.get(id) : undefined
        return win && win.isVisible() && !win.isMinimized() ? [win] : []
      })
      const win = windows.find((candidate) => candidate.isFocused()) ?? windows[0]
      if (!win || !connected()) return { kind: "unavailable" }

      const display = screen.getDisplayMatching(win.getBounds())
      const [minimumWidth] = win.getMinimumSize()
      const layout = windowLayout(display, screen.getAllDisplays(), minimumWidth)
      if (layout.loginom.width <= 0) return { kind: "unavailable" }
      if (layout.app) {
        if (win.isFullScreen()) {
          const exited = once(win, "leave-full-screen", { signal: AbortSignal.timeout(1500) })
          win.setFullScreen(false)
          await exited
        }
        if (win.isMaximized()) {
          const restored = once(win, "unmaximize", { signal: AbortSignal.timeout(1500) })
          win.unmaximize()
          await restored
        }
        if (win.isDestroyed() || !connected() || tracked.get(win.id) !== chat) return { kind: "unavailable" }
        win.setBounds(layout.app)
      }
      return { kind: "placed", bounds: layout.loginom }
    }

    ctx.windows.on("close", (window) => tracked.delete(window.id))
    ctx.provide(LoginomWindow, {
      async track(session, caller) {
        const win = ctx.windows.get(caller.window)
        if (!win || caller.signal.aborted) return
        if (session === null) {
          tracked.delete(win.id)
          return
        }
        if (!watched.has(win)) {
          const id = win.id
          watched.add(win)
          // A new renderer document must publish its current conversation again.
          const forget = (event: Electron.Event<{ isMainFrame: boolean; isSameDocument: boolean }>) => {
            if (event.isMainFrame && !event.isSameDocument) tracked.delete(id)
          }
          const contents = win.webContents
          contents.on("did-start-navigation", forget)
          ctx.onCleanup(() => {
            if (!contents.isDestroyed()) contents.off("did-start-navigation", forget)
          })
        }
        tracked.set(win.id, createHash("sha256").update(session).digest("hex"))
        await listen(ownerFile() + ".window")
      },
    })
  }
}
