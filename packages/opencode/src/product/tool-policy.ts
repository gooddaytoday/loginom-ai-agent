import type { TaskScope } from "@/session/task-scope"
import type { Tool } from "@/tool/tool"

const LOGINOM_LOCAL_TOOLS = new Set(["find", "search", "read", "grep", "glob", "list", "tree", "dock_diagnostics"])
const DOCS_BUILTINS = new Set([
  "read",
  "glob",
  "grep",
  "edit",
  "write",
  "apply_patch",
  "todowrite",
  "question",
  "skill",
  "package_docs_run",
])
const DASHBOARD_BUILTINS = new Set([
  "read",
  "glob",
  "grep",
  "edit",
  "write",
  "apply_patch",
  "skill",
  "dashboard_draft",
  "dashboard_publish",
])
const PROFILE_TOOLS = ["package_docs_run", "dashboard_draft", "dashboard_publish"]

export const toolPolicy = {
  permits(profile: TaskScope.Profile, id: string, origin: Tool.Def["origin"]) {
    if (profile === "loginom-dashboard") return origin === "builtin" && DASHBOARD_BUILTINS.has(id)
    if (profile === "package-docs") return origin === "builtin" && DOCS_BUILTINS.has(id)
    return !PROFILE_TOOLS.includes(id) && (profile !== "loginom-automation" || id !== "task")
  },

  permitsLoginom: (profile: TaskScope.Profile, name: string) =>
    profile !== "loginom-dashboard" && (profile === "loginom-automation" || LOGINOM_LOCAL_TOOLS.has(name)),

  isLocalLoginom: (name: string) => LOGINOM_LOCAL_TOOLS.has(name),

  allowsMcp: (profile: TaskScope.Profile) => profile !== "package-docs" && profile !== "loginom-dashboard",

  denied: () => Error("LOGINOM_SCOPE_DENIED"),
}
