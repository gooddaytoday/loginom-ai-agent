import type { Context } from "@opencode/plugin/gui"

export function profileService(ctx: Context) {
  const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])

  if (ctx.desktop) return servers.find((server) => server.builtin)
  const serving = ctx.servers.get(location.origin)

  if (serving) return serving
  const local = servers.filter((server) => server.local)

  return local.length === 1 ? local.at(0) : undefined
}
