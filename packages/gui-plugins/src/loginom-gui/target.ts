import type { Context, ServerRef } from "@opencode/plugin/gui"

export function loginomService(ctx: Pick<Context, "desktop" | "servers">) {
  const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])

  if (ctx.desktop) return servers.find((server) => server.builtin)
  const serving = ctx.servers.get(location.origin)

  if (serving) return serving
  const local = servers.filter((server) => server.local)

  if (local.length === 1) return local.at(0)
}

export async function loginomLocation(server: ServerRef, signal: AbortSignal) {
  const directory =
    server.data.location.default().directory ||
    (await server.client.location.get({}, { signal }).catch(() => undefined))?.directory

  return directory && !signal.aborted ? { directory } : undefined
}
