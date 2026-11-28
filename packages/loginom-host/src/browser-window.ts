import { Schema } from "effect"
import { readFile } from "node:fs/promises"
import { request } from "node:http"
import { join } from "node:path"

export const WindowBounds = Schema.Struct({
  x: Schema.Int,
  y: Schema.Int,
  width: Schema.Int.check(Schema.isGreaterThan(0)),
  height: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type WindowBounds = typeof WindowBounds.Type

const Session = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))
export const WindowChat = Schema.Struct({ sessionID: Session })
export const WindowPlacement = Schema.Struct({ ...WindowChat.fields, bounds: WindowBounds })
export type WindowPlacement = typeof WindowPlacement.Type
export const WindowStatus = Schema.Literals(["focused", "no-window", "starting", "taskbar", "manual"])
export const PlacementStatus = Schema.Literals(["placed", "unchanged", "moved", "layout-unavailable", "no-window", "starting"])
export const BrowserPID = Schema.Struct({ pid: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(0xffffffff)) })

const StartupEndpoint = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({
  port: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(65535)),
  token: Schema.String.check(Schema.isUUID()),
})))
const decodeBounds = Schema.decodeUnknownSync(Schema.fromJsonString(WindowBounds))

export async function startupWindowBounds(root: string, chat: string) {
  if (!/^[a-f0-9]{64}$/.test(chat)) return
  try {
    const { port, token } = StartupEndpoint(await readFile(join(root, "window-layout.json"), "utf8"))
    return await new Promise<WindowBounds | undefined>((resolve) => {
      const outgoing = request({ hostname: "127.0.0.1", port, path: `/${chat}`, method: "POST", agent: false,
        headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(500) }, (incoming) => {
        if (incoming.statusCode !== 200) {
          incoming.destroy()
          resolve(undefined)
          return
        }
        let body = ""
        incoming.setEncoding("utf8")
        incoming.on("data", (chunk: string) => {
          body += chunk
          if (body.length > 1024) incoming.destroy()
        })
        incoming.on("close", () => resolve(undefined))
        incoming.on("error", () => resolve(undefined))
        incoming.on("end", () => {
          try { resolve(decodeBounds(body)) } catch { resolve(undefined) }
        })
      })
      outgoing.on("error", () => resolve(undefined))
      outgoing.end()
    })
  } catch {}
}
