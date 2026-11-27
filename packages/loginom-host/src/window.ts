import { get } from "node:http"
import { readFile } from "node:fs/promises"
import { Schema } from "effect"

const Endpoint = Schema.Struct({
  port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  token: Schema.String.check(Schema.isUUID()),
})
const Bounds = Schema.Struct({
  x: Schema.Int,
  y: Schema.Int,
  width: Schema.Int.check(Schema.isGreaterThan(0)),
  height: Schema.Int.check(Schema.isGreaterThan(0)),
})
const Placement = Schema.Struct({ kind: Schema.Literal("placed"), bounds: Bounds })
export type WindowBounds = typeof Bounds.Type

export const WindowReply = Schema.Struct({
  kind: Schema.Literals(["focused", "taskbar", "manual", "unavailable"]),
})

export async function desktopWindowBounds(ownerFile: string, chat: string, signal: AbortSignal) {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(4000)])
  try {
    const text = await readFile(ownerFile + ".window", { encoding: "utf8", signal: bounded })
    const endpoint = Schema.decodeUnknownSync(Schema.fromJsonString(Endpoint))(text)
    // This is private local IPC, independent of the service's Internet proxy policy.
    const body = await new Promise<string>((resolve, reject) => {
      get(
        {
          hostname: "127.0.0.1",
          port: endpoint.port,
          path: "/" + chat,
          method: "POST",
          headers: { authorization: "Bearer " + endpoint.token },
          agent: false,
          signal: bounded,
        },
        (response) => {
          response.setEncoding("utf8")
          const chunks: string[] = []
          response.on("data", (chunk: string) => chunks.push(chunk))
          response.once("error", reject)
          response.once("end", () => resolve(response.statusCode === 200 ? chunks.join("") : ""))
        },
      ).once("error", reject)
    })
    const result = Schema.decodeUnknownOption(Schema.fromJsonString(Placement))(body)
    if (result._tag === "Some") return result.value.bounds
  } catch {
    // Standalone and compositor-managed launches retain Chromium's default placement.
    return undefined
  }
}
