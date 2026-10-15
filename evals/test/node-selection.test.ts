import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
import { unzip } from "../src/artifact"
import { inspectSelection, inspectSelectionHistory, inspectSelectionRuntime, inspectSelectionProvenance, inspectSelectionReview, inspectSelectionJavaScriptIdentity, inspectSelectionRecovery } from "../src/node-selection"
import type { SelectionRuntime } from "../src/node-selection"
import applyWait from "./fixtures/node-selection/apply-wait.json"
import pilotHistory from "./fixtures/node-selection/pilot-history.json"
import pilotRuntime from "./fixtures/node-selection/pilot-runtime.json"

test("an optional standard review cannot hide a bound failed verdict", () => {
  expect(inspectSelectionReview({ mode: "standard", sessionID: "session", packageSha256: "a".repeat(64),
    review: { verdict: "failed", reviewer: "reviewer", notes: "Anomaly in the saved graph.", sessionID: "session",
      packageSha256: "a".repeat(64), evidence: ["artifact/package.lgp"] },
  }).reviewStatus).toBe("failed")
})

test.each(["valid", "missing", "wrong-session", "wrong-package", "no-evidence", "wrong-role"])(
  "exception review binds the current session and saved bytes: %s", (kind) => {
    const review = { verdict: "passed", reviewer: "independent reviewer", notes: "Checked the requested aggregation and its native surroundings.",
      sessionID: pilotHistory.snapshot.sessionID, packageSha256: "a".repeat(64), evidence: ["parts.json"], javascriptRole: "requested-aggregation" }
    if (kind === "wrong-session") review.sessionID = "different-session"
    if (kind === "wrong-package") review.packageSha256 = "b".repeat(64)
    if (kind === "no-evidence") review.evidence = []
    if (kind === "wrong-role") review.javascriptRole = "variable-unpack-only"
    expect(inspectSelectionReview({ review: kind === "missing" ? null : review, mode: "explicit-js",
      sessionID: pilotHistory.snapshot.sessionID, packageSha256: "a".repeat(64),
    }).reviewStatus).toBe(kind === "valid" ? "passed" : "pending")
  },
)

test("offline audit certifies the complete native pilot independently of selection policy", async () => {
  const directory = await pilotDirectory()
  try {
    const run = Bun.spawn([process.execPath, "script/audit-node-selection.ts", "--tasks", "tasks/analytic",
      "--task", "sales-by-category", "--attempt", directory, "--mode", "standard"], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(0)
    expect(await Bun.file(path.join(directory, "selection-audit.json")).json()).toMatchObject({
      policyStatus: "passed", oraclePassed: true, calculationPassed: true, historyComplete: true, runtimeSettled: true,
      auditVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("offline audit refuses an oracle whose bytes differ from the pinned task", async () => {
  const directory = await pilotDirectory()
  try {
    const pins = await Bun.file(path.join(directory, "pins.json")).json()
    pins.tasks["sales-by-category"].oracleSha256 = "0".repeat(64)
    await Bun.write(path.join(directory, "pins.json"), JSON.stringify(pins))
    const run = Bun.spawn([process.execPath, "script/audit-node-selection.ts", "--tasks", "tasks/analytic",
      "--task", "sales-by-category", "--attempt", directory, "--mode", "standard"], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(2)
    const result = await Bun.file(path.join(directory, "selection-audit.json")).json()
    expect(result.calculationPassed).toBe(false)
    expect(result.failures).toContain("ORACLE_PIN_MISMATCH")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("the receipt for an earlier exporter cannot certify a replaced exporter in the saved package", async () => {
  const directory = await pilotDirectory()
  try {
    const mutation = Bun.spawn(["python3", "-c", `import sys, zipfile, pathlib, xml.etree.ElementTree as ET
package = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(package) as source:
    entries = {name: source.read(name) for name in source.namelist()}
unit = "Unit_0/Unit.xml"
root = ET.fromstring(entries[unit])
exported = next(item for item in root.findall(".//WorkFlow/Nodes/Item") if item.find("./Component/Engine").get("{http://www.w3.org/2001/XMLSchema-instance}type") == "TBGExportTextFile")
entries[unit] = entries[unit].replace(exported.get("Guid").encode(), b"replacement-exporter")
with zipfile.ZipFile(package, "w") as target:
    for name, content in entries.items(): target.writestr(name, content)
(pathlib.Path(sys.argv[2]) / unit).write_bytes(entries[unit])`, path.join(directory, "artifact/package.lgp"), path.join(directory, "artifact/unpacked")],
      { stdout: "pipe", stderr: "pipe" })
    expect(await mutation.exited).toBe(0)
    const run = Bun.spawn([process.execPath, "script/audit-node-selection.ts", "--tasks", "tasks/analytic",
      "--task", "sales-by-category", "--attempt", directory, "--mode", "standard"], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(2)
    const result = await Bun.file(path.join(directory, "selection-audit.json")).json()
    expect(result.graphComplete).toBe(true)
    expect(result.oraclePassed).toBe(true)
    expect(result.calculationPassed).toBe(false)
    expect(result.failures).toContain("EXPORT_IDENTITY_UNVERIFIED")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test.each(["verified", "corrupt", "unknown-entry"])("truncated tool output requires its complete verified manifest: %s", async (kind) => {
  const directory = await pilotDirectory()
  try {
    const original = pilotHistory.snapshot.parts.find((part) => part.tool === "loginom_dock_node_wait")!
    const content = original.state!.output!
    const truncated = { ...original, state: { ...original.state, output: "truncated...",
      metadata: { ...original.state!.metadata, truncated: true, outputPath: "/private/complete-output" } } }
    await Bun.write(path.join(directory, "parts.json"), JSON.stringify({ ...pilotHistory.snapshot,
      parts: pilotHistory.snapshot.parts.map((part) => part.id === original.id ? truncated : part) }))
    await Bun.write(path.join(directory, "events.jsonl"), pilotHistory.events.map((event) => JSON.stringify(
      event.part?.id === original.id ? { ...event, part: truncated } : event)).join("\n"))
    await mkdir(path.join(directory, "tool-outputs"))
    await Bun.write(path.join(directory, "tool-outputs/complete.txt"), content)
    const entry = { partID: original.id, source: "/private/complete-output", path: "tool-outputs/complete.txt",
      sha256: kind === "corrupt" ? "0".repeat(64) : createHash("sha256").update(content).digest("hex") }
    await Bun.write(path.join(directory, "tool-outputs.json"), JSON.stringify(kind === "unknown-entry" ? [entry, {}] : [entry]))
    const run = Bun.spawn([process.execPath, "script/audit-node-selection.ts", "--tasks", "tasks/analytic",
      "--task", "sales-by-category", "--attempt", directory, "--mode", "standard"], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(kind === "verified" ? 0 : 2)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("a failed semantic review blocks acceptance without changing native selection policy", async () => {
  const directory = await pilotDirectory()
  try {
    await Bun.write(path.join(directory, "graph-review.json"), JSON.stringify({ verdict: "failed", reviewer: "reviewer",
      notes: "The reviewed interpretation is wrong despite its matching CSV.", sessionID: pilotHistory.snapshot.sessionID,
      packageSha256: createHash("sha256").update(await Bun.file(path.join(directory, "artifact/package.lgp")).bytes()).digest("hex"),
      evidence: ["artifact/package.lgp"] }))
    const run = Bun.spawn([process.execPath, "script/audit-node-selection.ts", "--tasks", "tasks/analytic",
      "--task", "sales-by-category", "--attempt", directory, "--mode", "standard"], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(1)
    expect(await Bun.file(path.join(directory, "selection-audit.json")).json()).toMatchObject({
      reviewStatus: "failed", policyStatus: "passed", calculationPassed: true,
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("a malformed existing standard review remains pending instead of becoming optional", async () => {
  const directory = await pilotDirectory()
  try {
    await Bun.write(path.join(directory, "graph-review.json"), "{invalid")
    const run = Bun.spawn([process.execPath, "script/audit-node-selection.ts", "--tasks", "tasks/analytic",
      "--task", "sales-by-category", "--attempt", directory, "--mode", "standard"], { stdout: "pipe", stderr: "pipe" })
    expect(await run.exited).toBe(2)
    expect((await Bun.file(path.join(directory, "selection-audit.json")).json()).reviewStatus).toBe("pending")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

async function pilotDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-selection-complete-"))
  await mkdir(path.join(directory, "artifact/results"), { recursive: true })
  await Bun.write(path.join(directory, "parts.json"), JSON.stringify(pilotHistory.snapshot))
  await Bun.write(path.join(directory, "events.jsonl"), pilotHistory.events.map((event) => JSON.stringify(event)).join("\n"))
  await Bun.write(path.join(directory, "tool-outputs.json"), "[]")
  const manifests = []
  for (const runtime of pilotRuntime) {
    const relative = `runtime/generations/1/chats/${createHash("sha256").update(pilotHistory.snapshot.sessionID).digest("hex")}/attempts/fixture-attempt`
    await mkdir(path.join(directory, relative), { recursive: true })
    for (const [name, content] of [["session.json", JSON.stringify(runtime.session)],
      ["execution-events.jsonl", runtime.events.map((event) => JSON.stringify(event)).join("\n")]]) {
      await Bun.write(path.join(directory, relative, name!), content!)
      manifests.push({ path: `${relative}/${name}`, sha256: createHash("sha256").update(content!).digest("hex") })
    }
  }
  await Bun.write(path.join(directory, "runtime-journals.json"), JSON.stringify(manifests))
  const prefix = "/user/node-selection-20261013T093809Z-f5d429-sales-by-category-baseline-1"
  const pinned = { model: "openai/gpt-6-sol-fast", variant: "medium", expectedSkillDigest: pilotRuntime[0]!.session.skillRevision }
  await Bun.write(path.join(directory, "pins.json"), JSON.stringify({ ...pinned, manifestSha256: "b".repeat(64),
    tasks: { "sales-by-category": { oracleSha256: "ba7e5d7f0d7e3c1f2483505483ec8ce8d2f3bcdbb52686cb9814f4ea496ba115",
      inputHashes: { "dataset.csv": "673fc3a6482c19baf96a2221a3964c151716a9c5e66837601df3d8de6316d1a8" } } },
  }))
  await Bun.write(path.join(directory, "attempt.json"), JSON.stringify({ ...pinned, binaryManifestSha256: "b".repeat(64),
    sessionID: pilotHistory.snapshot.sessionID, cliExitCode: 0, taskID: "sales-by-category", mode: "standard",
    packagePath: prefix + ".lgp", resultPath: prefix + ".result.csv", collectionFailures: [],
  }))
  await Bun.write(path.join(directory, "artifact/package.lgp"), Bun.file("test/fixtures/node-selection/pilot-package.lgp"))
  await unzip(path.join(directory, "artifact/package.lgp"), path.join(directory, "artifact/unpacked"))
  await Bun.write(path.join(directory, "artifact/results", path.basename(prefix) + ".result.csv"),
    Bun.file("test/fixtures/node-selection/pilot-result.csv"))
  return directory
}

test.each(["source", "context"])("owned %s reads settle using their own contract without an apply status", (kind) => {
  const evidence = sourceReadEvidence(kind)
  expect(inspectSelectionRuntime(evidence)).toEqual({ runtimeSettled: true, failures: [] })
})

function sourceReadEvidence(kind: string) {
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
  return { parts, runtime, node }
}

function sourceCursorEvidence() {
  const evidence = sourceReadEvidence("source")
  const initial = evidence.parts.at(-1) as { id: string; sessionID: string; type: string; tool: string;
    state: { status: string; input: Record<string, unknown>; output: string } }
  const source = JSON.parse(initial.state.output)
  const cursor = "00000000-0000-4000-8000-000000000000"
  initial.state.output = JSON.stringify({ ...source, cursor })
  const next = { ...initial, id: "source-next", state: { status: "completed",
    input: { kind: "source", operation_id: "source-read", cursor, expected_source_sha256: source.source_sha256 },
    output: JSON.stringify({ ...source, cursor: null }),
  } }
  evidence.parts.push(next)
  return { evidence, initial, next, source }
}

test.each(["valid", "retry", "missing-start", "future-start", "foreign-session", "foreign-dock", "foreign-node", "wrong-digest", "unissued-cursor", "conflicting-start"])(
  "source cursor continuation binds its prior initial request, owner and digest: %s", (kind) => {
    const value = sourceCursorEvidence()
    if (kind === "retry") value.evidence.parts.splice(-1, 0, { ...value.initial, id: "source-initial-retry" })
    if (kind === "missing-start") value.evidence.parts.splice(-2, 1)
    if (kind === "future-start") value.evidence.parts.splice(-2, 2, value.next, value.initial)
    if (kind === "foreign-session") value.initial.sessionID = "foreign-session"
    if (kind === "foreign-dock") value.evidence.parts.splice(-1, 0, {
      type: "tool", tool: "loginom_dock_prepare", sessionID: value.next.sessionID,
      state: { status: "completed", input: {}, output: JSON.stringify({ prepared: true, sessionId: "foreign-dock" }) },
    })
    if (kind === "foreign-node") value.next.state.output = JSON.stringify({ ...value.source,
      owner: { ...value.source.owner, node_id: "foreign-node" }, cursor: null })
    if (kind === "wrong-digest") value.next.state.input.expected_source_sha256 = "b".repeat(64)
    if (kind === "unissued-cursor") value.next.state.input.cursor = "00000000-0000-4000-8000-000000000001"
    if (kind === "conflicting-start") value.evidence.parts.splice(-1, 0, { ...value.initial, id: "conflicting-source-initial",
      state: { ...value.initial.state, input: { ...value.initial.state.input,
        node: { ...value.evidence.node, node_id: "foreign-node" } } },
    })
    const result = inspectSelectionRuntime(value.evidence)
    if (["valid", "retry"].includes(kind)) expect(result).toEqual({ runtimeSettled: true, failures: [] })
    if (!["valid", "retry"].includes(kind)) expect(result.failures).toContain("SOURCE_RECEIPT_UNVERIFIED")
  },
)

test.each([true, false])("source wait uses its progress cleanup contract: %s", (cleanup) => {
  const evidence = sourceReadEvidence("source")
  evidence.parts.push({ id: "read-wait", type: "tool", tool: "loginom_dock_node_wait", sessionID: pilotHistory.snapshot.sessionID,
    state: { status: "completed", input: { operation_id: "source-read", timeout_ms: 1000 }, output: JSON.stringify({
      operation_id: "source-read", state: "settled", outcome: null, progress: {
        node: evidence.node, cleanup_complete: cleanup, pending_phase: null,
      },
    }) },
  })
  expect(inspectSelectionRuntime(evidence).runtimeSettled).toBe(cleanup)
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

test("an owned runtime JS admission cannot be hidden by a missing public apply", () => {
  const runtime = structuredClone(pilotRuntime)
  runtime[0]!.events.find((event) => event.phase === "node_apply_prepared")!.request!.target.type = "programming.javascript"
  const result = inspectSelection({ mode: "standard", nodeTypes: [], parts: pilotHistory.snapshot.parts, runtime })
  expect(result.jsCalls).toBe(1)
  expect(result.failures).toContain("JAVASCRIPT_NOT_ALLOWED")
})

test.each(["corrected", "blocked", "wrong-code", "foreign-node", "foreign-operation", "error-receipt"])(
  "recovery requires the native refusal and later correction on the same calculator: %s", (kind) => {
    const runtime: SelectionRuntime[] = structuredClone(pilotRuntime)
    const node = { document_id: "document", workflow_id: "workflow", node_id: "calculator" }
    const request = { operation_id: "invalid-formula", document_id: node.document_id, workflow_ref: { workflow_id: node.workflow_id },
      target: { type: "transform.calculator", kind: "existing", ref: node } }
    const rejected = { operation_id: request.operation_id, state: "settled", status: "FAILED", cleanup_complete: true, node,
      error: { code: "NODE_APPLY_STOPPED", cause: { code: kind === "wrong-code" ? "OTHER_ERROR" : "WIZARD_CALCULATOR_VALIDATION_FAILED" } } }
    const part = { id: "recovery", type: "tool", tool: "loginom_dock_node_apply", sessionID: pilotHistory.snapshot.sessionID,
      state: { status: "completed", input: request, output: JSON.stringify(rejected) } }
    const parts: unknown[] = [...pilotHistory.snapshot.parts, kind === "error-receipt"
      ? { ...part, state: { status: "error", input: request, error: JSON.stringify(rejected) } } : part]
    runtime[0]!.events.push({ phase: "node_phase_refused", session_id: pilotRuntime[0]!.session.sessionId,
      operation_id: kind === "foreign-operation" ? "foreign" : request.operation_id,
      receipt: { status: "FAILED", cleanup_complete: true, verification: "calculator_syntax_rejected_draft_restored",
        proof: { node: { ...node, node_id: kind === "foreign-node" ? "foreign" : node.node_id } } } })
    if (kind !== "blocked") parts.push({ ...part, id: "corrected", state: { ...part.state,
      input: { ...request, operation_id: "corrected-formula" }, output: JSON.stringify({ ...rejected,
        operation_id: "corrected-formula", status: "SUCCEEDED", execution: { status: "completed" }, error: null }) } })
    expect(inspectSelectionRecovery({ parts, runtime }).recoveryStatus)
      .toBe(kind === "error-receipt" ? "corrected" : ["corrected", "blocked"].includes(kind) ? kind : "unobserved")
  },
)

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

test.each(["document", "workflow", "existing-ref", "terminal-node"])(
  "runtime admission and terminal preserve the public apply node context: %s", (kind) => {
    const runtime = structuredClone(pilotRuntime)
    const admission = runtime[0]!.events.find((event) => event.phase === "node_apply_prepared")!
    const terminal = runtime[0]!.events.find((event) => event.operation_id === admission.operation_id && event.phase === "completed")!
    const part = structuredClone(pilotHistory.snapshot.parts.find((part) => part.tool === "loginom_dock_node_apply"
      && part.state?.input?.operation_id === admission.operation_id)!)
    if (kind === "document") admission.request!.document_id = "foreign-document"
    if (kind === "workflow") admission.request!.workflow_ref.workflow_id = "foreign-workflow"
    if (kind === "terminal-node") terminal.outcome!.output!.node!.document_id = "foreign-document"
    if (kind === "existing-ref") {
      admission.request!.target.kind = "existing"
      part.state!.input!.target!.kind = "existing"
      Object.assign(part.state!.input!.target!, { ref: terminal.outcome!.output!.node })
      Object.assign(admission.request!.target, { ref: { ...terminal.outcome!.output!.node, node_id: "foreign-node" } })
    }
    const result = inspectSelectionRuntime({ runtime, parts: pilotHistory.snapshot.parts.map((entry) => entry.id === part.id ? part : entry) })
    expect(result.runtimeSettled).toBe(false)
    expect(result.failures).toContain("RUNTIME_APPLY_MISMATCH")
  },
)

test("complete pilot history accepts the activation metadata update and settles historical pending replies", () => {
  expect(inspectSelectionHistory(pilotHistory)).toEqual({ historyComplete: true, failures: [] })
})

test("an unknown part type cannot hide an apply from complete history", () => {
  const evidence = structuredClone(pilotHistory)
  const part = evidence.snapshot.parts.find((part) => part.tool === "loginom_dock_node_apply")!
  part.type = "future-tool"
  evidence.events = evidence.events.filter((event) => event.part?.id !== part.id)
  expect(inspectSelectionHistory(evidence).historyComplete).toBe(false)
})

test("an admitted JavaScript apply counts as successful only after its matching real wait receipt", () => {
  const parts = structuredClone(applyWait)
  parts[0]!.state.input.target!.type = "programming.javascript"
  const result = inspectSelection({ mode: "explicit-js", nodeTypes: ["TBGCodeModelComponentEngine"], parts })
  expect(result.successfulJsCalls).toBe(1)
  expect(result.failures).toEqual([])
})

test("a retained node outcome delivered by resolved inspection settles the earlier response-budget refusal", () => {
  const evidence = inspectedDelivery()
  expect(inspectSelectionRuntime(evidence)).toEqual({ runtimeSettled: true, failures: [] })
  expect(inspectSelection({ mode: "standard", nodeTypes: ["TBGCodeModelComponentEngine"], ...evidence })).toMatchObject({
    jsCalls: 1, successfulJsCalls: 1, failures: ["JAVASCRIPT_NOT_ALLOWED"],
  })
})

test.each(["pending", "cleanup-false", "inner-cleanup-false", "effect-unverified", "missing-outcome", "wrong-action"])(
  "outer inspection success cannot certify a node outcome: %s", (kind) => {
    const evidence = inspectedDelivery()
    if (kind === "pending") evidence.inspection.output.state = "pending"
    if (kind === "cleanup-false") evidence.inspection.output.cleanup_confirmed = false
    if (kind === "inner-cleanup-false") evidence.inspection.output.outcome.cleanup_complete = false
    if (kind === "effect-unverified") evidence.inspection.output.effect_state = "observed_unverified"
    if (kind === "missing-outcome") Object.assign(evidence.inspection.output, { outcome: null })
    if (kind === "wrong-action") evidence.inspection.action_key = "another.action"
    evidence.parts.at(-1)!.state.output = JSON.stringify(evidence.inspection)
    expect(inspectSelectionRuntime(evidence).runtimeSettled).toBe(false)
    expect(inspectSelection({ mode: "explicit-js", nodeTypes: ["TBGCodeModelComponentEngine"], ...evidence }).successfulJsCalls).toBe(0)
  },
)

test.each(["inner-id", "node", "document", "workflow", "execution", "session"])(
  "inspection must retain its admitted operation and runtime identity: %s", (kind) => {
    const evidence = inspectedDelivery()
    const outcome = evidence.inspection.output.outcome
    if (kind === "inner-id") outcome.operation_id = "foreign-operation"
    if (kind === "node") outcome.output.node.node_id = "foreign-node"
    if (kind === "document") outcome.output.node.document_id = "foreign-document"
    if (kind === "workflow") outcome.output.node.workflow_id = "foreign-workflow"
    if (kind === "execution") outcome.output.execution.execution_id = "foreign-execution"
    if (kind === "session") evidence.parts.at(-1)!.sessionID = "foreign-session"
    evidence.parts.at(-1)!.state.output = JSON.stringify(evidence.inspection)
    expect(inspectSelectionRuntime(evidence).runtimeSettled).toBe(false)
  },
)

test.each(["original-id", "input-id", "unknown-error", "missing-inspection", "earlier-inspection"])(
  "only a later bound terminal inspection resolves this delivery refusal: %s", (kind) => {
    const evidence = inspectedDelivery()
    if (kind === "original-id") evidence.refusal.original_operation_id = "foreign-operation"
    if (kind === "input-id") evidence.parts[3]!.state.input.operation_id = "foreign-operation"
    if (kind === "unknown-error") evidence.refusal.error.code = "UNKNOWN_FAILURE"
    evidence.parts[3]!.state.error = JSON.stringify(evidence.refusal)
    if (kind === "missing-inspection") evidence.parts.pop()
    if (kind === "earlier-inspection") evidence.parts.splice(3, 0, evidence.parts.pop()!)
    const result = inspectSelectionRuntime(evidence)
    expect(result.runtimeSettled).toBe(false)
    expect(result.failures).toContain("TOOL_RECEIPT_INCOMPLETE")
  },
)

// Minimal projection of ABC baseline/2: retained outcome, delivery refusal and the instructed inspection.
function inspectedDelivery() {
  const operation = "pareto-rows-01"
  const request = { operation_id: operation, document_id: "document", workflow_ref: { workflow_id: "workflow" },
    target: { kind: "new", type: "programming.javascript" } }
  const outcome = { status: "SUCCEEDED", action_key: "node.apply", operation_id: operation, phase: "node_ready",
    effect_possible: true, cleanup_complete: true, error: null, output: {
      operation_id: operation, status: "SUCCEEDED", cleanup_complete: true,
      node: { document_id: "document", workflow_id: "workflow", node_id: "pareto-node" },
      execution: { status: "completed", execution_id: "document:1091:4" },
    } }
  const inspection = { status: "SUCCEEDED", action_key: "operation.inspect", operation_id: operation,
    phase: "observed", effect_possible: false, error: null, output: {
      operation_id: operation, state: "resolved", outcome, cleanup_confirmed: true, effect_state: "verified",
    } }
  const refusal = { result_delivery: "refused", error: { code: "USER_RESPONSE_BUDGET", scope: "whole_response" },
    original_operation_id: operation, next_step: { tool: "dock_operation_inspect", arguments: { operation_id: operation } } }
  const parts = [
    { id: "prepare", sessionID: "session", type: "tool", tool: "loginom_dock_prepare",
      state: { status: "completed", input: {}, output: JSON.stringify({ prepared: true, sessionId: "dock" }) } },
    { id: "apply", sessionID: "session", type: "tool", tool: "loginom_dock_node_apply",
      state: { status: "completed", input: request, output: JSON.stringify({ operation_id: operation, state: "running" }) } },
    { id: "wait", sessionID: "session", type: "tool", tool: "loginom_dock_node_wait",
      state: { status: "completed", input: { operation_id: operation }, output: JSON.stringify({ operation_id: operation, state: "running" }) } },
    { id: "refusal", sessionID: "session", type: "tool", tool: "loginom_dock_node_wait",
      state: { status: "error", input: { operation_id: operation }, error: JSON.stringify(refusal) } },
    { id: "inspect", sessionID: "session", type: "tool", tool: "loginom_dock_operation_inspect",
      state: { status: "completed", input: { operation_id: operation }, output: JSON.stringify(inspection) } },
  ]
  return { parts, inspection, refusal, runtime: [{ path: "own-runtime", session: { sessionId: "dock" }, events: [
    { session_id: "dock", operation_id: operation, phase: "node_apply_prepared", request },
    { session_id: "dock", operation_id: operation, phase: "completed", outcome: structuredClone(outcome) },
  ] }] }
}

test.each(["valid", "wrong-existing-ref", "foreign-workflow", "duplicate-xml-id", "different-xml-node"])(
  "successful JS belongs to the unique saved node and exported workflow: %s", (kind) => {
    const parts: unknown[] = structuredClone(applyWait)
    const node = JSON.parse(applyWait[2]!.state.output).node as Record<string, unknown>
    parts[0] = { ...applyWait[0], state: { ...applyWait[0]!.state, input: { ...applyWait[0]!.state.input,
      target: { kind: "existing", type: "programming.javascript", ref: { ...node,
        node_id: kind === "wrong-existing-ref" ? "different-node" : node.node_id } },
    } } }
    const nodeIDs = kind === "duplicate-xml-id" ? [node.node_id, node.node_id]
      : [kind === "different-xml-node" ? "different-node" : node.node_id]
    expect(inspectSelectionJavaScriptIdentity({ parts, nodeIDs,
      exportNode: { ...node, workflow_id: kind === "foreign-workflow" ? "foreign-workflow" : node.workflow_id },
    })).toBe(kind === "valid")
  },
)

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

test.each(["pending", "running", "completed", "error"])(
  "standard rejects a full JavaScript resume request in state %s before runtime admission",
  (status) => {
    const parts = [{
      id: "resume-js", sessionID: "session", type: "tool", tool: "loginom_dock_node_resume",
      state: { status, input: { operation_id: "unknown-js", target: { kind: "new", type: "programming.javascript" } } },
    }]
    for (const mode of ["standard", "standard-recovery"] as const) {
      const result = inspectSelection({ mode, nodeTypes: [], parts })
      expect(result.jsCalls).toBe(1)
      expect(result.successfulJsCalls).toBe(0)
      expect(result.failures).toContain("JAVASCRIPT_NOT_ALLOWED")
    }
    expect(inspectSelection({ mode: "explicit-js", nodeTypes: [], parts }).failures).not.toContain("JAVASCRIPT_NOT_ALLOWED")
  },
)

test("an ID-only standard resume does not invent a new node-selection request", () => {
  expect(inspectSelection({ mode: "standard", nodeTypes: [], parts: [{
    id: "resume-owned", sessionID: "session", type: "tool", tool: "loginom_dock_node_resume",
    state: { status: "completed", input: { operation_id: "owned-standard" } },
  }] })).toEqual({ jsNodes: 0, jsCalls: 0, successfulJsCalls: 0, failures: [] })
})

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

test("native XML and oracle alone do not certify incomplete session evidence", async () => {
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
      historyComplete: false, runtimeSettled: false,
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
