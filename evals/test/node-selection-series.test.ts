import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import { collectSeriesSlot, inspectSeriesTransition, inspectSeriesLiveParts, runSeriesSlot, runSelectionSeries, selectionSeriesSlots, verifySeriesInputs } from "../script/run-node-selection-series"
import { selectionAttempt } from "../script/run-node-selection-attempt"
import { buildAgentPrompt, loadTasks } from "../src/task"

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
    expect(await runSeriesSlot(filename, "sales-by-category", 1, "audit", undefined, false, undefined, true))
      .toEqual({ decision: "halt", reason: "REFERENCE_SLOT_NOT_DISPATCHED" })
    expect(await Bun.file(path.join(pins.resultsRoot, "series/candidate-sales-by-category-1/dispatch.json")).exists()).toBe(false)
    expect(await readdir(root)).not.toContain("results")
    expect((await runSeriesSlot(filename, "sales-by-category", 1, "audit")).decision).toBe("halt")
    expect(await readdir(path.join(pins.resultsRoot, "incidents"))).toHaveLength(1)
    const before = await readdir(path.join(pins.resultsRoot, "incidents"))
    expect((await runSeriesSlot(filename, "sales-by-category", 1, "audit")).reason).toBe("SLOT_ALREADY_DISPATCHED")
    expect(await readdir(path.join(pins.resultsRoot, "incidents"))).toEqual(before)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test.each(["package-cleanup.json", "saved-package-cleanup.json"])("copyout binds the actual %s receipt to prepare, Save, runtime and phase pins", async (cleanupFile) => {
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
    await write(path.join(path.dirname(source), cleanupFile), { ...value.packageCleanup, package_path: plan.packagePath,
      policy: cleanupFile === "saved-package-cleanup.json" ? "last_confirmed_own_save" : undefined })
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
    // Actual claims2 shape: completed machine audit, corrected-history anomaly,
    // and a later independent review must not rewrite the sealed audit.
    await write(path.join(closed, "closure.json"), { ...closure, historyAnomaly: true })
    const auditFile = path.join(plan.directory, "selection-audit.json")
    const auditBytes = await Bun.file(auditFile).text()
    await chmod(auditFile, 0o400)
    const reviewFile = path.join(plan.directory, "graph-review.json")
    const review = { verdict: "passed", reviewer: "independent",
      notes: "Reviewed the corrected anomaly against the bound saved package.", sessionID: value.sessionID,
      packageSha256: createHash("sha256").update("closed fixture bytes").digest("hex"), evidence: ["artifact/package.lgp"] }
    await write(reviewFile, review)
    const assessV2 = () => runSeriesSlot(path.join(root, "pins.json"), plan.taskID, 1, "audit", "runtime", false,
      { criteriaVersion: "node-selection-policy-v2", criteriaSha256: "5b5053d14aecf7462e317b75fa3a14fa3bff6717080128edf0da582171a015fa" })
    expect(await runSeriesSlot(path.join(root, "pins.json"), plan.taskID, 1, "audit", "runtime"))
      .toEqual({ decision: "review", reason: "AUDIT_REVIEW_REFRESH_REQUIRED" })
    expect(await assessV2()).toEqual({ decision: "advance", reason: null })
    expect((await runSeriesSlot(path.join(root, "pins.json"), plan.taskID, 1, "audit", "runtime", false,
      { criteriaVersion: "node-selection-policy-v2", criteriaSha256: "unbound" })).decision).toBe("review")
    await rm(reviewFile)
    expect(await assessV2()).toEqual({ decision: "review", reason: "MANUAL_REVIEW_REQUIRED" })
    for (const change of [{ sessionID: "foreign" }, { packageSha256: "b".repeat(64) }, { evidence: [] }, { verdict: "failed" }]) {
      await write(reviewFile, { ...review, ...change })
      expect((await assessV2()).decision).not.toBe("advance")
    }
    await write(reviewFile, { ...review, evidence: ["artifact/missing.lgp"] })
    await expect(assessV2()).rejects.toMatchObject({ code: "ENOENT" })
    await write(reviewFile, review)
    expect(await Bun.file(auditFile).text()).toBe(auditBytes)
    const audit: Record<string, unknown> = await Bun.file(auditFile).json()
    for (const change of [{ jsCalls: 1 }, { jsNodes: 1 }, { policyStatus: "failed" },
      { calculationPassed: false }, { oraclePassed: false }, { reviewStatus: "failed" }]) {
      await chmod(auditFile, 0o600)
      await write(auditFile, { ...audit, ...change })
      await chmod(auditFile, 0o400)
      const before = await Bun.file(auditFile).text()
      expect((await assessV2()).decision).not.toBe("advance")
      expect(await Bun.file(auditFile).text()).toBe(before)
    }
    await chmod(auditFile, 0o600)
    await Bun.write(auditFile, auditBytes)
    await chmod(auditFile, 0o400)
    expect(await assessV2()).toEqual({ decision: "advance", reason: null })
    expect(await Bun.file(auditFile).text()).toBe(auditBytes)
    // Actual first-last-touch/2: partial package saved, four no-effect Export
    // refusals, no CSV, original machine flags still false after normal release.
    const failedAttempt = { ...attempt, exitCode: 2, resultPath: null, policyStatus: "incomplete",
      calculationPassed: false, oraclePassed: false, collectionFailures: ["RESULT_RECEIPT_MISSING_OR_AMBIGUOUS"] }
    const failedAudit = { ...audit, policyStatus: "incomplete", calculationPassed: false, oraclePassed: false,
      runtimeSettled: false, identityVerified: false, graphComplete: false, exportIdentityVerified: false,
      failures: ["RESULT_RECEIPT_UNVERIFIED", "RUNTIME_APPLY_MISMATCH", "TOOL_RECEIPT_INCOMPLETE", "CATALOG_UNVERIFIED", "GRAPH_IMPORT_EXPORT_REQUIRED"] }
    await write(path.join(plan.directory, "attempt.json"), failedAttempt)
    await chmod(auditFile, 0o600)
    await write(auditFile, failedAudit)
    await chmod(auditFile, 0o400)
    const boundFile = async (file: string) => ({ path: file, sha256: createHash("sha256").update(await Bun.file(file).bytes()).digest("hex") })
    const failureClosure = { ...closure, historyAnomaly: true, protectedFiles: { ...closure.protectedFiles,
      "attempt.json": (await boundFile(path.join(plan.directory, "attempt.json"))).sha256 } }
    await write(path.join(closed, "closure.json"), failureClosure)
    await rm(reviewFile)
    const failureReviewFile = path.join(plan.directory, "independent-failed-attempt-review.json")
    const failureReview = { ...review, criteriaVersion: "node-selection-policy-v2",
      criteriaSha256: "5b5053d14aecf7462e317b75fa3a14fa3bff6717080128edf0da582171a015fa",
      phase: "candidate", taskID: plan.taskID, attempt: 1, policyVerdict: "passed", functionalResultPassed: false,
      historyComplete: true, substantiveSelectionSufficient: true, jsApplyAttempts: 0, unjustifiedJsAttempts: 0,
      publicOperationsSettled: true, catalogIdentityVerified: true,
      notes: "Standard analytics executed; Export refused without effect. Failure accounting, not functional PASS.",
      evidence: ["attempt.json", "selection-audit.json", "parts.json", "runtime-journals.json", "artifact/package.lgp"] }
    await write(failureReviewFile, failureReview)
    await chmod(failureReviewFile, 0o400)
    const sidecarFile = path.join(plan.pins.resultsRoot, "policy-v2/candidate", plan.taskID, "1.json")
    const sidecar = { version: 2, criteriaVersion: "node-selection-policy-v2",
      criteria: { sha256: "5b5053d14aecf7462e317b75fa3a14fa3bff6717080128edf0da582171a015fa" },
      phase: "candidate", taskID: plan.taskID, attempt: 1, sessionID: value.sessionID, reviewer: "independent",
      packageSha256: review.packageSha256, failureReview: await boundFile(failureReviewFile),
      policy: { verdict: "passed", reason: "Seven standard analytical nodes; four settled no-effect Export refusals, no JavaScript.",
        historyComplete: true, substantiveSelectionSufficient: true, entireToolLedgerReviewed: true,
        temporaryAndFailedJsAttemptsIncluded: true, jsApplyAttempts: 0, successfulJsCalls: 0, savedJsNodes: 0,
        unjustifiedJsAttempts: 0, standardFailureUsedAsJsJustification: false, manualReview: await boundFile(failureReviewFile),
        substantiveSelections: [{ type: "imports.text", toolState: "completed" },
          { type: "transform.calculator", toolState: "completed" }, { type: "transform.group_data", toolState: "completed" }] },
      analytics: { originalAudit: failedAudit },
      trustedHistory: { parentID: null, childSessionIDs: [], allSessionAndMessageBindingsMatch: true, allEventsOwnSession: true },
      runtime: { publicOperationsSettled: true, catalogIdentityVerified: true, originalRuntimeSettled: false, originalIdentityVerified: false },
      evidence: await Promise.all(["attempt.json", "selection-audit.json", "parts.json", "runtime-journals.json", relative,
        "independent-failed-attempt-review.json", "artifact/package.lgp"].map((file) => boundFile(path.join(plan.directory, file)))
        .concat(boundFile(path.join(closed, "closure.json")))) }
    await write(sidecarFile, sidecar)
    await chmod(sidecarFile, 0o400)
    expect(await runSeriesSlot(path.join(root, "pins.json"), plan.taskID, 1, "audit", "runtime"))
      .toEqual({ decision: "halt", reason: "ATTEMPT_NOT_COMPLETE" })
    const failedAuditBytes = await Bun.file(auditFile).text()
    expect(await assessV2()).toMatchObject({ decision: "advance", reason: "POLICY_V2_FAILURE_RECORDED",
      calculationPassed: false, oraclePassed: false, policyStatus: "incomplete", jsCalls: 0 })
    expect(await Bun.file(auditFile).text()).toBe(failedAuditBytes)
    const sealSidecar = async (change: Record<string, unknown> = {}) => {
      await chmod(sidecarFile, 0o600)
      await write(sidecarFile, { ...sidecar, evidence: await Promise.all(sidecar.evidence.map((item) => boundFile(item.path))), ...change })
      await chmod(sidecarFile, 0o400)
    }
    await rm(sidecarFile)
    expect((await assessV2()).reason).toBe("POLICY_V2_FAILURE_REVIEW_REQUIRED")
    await write(sidecarFile, sidecar)
    await chmod(sidecarFile, 0o400)
    for (const change of [{ criteria: { sha256: "a".repeat(64) } }, { phase: "baseline" }, { taskID: "foreign" },
      { attempt: 2 }, { sessionID: "foreign" }, { packageSha256: "b".repeat(64) }, { reviewer: "" },
      ...[{ verdict: "failed" }, { historyComplete: false }, { substantiveSelectionSufficient: false }, { jsApplyAttempts: 1 },
        { substantiveSelections: [{ type: "imports.text", toolState: "completed" }] }].map((change) => ({ policy: { ...sidecar.policy, ...change } })),
      { trustedHistory: { ...sidecar.trustedHistory, childSessionIDs: ["foreign"] } },
      { runtime: { ...sidecar.runtime, publicOperationsSettled: false } }, { runtime: { ...sidecar.runtime, catalogIdentityVerified: false } },
      { evidence: sidecar.evidence.filter((item) => item.path !== path.join(closed, "closure.json")) },
      { evidence: sidecar.evidence.map((item) => ({ ...item, sha256: "a".repeat(64) })) }]) {
      await sealSidecar(change)
      expect((await assessV2()).decision).not.toBe("advance")
    }
    await sealSidecar()
    await chmod(sidecarFile, 0o600)
    expect((await assessV2()).decision).toBe("halt")
    await chmod(sidecarFile, 0o400)
    const sealedSidecar = await Bun.file(sidecarFile).text()
    await Bun.write(path.join(root, "foreign-sidecar.json"), sealedSidecar)
    await chmod(path.join(root, "foreign-sidecar.json"), 0o400)
    await rm(sidecarFile)
    await symlink(path.join(root, "foreign-sidecar.json"), sidecarFile)
    expect((await assessV2()).decision).toBe("halt")
    await rm(sidecarFile)
    await Bun.write(sidecarFile, sealedSidecar)
    await chmod(sidecarFile, 0o400)
    const failureReviewBytes = await Bun.file(failureReviewFile).text()
    for (const change of [{ verdict: "failed" }, { sessionID: "foreign" }, { packageSha256: "b".repeat(64) }, { evidence: [] },
      { criteriaSha256: "a".repeat(64) }, { taskID: "foreign" }, { attempt: 2 }, { functionalResultPassed: true },
      { publicOperationsSettled: false }, { catalogIdentityVerified: false }, { jsApplyAttempts: 1 }]) {
      await chmod(failureReviewFile, 0o600)
      await write(failureReviewFile, { ...failureReview, ...change })
      await chmod(failureReviewFile, 0o400)
      const changedReview = await boundFile(failureReviewFile)
      await sealSidecar({ failureReview: changedReview, policy: { ...sidecar.policy, manualReview: changedReview } })
      expect((await assessV2()).decision).toBe("halt")
    }
    await chmod(failureReviewFile, 0o600)
    await Bun.write(failureReviewFile, failureReviewBytes)
    await chmod(failureReviewFile, 0o400)
    for (const change of [{ jsCalls: 1 }, { jsNodes: 1 }, { historyComplete: false }, { policyStatus: "failed" }, { failures: ["UNKNOWN_FAILURE"] }]) {
      await chmod(auditFile, 0o600)
      await write(auditFile, { ...failedAudit, ...change })
      await chmod(auditFile, 0o400)
      await sealSidecar()
      expect((await assessV2()).decision).toBe("halt")
    }
    await chmod(auditFile, 0o600)
    await Bun.write(auditFile, failedAuditBytes)
    await chmod(auditFile, 0o400)
    const copiedBytes = await Promise.all(Object.keys(failureClosure.copied).map(async (name) => ({ name, text: await Bun.file(path.join(closed, name)).text() })))
    for (const change of [{ name: cleanupFile, patch: { package_closed: false } }, { name: cleanupFile, patch: { logged_out: false } },
      { name: cleanupFile, patch: { unsaved_changes_discarded: true } }, { name: cleanupFile, patch: { account: "foreign" } },
      { name: "host-close.json", patch: { closed_ack: false } }, { name: "host-close.json", patch: { exit_code: 1 } }]) {
      const before = await Bun.file(path.join(closed, change.name)).text()
      const receipt: Record<string, unknown> = JSON.parse(before)
      await write(path.join(closed, change.name), { ...receipt, ...change.patch })
      await write(path.join(closed, "closure.json"), { ...failureClosure,
        copied: { ...failureClosure.copied, [change.name]: (await boundFile(path.join(closed, change.name))).sha256 } })
      await sealSidecar()
      expect((await assessV2()).decision).toBe("halt")
      await Bun.write(path.join(closed, change.name), before)
    }
    for (const name of ["resource-close.jsonl", "terminal-close.jsonl"]) {
      await Bun.write(path.join(closed, name), "")
      await write(path.join(closed, "closure.json"), { ...failureClosure,
        copied: { ...failureClosure.copied, [name]: (await boundFile(path.join(closed, name))).sha256 } })
      await sealSidecar()
      expect((await assessV2()).decision).toBe("halt")
      await Bun.write(path.join(closed, name), copiedBytes.find((item) => item.name === name)!.text)
    }
    await write(path.join(closed, "closure.json"), { ...failureClosure, cliPid: process.pid })
    await sealSidecar()
    expect((await assessV2()).reason).toBe("OWN_PROCESS_NOT_GONE")
    await write(path.join(closed, "closure.json"), failureClosure)
    await sealSidecar()
    await mkdir(path.join(plan.pins.profile, ".writer"))
    expect((await assessV2()).reason).toBe("PROFILE_WRITER_PRESENT_OR_UNKNOWN")
    await rm(path.join(plan.pins.profile, ".writer"), { recursive: true })
    expect((await assessV2()).reason).toBe("POLICY_V2_FAILURE_RECORDED")
    expect(await Bun.file(auditFile).text()).toBe(failedAuditBytes)
    expect(await Bun.file(path.join(plan.directory, "attempt.json")).json()).toEqual(failedAttempt)
    await Bun.write(path.join(plan.directory, "parts.json"), "changed history")
    expect((await runSeriesSlot(path.join(root, "pins.json"), plan.taskID, 1, "audit", "runtime")).reason).toBe("ATTEMPT_CHANGED")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test.each([
  { taskID: "explicit-js", mode: "explicit-js", javascriptRole: "requested-aggregation" },
  { taskID: "tags", mode: "capability-gap", javascriptRole: "variable-unpack-only" },
])("v2 successful $mode review advances without rewriting the original pending audit", async (scenario) => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-exception-review-"))
  try {
    const plan = selectionAttempt({ runID: "test-1", phase: "candidate", resultsRoot: path.join(root, "results"),
      workspaceRoot: path.join(root, "workspaces"), payload: path.join(root, "payload"), profile: path.join(root, "profile"),
      manifestSha256: "a".repeat(64), expectedSkillDigest: "b".repeat(64), model: "openai/gpt-6-sol-fast", variant: "medium",
      frozenModelsPath: path.join(root, "models.json"), frozenModelsSha256: "c".repeat(64), deadlineSeconds: 1800, graceSeconds: 90,
      connection: { url: "http://localhost/app/", username: "user", folder: "/user" },
      container: { id: "d".repeat(64), name: "loginom-test" }, storageDir: "/workdir/UserStorage/user",
      tasks: { [scenario.taskID]: { directory: path.join(root, "tasks", scenario.taskID), mode: scenario.mode, attempts: [2],
        promptSha256: "e".repeat(64), inputHashes: { "data.csv": "f".repeat(64) }, oracleSha256: "a".repeat(64) } } }, scenario.taskID, 2)
    const value = evidence()
    const write = async (file: string, data: unknown) => { await Bun.write(file, JSON.stringify(data)) }
    const cli = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" })
    await cli.exited
    const host = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" })
    await host.exited
    const closed = path.join(plan.pins.resultsRoot, "series", `candidate-${plan.taskID}-2`)
    const copied: Record<string, string> = {}
    for (const [name, data] of [
      ["saved-package-cleanup.json", JSON.stringify({ ...value.packageCleanup, package_path: plan.packagePath })],
      ["host-close.json", JSON.stringify({ ...value.hostClose[0], pid: host.pid })],
      ["resource-close.jsonl", value.resourceClose.map((row) => JSON.stringify(row)).join("\n") + "\n"],
      ["terminal-close.jsonl", value.terminalClose.map((row) => JSON.stringify(row)).join("\n") + "\n"],
    ]) {
      await Bun.write(path.join(closed, name!), data!)
      copied[name!] = createHash("sha256").update(data!).digest("hex")
    }
    await Bun.write(path.join(plan.directory, "artifact/package.lgp"), "closed exception package")
    // Actual explicit-js/2 projection: wrapper2, JS1/1/1, all machine axes pass,
    // original review pending, and successful normal close. Identities sanitized;
    // capability-gap also exercises its existing variable-unpack-only role contract.
    const attempt = { ...value.attempt, taskID: plan.taskID, mode: plan.task.mode, exitCode: 2, packagePath: plan.packagePath }
    const audit = { ...value.audit, taskID: plan.taskID, mode: plan.task.mode, jsNodes: 1, jsCalls: 1, successfulJsCalls: 1,
      oracleSha256: plan.task.oracleSha256, packageSha256: createHash("sha256").update("closed exception package").digest("hex"), reviewStatus: "pending" }
    const auditFile = path.join(plan.directory, "selection-audit.json")
    await write(path.join(plan.directory, "attempt.json"), attempt)
    await write(auditFile, audit)
    await chmod(auditFile, 0o400)
    await write(path.join(closed, "closure.json"), { ...value, mode: plan.task.mode, taskID: plan.taskID,
      packagePath: plan.packagePath, runtimeRevision: "runtime", cliPid: cli.pid, copied,
      protectedFiles: { "attempt.json": createHash("sha256").update(JSON.stringify(attempt)).digest("hex") },
      pinsSha256: createHash("sha256").update(JSON.stringify(plan.pins)).digest("hex") })
    await write(path.join(root, "pins.json"), plan.pins)
    await write(path.join(closed, "dispatch.json"), { pinsFile: path.join(root, "pins.json") })
    await write(path.join(closed, "returned.json"), { interruptReason: null })
    const reviewFile = path.join(plan.directory, "graph-review.json")
    const review = { verdict: "passed", reviewer: "independent",
      notes: "The allowed role is bound to the saved JavaScript node and output.", sessionID: value.sessionID,
      packageSha256: audit.packageSha256, javascriptRole: scenario.javascriptRole, evidence: ["artifact/package.lgp"] }
    await write(reviewFile, review)
    const auditBytes = await Bun.file(auditFile).text()
    const assessV2 = () => runSeriesSlot(path.join(root, "pins.json"), plan.taskID, 2, "audit", "runtime", false,
      { criteriaVersion: "node-selection-policy-v2", criteriaSha256: "5b5053d14aecf7462e317b75fa3a14fa3bff6717080128edf0da582171a015fa" })
    expect(await assessV2()).toEqual({ decision: "advance", reason: null })
    expect(await runSeriesSlot(path.join(root, "pins.json"), plan.taskID, 2, "audit", "runtime"))
      .toEqual({ decision: "review", reason: "AUDIT_REVIEW_REFRESH_REQUIRED" })
    await rm(reviewFile)
    expect(await assessV2()).toEqual({ decision: "review", reason: "MANUAL_REVIEW_REQUIRED" })
    for (const change of [{ javascriptRole: undefined }, { javascriptRole: "arbitrary-script" },
      { javascriptRole: scenario.mode === "explicit-js" ? "variable-unpack-only" : "requested-aggregation" },
      { sessionID: "foreign" }, { packageSha256: "b".repeat(64) }, { evidence: [] }, { verdict: "failed" },
      { reviewer: "" }, { notes: "" }]) {
      await write(reviewFile, { ...review, ...change })
      expect((await assessV2()).decision).not.toBe("advance")
    }
    await write(reviewFile, { ...review, evidence: ["artifact/missing.lgp"] })
    await expect(assessV2()).rejects.toMatchObject({ code: "ENOENT" })
    await write(reviewFile, review)
    expect(await Bun.file(auditFile).text()).toBe(auditBytes)
    for (const change of [{ policyStatus: "failed" }, { calculationPassed: false }, { oraclePassed: false },
      { historyComplete: false }, { runtimeSettled: false }, { identityVerified: false }, { graphComplete: false },
      { exportIdentityVerified: false }, { reviewStatus: "failed" }]) {
      await chmod(auditFile, 0o600)
      await write(auditFile, { ...audit, ...change })
      await chmod(auditFile, 0o400)
      const before = await Bun.file(auditFile).text()
      expect((await assessV2()).decision).not.toBe("advance")
      expect(await Bun.file(auditFile).text()).toBe(before)
    }
    await chmod(auditFile, 0o600)
    await write(auditFile, { ...audit, reviewStatus: "not-required" })
    await chmod(auditFile, 0o400)
    const notRequiredBytes = await Bun.file(auditFile).text()
    expect(await assessV2()).toEqual({ decision: "advance", reason: null })
    expect(await Bun.file(auditFile).text()).toBe(notRequiredBytes)
    await chmod(auditFile, 0o600)
    await Bun.write(auditFile, auditBytes)
    await chmod(auditFile, 0o400)
    expect(await assessV2())
      .toEqual({ decision: "advance", reason: null })
    expect(await Bun.file(auditFile).text()).toBe(auditBytes)
    expect(await Bun.file(path.join(plan.directory, "attempt.json")).text()).toBe(JSON.stringify(attempt))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("the frozen 9 → 6 → 16 schedule preserves all slots and rejects duplicate/replacement admission", () => {
  const tasks = ["abc-pareto-groups", "first-last-touch", "sales-by-category", "monthly-demand", "risky-approved-claims", "campaign-roi-by-channel"]
  const schedule = {
    candidateFirst9: [...tasks, "explicit-js", "tags", "recovery"].map((task) => ({ phase: "candidate", task, attempt: 1 })),
    baseline6: tasks.map((task) => ({ phase: "baseline", task, attempt: 1 })),
    candidateRemaining16: [2, 3].flatMap((attempt) => [...tasks, "explicit-js", "tags"].map((task) => ({ phase: "candidate", task, attempt }))),
    completedFirst9RequiredBeforeBaseline: true, technicalFailuresRemainFailed: true,
    strictReleaseBeforeNext: true, trustedHistoryBeforeContinuation: true, noStartedAttemptReplacement: true,
    comparativePassRequiresBothPhasesComplete: true, policyViolationStopsDigestImmediately: true,
  }
  const lock = { technicalContinuationVersion: 1, plannedModelSlots: 31, plannedBaselineSlots: 6, plannedCandidateSlots: 25, executionSchedule: schedule }
  const slots = selectionSeriesSlots(lock)
  expect(slots).toHaveLength(31)
  expect(slots[8]).toEqual({ phase: "candidate", task: "recovery", attempt: 1 })
  expect(slots[9]?.phase).toBe("baseline")
  expect(slots[15]?.phase).toBe("candidate")
  expect(selectionSeriesSlots({ ...lock, plannedModelSlots: 25, plannedComparisonSlots: 31, referencedBaselineSlots: 6,
    baselineReferences: { version: 1 } })).toEqual(slots)
  expect(() => selectionSeriesSlots({ ...lock, technicalContinuationVersion: undefined })).toThrow("SERIES_SCHEDULE_INVALID")
  expect(() => selectionSeriesSlots({ ...lock, executionSchedule: { ...schedule, completedFirst9RequiredBeforeBaseline: false } }))
    .toThrow("SERIES_SCHEDULE_INVALID")
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

test("an explicit acceptance lock must be admitted before the original series can run", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-v2-admission-"))
  try {
    const seal = async (name: string, value: unknown) => {
      const file = path.join(root, name), text = JSON.stringify(value)
      await Bun.write(file, text)
      await chmod(file, 0o400)
      return { path: file, sha256: createHash("sha256").update(text).digest("hex") }
    }
    const original = await seal("original.json", { ready: false })
    const acceptance = await seal("acceptance.json", { version: 2, ready: false })
    await expect(runSelectionSeries(original.path, original.sha256, 1, acceptance))
      .rejects.toThrow("SERIES_ACCEPTANCE_NOT_ADMITTED")
    expect((await readdir(root)).sort()).toEqual(["acceptance.json", "original.json"])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("v2 admission verifies every archived original before accepting source overrides", async () => {
  const fixture = await acceptanceFixture()
  try {
    await chmod(fixture.archived, 0o600)
    await Bun.write(fixture.archived, "substituted old evaluator")
    await chmod(fixture.archived, 0o400)
    await expect(runSelectionSeries(fixture.original.path, fixture.original.sha256, 1, fixture.acceptance))
      .rejects.toThrow("SERIES_SEAL_MISMATCH")
    expect(await Bun.file(path.join(fixture.root, "series/.active")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("v2 permits exactly the four evaluator overrides while preserving the original admission", async () => {
  const fixture = await acceptanceFixture()
  try {
    await expect(runSelectionSeries(fixture.original.path, fixture.original.sha256, 1, fixture.acceptance))
      .rejects.toThrow("SERIES_NOT_ADMITTED")
    const value = await Bun.file(fixture.acceptance.path).json() as Record<string, unknown>
    for (const change of [
      { sourceOverrides: { ...(value.sourceOverrides as Record<string, string>), "packages/loginom-runtime/client/lib/workspace-ui.mjs": "b".repeat(64) } },
      { sourceOverrides: { ...(value.sourceOverrides as Record<string, string>), "evals/fixtures/node-selection/tags/data/dataset.csv": "b".repeat(64) } },
    ]) {
      const file = path.join(fixture.root, `invalid-${Object.keys(change.sourceOverrides).at(-1)!.includes("packages/") ? "product" : "fixture"}.json`)
      const text = JSON.stringify({ ...value, ...change })
      await Bun.write(file, text)
      await chmod(file, 0o400)
      await expect(runSelectionSeries(fixture.original.path, fixture.original.sha256, 1,
        { path: file, sha256: createHash("sha256").update(text).digest("hex") })).rejects.toThrow("SERIES_SOURCE_OVERRIDE_FORBIDDEN")
    }
    expect(await Bun.file(path.join(fixture.root, "series/.active")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("the CLI requires both acceptance flags before reading a protocol or dispatching", async () => {
  for (const flag of ["--acceptance-lock", "--acceptance-sha"]) {
    const child = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../script/run-node-selection-series.ts"),
      "--lock", "/nonexistent-protocol", "--sha", "a".repeat(64), flag, flag.endsWith("lock") ? "/nonexistent-acceptance" : "b".repeat(64)],
      { stdout: "pipe", stderr: "pipe" })
    const stderr = await new Response(child.stderr).text()
    expect(await child.exited).not.toBe(0)
    expect(stderr).toContain("SERIES_ARGUMENTS_INVALID")
    expect(stderr).not.toContain("ENOENT")
  }
})

async function acceptanceFixture(overrides: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "selection-v2-seal-"))
  const seal = async (name: string, value: unknown) => {
    const file = path.join(root, name), text = JSON.stringify(value)
    await Bun.write(file, text)
    await chmod(file, 0o400)
    return { path: file, sha256: createHash("sha256").update(text).digest("hex") }
  }
  const names = ["evals/script/run-node-selection-series.ts", "evals/test/node-selection-series.test.ts",
    "evals/src/node-selection-continuation.ts", "evals/test/node-selection-continuation.test.ts"]
  const archived = await Promise.all(names.map((name) => seal("original-source-v1/" + name, "original " + name)))
  const files = Object.fromEntries(names.map((name, index) => [name, archived[index]!.sha256]))
  const original = await seal("original.json", { ready: false, files, fileCount: names.length })
  const index = await seal("original-source-v1-index.json", { version: 1, originalProtocolSha256: original.sha256,
    sourceFiles: Object.fromEntries(names.map((name, i) => [name, archived[i]!])) })
  const criteria = await seal("criteria.json", { criteriaVersion: "node-selection-policy-v2" })
  const acceptance = await seal("acceptance.json", { version: 2, ready: true, criteriaVersion: "node-selection-policy-v2",
    criteriaPath: criteria.path, criteriaSha256: criteria.sha256, originalProtocolPath: original.path,
    originalProtocolSha256: original.sha256, originalSourceArchiveIndexPath: index.path, originalSourceArchiveIndexSha256: index.sha256,
    sourceOverrides: { ...Object.fromEntries(names.map((name) => [name, "a".repeat(64)])), ...overrides } })
  return { root, original, acceptance, archived: archived[0]!.path }
}

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

test("a prospective series consumes six closed baseline references without dispatch or rewriting their identities", async () => {
  const fixture = await baselineReuseFixture()
  try {
    const before = await Promise.all(fixture.references.slots.flatMap((slot) => Object.keys(slot.evidence))
      .map(async (file) => [file, await Bun.file(path.join(fixture.baseline.resultsRoot, file)).text()]))
    expect(await runSelectionSeries(fixture.lock.path, fixture.lock.sha256, 1, fixture.acceptance))
      .toEqual({ status: "machine-complete-review-required", dispatched: 0 })
    const rows = (await Bun.file(path.join(fixture.candidate.resultsRoot, "series/ledger.jsonl")).text()).trim().split("\n").map((line) => JSON.parse(line))
    expect(rows).toHaveLength(31)
    const reused = rows.filter((row) => row.reference === true)
    expect(reused).toHaveLength(6)
    expect(reused.every((row) => row.originRunID === fixture.baseline.runID && row.rechecked === true && row.decision === "advance")).toBe(true)
    expect(rows.slice(0, 9).every((row) => row.slot.phase === "candidate")).toBe(true)
    for (const [file, bytes] of before) expect(await Bun.file(path.join(fixture.baseline.resultsRoot, file!)).text()).toBe(bytes!)
    expect(await Bun.file(path.join(fixture.baseline.resultsRoot, "series/ledger.jsonl")).exists()).toBe(false)
    expect(await readdir(fixture.candidate.resultsRoot)).not.toContain("incidents")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("a reference seal must include the actual close copies before any candidate slot is considered", async () => {
  const fixture = await baselineReuseFixture()
  try {
    delete fixture.references.slots[0]!.evidence["series/baseline-sales-by-category-1/host-close.json"]
    await fixture.reseal()
    await expect(runSelectionSeries(fixture.lock.path, fixture.lock.sha256, 1, fixture.acceptance))
      .rejects.toThrow("BASELINE_REFERENCE_INCOMPLETE")
    expect(await Bun.file(path.join(fixture.candidate.resultsRoot, "series/ledger.jsonl")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("baseline references require the original pin bytes, not only equivalent JSON", async () => {
  const fixture = await baselineReuseFixture()
  try {
    Object.assign(fixture.references.pins, await fixture.seal(fixture.references.pins.path,
      (await Bun.file(fixture.references.pins.path).text()) + "\n"))
    await fixture.reseal()
    await expect(runSelectionSeries(fixture.lock.path, fixture.lock.sha256, 1, fixture.acceptance))
      .rejects.toThrow("BASELINE_COMPARABILITY_INVALID")
    expect(await Bun.file(path.join(fixture.candidate.resultsRoot, "series/ledger.jsonl")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("comparability cannot omit a required auditor or task dependency from its seal", async () => {
  const fixture = await baselineReuseFixture()
  try {
    const comparison = await Bun.file(fixture.references.comparison.path).json()
    delete comparison.taskFiles["evals/src/node-selection.ts"]
    Object.assign(fixture.references.comparison, await fixture.seal(fixture.references.comparison.path, comparison))
    await fixture.reseal()
    await expect(runSelectionSeries(fixture.lock.path, fixture.lock.sha256, 1, fixture.acceptance))
      .rejects.toThrow("BASELINE_COMPARABILITY_INVALID")
    expect(await Bun.file(path.join(fixture.candidate.resultsRoot, "series/ledger.jsonl")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("a sealed sidecar from another Session cannot certify a baseline reference", async () => {
  const fixture = await baselineReuseFixture()
  try {
    const slot = fixture.references.slots[0]!, relative = `policy-v2/baseline/${slot.task}/1.json`
    const file = path.join(fixture.baseline.resultsRoot, relative)
    slot.evidence[relative] = (await fixture.seal(file, { ...await Bun.file(file).json(), sessionID: "foreign-session" })).sha256
    await fixture.reseal()
    await expect(runSelectionSeries(fixture.lock.path, fixture.lock.sha256, 1, fixture.acceptance))
      .rejects.toThrow("BASELINE_REFERENCE_IDENTITY_INVALID")
    expect(await Bun.file(path.join(fixture.candidate.resultsRoot, "series/ledger.jsonl")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("baseline reference admission rejects missing, duplicate, candidate and foreign identities", async () => {
  for (const mutation of ["missing", "duplicate", "candidate", "foreign-session", "changed-hash", "writable", "symlink"]) {
    const fixture = await baselineReuseFixture()
    try {
      const slot = fixture.references.slots[0]!, relative = `baseline/${slot.task}/1/parts.json`
      const file = path.join(fixture.baseline.resultsRoot, relative)
      if (mutation === "missing") fixture.references.slots.pop()
      if (mutation === "duplicate") fixture.references.slots[1] = slot
      if (mutation === "candidate") slot.phase = "candidate"
      if (mutation === "foreign-session") slot.sessionID = "foreign-session"
      if (mutation === "changed-hash") slot.evidence[relative] = "0".repeat(64)
      if (mutation === "writable") await chmod(file, 0o600)
      if (mutation === "symlink") {
        const copy = path.join(fixture.root, "foreign-parts.json")
        await fixture.seal(copy, await Bun.file(file).text())
        await rm(file)
        await symlink(copy, file)
      }
      await fixture.reseal()
      await expect(runSelectionSeries(fixture.lock.path, fixture.lock.sha256, 1, fixture.acceptance)).rejects.toThrow()
      expect(await Bun.file(path.join(fixture.candidate.resultsRoot, "series/ledger.jsonl")).exists()).toBe(false)
      expect(await readdir(fixture.candidate.resultsRoot)).not.toContain("incidents")
    } finally { await rm(fixture.root, { recursive: true, force: true }) }
  }
})

test("baseline comparability rejects changed runtime, model and task inputs", async () => {
  for (const mutation of ["runtime", "model", "task-input", "task-oracle", "skill"]) {
    const fixture = await baselineReuseFixture()
    try {
      if (mutation === "runtime") fixture.references.runtimeRevision = "0".repeat(64)
      if (mutation === "skill") fixture.references.expectedSkillDigest = "0".repeat(64)
      if (["model", "task-input", "task-oracle"].includes(mutation)) {
        const file = path.join(fixture.candidate.resultsRoot, "candidate-pins.json")
        const pins = await Bun.file(file).json()
        if (mutation === "model") pins.variant = "high"
        if (mutation === "task-input") pins.tasks["sales-by-category"].inputHashes["data/dataset.csv"] = "0".repeat(64)
        if (mutation === "task-oracle") pins.tasks["sales-by-category"].oracleSha256 = "0".repeat(64)
        const changed = await fixture.seal(file, pins)
        fixture.lockValue.pinsSha256["candidate-pins.json"] = changed.sha256
        const comparison = await Bun.file(fixture.references.comparison.path).json()
        comparison.candidatePinsSha256 = changed.sha256
        Object.assign(fixture.references.comparison, await fixture.seal(fixture.references.comparison.path, comparison))
      }
      await fixture.reseal()
      await expect(runSelectionSeries(fixture.lock.path, fixture.lock.sha256, 1, fixture.acceptance))
        .rejects.toThrow("BASELINE_COMPARABILITY_INVALID")
      expect(await Bun.file(path.join(fixture.candidate.resultsRoot, "series/ledger.jsonl")).exists()).toBe(false)
    } finally { await rm(fixture.root, { recursive: true, force: true }) }
  }
})

test("a pending first-wave review stops before any baseline reference is consumed", async () => {
  const fixture = await baselineReuseFixture()
  try {
    const file = path.join(fixture.candidate.resultsRoot, "series/candidate-abc-pareto-groups-1/closure.json")
    await fixture.seal(file, { ...await Bun.file(file).json(), historyAnomaly: true })
    const result = await runSelectionSeries(fixture.lock.path, fixture.lock.sha256, 1, fixture.acceptance)
    expect(result).toMatchObject({ status: "review", reason: "MANUAL_REVIEW_REQUIRED", dispatched: 0 })
    const rows = (await Bun.file(path.join(fixture.candidate.resultsRoot, "series/ledger.jsonl")).text()).trim().split("\n").map((line) => JSON.parse(line))
    expect(rows).toHaveLength(1)
    expect(rows[0].reference).toBeUndefined()
    expect(await Bun.file(path.join(fixture.baseline.resultsRoot, "series/ledger.jsonl")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

async function baselineReuseFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "selection-baseline-reference-"))
  const repo = path.resolve(import.meta.dir, "../..")
  const sha = (value: string) => createHash("sha256").update(value).digest("hex")
  const seal = async (file: string, value: unknown) => {
    await chmod(file, 0o600).catch(() => {})
    await Bun.write(file, typeof value === "string" ? value : JSON.stringify(value))
    await chmod(file, 0o400)
    return { path: file, sha256: sha(await Bun.file(file).text()) }
  }
  const standard = ["sales-by-category", "abc-pareto-groups", "monthly-demand", "risky-approved-claims", "campaign-roi-by-channel", "first-last-touch"]
  const first = ["abc-pareto-groups", "first-last-touch", "sales-by-category", "monthly-demand", "risky-approved-claims", "campaign-roi-by-channel", "explicit-js", "tags", "recovery"]
  const tasks = Object.fromEntries(await Promise.all(first.map(async (id) => {
    const directory = path.join(repo, "evals", standard.includes(id) ? "tasks/analytic" : "fixtures/node-selection", id)
    const task = (await loadTasks(path.dirname(directory), [id]))[0]!
    return [id, { directory, mode: id === "explicit-js" ? "explicit-js" : id === "tags" ? "capability-gap" : id === "recovery" ? "standard-recovery" : "standard",
      attempts: id === "recovery" ? [1] : [1, 2, 3], promptSha256: sha(task.prompt),
      inputHashes: Object.fromEntries(await Promise.all(task.inputs.map(async (name) => [name, sha(await Bun.file(path.join(directory, name)).text())]))),
      oracleSha256: sha(await Bun.file(path.join(directory, "oracle.csv")).text()) }]
  })))
  const models = await seal(path.join(root, "models.json"), {})
  const common = { workspaceRoot: path.join(root, "workspaces"), payload: path.join(root, "payload"), profile: path.join(root, "profile"),
    manifestSha256: "a".repeat(64), expectedSkillDigest: "b".repeat(64), model: "openai/gpt-6-sol-fast", variant: "medium",
    apiModel: "gpt-6-sol", requestedServiceTier: "priority", reviewSeed: "e".repeat(64),
    frozenModelsPath: models.path, frozenModelsSha256: models.sha256, deadlineSeconds: 1800, graceSeconds: 90,
    connection: { url: "http://localhost/app/", username: "user", folder: "/user" },
    container: { id: "d".repeat(64), name: "loginom-test" }, storageDir: "/workdir/UserStorage/user", auditVersion: "f".repeat(64) }
  const baseline = { ...common, runID: "old-run", phase: "baseline", resultsRoot: path.join(root, "old"),
    tasks: Object.fromEntries(standard.map((id) => [id, { ...tasks[id]!, attempts: [1] }])) }
  const candidate = { ...common, runID: "new-run", phase: "candidate", resultsRoot: path.join(root, "new"), expectedSkillDigest: "c".repeat(64), tasks }
  const baselinePins = await seal(path.join(baseline.resultsRoot, "baseline-pins.json"), baseline)
  const candidatePins = await seal(path.join(candidate.resultsRoot, "candidate-pins.json"), candidate)
  await seal(path.join(candidate.resultsRoot, "baseline-pins.json"), baseline)
  const schedule = { candidateFirst9: first.map((task) => ({ phase: "candidate", task, attempt: 1 })),
    baseline6: standard.map((task) => ({ phase: "baseline", task, attempt: 1 })),
    candidateRemaining16: [2, 3].flatMap((attempt) => first.filter((id) => id !== "recovery").map((task) => ({ phase: "candidate", task, attempt }))),
    completedFirst9RequiredBeforeBaseline: true, technicalFailuresRemainFailed: true, strictReleaseBeforeNext: true,
    trustedHistoryBeforeContinuation: true, noStartedAttemptReplacement: true, comparativePassRequiresBothPhasesComplete: true, policyViolationStopsDigestImmediately: true }
  const slots = [...schedule.candidateFirst9, ...schedule.baseline6, ...schedule.candidateRemaining16]
  const names = ["evals/script/run-node-selection-series.ts", "evals/test/node-selection-series.test.ts",
    "evals/src/node-selection-continuation.ts", "evals/test/node-selection-continuation.test.ts", "evals/script/run-node-selection-attempt.ts", "evals/src/node-selection.ts"]
  const taskFiles = Object.fromEntries(await Promise.all(standard.map(async (id) => {
    const name = path.relative(repo, path.join(tasks[id]!.directory, "task.json")); return [name, sha(await Bun.file(path.join(repo, name)).text())]
  })))
  const files = { ...Object.fromEntries(await Promise.all(names.map(async (name) => [name, sha(await Bun.file(path.join(repo, name)).text())]))), ...taskFiles }
  const protocol = await seal(path.join(baseline.resultsRoot, "acceptance-lock.json"), { runID: baseline.runID, files,
    auditVersion: common.auditVersion, pinsSha256: { "baseline-pins.json": baselinePins.sha256 } })
  const revision = "d".repeat(64)
  const runtime = { baseline: { revision, manifest: [{ path: "./fixture.mjs", sha256: "f".repeat(64) }] },
    candidate: { revision, manifest: [{ path: "./fixture.mjs", sha256: "f".repeat(64) }] } }
  const runtimePins = await seal(path.join(baseline.resultsRoot, "runtime-source-pins.json"), runtime)
  const newRuntimePins = await seal(path.join(candidate.resultsRoot, "runtime-source-pins.json"), runtime)
  const criteria = await seal(path.join(candidate.resultsRoot, "criteria.json"), { version: "node-selection-policy-v2" })
  const cli = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" }); await cli.exited
  const host = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" }); await host.exited
  const matrix = []
  const references = { version: 1, originRunID: baseline.runID, originResultsRoot: baseline.resultsRoot,
    protocol, pins: baselinePins, runtimePins, summary: { path: "", sha256: "" }, runtimeRevision: revision,
    expectedSkillDigest: baseline.expectedSkillDigest, comparison: { path: "", sha256: "" },
    slots: [] as { phase: string; task: string; attempt: number; sessionID: string; evidence: Record<string, string> }[] }
  for (const slot of slots) {
    const pins = slot.phase === "baseline" ? baseline : candidate
    const plan = selectionAttempt(pins, slot.task, slot.attempt)
    const task = (await loadTasks(path.dirname(plan.task.directory), [slot.task]))[0]!
    matrix.push({ ...slot, mode: plan.task.mode, directory: plan.directory, prefix: plan.prefix, workspace: plan.workspace,
      packagePath: plan.packagePath, resultName: plan.resultName, promptSha256: sha(buildAgentPrompt(task.prompt, plan.packagePath, plan.resultName)) })
    const directory = path.join(pins.resultsRoot, "series", `${slot.phase}-${slot.task}-${slot.attempt}`)
    const value = evidence(), sessionID = `ses_${slot.phase}_${slot.task}_${slot.attempt}`
    const bound: Record<string, string> = {}, copied: Record<string, string> = {}
    const save = async (file: string, content: unknown) => { const sealed = await seal(file, content); bound[path.relative(pins.resultsRoot, file)] = sealed.sha256; return sealed.sha256 }
    for (const [name, data] of Object.entries({ "saved-package-cleanup.json": { ...value.packageCleanup, package_path: plan.packagePath },
      "host-close.json": { ...value.hostClose[0], pid: host.pid },
      "resource-close.jsonl": value.resourceClose.map((row) => JSON.stringify(row)).join("\n") + "\n",
      "terminal-close.jsonl": value.terminalClose.map((row) => JSON.stringify(row)).join("\n") + "\n" }))
      copied[name] = await save(path.join(directory, name), data)
    const packageSha = await save(path.join(plan.directory, "artifact/package.lgp"), "closed fixture package")
    const attempt = { ...value.attempt, sessionID, taskID: slot.task, mode: plan.task.mode, evidence: plan.directory, packagePath: plan.packagePath }
    const protectedFiles = { "attempt.json": await save(path.join(plan.directory, "attempt.json"), attempt),
      "parts.json": await save(path.join(plan.directory, "parts.json"), { sessionID }),
      "runtime-journals.json": await save(path.join(plan.directory, "runtime-journals.json"), []) }
    await save(path.join(plan.directory, "selection-audit.json"), { ...value.audit, taskID: slot.task, mode: plan.task.mode,
      auditVersion: common.auditVersion, packageSha256: packageSha, oracleSha256: plan.task.oracleSha256,
      reviewStatus: plan.task.mode === "standard" ? "not-required" : "passed" })
    if (plan.task.mode !== "standard") await save(path.join(plan.directory, "graph-review.json"), { verdict: "passed", reviewer: "independent",
      notes: "Closed fixture role reviewed", sessionID, packageSha256: packageSha, recoveryObserved: true,
      javascriptRole: plan.task.mode === "explicit-js" ? "requested-aggregation" : "variable-unpack-only", evidence: ["artifact/package.lgp"] })
    await save(path.join(directory, "closure.json"), { ...value, phase: slot.phase, taskID: slot.task, mode: plan.task.mode,
      sessionID, packagePath: plan.packagePath, auditVersion: common.auditVersion, runtimeRevision: revision, cliPid: cli.pid,
      copied, protectedFiles, pinsSha256: sha(JSON.stringify(plan.pins)) })
    await save(path.join(directory, "dispatch.json"), { pinsSha256: slot.phase === "baseline" ? baselinePins.sha256 : candidatePins.sha256, taskID: slot.task, number: slot.attempt })
    await save(path.join(directory, "returned.json"), { interruptReason: null, evidence: plan.directory, attemptSha256: protectedFiles["attempt.json"] })
    if (slot.phase === "baseline") {
      await save(path.join(pins.resultsRoot, "policy-v2/baseline", slot.task, "1.json"), { version: 2, criteriaVersion: "node-selection-policy-v2", criteria,
        sessionID, phase: "baseline", taskID: slot.task, attempt: 1 })
      references.slots.push({ ...slot, sessionID, evidence: bound })
    }
  }
  references.summary = await seal(path.join(baseline.resultsRoot, "summary.json"), { phase: "baseline", criteriaVersion: "node-selection-policy-v2", criteria, records: references.slots.map((slot) => ({ taskID: slot.task, attempt: slot.attempt, sessionID: slot.sessionID })) })
  references.comparison = await seal(path.join(candidate.resultsRoot, "comparison.json"), { version: 1, verdict: "approved", reviewer: "independent",
    baselinePinsSha256: baselinePins.sha256, candidatePinsSha256: candidatePins.sha256, runtimeRevision: revision, commonAssetsEqual: true,
    taskFiles: Object.fromEntries(Object.entries(files).filter(([name]) => !names.slice(0, 4).includes(name))),
    evidence: [await seal(path.join(candidate.resultsRoot, "asset.json"), { runtimeRevision: revision })] })
  const matrixRef = await seal(path.join(candidate.resultsRoot, "matrix.json"), { promptArgumentCount: 3, slots: matrix })
  const lockValue = { ready: true, runID: candidate.runID, technicalContinuationVersion: 1, plannedModelSlots: 25, plannedComparisonSlots: 31,
    referencedBaselineSlots: 6, plannedBaselineSlots: 6, plannedCandidateSlots: 25, executionSchedule: schedule, baselineReferences: references,
    auditVersion: common.auditVersion, files, pinsSha256: { "baseline-pins.json": baselinePins.sha256, "candidate-pins.json": candidatePins.sha256 },
    matrixInterfaceCheckPath: matrixRef.path, matrixInterfaceCheckSha256: matrixRef.sha256, runtimeSourcePins: newRuntimePins }
  const lock = await seal(path.join(candidate.resultsRoot, "lock.json"), lockValue)
  const sourceFiles = Object.fromEntries(await Promise.all(Object.keys(files).map(async (name) => [name,
    await seal(path.join(root, "archive", name), await Bun.file(path.join(repo, name)).text())])))
  const index = await seal(path.join(candidate.resultsRoot, "archive-index.json"), { version: 1, originalProtocolSha256: lock.sha256, sourceFiles })
  const acceptanceValue = { version: 2, ready: true, criteriaVersion: "node-selection-policy-v2", criteriaPath: criteria.path, criteriaSha256: criteria.sha256,
    originalProtocolPath: lock.path, originalProtocolSha256: lock.sha256, originalSourceArchiveIndexPath: index.path,
    originalSourceArchiveIndexSha256: index.sha256, sourceOverrides: Object.fromEntries(names.slice(0, 4).map((name) => [name, files[name]!])) }
  const acceptance = await seal(path.join(candidate.resultsRoot, "acceptance.json"), acceptanceValue)
  const reseal = async () => {
    Object.assign(lock, await seal(lock.path, lockValue))
    const nextIndex = await seal(index.path, { version: 1, originalProtocolSha256: lock.sha256, sourceFiles })
    Object.assign(acceptanceValue, { originalProtocolSha256: lock.sha256, originalSourceArchiveIndexSha256: nextIndex.sha256 })
    Object.assign(acceptance, await seal(acceptance.path, acceptanceValue))
  }
  return { root, baseline, candidate, lock, lockValue, acceptance, acceptanceValue, references, seal, reseal }
}
