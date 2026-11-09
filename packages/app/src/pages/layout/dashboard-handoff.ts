import { createStore } from "solid-js/store"
import type { DashboardContextItem } from "@opencode-ai/session-ui/v2/prompt-input/types"

const [pending, setPending] = createStore<Record<string, DashboardContextItem | undefined>>({})

export function dashboardRoute(server: string, path: string, draftID?: string) {
  return JSON.stringify([server, path, draftID])
}

export function deliverDashboard(route: string, item: DashboardContextItem) {
  setPending(route, item)
}

export function takeDashboard(route: string) {
  const item = pending[route]
  if (item) setPending(route, undefined)
  return item
}
