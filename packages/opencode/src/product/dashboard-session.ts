import { existsSync, realpathSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { DASHBOARD_SESSION_MARKER } from "@loginom-ai-agent/product/dashboard-root"
import { Global } from "@opencode-ai/core/global"
import type { TaskScope } from "@/session/task-scope"

export const dashboardRoot = () => join(Global.Path.data, "dashboards")

// The profile follows the session directory chosen by Desktop or CLI, never model input.
export function isDashboardWork(directory: string) {
  const root = dashboardRoot()
  if (!existsSync(directory) || !existsSync(root)) return false
  const work = realpathSync(directory)
  return statSync(work).isDirectory() && basename(work) === "work" && dirname(dirname(work)) === realpathSync(root)
}

export const baseProfile = (directory: string): TaskScope.Profile =>
  isDashboardWork(directory) ? "loginom-dashboard" : "default"

export function metadata(directory: string, metadata?: Record<string, unknown>, marked = false) {
  const clean = { ...metadata }
  delete clean[DASHBOARD_SESSION_MARKER]
  return marked || isDashboardWork(directory)
    ? { ...clean, [DASHBOARD_SESSION_MARKER]: true }
    : metadata
      ? clean
      : undefined
}

export function profile(session: { directory: string; metadata?: Record<string, unknown> }) {
  const base = baseProfile(session.directory)
  if (session.metadata?.[DASHBOARD_SESSION_MARKER] === true && base !== "loginom-dashboard")
    throw Error("LOGINOM_SCOPE_DENIED")
  return base
}

export * as DashboardSession from "./dashboard-session"
