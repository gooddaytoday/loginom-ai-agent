import { session, WebContentsView } from "electron"
import type { Embed, Plugin } from "@opencode/plugin/gui/main"
import { DashboardPreview } from "./contract"

const setup: Plugin.MainSetup = (ctx) => {
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
