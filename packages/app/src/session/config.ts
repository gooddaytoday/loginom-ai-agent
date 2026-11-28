import type { ConfigEntry } from "@opencode/client/promise"
import { useQuery } from "@tanstack/solid-query"
import type { Accessor } from "solid-js"
import { useServerSDK } from "@/runtime/server/client"

export function useSessionConfig(directory: Accessor<string>) {
  const server = useServerSDK()
  return useQuery(() => ({
    queryKey: [server.scope, "session-ui-config", directory()],
    enabled: server.connection.status() === "connected",
    queryFn: () => server.api.config.get({ location: { directory: directory() } }),
  }))
}

export function modelConnectionRestricted(entries: readonly ConfigEntry[]) {
  return (["provider.use", "integration.connect"] as const).some((action) => {
    // Match config precedence: the earliest matching document wins, the last matching rule in that document wins.
    for (const entry of entries) {
      if (entry.type !== "document") continue
      const rule = entry.info.policies?.findLast((policy) => policy.action === action && policy.resource === "*")
      if (rule) return rule.effect === "deny"
    }
    return false
  })
}
