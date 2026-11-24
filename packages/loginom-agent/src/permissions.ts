// Product permissions (B2.6a; В-30, В-31, В-68, decision 12; ux-spec «Разрешения»): which permission requests belong to
// which of the six kinds of action the user sees, the product's defaults, and «Разрешать в этом разговоре».
//
// Layers, lowest precedence first:
// - the defaults are agent rules placed right after OpenCode's catch-all `* * allow` (`withDefaults`), so an agent's own
//   rules, the config's `permissions` (the settings mechanism in ux-spec) and the session's rules still override them,
//   and a configured deny still wins before any hook;
// - the `permission.evaluate` hook (`settle`) handles what rules cannot express: the conversation grant, a terminal
//   command of the agent and a dashboard's deletion, which always ask (В-31, В-102), a schedule's `run` check that never
//   runs, subagents, whose own rules may not loosen the product's defaults, and reading the product's own directories
//   outside the project;
// - a refused call does not end the turn (B2.6b, В-75): the user's «Отклонить» and a rule's deny reach the model as text
//   (`refusal`, applied in the plugin's `execute.after` and `execute.before`), and the call's metadata says which;
// - the kinds the settings deny are named to the model before it tries them (`deniedKinds`, B2.6b2);
// - the administrator's deny (B2.6c, В-69) is OpenCode's managed policy: `tool.use` statements of the product's system
//   config (`/etc/loginom-ai-agent`, `%ProgramData%\loginom-ai-agent`, MDM), which OpenCode's guarded policy plugin
//   applies in its `permission.evaluate` hook after every rule and before the product's. The product never lifts it
//   (`settle`), refuses the conversation grant for a kind it touches, and tells the model who denied (`refusal`).
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
  // The kind covers the project only: OpenCode asks `external_directory` before it touches anything outside, and the
  // product keeps that question (OpenCode's `build` agent allows it without one).
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
  // The terminal is off until the user turns it on (decision 12, В-68); on, it asks for every command (В-31), and a
  // schedule's `run` check never runs (`settle`).
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

/**
 * The kinds a conversation grant may cover: where the product asks by default, except the terminal (В-31) and a
 * dashboard's deletion (В-102), which ask every time.
 */
export function grantable(entry: Entry | undefined) {
  return (
    entry !== undefined && entry.kind !== "terminal" && entry.action !== "dashboard_delete" && entry.effect === "ask"
  )
}

type Request = {
  readonly action: string
  readonly resources: readonly string[]
  readonly source?: unknown
  readonly effect: Permission.Effect
}

/**
 * The product's word on a request the rules did not deny (a configured deny never reaches a hook). `subagent` is true
 * for a subagent's request, `granted` holds the session's conversation grants, `own` marks a read in the product's own
 * directories (`ownRead`).
 */
export function settle(request: Request, subagent: boolean, granted: ReadonlySet<Kind>, own = false) {
  // A deny reaches this hook only from an earlier one: the administrator's policy (B2.6c). Nothing the product allows
  // lifts it, and its text stays.
  if (request.effect === "deny") return { effect: "deny" as const }
  if (own) return { effect: "allow" as const }
  const entry = classify(request.action, request.resources)
  if (!entry) return { effect: request.effect }
  if (entry.kind === "terminal") {
    if (subagent) return { effect: "deny" as const, message: terminalDenied }
    // A schedule's check has no source. It never runs, the terminal on or off: nobody answers its question, and an
    // approval given once would run the command unattended at every tick (В-31).
    if (request.source === undefined) return { effect: "deny" as const, message: scheduleRunDenied }
    // A command of the agent asks every time, whatever saved, configured or session rule allows it.
    return { effect: request.effect === "allow" ? ("ask" as const) : request.effect }
  }
  // So does a dashboard's deletion, whatever allows «Сохранять пакеты в Loginom» (В-102, ux-spec).
  if (entry.action === "dashboard_delete")
    return { effect: request.effect === "allow" ? ("ask" as const) : request.effect }
  // A subagent's own rules (`explore` allows sites and reading outside the project) do not loosen the defaults.
  const effect = subagent && entry.effect === "ask" && request.effect === "allow" ? "ask" : request.effect
  if (effect === "ask" && grantable(entry) && granted.has(entry.kind)) return { effect: "allow" as const }
  return { effect }
}

/**
 * What the model reads instead of a refused call's error (B2.6b, В-75), so that it explains and the turn goes on: the
 * user's «Отклонить» (`Permission.DeclinedError`, which would end the step) and a rule that denies a kind
 * (`Permission.BlockedError` without a reason), by the cause inside the call's `Tool.Error`; the administrator's policy
 * that denies a kind (B2.6c) is told as such. Any other deny with its own reason (a hook's: a subagent's terminal, a
 * schedule check, nobody present) and a rejection with the user's words (`Permission.CorrectedError`) keep their text.
 */
export function refusal(cause: unknown) {
  if (isDecline(cause)) return declinedText
  const blocked = blockedError(cause)
  if (!blocked) return
  const entry = classify(blocked.permission, blocked.resources)
  if (!entry) return
  if (blocked.reason === undefined) return deniedText(entry)
  if (policy(blocked.reason)) return policyDeniedText(entry)
}

/** Whether a check failed on the administrator's policy (B2.6c): a `Permission.BlockedError` with its reason. */
export function policyDenied(cause: unknown) {
  const reason = blockedError(cause)?.reason
  return reason !== undefined && policy(reason)
}

// The reasons of OpenCode's managed policy (`core/src/managed-policy.ts`, `statements`): a config document's, or an
// organization's that came with an integration. Statements of user and project config documents carry the first text
// too, and only ever add denies; the managed ones are loaded first and win.
const policy = (reason: string) => /^Blocked by (configuration policy|.+'s policy)$/s.test(reason)

/** OpenCode's plain decline: the user's «Отклонить», or an open question of a Location that shuts down. */
export const isDecline = (value: unknown) =>
  value instanceof Object && "_tag" in value && value._tag === "Permission.DeclinedError"

export const declinedText =
  "LOGINOM_PERMISSION_DECLINED: пользователь отклонил это действие, оно не выполнено. Не повторяйте его и не обходите " +
  "другим инструментом. Скажите пользователю, что не сделали, и продолжайте задачу без этого действия или спросите, " +
  "как поступить."

export const deniedText = (entry: Pick<Entry, "action" | "kind">) =>
  `LOGINOM_PERMISSION_DENIED: «${kinds[entry.kind]}» (${entry.action}) запрещено правилами разрешений, действие не ` +
  "выполнено. Не повторяйте его и не обходите другим инструментом. Скажите пользователю, что не сделали и почему; " +
  "разрешить это пользователь может в «Настройки → Разрешения»."

export const policyDeniedText = (entry: Pick<Entry, "action" | "kind">) =>
  `LOGINOM_POLICY_DENIED: «${kinds[entry.kind]}» (${entry.action}) запрещено политикой администратора, действие не ` +
  "выполнено. Не повторяйте его и не обходите другим инструментом. Скажите пользователю, что не сделали и почему; " +
  "изменить это может только администратор."

/**
 * The kinds whose every table entry the rules deny, as the settings' «Запрещено» writes them (B2.6b2). OpenCode then
 * offers none of their tools whose action is denied outright. The terminal, off by default, is not named. `rules` are
 * the product's defaults and settings (the rules of the default agent `build`, which has no denies of its own) and the
 * session's; a later rule wins, as in OpenCode's `Permission.evaluate`.
 */
export function deniedKinds(rules: readonly Permission.Rule[]) {
  return (Object.keys(kinds) as Kind[]).filter(
    (kind) =>
      kind !== "terminal" &&
      table
        .filter((entry) => entry.kind === kind)
        .every(
          (entry) =>
            rules.findLast((rule) => wildcard(entry.action, rule.action) && wildcard(entry.resource, rule.resource))
              ?.effect === "deny",
        ),
  )
}

/** The system text that names the denied kinds to the model. */
export const deniedKindsText = (denied: readonly Kind[]) =>
  `LOGINOM_PERMISSIONS_DENIED: в «Разрешениях» запрещено: ${denied.map((kind) => `«${kinds[kind]}»`).join(", ")}. ` +
  "Не пытайтесь делать эти действия и не обходите их другими инструментами. Если задача их требует, скажите " +
  "пользователю, что это запрещено в «Разрешениях» и разрешить может только он сам, и продолжайте без них."

/**
 * The call metadata of a refusal, for clients (0.4 `permissionDenied`): `declined` by the user, `denied` by a rule,
 * `policy` by the administrator (B2.6c).
 */
export const refusalMetadata = (text: string) => ({
  permissionDenied: true,
  permissionRefusal:
    text === declinedText
      ? ("declined" as const)
      : text.startsWith("LOGINOM_POLICY_DENIED:")
        ? ("policy" as const)
        : ("denied" as const),
})

export const terminalDenied = "LOGINOM_TERMINAL_DENIED: subagents do not run terminal commands in Loginom AI Agent"
export const scheduleRunDenied =
  "LOGINOM_SCHEDULE_RUN_DENIED: schedule checks do not run terminal commands in Loginom AI Agent; use a code check"

// The tools whose `external_directory` question is a read (`FileAccess.authorizeRead`, `glob`, `grep`).
const readers = new Set(["read", "glob", "grep"])

/**
 * Whether a request is a read by `tool` in the product's own `directories` outside the project: the `external_directory`
 * question of `read`, `glob` or `grep`, whose every resource (`<directory>/*`, as `FileAccess` names it) lies inside one
 * of them. A write there asks as before.
 */
export function ownRead(
  tool: string | undefined,
  request: Pick<Request, "action" | "resources">,
  directories: readonly string[],
) {
  if (request.action !== "external_directory" || tool === undefined || !readers.has(tool)) return false
  if (request.resources.length === 0) return false
  const roots = directories.map(slash)
  return request.resources.every((resource) => {
    const directory = slash(resource).replace(/\/\*$/, "")
    return roots.some((root) => directory === root || directory.startsWith(root + "/"))
  })
}

const slash = (value: string) => value.replaceAll("\\", "/").replace(/\/+$/, "")

// Entry resources are `*`, a literal or a `prefix*`.
const within = (resource: string, pattern: string) =>
  pattern === "*" || resource === pattern || (pattern.endsWith("*") && resource.startsWith(pattern.slice(0, -1)))

// The fields of a `Permission.BlockedError` that a refusal names; Core's error classes stay out of the plugin.
function blockedError(value: unknown) {
  if (!(value instanceof Object) || !("_tag" in value) || value._tag !== "Permission.BlockedError") return
  return {
    permission: "permission" in value ? String(value.permission) : "",
    resources: "resources" in value && Array.isArray(value.resources) ? value.resources.map(String) : [],
    reason: "reason" in value && typeof value.reason === "string" ? value.reason : undefined,
  }
}

// OpenCode's `Wildcard.match` (`core/src/util/wildcard.ts`), which the plugin cannot import: `*` and `?` in the pattern,
// `/` for `\`, and a pattern ending in ` *` also matches without its arguments.
function wildcard(input: string, pattern: string) {
  const escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  const tail = escaped.endsWith(" .*") ? escaped.slice(0, -3) + "( .*)?" : escaped
  return new RegExp("^" + tail + "$", process.platform === "win32" ? "si" : "s").test(input.replaceAll("\\", "/"))
}
