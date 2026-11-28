import type { SessionRef } from "@opencode/plugin/gui"
import type { ServerEndpoint } from "@opencode/plugin/gui/main"
import { Schema } from "effect"
import type { Rectangle } from "electron"
import { WindowTarget, type Focus } from "./contract"

export const Placement = Schema.Literals([
  "placed",
  "unchanged",
  "moved",
  "layout-unavailable",
  "starting",
  "no-window",
  "workspace-unavailable",
])

const output = Schema.decodeUnknownSync(Schema.Struct({ output: Schema.Unknown }))

type WindowRequest = typeof WindowTarget.Type & { bounds?: Rectangle }

export function windowTarget(session: Pick<SessionRef, "id" | "location" | "pending"> | undefined) {
  if (!session || session.pending) return
  const input = { sessionID: session.id, location: session.location }

  if (Schema.is(WindowTarget)(input)) return input
}

export async function requestWindow<S extends typeof Placement | typeof Focus>(
  endpoint: ServerEndpoint,
  method: "place" | "show",
  input: WindowRequest,
  schema: S,
  signal: AbortSignal,
): Promise<S["Type"] | undefined> {
  try {
    const url = new URL(`/api/rpc/loginom.window/${method}`, endpoint.url)
    url.searchParams.set("location[directory]", input.location.directory)

    const response = await fetch(url, {
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
