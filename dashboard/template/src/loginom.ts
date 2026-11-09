export type DashboardState = {
  value: number | null
  table: {
    schema: { name: string; type: number }[]
    rows: (string | number | boolean | null)[][]
  } | null
  error: string | null
}

type Dashboard = {
  state(): Promise<DashboardState>
  change(value: number): Promise<DashboardState>
  run(): Promise<DashboardState>
}

export const dashboard = (window.frameElement as (HTMLIFrameElement & { dashboard: Dashboard }) | null)?.dashboard
