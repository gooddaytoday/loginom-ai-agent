import { describe, expect, test } from "bun:test"
import { toolPolicy } from "../../src/product/tool-policy"

const policy = toolPolicy
const docsBuiltins = [
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
]

describe("toolPolicy", () => {
  test("package-docs exposes only its built-in tools", () => {
    for (const id of docsBuiltins) expect(policy.permits("package-docs", id, "builtin")).toBe(true)
    for (const id of ["bash", "task", "webfetch", "websearch", "dock_diagnostics"])
      expect(policy.permits("package-docs", id, "builtin")).toBe(false)
  })

  test("a user or MCP tool cannot take the name of a package-docs built-in", () => {
    for (const id of docsBuiltins) expect(policy.permits("package-docs", id, "external")).toBe(false)
    expect(policy.permits("package-docs", "read", undefined)).toBe(false)
  })

  test("the package-docs executor exists only in the package-docs profile", () => {
    expect(policy.permits("package-docs", "package_docs_run", "builtin")).toBe(true)
    expect(policy.permits("default", "package_docs_run", "builtin")).toBe(false)
    expect(policy.permits("loginom-automation", "package_docs_run", "external")).toBe(false)
  })

  test("loginom-automation cannot start subagents", () => {
    expect(policy.permits("loginom-automation", "task", "builtin")).toBe(false)
    expect(policy.permits("default", "task", "builtin")).toBe(true)
    expect(policy.permits("loginom-automation", "bash", "builtin")).toBe(true)
  })

  test("only automation reaches the mutating Loginom tools", () => {
    for (const name of ["find", "search", "read", "grep", "glob", "list", "tree", "dock_diagnostics"]) {
      expect(policy.isLocalLoginom(name)).toBe(true)
      for (const profile of ["default", "package-docs", "loginom-automation"] as const)
        expect(policy.permitsLoginom(profile, name)).toBe(true)
    }
    for (const name of ["dock_prepare", "dock_run", "browser_click"]) {
      expect(policy.isLocalLoginom(name)).toBe(false)
      expect(policy.permitsLoginom("default", name)).toBe(false)
      expect(policy.permitsLoginom("package-docs", name)).toBe(false)
      expect(policy.permitsLoginom("loginom-automation", name)).toBe(true)
    }
  })

  test("package-docs never sees MCP tools", () => {
    expect(policy.allowsMcp("package-docs")).toBe(false)
    expect(policy.allowsMcp("default")).toBe(true)
    expect(policy.allowsMcp("loginom-automation")).toBe(true)
  })
})

test("loginom-dashboard exposes only its built-in tools without MCP or Loginom", () => {
  const allowed = [
    "read",
    "glob",
    "grep",
    "edit",
    "write",
    "apply_patch",
    "skill",
    "dashboard_draft",
    "dashboard_publish",
  ]
  for (const id of allowed) {
    expect(policy.permits("loginom-dashboard", id, "builtin")).toBe(true)
    expect(policy.permits("loginom-dashboard", id, "external")).toBe(false)
    expect(policy.permits("loginom-dashboard", id, undefined)).toBe(false)
  }
  for (const id of ["bash", "task", "webfetch", "websearch", "todowrite", "question", "lsp", "package_docs_run"])
    expect(policy.permits("loginom-dashboard", id, "builtin")).toBe(false)
  expect(policy.allowsMcp("loginom-dashboard")).toBe(false)
  for (const name of ["find", "search", "dock_diagnostics", "dock_prepare"])
    expect(policy.permitsLoginom("loginom-dashboard", name)).toBe(false)
})

test("dashboard built-ins stay unavailable in ordinary and other product profiles", () => {
  for (const profile of ["default", "package-docs", "loginom-automation"] as const)
    for (const id of ["dashboard_draft", "dashboard_publish"])
      expect(policy.permits(profile, id, "builtin")).toBe(false)
})
