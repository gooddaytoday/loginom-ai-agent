// Dashboard sessions (B2.9, guarantee G1). The server prepares a dashboard's folder under `<data>/dashboards/<id>`
// (B2.9h); the model works in its `work` folder. Desktop or the CLI open a Location there, so the profile follows the
// Location's directory, never model input (0.4 `packages/opencode/src/product/dashboard-session.ts`).
export * as Dashboard from "./dashboard"

import { join } from "node:path"
import { isDashboardWorkDirectory } from "@loginom-ai-agent/product/dashboard-root"
import { Global } from "@opencode/util/global"

/** The root of the dashboards' folders: the server's own data directory, as in 0.4. */
export const root = () => join(Global.Path.data, "dashboards")

/** Whether `directory` resolves to the `work` folder of a dashboard under `root`. */
export const isWork = (directory: string) => isDashboardWorkDirectory(directory, root())

/**
 * Whether the Location at `directory` belongs to a dashboard. It is checked until it first does and stays so: a folder
 * that appears after the Location activated still confines its sessions, and one that disappears never frees them.
 */
export function latch(directory: string) {
  const state = { work: false }
  return () => (state.work ||= isWork(directory))
}
