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

export const toolPolicy = {
  permits(profile: TaskScope.Profile, id: string, origin: Tool.Def["origin"]) {
    if (profile === "package-docs") return origin === "builtin" && DOCS_BUILTINS.has(id)
    return id !== "package_docs_run" && (profile !== "loginom-automation" || id !== "task")
  },

  permitsLoginom: (profile: TaskScope.Profile, name: string) =>
    profile === "loginom-automation" || LOGINOM_LOCAL_TOOLS.has(name),

  isLocalLoginom: (name: string) => LOGINOM_LOCAL_TOOLS.has(name),

  allowsMcp: (profile: TaskScope.Profile) => profile !== "package-docs",

  denied: () => Error("LOGINOM_SCOPE_DENIED"),
}
