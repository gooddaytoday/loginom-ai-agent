// Loginom access grants and the tool policy (guarantee G1). The product plugin hides what a session's task may not use
// (`context`) and rejects what it calls anyway (`execute.before`); both ask `permits`.
import { HostTaskScope } from "@loginom-ai-agent/loginom-host/task-scope"

export type Profile = "default" | "package-docs" | "loginom-automation" | "loginom-dashboard"
// A dashboard's work folder sets its profile for the whole session (B2.9b); nothing grants it.
export type Grant = Exclude<Profile, "default" | "loginom-dashboard">

// Skill IDs whose activation grants their profile, by the user (prompt skill attachment) or the agent (`skill` tool).
// Only the bundled catalog may use these IDs (B2.4, G6); a Hub skill has its own ID and grants nothing.
export const grants: readonly Grant[] = ["package-docs", "loginom-automation"]

// Loginom tools that read local help or diagnose the connection stay available without a grant (0.4 LOGINOM_LOCAL_TOOLS).
export const local: ReadonlySet<string> = new Set(
  ["find", "search", "read", "grep", "glob", "list", "tree", "dock_diagnostics"].map((name) => `loginom_${name}`),
)
// OpenCode 2 names: 0.4 `apply_patch`, `bash` and `task` are `patch`, `shell` and `subagent`. `write` and `patch` keep
// their tool names; only their permission action is `edit`.
const docs = new Set([
  "read",
  "glob",
  "grep",
  "edit",
  "write",
  "patch",
  "todowrite",
  "question",
  "skill",
  "package_docs_run",
])
// A dashboard session edits its sources and publishes them, nothing else: no Loginom, no MCP, no terminal or subagents
// (0.4 `DASHBOARD_BUILTINS`). The dashboard tools are named one by one: an MCP tool is `<server>_<tool>`, so a server
// named `dashboard` would pass a prefix.
const dashboard = new Set([
  "read",
  "glob",
  "grep",
  "edit",
  "write",
  "patch",
  "skill",
  "dashboard_draft",
  "dashboard_publish",
  "dashboard_delete",
])
const profileTools = new Set(["package_docs_run", "dashboard_draft", "dashboard_publish", "dashboard_delete"])

/** Whether a session whose task holds `profile` may see and call `tool` (the model-facing name). */
export function permits(profile: Profile, tool: string) {
  if (profile === "loginom-dashboard") return dashboard.has(tool)
  if (profile === "package-docs") return docs.has(tool) || local.has(tool)
  if (tool.startsWith("loginom_")) return profile === "loginom-automation" || local.has(tool)
  if (profileTools.has(tool)) return false
  return profile !== "loginom-automation" || tool !== "subagent"
}

/**
 * The profile after the task asks for `requested`: a grant may narrow a task, never widen `package-docs` or end
 * `loginom-dashboard`.
 */
export function next(current: Profile, requested: unknown): Profile {
  if (!isGrant(requested)) return current
  return HostTaskScope.permits(current, requested) ? requested : current
}

const isGrant = (value: unknown): value is Grant => grants.some((grant) => grant === value)
