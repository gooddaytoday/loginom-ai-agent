import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import { collectSeriesSlot, inspectSeriesTransition, inspectSeriesLiveParts, runSeriesSlot, runSelectionSeries, selectionSeriesSlots, verifySeriesInputs } from "../script/run-node-selection-series"
import { selectionAttempt } from "../script/run-node-selection-attempt"

// Sanitized projection of completed candidate sales1 (233119), including the
// managed_saved_package_cleanup event. No credentials or browser state.
function evidence() {
  return {
    phase: "candidate", mode: "standard", taskID: "sales-by-category", auditVersion: "audit",
    sessionID: "ses_own", resourceSessionID: "dock-own", documentID: "document-own",
    account: "user", packagePath: "/user/own.lgp", saveOperationID: "save-sales-1",
    cliPid: 1234, deadPids: [1234, 1235], writerAbsent: true,
    attempt: { sessionID: "ses_own", mode: "standard", taskID: "sales-by-category", exitCode: 0,
      cliExitCode: 0, cleanupConfirmed: true, modelStarted: true, blocker: null,
      startedAt: "2026-10-14T02:39:01.092Z", finishedAt: "2026-10-14T02:44:26.496Z",
      cliStartedAt: "2026-10-14T02:39:10.784Z", cliFinishedAt: "2026-10-14T02:44:25.882Z",
      timedOut: false, interruptSentAt: null, packagePath: "/user/own.lgp", resultPath: "/user/own.result.csv",
      reviewStatus: "pending", collectionFailures: [] },
    audit: { auditStage: "complete", auditVersion: "audit", taskID: "sales-by-category", mode: "standard",
      jsNodes: 0, jsCalls: 0, successfulJsCalls: 0, failures: [], policyStatus: "passed", oraclePassed: true,
      calculationPassed: true, historyComplete: true, runtimeSettled: true, identityVerified: true,
      graphComplete: true, exportIdentityVerified: true, packageSha256: "a".repeat(64), reviewStatus: "not-required" },
    packageCleanup: { version: 1, session_id: "dock-own", document_id: "document-own", account: "user",
      package_path: "/user/own.lgp", package_closed: true, logged_out: true, unsaved_changes_discarded: false,
      started_at: "2026-10-14T02:44:25.114Z", completed_at: "2026-10-14T02:44:25.563Z",
      packages_before: 1, packages_after: 0, status: "SUCCEEDED", reason: null,
      save_operation_id: "save-sales-1", policy: "last_confirmed_own_save" },
    resourceClose: ["drain", "client", "bridge", "bridge_ack", "browser_server", "browser", "complete"]
      .map((stage) => ({ version: 1, stage, status: "fulfilled" })),
    terminalClose: ["reply_sending", "reply_flushed", "disconnect_returned", "stop_requested", "exit_requested", "exit_event"]
      .map((stage) => ({ version: 1, stage })),
    hostClose: [{ version: 1, pid: 1235, started_at: "2026-10-14T02:44:25.100Z",
      completed_at: "2026-10-14T02:44:25.800Z", request_error: null, closed_ack: true,
      exit_code: 0, exit_signal: null }],
  }
}

test("closed standard success advances using the authoritative audit review, not attempt.pending", () => {
  expect(inspectSeriesTransition(evidence())).toEqual({ decision: "advance", reason: null })
})

test("foreign or missing close evidence and live/unknown process ownership never advance", () => {
  for (const key of ["session_id", "document_id", "account", "package_path", "save_operation_id"] as const) {
    const value = evidence()
    value.packageCleanup[key] = "foreign"
    expect(inspectSeriesTransition(value).decision).toBe("halt")
  }
  for (const change of [
    { packageCleanup: null }, { resourceClose: [] }, { terminalClose: [] }, { hostClose: [] },
    { hostClose: [...evidence().hostClose, ...evidence().hostClose] }, { deadPids: [1234] }, { writerAbsent: false },
    { resourceClose: [...evidence().resourceClose, { version: 1, stage: "complete", status: "unknown" }] },
  ]) expect(inspectSeriesTransition({ ...evidence(), ...change }).decision).toBe("halt")
})

test("unknown counters and a string wrapper exit cannot masquerade as a completed attempt", () => {
  for (const change of [{ exitCode: "0" }, { exitCode: null }])
    expect(inspectSeriesTransition({ ...evidence(), attempt: { ...evidence().attempt, ...change } }).decision).toBe("halt")
  for (const change of [{ jsNodes: null }, { jsCalls: -1 }, { successfulJsCalls: "0" }])
    expect(inspectSeriesTransition({ ...evidence(), audit: { ...evidence().audit, ...change } }).decision).toBe("halt")
})

test("baseline legacy JavaScript remains a measured policy failure without semantic review", () => {
  const value = evidence()
  expect(inspectSeriesTransition({ ...value, phase: "baseline", attempt: { ...value.attempt, exitCode: 1 },
    audit: { ...value.audit, policyStatus: "failed", jsNodes: 1, jsCalls: 1, failures: ["JAVASCRIPT_NOT_ALLOWED"] } }))
    .toEqual({ decision: "advance", reason: null })
  expect(inspectSeriesTransition({ ...value, phase: "candidate", attempt: { ...value.attempt, exitCode: 1 },
    audit: { ...value.audit, policyStatus: "failed", jsNodes: 1, jsCalls: 1, failures: ["JAVASCRIPT_NOT_ALLOWED"] } }).decision).toBe("halt")
})

test("a completed exception pauses for review and resumes the same evidence after bound audit review", () => {
  const value = evidence()
  const exception = { ...value, mode: "explicit-js", attempt: { ...value.attempt, mode: "explicit-js", exitCode: 2 },
    audit: { ...value.audit, mode: "explicit-js", jsNodes: 1, jsCalls: 1, successfulJsCalls: 1, reviewStatus: "pending" } }
  expect(inspectSeriesTransition(exception)).toEqual({ decision: "review", reason: "MANUAL_REVIEW_REQUIRED" })
  expect(inspectSeriesTransition({ ...exception, audit: { ...exception.audit, reviewStatus: "passed" } }))
    .toEqual({ decision: "advance", reason: null })
})

test("the live guard counts a rejected JavaScript apply once and ignores a partial final JSON line", () => {
  const part = { id: "prt_own", sessionID: "ses_own", type: "tool", tool: "loginom_dock_node_apply",
    state: { status: "error", input: { operation_id: "js-1", target: { kind: "new", type: "programming.javascript" } }, error: "refused" } }
  const line = JSON.stringify({ type: "tool_use", sessionID: "ses_own", part }) + "\n"
  expect(inspectSeriesLiveParts(line + '{"type":', "standard")).toEqual({ stop: true, reason: "JAVASCRIPT_NOT_ALLOWED" })
  expect(inspectSeriesLiveParts(line, "explicit-js").stop).toBe(false)
  expect(inspectSeriesLiveParts(line + JSON.stringify({ sessionID: "foreign" }) + "\n", "standard").reason).toBe("LIVE_SESSION_UNBOUND")
})

test("a durable running JavaScript apply is caught before CLI emits its terminal tool_use", () => {
  const text = JSON.stringify({ type: "step_start", sessionID: "ses_own" }) + "\n"
  const snapshot = { sessionID: "ses_own", parentID: null, childSessionIDs: [], messages: [], parts: [
    { id: "prt_running", sessionID: "ses_own", type: "tool", tool: "loginom_dock_node_apply",
      state: { status: "running", input: { operation_id: "js-1", target: { kind: "new", type: "programming.javascript" } } } },
  ] }
  expect(inspectSeriesLiveParts(text, "standard", snapshot)).toEqual({ stop: true, reason: "JAVASCRIPT_NOT_ALLOWED" })
  expect(inspectSeriesLiveParts(text, "standard", { ...snapshot, sessionID: "foreign" }).reason).toBe("LIVE_SESSION_UNBOUND")
})

test("an observed CLI error halts, and a corrected candidate anomaly requires explicit closed-artifact review", () => {
  expect(inspectSeriesLiveParts(JSON.stringify({ type: "error", sessionID: "ses_own", error: { name: "APIError", data: { message: "quota" } } }) + "\n", "standard"))
    .toEqual({ stop: true, reason: "CLI_ERROR_EVENT" })
  expect(inspectSeriesTransition({ ...evidence(), historyAnomaly: true }))
    .toEqual({ decision: "review", reason: "MANUAL_REVIEW_REQUIRED" })
  expect(inspectSeriesTransition({ ...evidence(), historyAnomaly: true, audit: { ...evidence().audit, reviewStatus: "passed" } }).decision).toBe("advance")
})

test("a real single-runner preflight failure is dispatched once, preserved and never retried", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-series-"))
  try {
    const pins = { runID: "test-1", phase: "candidate", resultsRoot: path.join(root, "results"),
      workspaceRoot: path.join(root, "workspaces"), payload: path.join(root, "payload"), profile: path.join(root, "profile"),
      manifestSha256: "a".repeat(64), expectedSkillDigest: "b".repeat(64), model: "openai/gpt-6-sol-fast", variant: "medium",
      frozenModelsPath: path.join(root, "models.json"), frozenModelsSha256: "c".repeat(64), deadlineSeconds: 1800, graceSeconds: 90,
      connection: { url: "http://localhost/app/", username: "user", folder: "/user" },
      container: { id: "d".repeat(64), name: "loginom-test" }, storageDir: "/workdir/UserStorage/user",
      tasks: { "sales-by-category": { directory: path.join(root, "tasks/sales-by-category"), mode: "standard", attempts: [1],
        promptSha256: "e".repeat(64), inputHashes: { "data.csv": "f".repeat(64) }, oracleSha256: "a".repeat(64) } } }
    const filename = path.join(root, "pins.json")
    await Bun.write(filename, JSON.stringify(pins))
    await Bun.write(path.join(pins.payload, "cli-manifest.json"), "changed payload")
    expect((await runSeriesSlot(filename, "sales-by-category", 1, "audit")).decision).toBe("halt")
    expect(await readdir(path.join(pins.resultsRoot, "incidents"))).toHaveLength(1)
    const before = await readdir(path.join(pins.resultsRoot, "incidents"))
    expect((await runSeriesSlot(filename, "sales-by-category", 1, "audit")).reason).toBe("SLOT_ALREADY_DISPATCHED")
    expect(await readdir(path.join(pins.resultsRoot, "incidents"))).toEqual(before)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("copyout binds the actual prepare, Save, ended runtime and phase pins before sealing closure", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-close-"))
  try {
    const plan = selectionAttempt({ runID: "test-1", phase: "candidate", resultsRoot: path.join(root, "results"),
      workspaceRoot: path.join(root, "workspaces"), payload: path.join(root, "payload"), profile: path.join(root, "profile"),
      manifestSha256: "a".repeat(64), expectedSkillDigest: "b".repeat(64), model: "openai/gpt-6-sol-fast", variant: "medium",
      frozenModelsPath: path.join(root, "models.json"), frozenModelsSha256: "c".repeat(64), deadlineSeconds: 1800, graceSeconds: 90,
      connection: { url: "http://localhost/app/", username: "user", folder: "/user" },
      container: { id: "d".repeat(64), name: "loginom-test" }, storageDir: "/workdir/UserStorage/user",
      tasks: { "sales-by-category": { directory: path.join(root, "tasks/sales-by-category"), mode: "standard", attempts: [1],
        promptSha256: "e".repeat(64), inputHashes: { "data.csv": "f".repeat(64) }, oracleSha256: "a".repeat(64) } } }, "sales-by-category", 1)
    const value = evidence()
    const chat = createHash("sha256").update(value.sessionID).digest("hex")
    const relative = `runtime/generations/1/chats/${chat}/attempts/owned/session.json`
    const source = path.join(plan.pins.profile, "loginom", relative)
    const session = { sessionId: value.resourceSessionID, skillRevision: plan.pins.expectedSkillDigest, clientRevision: "runtime" }
    const write = async (file: string, data: unknown) => { await Bun.write(file, JSON.stringify(data)) }
    await write(source, session)
    await write(path.join(plan.directory, relative), session)
    await write(path.join(plan.directory, "runtime-journals.json"), [{ source, path: relative,
      sha256: createHash("sha256").update(JSON.stringify(session)).digest("hex") }])
    const part = (tool: string, input: unknown, output: unknown) => ({ type: "tool", sessionID: value.sessionID,
      tool, state: { status: "completed", input, output: JSON.stringify(output) } })
    await write(path.join(plan.directory, "parts.json"), { sessionID: value.sessionID, parts: [
      part("loginom_dock_prepare", { intent: "new_draft" }, { prepared: true, sessionId: value.resourceSessionID,
        workspace: { status: "READY", document_id: value.documentID, loginom_account: "user" } }),
      part("loginom_dock_action_run", { action_key: "package.save_checkpoint", operation_id: value.saveOperationID },
        { status: "SUCCEEDED", cleanup_complete: true, operation_id: value.saveOperationID,
          output: { save_completed: true, package_ref: { path: plan.packagePath } } }),
    ] })
    await write(path.join(plan.directory, "tool-outputs.json"), [])
    const cli = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" })
    await cli.exited
    const host = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" })
    await host.exited
    await Bun.write(path.join(plan.directory, "cli.pid"), String(cli.pid) + "\n")
    await write(path.join(path.dirname(source), "saved-package-cleanup.json"), { ...value.packageCleanup, package_path: plan.packagePath })
    for (const [name, rows] of [["resource-close.jsonl", value.resourceClose], ["terminal-close.jsonl", value.terminalClose]] as const)
      await Bun.write(path.join(path.dirname(source), name), rows.map((row) => JSON.stringify(row)).join("\n") + "\n")
    await write(path.join(plan.pins.profile, `loginom/runtime/runtime-close-${host.pid}-aaaa.json`), { ...value.hostClose[0], pid: host.pid })
    await Bun.write(path.join(plan.directory, "artifact/package.lgp"), "closed fixture bytes")
    await write(path.join(plan.directory, "selection-audit.json"), { ...value.audit, oracleSha256: plan.task.oracleSha256,
      packageSha256: createHash("sha256").update("closed fixture bytes").digest("hex") })
    const attempt = { ...value.attempt, evidence: plan.directory, packagePath: plan.packagePath,
      model: plan.pins.model, variant: plan.pins.variant, expectedSkillDigest: plan.pins.expectedSkillDigest,
      binaryManifestSha256: plan.pins.manifestSha256 }
    await write(path.join(plan.directory, "attempt.json"), { ...attempt, expectedSkillDigest: "foreign" })
    await mkdir(path.join(root, "bad-close"))
    const closed = path.join(plan.pins.resultsRoot, "series/candidate-sales-by-category-1")
    await mkdir(closed, { recursive: true })
    await expect(collectSeriesSlot(plan, path.join(root, "bad-close"), [], "audit", "runtime")).rejects.toThrow("CLOSE_ATTEMPT_PINS_MISMATCH")
    await write(path.join(plan.directory, "attempt.json"), attempt)
    const closure = await collectSeriesSlot(plan, closed, [], "audit", "runtime")
    expect(closure.resourceSessionID).toBe(value.resourceSessionID)
    expect(closure.saveOperationID).toBe(value.saveOperationID)
    await write(path.join(root, "pins.json"), plan.pins)
    await write(path.join(closed, "dispatch.json"), { pinsFile: path.join(root, "pins.json") })
    await write(path.join(closed, "returned.json"), { interruptReason: null })
    expect(await runSeriesSlot(path.join(root, "pins.json"), plan.taskID, 1, "audit", "runtime"))
      .toEqual({ decision: "advance", reason: null })
    await expect(readdir(path.join(plan.pins.resultsRoot, "incidents"))).rejects.toMatchObject({ code: "ENOENT" })
    await Bun.write(path.join(plan.directory, "parts.json"), "changed history")
    expect((await runSeriesSlot(path.join(root, "pins.json"), plan.taskID, 1, "audit", "runtime")).reason).toBe("ATTEMPT_CHANGED")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("the frozen 9 → 6 → 16 schedule preserves all slots and rejects duplicate/replacement admission", () => {
  const tasks = ["abc-pareto-groups", "first-last-touch", "sales-by-category", "monthly-demand", "risky-approved-claims", "campaign-roi-by-channel"]
  const schedule = {
    candidateFirst9: [...tasks, "explicit-js", "tags", "recovery"].map((task) => ({ phase: "candidate", task, attempt: 1 })),
    baseline6: tasks.map((task) => ({ phase: "baseline", task, attempt: 1 })),
    candidateRemaining16: [2, 3].flatMap((attempt) => [...tasks, "explicit-js", "tags"].map((task) => ({ phase: "candidate", task, attempt }))),
    cleanFirst9RequiredBeforeBaseline: true, noStartedAttemptReplacement: true,
    comparativePassRequiresBothPhasesComplete: true, policyViolationStopsDigestImmediately: true,
  }
  const lock = { plannedModelSlots: 31, plannedBaselineSlots: 6, plannedCandidateSlots: 25, executionSchedule: schedule }
  const slots = selectionSeriesSlots(lock)
  expect(slots).toHaveLength(31)
  expect(slots[8]).toEqual({ phase: "candidate", task: "recovery", attempt: 1 })
  expect(slots[9]?.phase).toBe("baseline")
  expect(slots[15]?.phase).toBe("candidate")
  expect(() => selectionSeriesSlots({ ...lock, executionSchedule: { ...schedule,
    candidateRemaining16: [schedule.candidateFirst9[0], ...schedule.candidateRemaining16.slice(1)] } })).toThrow("SERIES_SLOT_INVALID")
})

test("a frozen ready:false lock refuses before dispatch or profile access", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-seal-"))
  try {
    const file = path.join(root, "lock.json")
    const text = JSON.stringify({ ready: false })
    await Bun.write(file, text)
    const { chmod } = await import("node:fs/promises")
    await chmod(file, 0o400)
    await expect(runSelectionSeries(file, createHash("sha256").update(text).digest("hex")))
      .rejects.toThrow("SERIES_NOT_ADMITTED")
    expect(await readdir(root)).toEqual(["lock.json"])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("the interslot seal refuses a changed auditor source before the next slot can be admitted", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-source-seal-"))
  try {
    const file = path.join(root, "audit-node-selection.ts")
    await Bun.write(file, "frozen auditor source")
    const inputs = new Map([[file, createHash("sha256").update("frozen auditor source").digest("hex")]])
    await verifySeriesInputs(inputs)
    await Bun.write(file, "changed auditor source")
    await expect(verifySeriesInputs(inputs)).rejects.toThrow("SERIES_INPUT_CHANGED")
  } finally { await rm(root, { recursive: true, force: true }) }
})
