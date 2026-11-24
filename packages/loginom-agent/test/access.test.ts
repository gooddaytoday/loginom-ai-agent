import { describe, expect, test } from "bun:test"
import { next, permits, type Profile } from "../src/access"

// The tool policy of guarantee G1, ported from 0.4 `toolPolicy` (`a080f7725c:packages/opencode/test/product/tool-policy.test.ts`)
// with OpenCode 2 tool names. The dashboard profile (B2.9b) adds 0.4's two `loginom-dashboard` cases there and the two of
// `test/session/task-scope.test.ts` about its base, whose transitions are `next` here; the base itself is the Location's
// folder (`server/test/loginom-access.test.ts`).
const docs = ["read", "glob", "grep", "edit", "write", "patch", "todowrite", "question", "skill", "package_docs_run"]
const local = ["find", "search", "read", "grep", "glob", "list", "tree", "dock_diagnostics"].map(
  (name) => `loginom_${name}`,
)
const mutating = ["loginom_dock_prepare", "loginom_dock_run", "loginom_browser_click", "loginom_file_admit"]
const profiles: Profile[] = ["default", "package-docs", "loginom-automation"]
const dashboard = ["read", "glob", "grep", "edit", "write", "patch", "skill"]
const dashboardTools = ["dashboard_draft", "dashboard_publish", "dashboard_delete"]

describe("tool policy", () => {
  test("package-docs exposes only its built-in tools and local Loginom help", () => {
    for (const tool of [...docs, ...local]) expect(permits("package-docs", tool)).toBe(true)
    for (const tool of [
      "shell",
      "subagent",
      "webfetch",
      "websearch",
      "execute",
      "opencode_schedule_create",
      ...mutating,
    ])
      expect(permits("package-docs", tool)).toBe(false)
  })

  test("the package-docs executor exists only in the package-docs profile", () => {
    expect(permits("package-docs", "package_docs_run")).toBe(true)
    expect(permits("default", "package_docs_run")).toBe(false)
    expect(permits("loginom-automation", "package_docs_run")).toBe(false)
  })

  test("loginom-automation cannot start subagents", () => {
    expect(permits("loginom-automation", "subagent")).toBe(false)
    expect(permits("default", "subagent")).toBe(true)
    for (const tool of ["shell", "execute", "edit", "write", "patch"])
      expect(permits("loginom-automation", tool)).toBe(true)
  })

  test("only automation reaches the mutating Loginom tools", () => {
    for (const tool of local) for (const profile of profiles) expect(permits(profile, tool)).toBe(true)
    for (const tool of mutating) {
      expect(permits("default", tool)).toBe(false)
      expect(permits("package-docs", tool)).toBe(false)
      expect(permits("loginom-automation", tool)).toBe(true)
    }
  })

  test("loginom-dashboard exposes only its built-in tools without MCP or Loginom", () => {
    for (const tool of [...dashboard, ...dashboardTools]) expect(permits("loginom-dashboard", tool)).toBe(true)
    for (const tool of [
      "shell",
      "subagent",
      "webfetch",
      "websearch",
      "todowrite",
      "question",
      "execute",
      "opencode_schedule_create",
      "package_docs_run",
      // Local Loginom help too, unlike every other profile.
      ...local,
      ...mutating,
      // An MCP tool is `<server>_<tool>`: a server named `dashboard` or `read` takes no dashboard tool's place.
      "dashboard_lookup",
      "read_file",
    ])
      expect(permits("loginom-dashboard", tool)).toBe(false)
  })

  test("dashboard built-ins stay unavailable in ordinary and other product profiles", () => {
    for (const profile of profiles) for (const tool of dashboardTools) expect(permits(profile, tool)).toBe(false)
  })
})

describe("grant transitions", () => {
  test("a bundled product skill grants its profile; other skills grant nothing", () => {
    expect(next("default", "loginom-automation")).toBe("loginom-automation")
    expect(next("default", "package-docs")).toBe("package-docs")
    for (const id of ["hub.loginom-automation", "community", undefined, 1, "default", "loginom-dashboard"])
      expect(next("default", id)).toBe("default")
  })

  test("package-docs never widens to automation; automation may narrow to package-docs", () => {
    expect(next("package-docs", "loginom-automation")).toBe("package-docs")
    expect(next("loginom-automation", "package-docs")).toBe("package-docs")
  })

  test("a task in a dashboard session keeps its base: a skill or a later request never changes it", () => {
    for (const id of ["package-docs", "loginom-automation", "loginom-dashboard", "default", undefined])
      expect(next("loginom-dashboard", id)).toBe("loginom-dashboard")
  })

  test("nothing grants the dashboard profile: its skill ID grants nothing in any other profile", () => {
    for (const profile of profiles) expect(next(profile, "loginom-dashboard")).toBe(profile)
  })
})
