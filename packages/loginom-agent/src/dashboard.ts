// Dashboard sessions (B2.9, guarantee G1). The server prepares a dashboard's folder under `<data>/dashboards/<id>`
// (B2.9h); the model works in its `work` folder. Desktop or the CLI open a Location there, so the profile follows the
// Location's directory, never model input (0.4 `packages/opencode/src/product/dashboard-session.ts`).
export * as Dashboard from "./dashboard"

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import {
  DASHBOARD_SESSION_MARKER,
  dashboardSessionMarker,
  isDashboardWorkDirectory,
} from "@loginom-ai-agent/product/dashboard-root"
import type { Plugin } from "@opencode/plugin"
import { Global } from "@opencode/util/global"
import { Patch } from "@opencode/util/patch"
import { Option, Result, Schema } from "effect"

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
 * The draft the dashboard folder of the Location at `directory` holds now (0.4 `draftMarker`): the `draftId` of its
 * `control/binding.json`, `true` for a folder prepared before drafts had IDs (no file or no `draftId`), or nothing when
 * the work folder is gone or its binding cannot be read.
 */
export function draft(directory: string) {
  if (!isWork(directory)) return
  const control = readControl(join(dirname(realpathSync(directory)), "control", "binding.json"))
  if (Option.isSome(control)) return control.value.draftId ?? true
}

/**
 * The draft binding of the sessions a Location runs (B2.9d, 0.4 `Session.getForExecution`): a dashboard chat works
 * only on the draft its folder held when the chat began, so a chat of a folder that was deleted, or deleted and prepared
 * again, is refused before the model and before any tool. The binding is the plugin's own, stored by session ID; the
 * session's metadata, which the public API sets and forks inherit, is read once per dashboard Location, only to adopt
 * the markers 0.4 kept there. `refusal` answers with the refusal, or nothing when the session may run.
 * - Outside a dashboard (`dashboard()` is false) a bound session is refused: its folder is gone, or it was moved away.
 * - `fork` gives a new fork its source's binding wherever it runs, as 0.4's fork carried the marker: a fork of an old
 *   chat is refused in its dashboard, and a fork of a chat moved out of its dashboard is refused there too.
 * - In a dashboard, a session without a binding takes one when first seen: a session moved in from elsewhere none
 *   (refused here, still free elsewhere), any other the current draft — it has had no input yet, or it is a row 0.4
 *   kept without a marker (0.4 adopted one only in a folder older than draft IDs).
 */
export function binding(plugin: Pick<Plugin.Context, "location" | "session" | "storage">, dashboard: () => boolean) {
  const directory = plugin.location.directory
  // Bindings change only through this Location's plugin or by a move to another Location, which reads storage afresh.
  const known = new Map<string, Binding | undefined>()
  const stored = async (sessionID: string) => {
    if (!known.has(sessionID)) known.set(sessionID, dashboardSessionMarker(await plugin.storage.get(key + sessionID)))
    return known.get(sessionID)
  }
  const bind = async (sessionID: string, value: Binding) => {
    await plugin.storage.set(key + sessionID, value)
    known.set(sessionID, value)
  }
  // 0.4's markers, once per Location: a binding already stored wins, and the flag is written last.
  const page = async (cursor?: string): Promise<void> => {
    const result = await plugin.session.list(cursor ? { cursor, limit: 100 } : { directory, limit: 100 })
    await Promise.all(
      result.data.map(async (session) => {
        const marker = dashboardSessionMarker(session.metadata?.[DASHBOARD_SESSION_MARKER])
        if (marker !== undefined && (await stored(session.id)) === undefined) await bind(session.id, marker)
      }),
    )
    if (result.data.length > 0 && result.cursor.next) await page(result.cursor.next)
  }
  const migration: { done?: Promise<void> } = {}
  const migrate = () =>
    (migration.done ??= (async () => {
      if ((await plugin.storage.get(migrated + directory)) === true) return
      await page()
      await plugin.storage.set(migrated + directory, true)
    })().catch((error: unknown) => {
      migration.done = undefined
      throw error
    }))
  const adopt = async (sessionID: string, current: Binding) => {
    const context = await plugin.session.context({ sessionID })
    if (context.some((message) => message.type === "location-switched")) return
    await bind(sessionID, current)
    return current
  }
  return {
    refusal: async (sessionID: string) => {
      if (!dashboard()) return (await stored(sessionID)) === undefined ? undefined : unbound
      await migrate()
      const current = draft(directory)
      if (current === undefined) return unbound
      if (((await stored(sessionID)) ?? (await adopt(sessionID, current))) !== current) return unbound
    },
    fork: async (sessionID: string) => {
      const session = await plugin.session.get({ sessionID })
      const source = session.fork ? await stored(session.fork.sessionID) : undefined
      if (source !== undefined) await bind(sessionID, source)
    },
    // The chat that deleted its dashboard (B2.9g, 0.4 `retireDashboard`): no folder prepared later is its own.
    retire: (sessionID: string) => bind(sessionID, "deleted"),
  }
}

/** What a chat that does not belong to the dashboard's current draft reads (0.4: `LOGINOM_SCOPE_DENIED`). */
export const unbound = "LOGINOM_SCOPE_DENIED: this chat does not belong to the dashboard's current draft"

// A binding as 0.4 marked it: a draft ID, `true` for a folder older than draft IDs, or `"deleted"` (B2.9g).
type Binding = NonNullable<ReturnType<typeof dashboardSessionMarker>>
// Keys in the plugin's storage: a session's binding, and the Locations whose 0.4 markers were adopted.
const key = "dashboard.binding:"
const migrated = "dashboard.migrated:"
const readControl = (file: string) => {
  try {
    return decodeControl(readFileSync(file, "utf8"))
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? Option.some({ draftId: undefined }) : Option.none()
  }
}
const decodeControl = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      draftId: Schema.optional(Schema.String.check(Schema.isPattern(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i))),
    }),
  ),
)

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
 * Why a file tool's call may not run in a dashboard session, checked before it runs, or nothing. Paths resolve as Core
 * resolves them (`FileAccess.resolvePath`: `~`). The `path` of `glob` and `grep` is not a resource of their request:
 * `permission.evaluate` sees it only as an `external_directory` question, which a git repository around the data
 * directory or a link inside the work folder never raises. `edit` and `patch` read their targets before they ask `edit`
 * (`edit` whether the file exists, `patch` its lines too), so a refusal only at that question would tell the model what
 * lies outside; `write` is checked with them. A glob — `glob`'s `pattern`, `grep`'s `include` — may not climb with `..`;
 * `grep`'s `pattern` is a regular expression.
 */
export function callError(directory: string, tool: string, input: unknown) {
  const value = (input ?? {}) as { path?: unknown; pattern?: unknown; include?: unknown; patchText?: unknown }
  const reach = (path: unknown, write: boolean) =>
    typeof path === "string" ? pathError(directory, resolve(directory, home(path)), write) : undefined
  if (tool === "write" || tool === "edit") return reach(value.path, true)
  if (tool === "patch") {
    const parsed = Patch.parse(typeof value.patchText === "string" ? value.patchText : "")
    if (!Result.isSuccess(parsed)) return
    return parsed.success
      .flatMap((hunk) => [hunk.path, ...(hunk.type === "update" && hunk.movePath ? [hunk.movePath] : [])])
      .map((path) => reach(path, true))
      .find((reason) => reason !== undefined)
  }
  if (tool !== "glob" && tool !== "grep") return
  const glob = tool === "glob" ? value.pattern : value.include
  if (typeof glob === "string" && /(^|[\\/])\.\.([\\/]|$)/.test(glob)) return outside
  return reach(value.path ?? ".", false)
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

// Any failure counts as no entry — `ENOTDIR` under a regular file, `ELOOP`, no access: the error would tell the model
// what lies at a path outside, and the nearest ancestor that exists decides instead.
const entry = (path: string) => {
  try {
    return lstatSync(path, { throwIfNoEntry: false })
  } catch {
    return undefined
  }
}
// The path itself or its nearest ancestor that exists, as a link or otherwise.
const nearest = (path: string): string => (entry(path) || dirname(path) === path ? path : nearest(dirname(path)))
const home = (value: string) =>
  value === "~"
    ? Global.Path.home
    : value.startsWith("~/") || (process.platform === "win32" && value.startsWith("~\\"))
      ? join(Global.Path.home, value.slice(2))
      : value
