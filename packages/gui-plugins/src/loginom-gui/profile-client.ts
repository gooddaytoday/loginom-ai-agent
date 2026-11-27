import { usePlugin } from "@opencode/plugin/gui"
import { createMemo } from "solid-js"
import type definition from "./index"

export function useProfileClient() {
  const ctx = usePlugin<typeof definition>()
  return createMemo(() => {
    const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])
    if (ctx.desktop) return servers.find((server) => server.builtin)?.client
    const serving = ctx.servers.get(location.origin)
    if (serving) return serving.client
    const local = servers.filter((server) => server.local)
    if (local.length === 1) return local.at(0)?.client
  })
}
