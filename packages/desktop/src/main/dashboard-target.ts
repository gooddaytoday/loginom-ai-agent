import { findDashboard, prepareDashboard } from "@loginom-ai-agent/dashboard/agent/folder"

export type DashboardDeps = {
  status(): Promise<{ url: string; generation: number }>
  dashboards(): string
  template: string
  fetch?: typeof fetch
}

export async function getDashboardTarget(id: string, deps: DashboardDeps) {
  const view = await deps.status()
  if (!view.generation) throw new Error("DASHBOARD_NOT_CONFIGURED")
  return prepareDashboard({
    id,
    origin: new URL(view.url).origin,
    dashboards: deps.dashboards(),
    template: deps.template,
    fetch: deps.fetch,
  })
}

export async function checkDashboardTarget(id: string, dashboards: string) {
  return (await findDashboard(dashboards, id)) !== undefined
}
