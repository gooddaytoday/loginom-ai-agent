import { existsSync, lstatSync, realpathSync, statSync } from "node:fs"
import { basename, dirname, join, parse, relative, resolve, sep } from "node:path"
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

export function dashboardPathError(directory: string, target: string, write = false) {
  if (!isDashboardWork(directory)) return
  const work = realpathSync(directory)
  const allowed = write ? join(work, "src") : work
  const entry = (path: string) => lstatSync(path, { throwIfNoEntry: false })
  const denied = write
    ? "Сессия dashboard: запись разрешена только в src/"
    : "Сессия dashboard: доступна только рабочая папка"
  // Removing a symlink with .. changes IO semantics, while resolve/realpath discard it lexically.
  let prefix = parse(target).root
  for (const part of target.slice(prefix.length).split(process.platform === "win32" ? /[\\/]/ : sep)) {
    if (part === ".." && entry(prefix)?.isSymbolicLink()) return denied
    prefix = resolve(prefix, part)
  }
  const normalized = resolve(target)
  if (write && entry(normalized)?.isSymbolicLink()) return "Сессия dashboard: запись в символьную ссылку запрещена"
  let existing = normalized
  while (!entry(existing) && dirname(existing) !== existing) existing = dirname(existing)
  if (entry(existing)?.isSymbolicLink() && !existsSync(existing))
    return "Сессия dashboard: путь ведёт в недоступную ссылку"
  const real = join(realpathSync(existing), relative(existing, normalized))
  if (real !== allowed && !real.startsWith(allowed + sep)) return denied
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
