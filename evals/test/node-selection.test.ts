import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { unzip } from "../src/artifact"
import { inspectSelection, inspectSelectionHistory, inspectSelectionRuntime, inspectSelectionProvenance } from "../src/node-selection"
import type { SelectionRuntime } from "../src/node-selection"
import applyWait from "./fixtures/node-selection/apply-wait.json"
import pilotHistory from "./fixtures/node-selection/pilot-history.json"
import pilotRuntime from "./fixtures/node-selection/pilot-runtime.json"

test.each(["source", "context"])("owned %s reads settle using their own contract without an apply status", (kind) => {
  const runtime: SelectionRuntime[] = structuredClone(pilotRuntime)
  const node = JSON.parse(applyWait[2]!.state.output).node as Record<string, unknown>
  const owner = { ...node, operation_id: "source-read", ui_epoch: 1 }
  const parts: unknown[] = [...pilotHistory.snapshot.parts, {
    id: "read-part", type: "tool", tool: "loginom_dock_node_read", sessionID: pilotHistory.snapshot.sessionID,
    state: { status: "completed", input: { kind, operation_id: owner.operation_id, node,
      document_id: node.document_id, workflow_ref: { workflow_id: node.workflow_id } },
    output: JSON.stringify({ kind, owner, ...(kind === "context" ? { cleanup_complete: true, semantic_sha256: "a".repeat(64) } : { source_sha256: "a".repeat(64) }) }) },
  }]
  runtime[0]!.events.push(...["source_open_dispatch", "source_discard_settled", "source_delivery_verified",
    ...(kind === "context" ? ["javascript_context_delivery_verified"] : [])].map((phase) => ({
    session_id: pilotRuntime[0]!.session.sessionId, owner, step: 1, phase,
    semantic_sha256: "a".repeat(64), receipt: { source_sha256: "a".repeat(64) },
  })))
  expect(inspectSelectionRuntime({ parts, runtime })).toEqual({ runtimeSettled: true, failures: [] })
})

test("pilot policy evidence binds the actual model, activated bundled skill and runtime catalog", () => {
  expect(inspectSelectionProvenance({ snapshot: pilotHistory.snapshot, runtime: pilotRuntime,
    model: "openai/gpt-6-sol-fast", variant: "medium", expectedSkillDigest: pilotRuntime[0]!.session.skillRevision,
  })).toEqual({ identityVerified: true, failures: [] })
})

test("the pilot settles its own admitted operations including independently verified delivery", () => {
  const result = inspectSelectionRuntime({ parts: pilotHistory.snapshot.parts, runtime: pilotRuntime })
  expect(result.runtimeSettled).toBe(true)
  expect(result.failures).toEqual([])
})

test.each(["missing-operation", "foreign-owner", "cleanup-false", "ambiguous", "upload-digest", "request-type"])(
  "runtime completion cannot use %s evidence",
  (kind) => {
    const runtime = structuredClone(pilotRuntime)
    const events = runtime[0]!.events
    if (kind === "missing-operation") runtime[0]!.events = events.filter((event) => event.operation_id !== "import-sales-1")
    if (kind === "foreign-owner") runtime[0]!.session.sessionId = "another-dock-session"
    const final = events.find((event) => event.operation_id === "import-sales-1" && event.phase === "completed")!
    if (kind === "cleanup-false") final.outcome!.cleanup_complete = false
    if (kind === "ambiguous") final.outcome!.status = "AMBIGUOUS"
    if (kind === "upload-digest") events.find((event) => event.phase === "artifact_delivery_completed")!.result!.sha256 = "0".repeat(64)
    if (kind === "request-type") events.find((event) => event.phase === "node_apply_prepared")!.request!.target.type = "programming.javascript"
    const result = inspectSelectionRuntime({ parts: pilotHistory.snapshot.parts, runtime })
    expect(result.runtimeSettled).toBe(false)
    expect(result.failures.length).toBeGreaterThan(0)
  },
)

test("complete pilot history accepts the activation metadata update and settles historical pending replies", () => {
  expect(inspectSelectionHistory(pilotHistory)).toEqual({ historyComplete: true, failures: [] })
})

test("an admitted JavaScript apply counts as successful only after its matching real wait receipt", () => {
  const parts = structuredClone(applyWait)
  parts[0]!.state.input.target!.type = "programming.javascript"
  const result = inspectSelection({ mode: "explicit-js", nodeTypes: ["TBGCodeModelComponentEngine"], parts })
  expect(result.successfulJsCalls).toBe(1)
  expect(result.failures).toEqual([])
})

test.each(["wrong-operation", "wrong-session", "failed", "ambiguous", "dirty", "truncated", "invalid-status"])(
  "allowed JavaScript cannot pass with %s receipt evidence",
  (kind) => {
    const parts = structuredClone(applyWait)
    parts[0]!.state.input.target!.type = "programming.javascript"
    const last = parts[2]!
    const output = JSON.parse(last.state.output) as Record<string, unknown>
    if (kind === "wrong-operation") output.operation_id = "another-operation"
    if (kind === "wrong-session") last.sessionID = "another-session"
    if (kind === "failed") output.status = "FAILED"
    if (kind === "ambiguous") output.status = "AMBIGUOUS"
    if (kind === "dirty") output.cleanup_complete = false
    if (kind === "truncated") last.state.metadata.truncated = true
    if (kind === "invalid-status") parts[0]!.state.status = "invented"
    last.state.output = JSON.stringify(output)
    const result = inspectSelection({ mode: "explicit-js", nodeTypes: ["TBGCodeModelComponentEngine"], parts })
    expect(result.successfulJsCalls).toBe(0)
    expect(result.failures).toContain("JAVASCRIPT_EXECUTION_REQUIRED")
  },
)

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

test("a malformed target type cannot establish a non-JavaScript call", () => {
  const result = inspectSelection({ mode: "standard", nodeTypes: null, parts: [{
    id: "part-invalid", type: "tool", tool: "loginom_dock_node_apply",
    state: { status: "completed", input: { target: { type: 123 } } },
  }] })
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
