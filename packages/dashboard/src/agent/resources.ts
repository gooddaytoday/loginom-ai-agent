import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export type DashboardResources = { node: string; template: string; page: string; selfcheck: string; playwright: string; chromium: string }
const MISSING = "DASHBOARD_RESOURCES_MISSING: в установке нет компонентов dashboard. Переустановите программу."

export function dashboardResources(root: string | undefined): DashboardResources {
  if (!root || !existsSync(join(root, "resource-manifest.json"))) throw Error(MISSING)
  const pins = JSON.parse(readFileSync(join(root, "resource-manifest.json"), "utf8")) as { node?: unknown; browser?: unknown }
  if (typeof pins.node !== "string" || typeof pins.browser !== "string") throw Error(MISSING)
  const resources = {
    node: join(root, pins.node),
    template: join(root, "dashboard", "template"),
    page: join(root, "dashboard", "draft.js"),
    selfcheck: join(root, "dashboard", "selfcheck.mjs"),
    playwright: join(root, "runtime", "client", "node_modules", "playwright-core"),
    chromium: join(root, pins.browser),
  }
  if (![...Object.values(resources), join(resources.template, "node_modules")].every(path => existsSync(path))) throw Error(MISSING)
  return resources
}
