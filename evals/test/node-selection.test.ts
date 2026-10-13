import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { unzip } from "../src/artifact"
import { inspectSelection } from "../src/node-selection"

test.each(["pending", "running", "completed", "error"])(
  "standard rejects a JavaScript call in state %s even without a saved JS node",
  (status) => {
    const result = inspectSelection({
      mode: "standard",
      nodeTypes: ["TBGImportTextFile", "TBGExportTextFile"],
      parts: [{
        id: "part-js", type: "tool", tool: "loginom_dock_node_apply",
        state: { status, input: { target: { type: "programming.javascript" } } },
      }],
    })
    expect(result.jsCalls).toBe(1)
    expect(result.failures).toContain("JAVASCRIPT_NOT_ALLOWED")
  },
)

test.each(["TBGJavaScriptEngine", "TBGCodeModelComponentEngine"])(
  "standard rejects persisted JavaScript engine %s even without tool calls",
  (type) => {
    const result = inspectSelection({ mode: "standard", nodeTypes: [type], parts: [] })
    expect(result.jsNodes).toBe(1)
    expect(result.failures).toContain("JAVASCRIPT_NOT_ALLOWED")
  },
)

test("missing input remains incomplete instead of proving no JavaScript attempts", () => {
  const result = inspectSelection({
    mode: "standard",
    nodeTypes: null,
    parts: [{
      id: "part-incomplete", type: "tool", tool: "loginom_dock_node_apply",
      state: { status: "pending", input: {}, raw: "" },
    }],
  })
  expect(result.jsNodes).toBeNull()
  expect(result.failures).toContain("TOOL_INPUT_INCOMPLETE")
})

test("pilot audit reads real native XML and oracle but does not certify unfinished evidence checks", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-selection-"))
  try {
    await mkdir(path.join(directory, "artifact/results"), { recursive: true })
    await Bun.write(path.join(directory, "attempt.json"), JSON.stringify({
      sessionID: "pilot-session", cliExitCode: 0, mode: "standard", taskID: "sales-by-category",
    }))
    await Bun.write(path.join(directory, "parts.json"), JSON.stringify({
      sessionID: "pilot-session", messages: [], parts: [],
    }))
    await Bun.write(path.join(directory, "events.jsonl"), "")
    await Bun.write(path.join(directory, "artifact/package.lgp"), Bun.file("tasks/analytic/sales-by-category/reference.lgp"))
    await Bun.write(path.join(directory, "artifact/results/pilot.result.csv"), Bun.file("tasks/analytic/sales-by-category/oracle.csv"))
    await unzip(path.join(directory, "artifact/package.lgp"), path.join(directory, "artifact/unpacked"))
    const run = Bun.spawn([process.execPath, "script/audit-node-selection.ts", "--tasks", "tasks/analytic",
      "--task", "sales-by-category", "--attempt", directory, "--mode", "standard"], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(2)
    expect(await Bun.file(path.join(directory, "selection-audit.json")).json()).toMatchObject({
      jsNodes: 0, jsCalls: 0, oraclePassed: true, policyStatus: "incomplete", calculationPassed: false,
      historyComplete: false, runtimeSettled: false, failures: ["AUDIT_NOT_FINALIZED"],
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test.each(["invalid", "missing"])("pilot preserves %s package evidence as unknown JS count", async (kind) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-selection-"))
  try {
    await mkdir(path.join(directory, "artifact"))
    if (kind === "invalid") await Bun.write(path.join(directory, "artifact/package.lgp"), "not a package")
    await Bun.write(path.join(directory, "parts.json"), JSON.stringify({ sessionID: "pilot-session", parts: [] }))
    const run = Bun.spawn([process.execPath, "script/audit-node-selection.ts", "--tasks", "tasks/analytic",
      "--task", "sales-by-category", "--attempt", directory, "--mode", "standard"], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(2)
    const audit = await Bun.file(path.join(directory, "selection-audit.json")).json()
    expect(audit).toMatchObject({ jsNodes: null, policyStatus: "incomplete", calculationPassed: false })
    expect(audit.failures).toContain(kind === "invalid" ? "PACKAGE_XML_INVALID" : "PACKAGE_MISSING")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("pilot audit writes an incomplete report when the session snapshot is unreadable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-selection-"))
  try {
    await Bun.write(path.join(directory, "parts.json"), "{broken")
    const run = Bun.spawn([process.execPath, "script/audit-node-selection.ts", "--tasks", "tasks/analytic",
      "--task", "sales-by-category", "--attempt", directory, "--mode", "standard"], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(2)
    const audit = await Bun.file(path.join(directory, "selection-audit.json")).json()
    expect(audit).toMatchObject({ policyStatus: "incomplete", historyComplete: false, calculationPassed: false })
    expect(audit.failures).toContain("SNAPSHOT_INVALID")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
