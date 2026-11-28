import type { Context } from "@opencode/plugin/gui"

export function loginomServer(ctx: Context) {
  const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])

  if (ctx.desktop) return servers.find((server) => server.builtin)
  const serving = ctx.servers.get(location.origin)

  if (serving) return serving
  const local = servers.filter((server) => server.local)

  if (local.length === 1) return local.at(0)
}

export type LoginomServer = NonNullable<ReturnType<typeof loginomServer>>

export async function loginomLocation(server: LoginomServer, signal: AbortSignal) {
  const directory = server.data.location.default().directory || (await server.client.location.get({}, { signal })).directory

  if (!directory) throw Error("Loginom location unavailable")

  return { directory }
}
