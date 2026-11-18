import { findDashboard, prepareDashboard } from "@loginom-ai-agent/dashboard/agent/folder"

import type { DashboardRead, PublicationSource } from "@loginom-ai-agent/loginom-host/dashboard"

export type DashboardDeps = {
  status(): Promise<{ url: string; generation: number }>
  settled(): Promise<void>
  catalog(generation: number): Promise<unknown>
  dashboards(): string
  template: string
  fetch?: typeof fetch
  signal?: AbortSignal
  readPublication(input: DashboardRead, signal?: AbortSignal): Promise<PublicationSource | null>
}

export async function getDashboardTarget(id: string, deps: DashboardDeps) {
  const view = await deps.status()
  if (!view.generation) throw new Error("DASHBOARD_NOT_CONFIGURED")
  const origin = new URL(view.url).origin
  return prepareDashboard({
    deferCreatePublicationCheck: true,
    signal: deps.signal,
    readPublication: async binding => {
      const cancelled = Promise.withResolvers<never>()
      const abort = () => cancelled.reject(deps.signal?.reason)
      deps.signal?.addEventListener("abort", abort, { once: true })
      try {
        deps.signal?.throwIfAborted()
        await Promise.race([
          deps.settled().then(() => {
            deps.signal?.throwIfAborted()
            return deps.catalog(view.generation)
          }),
          cancelled.promise,
        ])
        deps.signal?.throwIfAborted()
        return deps.readPublication({ origin, generation: view.generation, binding }, deps.signal)
      } finally {
        deps.signal?.removeEventListener("abort", abort)
      }
    },
    id,
    origin,
    dashboards: deps.dashboards(),
    template: deps.template,
    fetch: deps.fetch,
  })
}

export async function checkDashboardTarget(id: string, dashboards: string) {
  return (await findDashboard(dashboards, id)) !== undefined
}
