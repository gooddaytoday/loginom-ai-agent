import { findDashboard, prepareDashboard } from "@loginom-ai-agent/dashboard/agent/folder"

import type { DashboardRead, PublicationSource } from "@loginom-ai-agent/loginom-host/dashboard"

export type DashboardDeps = {
  status(): Promise<{ url: string; generation: number }>
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
    signal: deps.signal,
    readPublication: binding => deps.readPublication({ origin, generation: view.generation, binding }, deps.signal),
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
