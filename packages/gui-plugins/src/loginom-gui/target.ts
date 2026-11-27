import type { Context } from "@opencode/plugin/gui"

export function loginomClient(ctx: Pick<Context, "desktop" | "servers">) {
  const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])

  if (ctx.desktop) return servers.find((server) => server.builtin)?.client
  const serving = ctx.servers.get(location.origin)

  if (serving) return serving.client
  const local = servers.filter((server) => server.local)

  if (local.length === 1) return local.at(0)?.client
}
