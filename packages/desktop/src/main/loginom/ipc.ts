import { app, BrowserWindow, ipcMain } from "electron"
import type { IpcMainInvokeEvent } from "electron"
import { Option, Schema } from "effect"
import { Loginom } from "@loginom-ai-agent/schema/loginom"

export function registerLoginomIpc(api: Loginom.API) {
  function sender(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || event.senderFrame !== event.sender.mainFrame || window.isDestroyed())
      throw new Error("LOGINOM_SENDER_INVALID")
    const url = new URL(event.senderFrame.url)
    const valid =
      (url.protocol === "loginom-ai-agent-app:" && url.hostname === "renderer") ||
      (!app.isPackaged &&
        !!process.env.ELECTRON_RENDERER_URL &&
        url.origin === new URL(process.env.ELECTRON_RENDERER_URL).origin)
    if (!valid) throw new Error("LOGINOM_SENDER_INVALID")
  }
  const candidate = Schema.decodeUnknownOption(Loginom.Candidate)
  const save = Schema.decodeUnknownOption(Loginom.Save)
  const cancel = Schema.decodeUnknownOption(Loginom.Cancel)
  ipcMain.handle("loginom-read", (event) => {
    sender(event)
    return api.read()
  })
  ipcMain.handle("loginom-status", (event) => {
    sender(event)
    return api.status()
  })
  ipcMain.handle("loginom-check", (event, value: unknown) => {
    sender(event)
    const decoded = candidate(value)
    if (Option.isNone(decoded)) throw new Error("LOGINOM_CANDIDATE_INVALID")
    return api.check(decoded.value)
  })
  ipcMain.handle("loginom-save", (event, value: unknown) => {
    sender(event)
    const decoded = save(value)
    if (Option.isNone(decoded)) throw new Error("LOGINOM_SAVE_INVALID")
    return api.save(decoded.value)
  })
  ipcMain.handle("loginom-cancel-pending", (event, value: unknown) => {
    sender(event)
    const decoded = cancel(value)
    if (Option.isNone(decoded)) throw new Error("LOGINOM_CANCEL_INVALID")
    return api.cancelPending(decoded.value)
  })
}
