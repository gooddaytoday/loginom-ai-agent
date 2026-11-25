import { expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { loadTasks } from "../src/task"
import { copySelectionJournals, copySelectionToolOutputs, openSelectionDatabase, readSelectionAttemptReceipts, readSelectionSnapshot, reserveAttempt, runSelectionAttempt, selectionAttempt, selectionExitCode, selectionModelStarted } from "../script/run-node-selection-attempt"

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

test("a session without a Dock call has no Host runtime directory and no journals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-journals-test-"))
  try {
    const profile = path.join(root, "profile"), directory = path.join(root, "attempt")
    // The profile of a run that never called Dock: the Host's other directories exist, runtime does not.
    await mkdir(path.join(profile, "loginom/connection"), { recursive: true })
    await mkdir(directory)
    expect(await copySelectionJournals(profile, "ses_no_dock", directory)).toEqual([])
    expect(await Bun.file(path.join(directory, "runtime")).exists()).toBe(false)
    // With the directory, the journals of that chat alone are copied.
    const chat = new Bun.CryptoHasher("sha256").update("ses_dock").digest("hex")
    const journal = `generations/1/chats/${chat}/attempts/1/session.json`
    await Bun.write(path.join(profile, "loginom/runtime", journal), "{}")
    await Bun.write(path.join(profile, "loginom/runtime/generations/1/chats/other/attempts/1/session.json"), "{}")
    const copied = await copySelectionJournals(profile, "ses_dock", directory)
    expect(copied.map((item) => item.path)).toEqual([path.join("runtime", journal)])
    expect(await Bun.file(path.join(directory, "runtime", journal)).text()).toBe("{}")
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

// `loginom status` of 0.4 and of the product CLI on OpenCode 2 reports a saved connection whose Help its own Host has not
// loaded yet as `configured`, without `hasApiKey` (B2.7b); `loginom check` decides readiness.
test("a configured connection without hasApiKey reaches the connection check", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-status-test-"))
  try {
    const tasks = path.join(evalsRoot, "fixtures/node-selection")
    const task = (await loadTasks(tasks, ["explicit-js"]))[0]!
    const payload = path.join(root, "payload")
    await Bun.write(path.join(payload, "cli-manifest.json"), "{}")
    await Bun.write(path.join(root, "models.json"), "{}")
    const binary = path.join(payload, "bin/loginom-ai-agent-cli")
    await Bun.write(binary, `#!/bin/sh
if [ "$2" = status ]; then echo '{"state":"configured","generation":1,"url":"http://localhost/","username":"user","folder":"/user"}'; fi
if [ "$2" = check ]; then echo '{"ok":false,"code":"LOGINOM_KNOWLEDGE_UNAVAILABLE"}'; fi
`)
    await chmod(binary, 0o755)
    const value = { ...pins(), resultsRoot: path.join(root, "results"), workspaceRoot: path.join(root, "inputs"), payload,
      profile: path.join(root, "profile"), manifestSha256: sha256("{}"), frozenModelsPath: path.join(root, "models.json"), frozenModelsSha256: sha256("{}"),
      tasks: { "explicit-js": { directory: path.join(tasks, "explicit-js"), mode: "explicit-js", attempts: [1], promptSha256: sha256(task.prompt),
        inputHashes: Object.fromEntries(await Promise.all(task.inputs.map(async (input) => [input, sha256(await Bun.file(path.join(task.dir, input)).bytes())]))),
        oracleSha256: sha256(await Bun.file(path.join(task.dir, "oracle.csv")).bytes()) } } }
    const file = path.join(root, "pins.json")
    await Bun.write(file, JSON.stringify(value))
    const result = await runSelectionAttempt(file, "explicit-js", 1)
    expect(result.blocker).toBe("SELECTION_CONNECTION_NOT_READY")
    expect(result.modelStarted).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("empty stdout recovers only the exact own Session created during the CLI lifetime", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-snapshot-test-"))
  const filename = path.join(root, "snapshot.db")
  try {
    writeV2Run(filename)
    const window = { title: "own-exact-title", startedAt: 1795431136000, finishedAt: 1795431138000 }
    expect(readSelectionSnapshot(filename, "", window).sessionID).toBe(v2Run.session.id)
    expect(() => readSelectionSnapshot(filename, "", { ...window, title: "own-exact" })).toThrow("SELECTION_SESSION_INCOMPLETE")
    expect(() => readSelectionSnapshot(filename, "", { ...window, startedAt: 1795431137000 })).toThrow("SELECTION_SESSION_INCOMPLETE")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("a session of OpenCode 2 reads in the snapshot shape that model start, receipts and audit read", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-snapshot-v2-"))
  const filename = path.join(root, "snapshot.db")
  try {
    writeV2Run(filename)
    const snapshot = readSelectionSnapshot(filename, v2Run.session.id)
    expect(snapshot).toMatchObject({ sessionID: v2Run.session.id, parentID: null, childSessionIDs: [] })
    expect(snapshot.messages.map((message) => [message.id, message.role])).toEqual([
      ["msg_user", "user"], ["msg_tools", "assistant"], ["msg_text", "assistant"], ["msg_idle", "idle"]])
    expect(snapshot.messages[1]).toMatchObject({ sessionID: v2Run.session.id, providerID: "test", modelID: "test-model", variant: "default",
      tokens: { input: 10, output: 2, reasoning: 0, cache: { read: 0, write: 0 } } })
    expect(snapshot.messages[1]!.content).toBeUndefined()
    // session_part rows of a message come before its inline content, as history.ts reads them.
    expect(snapshot.parts.map((part) => [part.id, part.messageID, part.type, part.tool])).toEqual([
      ["call_0_0", "msg_tools", "tool", "loginom_dock_node_wait"], ["call_1_0", "msg_tools", "tool", "loginom_dock_node_wait"],
      ["call_2_0", "msg_tools", "tool", "read"], ["msg_text/0", "msg_text", "text", undefined]])
    expect(snapshot.parts[1]).toMatchObject({ callID: "call_1_0", sessionID: v2Run.session.id, state: { status: "completed",
      input: { operation_id: "op-1" }, output: receipt, metadata: { truncated: false }, time: { start: 1795431137369, end: 1795431137391 } } })
    expect(snapshot.parts[2]).toMatchObject({ state: { status: "error", error: "File not found: missing.csv",
      time: { start: 1795431137643, end: 1795431137654 } } })
    expect(selectionModelStarted(snapshot, 0)).toBe(true)
    const receipts = readSelectionAttemptReceipts(snapshot.parts)
    expect(receipts.failures).toEqual([])
    expect(receipts.calls.map((call) => [call.tool, call.start, call.end, call.output.status])).toEqual([
      ["loginom_dock_node_wait", 1795431137300, 1795431137330, "SUCCEEDED"], ["loginom_dock_node_wait", 1795431137369, 1795431137391, "SUCCEEDED"]])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// B2.7a4b: a run --command refused before the model leaves an empty session, and its error event carries that ID.
test("the empty session of a run refused before the model is no model start", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-snapshot-empty-"))
  const filename = path.join(root, "snapshot.db")
  try {
    writeV2Run(filename)
    const database = new Database(filename)
    database.run("INSERT INTO session_v2 VALUES (?, NULL, ?, ?)", ["ses_refused", "refused-title", 1795431140000])
    database.close()
    const snapshot = readSelectionSnapshot(filename, "ses_refused")
    expect(snapshot).toEqual({ sessionID: "ses_refused", parentID: null, childSessionIDs: [], messages: [], parts: [] })
    for (const code of [1, 2, 4]) expect(selectionModelStarted(snapshot, code)).toBe(null)
    expect(readSelectionSnapshot(filename, "", { title: "refused-title", startedAt: 1795431139000, finishedAt: 1795431141000 }).sessionID)
      .toBe("ses_refused")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// Rows a product run on OpenCode 2 left with a scripted model (B2.7b2: a tool, a failed tool, then text), sanitized; the
// tools are named as Dock's, and one more tool sits in a session_part row, as OpenCode 2 splits content of a message.
const receipt = JSON.stringify({ operation_id: "op-1", state: "settled", status: "SUCCEEDED", cleanup_complete: true })
const model = { id: "test-model", providerID: "test", variant: "default" }
const tokens = { input: 10, output: 2, reasoning: 0, cache: { read: 0, write: 0 } }
const v2Run = {
  session: { id: "ses_v2", title: "own-exact-title", time: 1795431136848 },
  messages: [
    { id: "msg_user", type: "user", seq: 5, data: { time: { created: 1795431137231 }, text: "Посчитай сумму qty", files: [] } },
    { id: "msg_tools", type: "assistant", seq: 6, data: { time: { created: 1795431137284, completed: 1795431137397 }, agent: "build", model,
      content: [
        { type: "tool", id: "call_1_0", name: "loginom_dock_node_wait", executed: false, state: { status: "completed", input: { operation_id: "op-1" },
          content: [{ type: "text", text: receipt }], metadata: { truncated: false } }, time: { created: 1795431137354, ran: 1795431137369, completed: 1795431137391 } },
        { type: "tool", id: "call_2_0", name: "read", executed: false, state: { status: "error", input: { path: "missing.csv" },
          error: { type: "tool.execution", message: "File not found: missing.csv" } }, time: { created: 1795431137634, ran: 1795431137643, completed: 1795431137654 } },
      ], finish: "tool-calls", rawFinish: "tool_calls", cost: 0, tokens } },
    { id: "msg_text", type: "assistant", seq: 14, data: { time: { created: 1795431137420, completed: 1795431137441 }, agent: "build", model,
      content: [{ type: "text", text: "Сумма qty: 3." }], finish: "stop", rawFinish: "stop", cost: 0, tokens } },
    { id: "msg_idle", type: "idle", seq: 20, data: { time: { created: 1795431137452 }, outcome: "succeeded" } },
  ],
  parts: [{ message_id: "msg_tools", ordinal: 0, data: { type: "tool", id: "call_0_0", name: "loginom_dock_node_wait", executed: false,
    state: { status: "completed", input: { operation_id: "op-0" }, content: [{ type: "text", text: receipt }] },
    time: { created: 1795431137290, ran: 1795431137300, completed: 1795431137330 } } }],
}

// The columns of OpenCode 2's session tables the snapshot reads (core/src/session/sql.ts).
function writeV2Run(filename: string) {
  const database = new Database(filename)
  database.exec("CREATE TABLE session_v2 (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, time_created INTEGER); " +
    "CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, data TEXT); " +
    "CREATE TABLE session_part (message_id TEXT, session_id TEXT, ordinal INTEGER, type TEXT, call_id TEXT, time_created INTEGER, data TEXT)")
  database.run("INSERT INTO session_v2 VALUES (?, NULL, ?, ?)", [v2Run.session.id, v2Run.session.title, v2Run.session.time])
  // Inserted out of seq order: the snapshot orders them.
  for (const message of [...v2Run.messages].reverse()) database.run("INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?)",
    [message.id, v2Run.session.id, message.type, message.seq, message.data.time.created, JSON.stringify(message.data)])
  for (const part of v2Run.parts) database.run("INSERT INTO session_part VALUES (?, ?, ?, ?, ?, ?, ?)",
    [part.message_id, v2Run.session.id, part.ordinal, part.data.type, part.data.id, part.data.time.created, JSON.stringify(part.data)])
  database.exec("PRAGMA journal_mode = WAL")
  database.close()
}

// B2.7b2 dump of a provider refusing the request with 401: an assistant without content, then the idle row of the failure.
const refusal = { type: "provider.auth", message: "Token refresh failed: HTTP 401", status: 401 }
const refusedModel = {
  sessionID: "ses_refused", parentID: null, childSessionIDs: [],
  messages: [
    { id: "msg_user", sessionID: "ses_refused", role: "user", time: { created: 1795431142053 }, text: "Ещё раз", files: [] },
    { id: "msg_assistant", sessionID: "ses_refused", role: "assistant", providerID: "openai", modelID: "gpt-6-sol-fast",
      time: { created: 1795431142103, completed: 1795431142141 }, finish: "error", error: refusal },
    { id: "msg_idle", sessionID: "ses_refused", role: "idle", time: { created: 1795431142176 }, outcome: "failed", error: refusal },
  ],
  parts: [],
}

test("a 401 of the model's provider proves no inference, while assistant creation alone does not", () => {
  expect(selectionModelStarted(refusedModel, 1)).toBe(false)
  expect(selectionModelStarted(refusedModel, null)).toBe(null)
  expect(selectionModelStarted(refusedModel, 2)).toBe(null)
  const unknown = structuredClone(refusedModel)
  unknown.messages[1]!.error = { type: "provider.unknown", message: "An unknown failure", status: 500 }
  expect(selectionModelStarted(unknown, 1)).toBe(null)
  const idleOk = structuredClone(refusedModel)
  idleOk.messages[2]!.outcome = "succeeded"
  expect(selectionModelStarted(idleOk, 1)).toBe(null)
})

test("a refused request that left a part is not taken for a refusal before inference", () => {
  const withText = structuredClone(refusedModel)
  withText.parts = [{ id: "msg_assistant/0", messageID: "msg_assistant", sessionID: "ses_refused", type: "text" }] as never
  expect(selectionModelStarted(withText, 1)).toBe(true)
})

// The refused request read through the tables, as the snapshot reads a run (B2.7b2: dump-v2 `failed`).
test("a 401 refusal row of OpenCode 2 reads as a refusal before inference", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-snapshot-401-"))
  const filename = path.join(root, "snapshot.db")
  try {
    writeV2Run(filename)
    const database = new Database(filename)
    database.run("INSERT INTO session_v2 VALUES (?, NULL, ?, ?)", ["ses_401", "title-401", 1795431142000])
    for (const [id, type, seq, data] of [
      ["msg_401_user", "user", 5, { time: { created: 1795431142053 }, text: "Ещё раз", files: [] }],
      ["msg_401_assistant", "assistant", 6, { time: { created: 1795431142103, completed: 1795431142141 }, agent: "build", model, content: [], finish: "error", error: refusal }],
      ["msg_401_idle", "idle", 8, { time: { created: 1795431142176 }, outcome: "failed", error: refusal }],
    ] as const) database.run("INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?)", [id, "ses_401", type, seq, data.time.created, JSON.stringify(data)])
    database.close()
    const snapshot = readSelectionSnapshot(filename, "ses_401")
    expect(snapshot.parts).toEqual([])
    expect(selectionModelStarted(snapshot, 1)).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("the snapshot connection cannot write, and does not create a missing file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-snapshot-readonly-"))
  const filename = path.join(root, "snapshot.db")
  try {
    writeV2Run(filename)
    const database = openSelectionDatabase(filename)
    try {
      expect(() => database.run("CREATE TABLE written (id TEXT)")).toThrow()
      expect(() => database.run("DELETE FROM session_v2")).toThrow()
      expect(database.query("SELECT count(*) AS count FROM session_v2").get()).toEqual({ count: 1 })
    } finally { database.close() }
    expect(() => readSelectionSnapshot(path.join(root, "missing.db"), "ses")).toThrow()
    expect(await Bun.file(path.join(root, "missing.db")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
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

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}
