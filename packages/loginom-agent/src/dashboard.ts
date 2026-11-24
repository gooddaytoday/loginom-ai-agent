// Dashboard sessions (B2.9, guarantee G1). The server prepares a dashboard's folder under `<data>/dashboards/<id>`
// (B2.9h); the model works in its `work` folder. Desktop or the CLI open a Location there, so the profile follows the
// Location's directory, never model input (0.4 `packages/opencode/src/product/dashboard-session.ts`).
export * as Dashboard from "./dashboard"

import { existsSync, lstatSync, realpathSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
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

/**
 * The dashboard's word on a permission request in its Location at `directory` (B2.9c; by parity with 0.4, where the
 * profile alone bounded paths and nothing was asked): `external_directory` is refused, and so is a `read` or an `edit`
 * (`write`, `edit`, `patch`) of a path the session may not reach (`pathError`); a write inside `src` needs no question.
 * Any other request gets no word. The refusal is a deny with its own text, so the call fails and the turn goes on.
 */
export function settle(directory: string, request: { readonly action: string; readonly resources: readonly string[] }) {
  if (request.action === "external_directory") return { effect: "deny" as const, message: deniedText(outside) }
  if (request.action !== "read" && request.action !== "edit") return
  const write = request.action === "edit"
  // A resource is relative to the Location, or absolute outside it; a skill file is virtual.
  const reason = request.resources
    .filter((resource) => !resource.startsWith("skill://"))
    .map((resource) => pathError(directory, resolve(directory, resource), write))
    .find((reason) => reason !== undefined)
  if (reason) return { effect: "deny" as const, message: deniedText(reason) }
  if (write) return { effect: "allow" as const }
}

/**
 * Why `glob` or `grep` may not search in a dashboard session, or nothing. Their `path` reaches `permission.evaluate`
 * only as an `external_directory` question, which a git repository around the data directory or a link inside the work
 * folder never raises, so it is checked before the call, resolved as Core resolves it (`FileAccess.resolvePath`: `~`).
 * A glob — `glob`'s `pattern`, `grep`'s `include` — may not climb with `..`; `grep`'s `pattern` is a regular expression.
 */
export function searchError(directory: string, tool: string, input: unknown) {
  if (tool !== "glob" && tool !== "grep") return
  const value = (input ?? {}) as { path?: unknown; pattern?: unknown; include?: unknown }
  const glob = tool === "glob" ? value.pattern : value.include
  if (typeof glob === "string" && /(^|[\\/])\.\.([\\/]|$)/.test(glob)) return outside
  return pathError(directory, resolve(directory, home(typeof value.path === "string" ? value.path : ".")))
}

/**
 * Why a dashboard session may not reach `target`, or nothing when it may (0.4 `dashboardPathError`). It reads only
 * inside the work folder of its Location at `directory` and writes only inside its `src`, by the real path: a link that
 * leads elsewhere, a dangling link and the dashboard's `control` folder next to `work` are outside, and a write never
 * goes through a file link, even into `src`. `target` is absolute and already normalized: Core resolves `..` lexically
 * (`FileAccess.resolve`) and opens that very path, so `link/..` is the folder that holds the link. A work folder that
 * no longer exists lets nothing through.
 */
export function pathError(directory: string, target: string, write = false) {
  if (!isWork(directory)) return gone
  const work = realpathSync(directory)
  const allowed = write ? join(work, "src") : work
  if (write && entry(target)?.isSymbolicLink()) return fileLink
  const existing = nearest(target)
  if (entry(existing)?.isSymbolicLink() && !existsSync(existing)) return dangling
  const real = join(realpathSync(existing), relative(existing, target))
  if (real !== allowed && !real.startsWith(allowed + sep)) return write ? srcOnly : outside
}

/** What the model reads instead of a refused call: the reason and what the session may do (B2.6b: the turn goes on). */
export const deniedText = (reason: string) =>
  `LOGINOM_DASHBOARD_PATH_DENIED: ${reason}. Действие не выполнено. В сессии дашборда читать можно только рабочую ` +
  "папку, менять — только файлы в её src/. Не обходите это другим путём или инструментом; если задаче нужно другое, " +
  "скажите об этом пользователю."

// The reasons, as 0.4 named them.
export const outside = "Сессия dashboard: доступна только рабочая папка"
export const srcOnly = "Сессия dashboard: запись разрешена только в src/"
export const fileLink = "Сессия dashboard: запись в символьную ссылку запрещена"
export const dangling = "Сессия dashboard: путь ведёт в недоступную ссылку"
export const gone = "Сессия dashboard: рабочей папки больше нет"

const entry = (path: string) => lstatSync(path, { throwIfNoEntry: false })
// The path itself or its nearest ancestor that exists, as a link or otherwise.
const nearest = (path: string): string => (entry(path) || dirname(path) === path ? path : nearest(dirname(path)))
const home = (value: string) =>
  value === "~"
    ? Global.Path.home
    : value.startsWith("~/") || (process.platform === "win32" && value.startsWith("~\\"))
      ? join(Global.Path.home, value.slice(2))
      : value
