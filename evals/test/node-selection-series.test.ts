import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises"
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
