import { expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { copySelectionToolOutputs, readSelectionAttemptReceipts, readSelectionSnapshot, reserveAttempt, runSelectionAttempt, selectionAttempt, selectionExitCode, selectionModelStarted } from "../script/run-node-selection-attempt"

test("an attempt cannot escape the pinned task through its identifier", () => {
  expect(() => selectionAttempt({}, "../foreign-task", 1)).toThrow("SELECTION_TASK_INVALID")
})

test("a pinned slot derives the same owned paths without exposing oracle to the workspace", () => {
  const result = selectionAttempt(pins(), "sales-by-category", 2)
  expect(result.directory).toBe("/tmp/selection-results/baseline/sales-by-category/2")
  expect(result.workspace).toBe("/tmp/selection-inputs/local-1/baseline/sales-by-category/2")
  expect(result.packagePath).toBe("/user/node-selection-local-1-sales-by-category-baseline-2.lgp")
  expect(result.resultName).toBe("node-selection-local-1-sales-by-category-baseline-2.result.csv")
})

test("unsafe or incomplete pins are rejected before any CLI or filesystem work", () => {
  for (const change of [
    { phase: "../other" }, { runID: "../other" }, { resultsRoot: "relative" },
    { workspaceRoot: "/tmp/selection-profile" }, { manifestSha256: "unknown" },
    { connection: { url: "http://user:secret@localhost/", username: "user", folder: "/user" } },
    { storageDir: "/workdir/UserStorage/other" }, { deadlineSeconds: 0 },
    { container: { id: "loginom-server", name: "loginom-server" } },
  ]) expect(() => selectionAttempt({ ...pins(), ...change }, "sales-by-category", 1)).toThrow("SELECTION_PINS_INVALID")
})

test("the verified local Docker container name may contain version dots", () => {
  const input = pins()
  input.container.name = "loginom-server-7.4.2-test"
  expect(selectionAttempt(input, "sales-by-category", 1).pins.container.name).toBe("loginom-server-7.4.2-test")
})

test("a confirmed cancellation preserves exit 130 when evidence is incomplete", () => {
  expect(selectionExitCode({ exitCode: 2, cliExitCode: 130, timedOut: false })).toBe(130)
  expect(selectionExitCode({ exitCode: 2, cliExitCode: 130, timedOut: true })).toBe(2)
  expect(selectionExitCode({ exitCode: 3, cliExitCode: 130, timedOut: false })).toBe(3)
})

test("unconfirmed cleanup remains a series blocker after secondary collection failure or cancellation", () => {
  expect(selectionExitCode({ exitCode: 2, cliExitCode: 1, timedOut: false, cleanupConfirmed: false })).toBe(3)
  expect(selectionExitCode({ exitCode: 2, cliExitCode: 130, timedOut: false, cleanupConfirmed: false })).toBe(3)
})

test("terminal collection preserves the full failed tool field before any cleanup admission", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-terminal-output-"))
  try {
    const profile = path.join(root, "profile"), directory = path.join(root, "attempt")
    const source = path.join(profile, "tool-output/own.txt")
    await Bun.write(source, "NODE_APPLY_STOPPED: own complete failure")
    const original = { id: "own-part", type: "tool", tool: "loginom_dock_node_apply", state: { status: "error",
      input: { target: { type: "transform.calculator" } }, error: "truncated",
      metadata: { truncated: true, outputPath: source } } }
    const parts = await copySelectionToolOutputs([original], profile, directory)
    expect(parts[0]).toMatchObject({ state: { error: "NODE_APPLY_STOPPED: own complete failure", metadata: { truncated: false } } })
    expect(original.state.error).toBe("truncated")
    const manifest = await Bun.file(path.join(directory, "tool-outputs.json")).json()
    expect(manifest).toHaveLength(1)
    expect(await Bun.file(path.join(directory, manifest[0].path)).text()).toBe("NODE_APPLY_STOPPED: own complete failure")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("reserving an existing slot refuses a rerun and preserves its evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-attempt-test-"))
  try {
    const plan = selectionAttempt({ ...pins(), resultsRoot: path.join(root, "results"), workspaceRoot: path.join(root, "inputs") }, "sales-by-category", 1)
    await reserveAttempt(plan)
    await Bun.write(path.join(plan.directory, "sentinel.txt"), "original evidence")
    await expect(reserveAttempt(plan)).rejects.toThrow("SELECTION_SLOT_EXISTS")
    expect(await Bun.file(path.join(plan.directory, "sentinel.txt")).text()).toBe("original evidence")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("failed payload preflight preserves an incident and does not consume the model slot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-preflight-test-"))
  try {
    const value = { ...pins(), resultsRoot: path.join(root, "results"), workspaceRoot: path.join(root, "inputs"), payload: path.join(root, "payload") }
    await Bun.write(path.join(value.payload, "cli-manifest.json"), "changed payload")
    const file = path.join(root, "pins.json")
    await Bun.write(file, JSON.stringify(value))
    const result = await runSelectionAttempt(file, "sales-by-category", 1)
    expect(result.exitCode).toBe(3)
    expect(result.modelStarted).toBe(false)
    expect(result.blocker).toBe("SELECTION_MANIFEST_MISMATCH")
    expect(result.evidence).toContain("/incidents/")
    expect((await Bun.file(path.join(result.evidence, "attempt.json")).json()).modelStarted).toBe(false)
    expect(await Bun.file(path.join(value.resultsRoot, "baseline/sales-by-category/1/attempt.json")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("empty stdout recovers only the exact own Session created during the CLI lifetime", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-snapshot-test-"))
  const filename = path.join(root, "snapshot.db")
  const database = new Database(filename)
  try {
    // One durable fixture transaction avoids one filesystem sync per inserted row.
    database.exec("BEGIN")
    database.exec("CREATE TABLE session (id TEXT, parent_id TEXT, title TEXT, time_created INTEGER); " +
      "CREATE TABLE message (id TEXT, session_id TEXT, data TEXT, time_created INTEGER); " +
      "CREATE TABLE part (id TEXT, message_id TEXT, session_id TEXT, data TEXT, time_created INTEGER)")
    database.run("INSERT INTO session VALUES (?, NULL, ?, ?)", [refreshIncident.sessionID, "own-exact-title", 1791885819700])
    for (const message of refreshIncident.messages) database.run("INSERT INTO message VALUES (?, ?, ?, ?)",
      [message.id, refreshIncident.sessionID, JSON.stringify(message), message.time.created])
    for (const part of refreshIncident.parts) database.run("INSERT INTO part VALUES (?, ?, ?, ?, ?)",
      [part.id, part.messageID, refreshIncident.sessionID, JSON.stringify(part), 1791885819742])
    database.exec("COMMIT")
    database.close()
    const window = { title: "own-exact-title", startedAt: 1791885807486, finishedAt: 1791885821184 }
    expect(readSelectionSnapshot(filename, "", window).sessionID).toBe(refreshIncident.sessionID)
    expect(() => readSelectionSnapshot(filename, "", { ...window, title: "own-exact" })).toThrow("SELECTION_SESSION_INCOMPLETE")
    expect(() => readSelectionSnapshot(filename, "", { ...window, startedAt: 1791885822000 })).toThrow("SELECTION_SESSION_INCOMPLETE")
  } finally {
    database.close()
    await rm(root, { recursive: true, force: true })
  }
})

// Sanitized shape of the 2026-10-13 pilot: no private paths, prompt, attachments or credentials.
const refreshIncident = {
  sessionID: "ses_pilot", parentID: null, childSessionIDs: [],
  messages: [
    { id: "msg_user", sessionID: "ses_pilot", role: "user", time: { created: 1791885819742 } },
    { id: "msg_assistant", sessionID: "ses_pilot", parentID: "msg_user", role: "assistant",
      modelID: "gpt-6-sol-fast", providerID: "openai",
      error: { name: "UnknownError", data: { message: "Token refresh failed: HTTP 401" } },
      time: { created: 1791885819802, completed: 1791885820833 },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  ],
  parts: [
    { id: "prt_1", messageID: "msg_user", sessionID: "ses_pilot", type: "text" },
    { id: "prt_2", messageID: "msg_user", sessionID: "ses_pilot", type: "text" },
    { id: "prt_3", messageID: "msg_user", sessionID: "ses_pilot", type: "text" },
    { id: "prt_4", messageID: "msg_user", sessionID: "ses_pilot", type: "file" },
  ],
}

test("the observed OAuth refresh failure proves no inference, while assistant creation alone does not", () => {
  expect(selectionModelStarted(refreshIncident, 1)).toBe(false)
  expect(selectionModelStarted(refreshIncident, null)).toBe(null)
  const unknown = structuredClone(refreshIncident)
  unknown.messages[1]!.error!.data.message = "An unknown failure"
  expect(selectionModelStarted(unknown, 1)).toBe(null)
})

test("collector preserves export and save receipts alongside completed Help with JavaScript imports", () => {
  const result = readSelectionAttemptReceipts(receiptParts())
  expect(result.failures).toEqual([])
  expect(result.calls).toHaveLength(2)
  expect(result.calls[0]).toMatchObject({
    tool: "loginom_dock_node_wait", start: 1791903896883, end: 1791903929126,
    output: { status: "SUCCEEDED", cleanup_complete: true, execution: { status: "completed", execution_id: "document:1055:9" },
      output: { file_artifacts: [{ destination: "/user/selection.result.csv", bytes: 228, sha256: "a".repeat(64) }] } },
  })
  expect(result.calls[1]).toMatchObject({
    tool: "loginom_dock_action_run", start: 1791903932305, end: 1791903934472,
    input: { action_key: "package.save_checkpoint", operation_id: "abc-save-001" },
    output: { status: "SUCCEEDED", cleanup_complete: true,
      output: { save_completed: true, package_ref: { kind: "package", path: "/user/selection.lgp" } } },
  })
})

test("collector ignores Help even when its content resembles a successful managed receipt", () => {
  const parts = receiptParts()
  parts[0]!.state.output = parts[2]!.state.output
  const result = readSelectionAttemptReceipts(parts)
  expect(result.failures).toEqual([])
  expect(result.calls.map((call) => call.tool)).toEqual(["loginom_dock_node_wait", "loginom_dock_action_run"])
})

test("collector still refuses damaged managed receipt JSON", () => {
  const parts = receiptParts()
  parts[2]!.state.output = parts[2]!.state.output.slice(0, -1)
  expect(() => readSelectionAttemptReceipts(parts)).toThrow("Incomplete tool output JSON")
})

test("collector receipt projection preserves the complete original parts", () => {
  const parts = receiptParts()
  const original = structuredClone(parts)
  readSelectionAttemptReceipts(parts)
  expect(parts).toEqual(original)
})

// Minimal 2026-10-13 ABC evidence: exact Help import fragment, projected receipts, sanitized identities and paths.
function receiptParts() {
  return [
    { id: "help", type: "tool", tool: "loginom_find", state: {
      status: "completed", input: { query: "JavaScript" }, time: { start: 1791903600000, end: 1791903600001 },
      output: '# export.js [JavaScript]\nimports: import { OutputTable, DataType } from "builtIn/Data";\n\ndef Summ()\ndef Multi()',
    } },
    { id: "export", type: "tool", tool: "loginom_dock_node_wait", state: {
      status: "completed", input: { operation_id: "abc-export-001", timeout_ms: 60000 },
      time: { start: 1791903896883, end: 1791903929126 }, output: JSON.stringify({
        operation_id: "abc-export-001", state: "settled", status: "SUCCEEDED", cleanup_complete: true,
        execution: { status: "completed", execution_id: "document:1055:9" }, output: { file_artifacts: [{
          destination: "/user/selection.result.csv", bytes: 228, sha256: "a".repeat(64), execution_id: "document:1055:9",
        }] },
      }),
    } },
    { id: "save", type: "tool", tool: "loginom_dock_action_run", state: {
      status: "completed", input: { action_key: "package.save_checkpoint", operation_id: "abc-save-001" },
      time: { start: 1791903932305, end: 1791903934472 }, output: JSON.stringify({
        status: "SUCCEEDED", cleanup_complete: true,
        output: { save_completed: true, package_ref: { kind: "package", path: "/user/selection.lgp" } },
      }),
    } },
  ]
}

function pins() {
  return {
    runID: "local-1", phase: "baseline", resultsRoot: "/tmp/selection-results",
    workspaceRoot: "/tmp/selection-inputs", payload: "/tmp/selection-payload", profile: "/tmp/selection-profile",
    manifestSha256: "a".repeat(64), expectedSkillDigest: "b".repeat(64),
    model: "openai/gpt-6-sol-fast", variant: "medium", frozenModelsPath: "/tmp/models.json",
    frozenModelsSha256: "c".repeat(64), deadlineSeconds: 1800, graceSeconds: 90,
    connection: { url: "http://localhost/", username: "user", folder: "/user" },
    container: { id: "d".repeat(64), name: "loginom-server" }, storageDir: "/workdir/UserStorage/user",
    tasks: { "sales-by-category": {
      directory: "/tmp/tasks/sales-by-category", mode: "standard", attempts: [1, 2, 3],
      promptSha256: "e".repeat(64), inputHashes: { "data/dataset.csv": "f".repeat(64) }, oracleSha256: "0".repeat(64),
    } },
  }
}
