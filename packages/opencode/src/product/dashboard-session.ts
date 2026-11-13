import { existsSync, realpathSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
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

export * as DashboardSession from "./dashboard-session"
