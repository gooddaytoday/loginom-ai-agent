// Product permissions (B2.6a; В-30, В-31, В-68, decision 12; ux-spec «Разрешения»): which permission requests belong to
// which of the six kinds of action the user sees, the product's defaults, and «Разрешать в этом разговоре».
//
// Layers, lowest precedence first:
// - the defaults are agent rules placed right after OpenCode's catch-all `* * allow` (`withDefaults`), so an agent's own
//   rules, the config's `permissions` (the settings mechanism in ux-spec) and the session's rules still override them,
//   and a configured deny still wins before any hook;
// - the `permission.evaluate` hook (`settle`) handles what rules cannot express: the conversation grant, a terminal
//   command of the agent that always asks (В-31), and subagents, whose own rules may not loosen the product's defaults.
import type { Permission } from "@opencode/schema/permission"

export type Kind = "read" | "write" | "save" | "export" | "web" | "terminal"

/** The kinds as the user sees them in «Настройки → Разрешения». */
export const kinds: Record<Kind, string> = {
  read: "Читать файлы проекта",
  write: "Создавать и менять файлы проекта",
  save: "Сохранять пакеты в Loginom",
  export: "Запускать сценарии с выгрузками",
  web: "Открывать сайты",
  terminal: "Терминал",
}

type Entry = {
  readonly action: string
  readonly resource: string
  readonly kind: Kind
  readonly effect: Permission.Effect
}

/**
 * Every permission action of the server's tools and Dock operations that belongs to a kind, with its default (В-30).
 * An action that is not here — `question`, `skill`, `subagent`, `todowrite`, CodeMode `execute`, MCP tools, the other
 * Dock operations — belongs to no kind and keeps OpenCode's rules.
 */
export const table: readonly Entry[] = [
  // Project files are read without a question: OpenCode's file tools and the Loginom file tools (each also asks `read`
  // for the file). `package_docs_run` asks `read` and `edit` itself.
  ...[
    "read",
    "glob",
    "grep",
    "loginom_file_admit",
    "loginom_file_profile",
    "loginom_file_scan",
    "loginom_file_sample",
  ].map((action) => ({ action, resource: "*", kind: "read" as const, effect: "allow" as const })),
  // The kind covers the project only: OpenCode asks `external_directory` before it touches anything outside, and that
  // question stays (v2 itself allows it).
  { action: "external_directory", resource: "*", kind: "read", effect: "ask" },
  // `edit`, `write`, `patch`, image generation and `package_docs_run` all write through the `edit` action.
  { action: "edit", resource: "*", kind: "write", effect: "ask" },
  // In the product's Dock profile `dock_action_run` only saves the package (`package.save_as`, `package.save_checkpoint`).
  { action: "loginom_dock_action_run", resource: "*", kind: "save", effect: "ask" },
  // A local package opened through `local_package_path` is uploaded into Loginom as a copy (В-75).
  { action: "loginom_dock_prepare", resource: "local_package", kind: "save", effect: "ask" },
  // Dashboards (B2.9): publishing sends sources to Loginom, deleting removes the published versions there.
  { action: "dashboard_publish", resource: "*", kind: "save", effect: "ask" },
  { action: "dashboard_delete", resource: "*", kind: "save", effect: "ask" },
  // An export node writes outside the package; the Dock call names the node type as its resource.
  { action: "loginom_dock_node_apply", resource: "exports.*", kind: "export", effect: "ask" },
  { action: "webfetch", resource: "*", kind: "web", effect: "ask" },
  { action: "websearch", resource: "*", kind: "web", effect: "ask" },
  // The terminal is off until the user turns it on (decision 12, В-68); on, it asks for every command (В-31).
  { action: "shell", resource: "*", kind: "terminal", effect: "deny" },
]

/** The product's defaults as rules. */
export const rules: Permission.Ruleset = table.map((entry) => ({
  action: entry.action,
  resource: entry.resource,
  effect: entry.effect,
}))

/** An agent's rules with the defaults right after OpenCode's catch-all allow, or first when it has none. */
export function withDefaults(permissions: readonly Permission.Rule[]) {
  const at = permissions.findIndex((rule) => rule.action === "*" && rule.resource === "*" && rule.effect === "allow")
  return [...permissions.slice(0, at + 1), ...rules, ...permissions.slice(at + 1)]
}

/** The table entry of a request: the same action, and every resource within the entry's resource. */
export function classify(action: string, resources: readonly string[]) {
  return table.find(
    (entry) => entry.action === action && resources.every((resource) => within(resource, entry.resource)),
  )
}

/** The kinds a conversation grant may cover: where the product asks by default, except the terminal (В-31). */
export function grantable(entry: Entry | undefined) {
  return entry !== undefined && entry.kind !== "terminal" && entry.effect === "ask"
}

type Request = {
  readonly action: string
  readonly resources: readonly string[]
  readonly source?: unknown
  readonly effect: Permission.Effect
}

/**
 * The product's word on a request the rules did not deny (a configured deny never reaches a hook). `subagent` is true
 * for a subagent's request, `granted` holds the session's conversation grants.
 */
export function settle(request: Request, subagent: boolean, granted: ReadonlySet<Kind>) {
  const entry = classify(request.action, request.resources)
  if (!entry) return { effect: request.effect }
  if (entry.kind === "terminal") {
    if (subagent) return { effect: "deny" as const, message: terminalDenied }
    // A command of the agent asks every time, whatever saved, configured or session rule allows it. A schedule's
    // check has no source: it follows the rules.
    return { effect: request.source !== undefined && request.effect === "allow" ? ("ask" as const) : request.effect }
  }
  // A subagent's own rules (`explore` allows sites and reading outside the project) do not loosen the defaults.
  const effect = subagent && entry.effect === "ask" && request.effect === "allow" ? "ask" : request.effect
  if (effect === "ask" && grantable(entry) && granted.has(entry.kind)) return { effect: "allow" as const }
  return { effect }
}

export const terminalDenied = "LOGINOM_TERMINAL_DENIED: subagents do not run terminal commands in Loginom AI Agent"

// Entry resources are `*`, a literal or a `prefix*`.
const within = (resource: string, pattern: string) =>
  pattern === "*" || resource === pattern || (pattern.endsWith("*") && resource.startsWith(pattern.slice(0, -1)))
