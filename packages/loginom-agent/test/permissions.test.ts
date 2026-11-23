import { describe, expect, test } from "bun:test"
import {
  classify,
  declinedText,
  deniedText,
  grantable,
  isDecline,
  kinds,
  ownRead,
  refusal,
  rules,
  scheduleRunDenied,
  settle,
  table,
  terminalDenied,
  withDefaults,
  type Kind,
} from "../src/permissions"

// The product's permission table (B2.6a): which permission action of the server's tools and Dock operations belongs to
// which kind of ux-spec «Разрешения», the defaults of В-30 and В-31, and the hook's word on a request.
const kind = (action: string, resources: string[] = ["*"]) => classify(action, resources)?.kind

describe("permission kinds", () => {
  test("every tool and Dock operation that acts for the user belongs to its kind", () => {
    const expected: Record<Kind, [string, string[]?][]> = {
      read: [
        ["read", ["src/a.ts"]],
        ["glob"],
        ["grep"],
        ["loginom_file_admit"],
        ["loginom_file_profile", ["data.csv"]],
        ["loginom_file_scan", ["data.csv"]],
        ["loginom_file_sample", ["data.csv"]],
        ["external_directory", ["/home/user/elsewhere/*"]],
      ],
      write: [["edit", ["report.md"]]],
      save: [
        ["loginom_dock_action_run"],
        ["loginom_dock_prepare", ["local_package"]],
        ["dashboard_publish"],
        ["dashboard_delete"],
      ],
      export: [
        ["loginom_dock_node_apply", ["exports.text"]],
        ["loginom_dock_node_apply", ["exports.excel"]],
        ["loginom_dock_node_apply", ["exports.lgd"]],
      ],
      web: [
        ["webfetch", ["https://example.com"]],
        ["websearch", ["loginom"]],
      ],
      terminal: [["shell", ["ls -la"]]],
    }
    for (const [name, requests] of Object.entries(expected))
      for (const [action, resources] of requests) expect(kind(action, resources)).toBe(name as Kind)
    expect(Object.keys(kinds).sort()).toEqual(Object.keys(expected).sort())
  })

  test("operations that change nothing outside the session belong to no kind", () => {
    for (const action of [
      "question",
      "skill",
      "subagent",
      "todowrite",
      "execute",
      "opencode_schedule_create",
      "github_create_issue",
      "loginom_find",
      "loginom_dock_diagnostics",
      "loginom_dock_action_describe",
      "loginom_dock_artifact_deliver",
      "loginom_dock_node_read",
      "loginom_dock_storage_download_start",
      "experimental_image_generate",
    ])
      expect(kind(action)).toBeUndefined()
    // A server package opened in the browser and a node that is not an export.
    expect(kind("loginom_dock_prepare")).toBeUndefined()
    expect(kind("loginom_dock_node_apply", ["transform.collapse_columns"])).toBeUndefined()
    expect(kind("loginom_dock_node_apply")).toBeUndefined()
  })

  test("defaults: project files without a question, the rest asks, the terminal is off (В-30, decision 12)", () => {
    const effect = (action: string, resources: string[] = ["*"]) => classify(action, resources)?.effect
    for (const action of ["read", "glob", "grep", "loginom_file_profile"]) expect(effect(action)).toBe("allow")
    expect(effect("external_directory")).toBe("ask")
    for (const [action, resources] of [
      ["edit"],
      ["loginom_dock_action_run"],
      ["loginom_dock_prepare", ["local_package"]],
      ["dashboard_publish"],
      ["dashboard_delete"],
      ["loginom_dock_node_apply", ["exports.excel"]],
      ["webfetch"],
      ["websearch"],
    ] as [string, string[]?][])
      expect(effect(action, resources)).toBe("ask")
    expect(effect("shell")).toBe("deny")
    expect(rules).toHaveLength(table.length)
  })

  test("the defaults sit right after OpenCode's catch-all allow, below every later rule", () => {
    const build = [
      { action: "*", resource: "*", effect: "allow" as const },
      { action: "read", resource: "*.env", effect: "ask" as const },
      { action: "shell", resource: "*", effect: "ask" as const },
    ]
    expect(withDefaults(build)).toEqual([build[0], ...rules, build[1], build[2]])
    const denied = [{ action: "*", resource: "*", effect: "deny" as const }]
    expect(withDefaults(denied)).toEqual([...rules, ...denied])
  })

  test("a conversation grant covers what the product asks by default, never the terminal (В-31)", () => {
    expect(grantable(classify("edit", ["a"]))).toBe(true)
    expect(grantable(classify("external_directory", ["/x/*"]))).toBe(true)
    expect(grantable(classify("webfetch", ["https://example.com"]))).toBe(true)
    // Asked only by OpenCode's own rules (a `.env` file) or never asked by the product.
    expect(grantable(classify("read", [".env"]))).toBe(false)
    expect(grantable(classify("shell", ["ls"]))).toBe(false)
    expect(grantable(classify("question", ["*"]))).toBe(false)
  })
})

describe("settle", () => {
  const none = new Set<Kind>()
  const source = { type: "tool", messageID: "msg", id: "call" }

  test("a request outside the kinds and a rule's answer inside them stay as the rules said", () => {
    expect(settle({ action: "question", resources: ["*"], effect: "ask" }, false, new Set(everyKind()))).toEqual({
      effect: "ask",
    })
    expect(settle({ action: "edit", resources: ["a"], effect: "ask" }, false, none)).toEqual({ effect: "ask" })
    expect(settle({ action: "edit", resources: ["a"], effect: "allow" }, false, none)).toEqual({ effect: "allow" })
  })

  test("a conversation grant answers its kind's question, not another kind's", () => {
    const granted = new Set<Kind>(["write"])
    expect(settle({ action: "edit", resources: ["a"], effect: "ask" }, false, granted)).toEqual({ effect: "allow" })
    expect(settle({ action: "webfetch", resources: ["u"], effect: "ask" }, false, granted)).toEqual({ effect: "ask" })
    // OpenCode's own `.env` question is not the product's to waive.
    expect(settle({ action: "read", resources: [".env"], effect: "ask" }, false, new Set(["read"]))).toEqual({
      effect: "ask",
    })
  })

  test("the terminal: an agent command always asks, a schedule check never runs, a subagent never runs one", () => {
    const all = new Set(everyKind())
    expect(settle({ action: "shell", resources: ["ls"], source, effect: "allow" }, false, all)).toEqual({
      effect: "ask",
    })
    expect(settle({ action: "shell", resources: ["ls"], source, effect: "ask" }, false, all)).toEqual({ effect: "ask" })
    // A schedule's check has no source; the terminal on (`allow` or `ask` from the rules) changes nothing (B2.6a2).
    for (const effect of ["allow", "ask"] as const)
      expect(settle({ action: "shell", resources: ["ls"], effect }, false, all)).toEqual({
        effect: "deny",
        message: scheduleRunDenied,
      })
    expect(settle({ action: "shell", resources: ["ls"], source, effect: "allow" }, true, all)).toEqual({
      effect: "deny",
      message: terminalDenied,
    })
  })

  test("a subagent's own allow does not loosen a default question", () => {
    expect(settle({ action: "webfetch", resources: ["u"], effect: "allow" }, true, none)).toEqual({ effect: "ask" })
    expect(settle({ action: "external_directory", resources: ["/x/*"], effect: "allow" }, true, none)).toEqual({
      effect: "ask",
    })
    expect(settle({ action: "read", resources: ["a"], effect: "allow" }, true, none)).toEqual({ effect: "allow" })
    expect(settle({ action: "webfetch", resources: ["u"], effect: "allow" }, true, new Set(["web"]))).toEqual({
      effect: "allow",
    })
  })
})

describe("the product's own directories outside the project (B2.6a2)", () => {
  const own = ["/data/tool-output", "/res/skills", "C:\\Users\\u\\.loginom-ai-agent\\plan"]
  const outside = (resources: string[]) => ({ action: "external_directory", resources })

  test("a read inside them asks nothing; a neighbour, a write or another question still asks", () => {
    for (const tool of ["read", "glob", "grep"]) {
      expect(ownRead(tool, outside(["/data/tool-output/*"]), own)).toBe(true)
      expect(ownRead(tool, outside(["/res/skills/loginom-automation/references/*"]), own)).toBe(true)
      expect(ownRead(tool, outside(["C:/Users/u/.loginom-ai-agent/plan/*"]), own)).toBe(true)
    }
    for (const resources of [
      ["/data/tool-output-other/*"],
      ["/data/*"],
      ["/res/*"],
      ["/data/tool-output/*", "/x/*"],
      [],
    ])
      expect(ownRead("read", outside(resources), own)).toBe(false)
    for (const tool of ["write", "edit", "patch", "shell", undefined])
      expect(ownRead(tool, outside(["/data/tool-output/*"]), own)).toBe(false)
    expect(ownRead("read", { action: "read", resources: ["/data/tool-output/a.txt"] }, own)).toBe(false)
  })

  test("settle allows such a read, also for a subagent", () => {
    expect(
      settle(
        { action: "external_directory", resources: ["/data/tool-output/*"], effect: "ask" },
        true,
        new Set(),
        true,
      ),
    ).toEqual({
      effect: "allow",
    })
  })
})

describe("refusals (B2.6b)", () => {
  // The fields of OpenCode's permission errors as the plugin receives them inside a `Tool.Error`.
  const declined = { _tag: "Permission.DeclinedError" }
  const blocked = (permission: string, resources: string[], reason?: string) => ({
    _tag: "Permission.BlockedError",
    rules: [],
    permission,
    resources,
    ...(reason === undefined ? {} : { reason }),
  })

  test("the user's «Отклонить» is told as such, whatever the tool", () => {
    expect(refusal({ message: "", error: declined })).toBe(declinedText)
    expect(refusal({ message: "The user declined this tool call", error: declined })).toBe(declinedText)
    expect(isDecline(declined)).toBe(true)
    expect(isDecline(new Error("Permission.DeclinedError"))).toBe(false)
    expect(isDecline(undefined)).toBe(false)
  })

  test("a rule's deny of a kind names the kind, from the error or from OpenCode's bare text", () => {
    expect(
      refusal({
        message: "Permission denied: loginom_dock_action_run",
        error: blocked("loginom_dock_action_run", ["*"]),
      }),
    ).toBe(deniedText({ action: "loginom_dock_action_run", kind: "save" }))
    expect(refusal({ message: "x", error: blocked("loginom_dock_prepare", ["local_package"]) })).toBe(
      deniedText({ action: "loginom_dock_prepare", kind: "save" }),
    )
    expect(refusal({ message: "x", error: blocked("loginom_dock_node_apply", ["exports.excel"]) })).toBe(
      deniedText({ action: "loginom_dock_node_apply", kind: "export" }),
    )
    // `write` wraps the deny with its own text; `webfetch` keeps only the deny's text.
    expect(refusal({ message: "Unable to write a.md", error: blocked("edit", ["a.md"]) })).toBe(
      deniedText({ action: "edit", kind: "write" }),
    )
    expect(refusal({ message: "Permission denied: webfetch" })).toBe(deniedText({ action: "webfetch", kind: "web" }))
    expect(refusal({ message: "Permission denied: shell" })).toBe(deniedText({ action: "shell", kind: "terminal" }))
    expect(deniedText({ action: "loginom_dock_action_run", kind: "save" })).toContain("«Сохранять пакеты в Loginom»")
  })

  test("anything else keeps its text: a reasoned deny, the user's words, an action of no kind, other failures", () => {
    for (const failure of [
      { message: "admin says no", error: blocked("loginom_dock_action_run", ["*"], "admin says no") },
      { message: "x", error: blocked("shell", ["ls"], "LOGINOM_TERMINAL_DENIED: …") },
      { message: "use the copy", error: { _tag: "Permission.CorrectedError", feedback: "use the copy" } },
      { message: "x", error: blocked("loginom_dock_node_apply", ["transform.sort"]) },
      { message: "x", error: blocked("question", ["*"]) },
      { message: "Permission denied: question" },
      { message: "Permission denied: webfetch", error: new Error("Permission denied: webfetch") },
      { message: "Permission denied: webfetch now" },
      { message: "File not found: a.md" },
      { message: "LOGINOM_SCOPE_DENIED: tool x is not available in this task", error: new Error("x") },
    ])
      expect([failure.message, refusal(failure)]).toEqual([failure.message, undefined])
  })
})

const everyKind = () => Object.keys(kinds) as Kind[]
