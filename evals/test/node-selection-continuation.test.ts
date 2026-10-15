import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, mkdtemp, rename, rm, stat, symlink, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { selectionAttempt } from "../script/run-node-selection-attempt"
import { runSeriesSlot } from "../script/run-node-selection-series"
import { assessTechnicalContinuation } from "../src/node-selection-continuation"

test("v2 can release an import-before-execution failure using a complete native action ledger and two dispatcher snapshots", async () => {
  const fixture = await nativeActionFixture()
  try {
    const before = await Bun.file(path.join(fixture.plan.directory, "attempt.json")).text()
    expect(await assessTechnicalContinuation(fixture.plan, fixture.directory, fixture.pinsFile, "audit", "runtime", fixture.acceptance))
      .toMatchObject({ decision: "advance", outcome: "technical-failed", calculationPassed: false, policyStatus: "incomplete" })
    expect(await Bun.file(path.join(fixture.plan.directory, "attempt.json")).text()).toBe(before)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("a complete native ledger retains a real U+2028 separator inside an historical debug message", async () => {
  const fixture = await nativeActionFixture()
  try {
    // Sanitized native server record 7031: U+2028 is message data, not a
    // missing native header or a new session event.
    await fixture.raw("ledger.log", fixture.ledger.replace("Multiline historical node warning", "Calculator expression first\u2028second"))
    expect(await assessTechnicalContinuation(fixture.plan, fixture.directory, fixture.pinsFile, "audit", "runtime", fixture.acceptance))
      .toMatchObject({ decision: "advance", outcome: "technical-failed", calculationPassed: false })
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("a v2 context preserves the original executed-node v1 release contract", async () => {
  const fixture = await technicalFixture()
  try {
    expect(await assessTechnicalContinuation(fixture.plan, fixture.directory, fixture.pinsFile, "audit", "runtime",
      { criteriaVersion: "node-selection-policy-v2", criteriaSha256: "f".repeat(64) }))
      .toMatchObject({ decision: "advance", outcome: "technical-failed" })
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test.each(["no-opt-in", "wrong-criteria", "v1-descriptor", "active-user", "missing-header", "tampered-ledger",
  "active-snapshot", "empty-snapshot", "missing-review", "self-review", "foreign-close", "guard-inode", "oracle-failed"] as const)
  ("v2 native action release rejects %s without relabeling the original failure", async (change) => {
    const fixture = await nativeActionFixture()
    try {
      if (change === "v1-descriptor") { fixture.descriptor.version = 1; await fixture.seal() }
      if (change === "active-user") await fixture.raw("ledger.log", fixture.ledger +
        '2026-10-14T08:19:00Z info abc (loginomd:5000>user:174) - Инициализирована сессия для пользователя user{"USER_NAME":"user"}\n')
      if (change === "missing-header") await fixture.raw("ledger.log", fixture.ledger.split("\n").slice(1).join("\n"))
      if (change === "tampered-ledger") {
        await chmod(path.join(fixture.directory, "ledger.log"), 0o600)
        await Bun.write(path.join(fixture.directory, "ledger.log"), fixture.ledger.replace("user:172", "user:999"))
        await chmod(path.join(fixture.directory, "ledger.log"), 0o400)
      }
      if (change === "active-snapshot") await fixture.raw("dispatcher-2.yml", fixture.dispatcher + '  - row "2 user:174":\n')
      if (change === "empty-snapshot") await fixture.raw("dispatcher-2.yml", "allUserSessionsAbsent: true\n")
      if (change === "missing-review") await rm(path.join(fixture.directory, "native-review.json"))
      if (change === "self-review") await fixture.recovery("native-review.json", { ...JSON.parse(await Bun.file(path.join(fixture.directory, "native-review.json")).text()), reviewer: fixture.descriptor.preparedBy })
      if (change === "foreign-close") await fixture.raw("ledger.log", fixture.ledger.replace("08:02:39.500 info abc (loginomd:4047>user:172)", "08:02:39.500 info abc (loginomd:4047>user:999)"))
      if (change === "guard-inode") await fixture.recovery("guard.json", { ...JSON.parse(await Bun.file(path.join(fixture.directory, "guard.json")).text()), ownerInode: 1 })
      if (change === "oracle-failed") await fixture.original("attempt.json", { ...JSON.parse(fixture.originals["attempt.json"]), oraclePassed: false })
      const result = await assessTechnicalContinuation(fixture.plan, fixture.directory, fixture.pinsFile, "audit", "runtime",
        change === "no-opt-in" ? undefined : { ...fixture.acceptance, criteriaSha256: change === "wrong-criteria" ? "0".repeat(64) : fixture.acceptance.criteriaSha256 })
      expect(result.decision).toBe("halt")
      if (change === "active-user") expect(result.reason).toBe("TECHNICAL_ACCOUNT_SESSION_ACTIVE")
      if (change === "oracle-failed") expect(result.reason).toBe("TECHNICAL_FAILURE_UNCONFIRMED")
      expect(JSON.parse(await Bun.file(path.join(fixture.plan.directory, "attempt.json")).text()).calculationPassed).toBe(false)
    } finally { await rm(fixture.root, { recursive: true, force: true }) }
  })

test("a recovered technical slot advances without rerunning or rewriting the failed attempt", async () => {
  const fixture = await technicalFixture()
  try {
    const before = await Bun.file(path.join(fixture.plan.directory, "attempt.json")).text()
    expect(await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true))
      .toMatchObject({ decision: "advance", reason: "TECHNICAL_FAILURE_RECORDED", outcome: "technical-failed",
        policyStatus: "incomplete", calculationPassed: false })
    expect(await Bun.file(path.join(fixture.plan.directory, "attempt.json")).text()).toBe(before)
    expect(await Bun.file(path.join(fixture.directory, "closure.json")).exists()).toBe(false)
    expect(await Bun.file(path.join(fixture.plan.pins.resultsRoot, "incidents")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("an attested archive without the exact archived owner file cannot release a failed slot", async () => {
  const fixture = await technicalFixture()
  try {
    await rm(path.join(fixture.guard.archivePath, "owner"))
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).decision).toBe("halt")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("an archived owner cannot be substituted through a symlinked directory", async () => {
  const fixture = await technicalFixture()
  try {
    await rename(fixture.guard.archivePath, path.join(fixture.root, "other-archive"))
    await symlink(path.join(fixture.root, "other-archive"), fixture.guard.archivePath)
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).decision).toBe("halt")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("a copied Host receipt without its exact own source cannot release a failed slot", async () => {
  const fixture = await technicalFixture()
  try {
    await rm(fixture.descriptor.release.hostSource)
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).decision).toBe("halt")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("an administrative logout does not release the profile while its own process is alive", async () => {
  const fixture = await technicalFixture()
  try {
    await fixture.recovery("admin.json", { ...fixture.administrative, processIDs: [process.pid] })
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).reason).toBe("OWN_PROCESS_NOT_GONE")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("an administrative logout from another server cannot attest this recovery", async () => {
  const fixture = await technicalFixture()
  try {
    await fixture.recovery("admin.json", { ...fixture.administrative, containerID: "e".repeat(64) })
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).reason).toBe("TECHNICAL_ADMIN_RELEASE_UNBOUND")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("a second Host receipt in the same CLI interval makes own attribution ambiguous", async () => {
  const fixture = await technicalFixture()
  try {
    await Bun.write(path.join(path.dirname(fixture.descriptor.release.hostSource), `runtime-close-${fixture.hostClose.pid}-bbbb.json`), JSON.stringify(fixture.hostClose))
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).reason).toBe("TECHNICAL_HOST_UNBOUND")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test.each(["package-cleanup.json", "saved-package-cleanup.json"])("a technical failure may also use its exact normal close %s without requiring a saved graph", async (cleanupFile) => {
  const fixture = await technicalFixture()
  try {
    const attempt = JSON.parse(fixture.originals["attempt.json"])
    await fixture.original("attempt.json", { ...attempt, cleanupConfirmed: true, blocker: "SELECTION_COLLECTION_FAILED", exitCode: 2, packagePath: fixture.plan.packagePath })
    fixture.snapshot.parts.push({ id: "p-save", sessionID: "ses_own", messageID: "msg_agent", type: "tool", tool: "loginom_dock_action_run",
      state: { status: "completed", input: { action_key: "package.save_as", operation_id: "save-own" }, output: JSON.stringify({ operation_id: "save-own",
        status: "SUCCEEDED", cleanup_complete: true, output: { save_completed: true, package_ref: { path: fixture.plan.packagePath } } }) } })
    await fixture.original("parts.json", fixture.snapshot)
    await fixture.original("events.jsonl", fixture.snapshot.parts.map((part) => ({ type: "tool_use", sessionID: "ses_own", part })), true)
    const cleanup = { version: 1, status: "SUCCEEDED", reason: null, session_id: "dock-own", document_id: "document-own", account: "user",
      package_path: fixture.plan.packagePath, save_operation_id: "save-own", package_closed: true, logged_out: true, unsaved_changes_discarded: false,
      started_at: "2026-10-14T08:02:39.100Z", completed_at: "2026-10-14T08:02:39.500Z", packages_before: 1, packages_after: 0,
      ...(cleanupFile === "saved-package-cleanup.json" ? { policy: "last_confirmed_own_save" } : {}) }
    const host = { ...fixture.hostClose, closed_ack: true, exit_code: 0, request_error: null }
    await Bun.write(fixture.descriptor.release.hostSource, JSON.stringify(host))
    await fixture.recovery("host.json", host)
    await fixture.recovery("cleanup.json", cleanup)
    for (const [name, rows] of [
      ["resource.jsonl", ["drain", "client", "bridge", "bridge_ack", "browser_server", "browser", "complete"].map((stage) =>
        ({ version: 1, stage, status: "fulfilled", recorded_at: "2026-10-14T08:02:39.800Z" }))],
      ["terminal.jsonl", ["reply_flushed", "exit_event"].map((stage) => ({ version: 1, stage, recorded_at: "2026-10-14T08:02:39.900Z" }))],
    ] as const) await fixture.recovery(name, rows, true)
    Object.assign(fixture.descriptor.release, { kind: "normal-close", packageCleanup: "cleanup.json", resourceClose: "resource.jsonl", terminalClose: "terminal.jsonl" })
    await fixture.seal()
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).decision).toBe("halt")
    for (const [target, copied] of [[cleanupFile, "cleanup.json"], ["resource-close.jsonl", "resource.jsonl"], ["terminal-close.jsonl", "terminal.jsonl"]])
      await Bun.write(path.join(fixture.runtimeSource, target!), await Bun.file(path.join(fixture.directory, copied!)).bytes())
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).reason).toBe("TECHNICAL_FAILURE_RECORDED")
    await fixture.recovery("cleanup.json", { ...cleanup, save_operation_id: "foreign-save" })
    await Bun.write(path.join(fixture.runtimeSource, cleanupFile), await Bun.file(path.join(fixture.directory, "cleanup.json")).bytes())
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).reason).toBe("TECHNICAL_NORMAL_CLOSE_UNCONFIRMED")
    await fixture.recovery("cleanup.json", cleanup)
    await Bun.write(path.join(fixture.runtimeSource, cleanupFile), await Bun.file(path.join(fixture.directory, "cleanup.json")).bytes())
    await fixture.recovery("cleanup.json", { ...cleanup, policy: "unsupported" })
    await Bun.write(path.join(fixture.runtimeSource, cleanupFile), await Bun.file(path.join(fixture.directory, "cleanup.json")).bytes())
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).decision).toBe("halt")
    await fixture.recovery("cleanup.json", cleanup)
    await Bun.write(path.join(fixture.runtimeSource, cleanupFile), await Bun.file(path.join(fixture.directory, "cleanup.json")).bytes())
    const otherCleanupFile = cleanupFile === "package-cleanup.json" ? "saved-package-cleanup.json" : "package-cleanup.json"
    await Bun.write(path.join(fixture.runtimeSource, otherCleanupFile), await Bun.file(path.join(fixture.directory, "cleanup.json")).bytes())
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).decision).toBe("halt")
    await rm(path.join(fixture.runtimeSource, otherCleanupFile))
    const resources = (await Bun.file(path.join(fixture.directory, "resource.jsonl")).text()).trim().split("\n").map((line) => JSON.parse(line))
    await fixture.recovery("resource.jsonl", [...resources, { version: 1, stage: "unknown-close", status: "fulfilled", recorded_at: "2026-10-14T08:02:39.800Z" }], true)
    await Bun.write(path.join(fixture.runtimeSource, "resource-close.jsonl"), await Bun.file(path.join(fixture.directory, "resource.jsonl")).bytes())
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).reason).toBe("TECHNICAL_NORMAL_CLOSE_UNCONFIRMED")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("foreign release identities, changed evidence, occupied profiles and incomplete history never advance", async () => {
  for (const change of ["run", "document", "native", "incarnation", "review", "hash", "writer", "history", "oracle", "live-cli"] as const) {
    const fixture = await technicalFixture()
    try {
      if (change === "run") { fixture.descriptor.runID = "foreign"; await fixture.seal() }
      if (change === "document") { fixture.descriptor.documentID = "foreign"; await fixture.seal() }
      if (change === "native") await fixture.recovery("server.json", { ...fixture.server, nativeNodeIDs: ["foreign"] })
      if (change === "incarnation") await fixture.recovery("server.json", { ...fixture.server, createdAt: "2026-10-14T09:00:00Z" })
      if (change === "review") {
        await chmod(path.join(fixture.directory, "technical-continuation-review.json"), 0o600)
        await Bun.write(path.join(fixture.directory, "technical-continuation-review.json"), "{}")
        await chmod(path.join(fixture.directory, "technical-continuation-review.json"), 0o400)
      }
      if (change === "hash") await Bun.write(path.join(fixture.plan.directory, "parts.json"), "{}")
      if (change === "writer") await Bun.write(path.join(fixture.plan.pins.profile, ".writer/owner"), "other-owner")
      if (change === "history") {
        fixture.snapshot.parts[3]!.state.status = "running"
        await fixture.original("parts.json", fixture.snapshot)
        await fixture.original("events.jsonl", fixture.snapshot.parts.map((part) => ({ type: "tool_use", sessionID: "ses_own", part })), true)
      }
      if (change === "oracle") await fixture.original("attempt.json", { ...JSON.parse(fixture.originals["attempt.json"]), oraclePassed: false })
      if (change === "live-cli") {
        fixture.descriptor.release.cliPid = process.pid
        await Bun.write(path.join(fixture.plan.directory, "cli.pid"), String(process.pid))
        fixture.descriptor.originalFiles["cli.pid"] = digest(String(process.pid))
        await fixture.recovery("guard.json", { ...fixture.guard, cliPid: process.pid })
      }
      expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).decision, change).toBe("halt")
    } finally { await rm(fixture.root, { recursive: true, force: true }) }
  }
})

test("confirmed candidate JavaScript stops even alongside terminal technical errors or incomplete history", async () => {
  const fixture = await technicalFixture()
  try {
    fixture.snapshot.parts[3]!.state.status = "running"
    fixture.snapshot.parts[3]!.state.input = { operation_id: "js-refused", target: { kind: "new", type: "programming.javascript" } }
    await fixture.original("parts.json", fixture.snapshot)
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).reason).toBe("JAVASCRIPT_NOT_ALLOWED")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("an existing confirmed policy failure cannot be relabeled as a technical continuation", async () => {
  const fixture = await technicalFixture()
  try {
    await Bun.write(path.join(fixture.plan.directory, "selection-audit.json"), JSON.stringify({ auditVersion: "audit", taskID: fixture.plan.taskID,
      mode: "standard", policyStatus: "failed", failures: ["JAVASCRIPT_NOT_ALLOWED"], oraclePassed: null, reviewStatus: "pending" }))
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).reason).toBe("JAVASCRIPT_NOT_ALLOWED")
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("baseline JavaScript remains a measured policy failure while the technical slot stays failed", async () => {
  const fixture = await technicalFixture("baseline")
  try {
    fixture.snapshot.parts[3]!.state.input = { operation_id: "calculator-1", target: { kind: "new", type: "programming.javascript" } }
    await fixture.original("parts.json", fixture.snapshot)
    await fixture.original("events.jsonl", fixture.snapshot.parts.map((part) => ({ type: "tool_use", sessionID: "ses_own", part })), true)
    expect(await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true))
      .toMatchObject({ decision: "advance", outcome: "technical-failed", policyStatus: "failed", calculationPassed: false, jsCalls: 1 })
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("re-entry rechecks release and never substitutes a second model attempt", async () => {
  const fixture = await technicalFixture()
  try {
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).decision).toBe("advance")
    await Bun.write(path.join(fixture.plan.pins.profile, ".writer/owner"), "new-owner")
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).reason).toBe("PROFILE_WRITER_PRESENT_OR_UNKNOWN")
    expect(await Bun.file(path.join(fixture.plan.pins.resultsRoot, "incidents")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

test("a historical protocol or a missing independent release review cannot reopen a dispatched slot", async () => {
  const fixture = await technicalFixture()
  try {
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime")).reason).toBe("SLOT_ALREADY_DISPATCHED")
    await rm(path.join(fixture.directory, "technical-continuation-review.json"))
    expect((await runSeriesSlot(fixture.pinsFile, fixture.plan.taskID, 1, "audit", "runtime", true)).decision).toBe("halt")
    expect(await Bun.file(path.join(fixture.plan.pins.resultsRoot, "incidents")).exists()).toBe(false)
  } finally { await rm(fixture.root, { recursive: true, force: true }) }
})

// Sanitized terminal/refusal and manual-release shapes from the stopped ABC/1.
// Native identity and administrative release are separate from normal cleanup.
async function technicalFixture(phase = "candidate", reviewedAt = "2026-10-14T08:21:00Z") {
  const root = await mkdtemp(path.join(tmpdir(), "selection-technical-"))
  const pins = { runID: "technical-1", phase, resultsRoot: path.join(root, "results"),
    workspaceRoot: path.join(root, "workspace"), payload: path.join(root, "payload"), profile: path.join(root, "profile"),
    manifestSha256: "a".repeat(64), expectedSkillDigest: "b".repeat(64), model: "openai/gpt-6-sol-fast", variant: "medium",
    frozenModelsPath: path.join(root, "models.json"), frozenModelsSha256: "c".repeat(64), deadlineSeconds: 1800, graceSeconds: 90,
    connection: { url: "http://localhost/app/", username: "user", folder: "/user" },
    container: { id: "d".repeat(64), name: "loginom-test" }, storageDir: "/workdir/UserStorage/user",
    tasks: { "abc-pareto-groups": { directory: path.join(root, "tasks/abc-pareto-groups"), mode: "standard", attempts: [1],
      promptSha256: "e".repeat(64), inputHashes: { "data.csv": "f".repeat(64) }, oracleSha256: "a".repeat(64) } } }
  const plan = selectionAttempt(pins, "abc-pareto-groups", 1)
  const pinsFile = path.join(root, "pins.json")
  const directory = path.join(pins.resultsRoot, `series/${phase}-abc-pareto-groups-1`)
  const cli = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" }); await cli.exited
  const host = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" }); await host.exited
  const adminProcess = Bun.spawn([process.execPath, "-e", ""], { stdout: "ignore", stderr: "ignore" }); await adminProcess.exited
  const nativeID = "00000000-0000-4000-8000-000000000001"
  const manifest = { actionCatalogDigest: "1".repeat(64), selectorCatalogDigest: "2".repeat(64), actionManifestDigest: "3".repeat(64),
    capabilityAbi: 1, executorRevision: "1", actionCatalogVersion: "1", compatibilityProfile: { profile_id: "local" } }
  const session = { sessionId: "dock-own", skillRevision: pins.expectedSkillDigest, clientRevision: "runtime", ...manifest }
  const prepared = { prepared: true, source: "bundled", sessionId: "dock-own", skillRevision: pins.expectedSkillDigest,
    workspace: { status: "READY", document_id: "document-own", workflow_ref: { workflow_id: "workflow-own" }, loginom_account: "user" },
    knowledge: { node_types: [{ type: "programming.javascript" }], session_manifest: manifest } }
  const part = (id: string, tool: string, input: unknown, output: unknown) => ({ id, sessionID: "ses_own", messageID: "msg_agent", type: "tool", tool,
    state: { status: "completed", input, output: JSON.stringify(output) } })
  const parts = [part("p-skill", "skill", { name: "loginom-automation" }, "activated"),
    part("p-prepare", "loginom_dock_prepare", { intent: "new_draft" }, prepared),
    part("p-import", "loginom_dock_node_apply", { operation_id: "import-1", target: { kind: "new", type: "imports.text" } },
      { operation_id: "import-1", status: "SUCCEEDED", cleanup_complete: true, execution: { status: "completed" },
        node: { document_id: "document-own", workflow_id: "workflow-own", node_id: nativeID } }),
    part("p-failed", "loginom_dock_node_apply", { operation_id: "calculator-1", target: { kind: "new", type: "transform.calculator" } },
      { operation_id: "calculator-1", status: "AMBIGUOUS", cleanup_complete: false, error: { code: "NODE_APPLY_STOPPED" } }),
  ].map((p) => p.id === "p-skill" ? { ...p, state: { ...p.state,
    metadata: { activation: { name: "loginom-automation", profile: "loginom-automation", digest: pins.expectedSkillDigest } } } } : p)
  const snapshot = { sessionID: "ses_own", parentID: null, childSessionIDs: [], messages: [
    { id: "msg_user", sessionID: "ses_own", role: "user" },
    { id: "msg_agent", sessionID: "ses_own", role: "assistant", providerID: "openai", modelID: "gpt-6-sol-fast", variant: "medium" },
  ], parts }
  const runtimePath = `runtime/generations/1/chats/${digest("ses_own")}/attempts/own`
  const runtimeEvents = [{ session_id: "dock-own", runtime_revision: "runtime", manifest_sha256: manifest.actionManifestDigest,
    operation_id: "import-1", phase: "completed", outcome: JSON.parse(parts[2]!.state.output) }]
  const originals = {
    "attempt.json": JSON.stringify({ evidence: plan.directory, sessionID: "ses_own", taskID: plan.taskID, mode: "standard", modelStarted: true,
      cliExitCode: 1, exitCode: 3, cleanupConfirmed: false, blocker: "SELECTION_CLEANUP_UNCONFIRMED", calculationPassed: false,
      policyStatus: "incomplete", oraclePassed: null, resultPath: null, packagePath: null, collectionFailures: [],
      model: pins.model, variant: pins.variant, expectedSkillDigest: pins.expectedSkillDigest, binaryManifestSha256: pins.manifestSha256,
      startedAt: "2026-10-14T07:55:00Z", cliStartedAt: "2026-10-14T07:55:03Z", cliFinishedAt: "2026-10-14T08:02:41Z", finishedAt: "2026-10-14T08:02:42Z" }),
    "cli.pid": String(cli.pid), "parts.json": JSON.stringify(snapshot), "tool-outputs.json": "[]",
    "events.jsonl": parts.map((p) => JSON.stringify({ type: "tool_use", sessionID: "ses_own", part: p })).join("\n") + "\n",
    [`${runtimePath}/session.json`]: JSON.stringify(session),
    [`${runtimePath}/execution-events.jsonl`]: runtimeEvents.map((e) => JSON.stringify(e)).join("\n") + "\n",
  }
  const originalFiles: Record<string, string> = {}
  for (const [name, data] of Object.entries(originals)) { await Bun.write(path.join(plan.directory, name), data); originalFiles[name] = digest(data) }
  const runtime = Object.keys(originals).filter((name) => name.startsWith("runtime/")).map((name) => ({ path: name,
    source: path.join(pins.profile, "loginom", name), sha256: originalFiles[name] }))
  await Bun.write(path.join(plan.directory, "runtime-journals.json"), JSON.stringify(runtime))
  originalFiles["runtime-journals.json"] = digest(JSON.stringify(runtime))
  await Bun.write(pinsFile, JSON.stringify(pins))
  await Bun.write(path.join(directory, "dispatch.json"), JSON.stringify({ pinsFile, pinsSha256: digest(JSON.stringify(pins)), taskID: plan.taskID, number: 1, auditVersion: "audit", hostFilesBefore: [] }))
  await Bun.write(path.join(directory, "returned.json"), JSON.stringify({ evidence: plan.directory, attemptSha256: originalFiles["attempt.json"], interruptReason: null }))
  const server = { version: 1, sessionID: "ses_own", resourceSessionID: "dock-own", documentID: "document-own", workflowID: "workflow-own",
    containerID: pins.container.id, account: "user", name: "user:172", createdAt: "2026-10-14T07:55:10Z", closedAt: "2026-10-14T08:15:58Z",
    nativeNodeIDs: [nativeID], nativeGuidBindingVerified: true, absentAfterClose: true }
  const administrative = { version: 1, containerID: pins.container.id, name: "admin:173", createdAt: "2026-10-14T08:10:00Z", closedAt: "2026-10-14T08:18:20Z", loggedOut: true,
    processIDs: [adminProcess.pid], processesExitedAt: "2026-10-14T08:19:00Z" }
  const guard = { version: 1, status: "archived", sessionID: "ses_own", cliPid: cli.pid, nonce: "own-nonce", createdAt: "2026-10-14T07:55:04Z",
    archivedAt: "2026-10-14T08:20:30Z", sourcePath: path.join(pins.profile, ".writer"), archivePath: path.join(pins.profile, ".writer-own-archived"),
    ownerSha256: digest("own-nonce"), archiveOwnerSha256: digest("own-nonce"), originalMtimeMs: 0, archivedMtimeMs: 0 }
  await Bun.write(path.join(guard.archivePath, "owner"), guard.nonce)
  await utimes(path.join(guard.archivePath, "owner"), new Date(guard.createdAt), new Date(guard.createdAt))
  guard.originalMtimeMs = guard.archivedMtimeMs = (await stat(path.join(guard.archivePath, "owner"))).mtimeMs
  const hostClose = { version: 1, pid: host.pid, started_at: "2026-10-14T08:02:39Z", completed_at: "2026-10-14T08:02:40Z",
    closed_ack: false, exit_code: 1, exit_signal: null, request_error: "own cleanup incomplete" }
  const hostSource = path.join(pins.profile, `loginom/runtime/runtime-close-${host.pid}-aaaa.json`)
  await Bun.write(hostSource, JSON.stringify(hostClose))
  const recoveryFiles: Record<string, string> = {}
  for (const [name, value] of Object.entries({ "server.json": server, "admin.json": administrative, "guard.json": guard, "host.json": hostClose })) {
    const file = path.join(directory, name); await Bun.write(file, JSON.stringify(value)); recoveryFiles[name] = digest(JSON.stringify(value)); await chmod(file, 0o400)
  }
  const descriptor = { version: 1, kind: "technical-continuation", preparedBy: "operator", runID: pins.runID, phase: pins.phase, taskID: plan.taskID, attempt: 1,
    pinsSha256: digest(JSON.stringify(pins)), auditVersion: "audit", runtimeRevision: "runtime", classification: "technical-failure",
    reason: "Own Calculator opening refused; no result was produced", sessionID: "ses_own", resourceSessionID: "dock-own", documentID: "document-own", workflowID: "workflow-own",
    account: "user", containerID: pins.container.id, originalFiles, recoveryFiles,
    release: { kind: "manual-recovery", server: "server.json", admin: "admin.json", guard: "guard.json", host: "host.json", hostSource, cliPid: cli.pid,
      releasedAt: "2026-10-14T08:20:31Z" } }
  const seal = async () => {
    const file = path.join(directory, "technical-continuation.json"); await chmod(file, 0o600).catch(() => {}); await Bun.write(file, JSON.stringify(descriptor)); await chmod(file, 0o400)
    const review = path.join(directory, "technical-continuation-review.json"); await chmod(review, 0o600).catch(() => {})
    await Bun.write(review, JSON.stringify({ version: 1, descriptorSha256: digest(JSON.stringify(descriptor)), verdict: "approved", reviewer: "independent",
      reviewedAt, notes: "Technical failure retained; only own resources released" })); await chmod(review, 0o400)
  }
  await seal()
  const recovery = async (name: string, value: unknown, jsonl = false) => {
    const data = jsonl && Array.isArray(value) ? value.map((row) => JSON.stringify(row)).join("\n") + "\n" : JSON.stringify(value)
    const file = path.join(directory, name); await chmod(file, 0o600).catch(() => {}); await Bun.write(file, data); await chmod(file, 0o400)
    recoveryFiles[name] = digest(data); await seal()
  }
  const original = async (name: string, value: unknown, jsonl = false) => {
    const data = jsonl && Array.isArray(value) ? value.map((row) => JSON.stringify(row)).join("\n") + "\n" : JSON.stringify(value)
    await Bun.write(path.join(plan.directory, name), data); originalFiles[name] = digest(data)
    if (name === "attempt.json") await Bun.write(path.join(directory, "returned.json"), JSON.stringify({ evidence: plan.directory, attemptSha256: originalFiles[name], interruptReason: null }))
    await seal()
  }
  return { root, plan, pinsFile, directory, descriptor, seal, recovery, original, snapshot, originals, server, guard, hostClose, administrative,
    runtimeSource: path.join(pins.profile, "loginom", runtimePath) }
}

function digest(value: string) { return createHash("sha256").update(value).digest("hex") }

// Sanitized early-import failure: no executed native node or direct GUID binding.
async function nativeActionFixture() {
  const fixture = await technicalFixture("baseline", "2026-10-14T08:38:00Z")
  const acceptance = { criteriaVersion: "node-selection-policy-v2" as const, criteriaSha256: "f".repeat(64) }
  Object.assign(fixture.descriptor, { version: 2, ...acceptance })
  fixture.server.closedAt = "2026-10-14T08:32:40Z"
  fixture.administrative.closedAt = "2026-10-14T08:34:00Z"
  fixture.administrative.processesExitedAt = "2026-10-14T08:35:00Z"
  fixture.guard.archivedAt = "2026-10-14T08:36:00Z"
  fixture.descriptor.release.releasedAt = "2026-10-14T08:37:00Z"
  await fixture.recovery("admin.json", fixture.administrative)
  const snapshot = { ...fixture.snapshot, parts: fixture.snapshot.parts.filter((part) => part.id !== "p-failed").map((part) => {
    if (part.id === "p-prepare") return { ...part, state: { ...part.state,
      time: { start: Date.parse("2026-10-14T07:55:08Z"), end: Date.parse("2026-10-14T07:55:12Z") },
      output: JSON.stringify({ ...JSON.parse(part.state.output), workspace: { ...JSON.parse(part.state.output).workspace,
        authenticated: true, created_draft: true, ownership_verified: true, target_verified: true, replayed: false } }) } }
    if (part.id !== "p-import") return part
    return { ...part, state: { ...part.state, output: JSON.stringify({ operation_id: "import-1", status: "AMBIGUOUS",
      cleanup_complete: false, execution: { status: "not_requested" }, error: { code: "UI_SCAN_LIMIT" } }) } }
  }) }
  await fixture.original("parts.json", snapshot)
  await fixture.original("events.jsonl", snapshot.parts.map((part) => ({ type: "tool_use", sessionID: "ses_own", part })), true)
  const runtimeName = Object.keys(fixture.originals).find((name) => name.endsWith("execution-events.jsonl"))!
  await fixture.original(runtimeName, [{ ...JSON.parse(fixture.originals[runtimeName as keyof typeof fixture.originals]!.trim()),
    outcome: JSON.parse(snapshot.parts.find((part) => part.id === "p-import")!.state.output) }], true)
  await fixture.original("runtime-journals.json", Object.keys(fixture.originals).filter((name) => name.startsWith("runtime/")).map((name) => ({ path: name,
    source: path.join(fixture.plan.pins.profile, "loginom", name), sha256: fixture.descriptor.originalFiles[name] })))
  const raw = async (name: string, data: string) => {
    const file = path.join(fixture.directory, name)
    await chmod(file, 0o600).catch(() => {}); await Bun.write(file, data); await chmod(file, 0o400)
    fixture.descriptor.recoveryFiles[name] = digest(data); await fixture.seal()
  }
  const native = (time: string, name: string, message: string) => `2026-10-14T${time.replace(/Z$/, "")} info abc (loginomd:4047>${name}) - ${message}`
  const ledger = ["2026-10-14T07:54:00Z info abc (loginomd:1>) - Лог-файл создан Loginom Enterprise 7.4.2",
    '2026-10-14T07:54:01Z warn abc (loginomd:1>) - Multiline historical node warning\ncontinued warning text',
    native("07:55:10Z", "user:172", 'Инициализирована сессия для пользователя user{"USER_NAME":"user"}'),
    native("07:55:11Z", "user:172", "Создан черновик пакета"),
    native("08:02:39.500Z", "user:172", "Обнаружен разрыв связи"),
    native("08:02:39.500Z", "user:172", "Сессия сохранена после обнаруженного разрыва связи"),
    native("08:10:00Z", "admin:173", 'Инициализирована сессия для пользователя admin{"USER_NAME":"admin"}'),
    native("08:32:39.500Z", "user:172", "Сессия закрыта по тайм-ауту после разрыва связи: 1800 секунд"),
    native("08:32:40Z", "user:172", 'Закрыта сессия для пользователя user{"USER_NAME":"user"}'),
    native("08:34:00Z", "admin:173", 'Закрыта сессия для пользователя admin{"USER_NAME":"admin"}')].join("\n") + "\n"
  await raw("ledger.log", ledger)
  const dispatcher = '- generic: Администрирование\n  - generic: Диспетчер\n    - generic: Сессии и пакеты\n    - table:\n      - rowgroup:\n        - row "1 admin:173":\n          - cell "admin:173"\n        - row "Общие пакеты":\n        - row "Пул пакетов 0 из 10":\n'
  await raw("dispatcher-1.yml", dispatcher)
  await raw("dispatcher-2.yml", dispatcher + "- generic: Обновить (Alt+F5)\n")
  await fixture.recovery("native-review.json", { version: 1, reviewer: "independent", reviewedAt: "2026-10-14T08:33:00Z",
    sessionID: "ses_own", resourceSessionID: "dock-own", documentID: "document-own", targetBackendSession: "user:172",
    nativeActionBinding: { verified: true }, directGuidLogBinding: { verified: false }, notes: "Two unique exact native RPC anchors" })
  await fixture.recovery("resource.jsonl", [
    { version: 1, stage: "client", status: "started", recorded_at: "2026-10-14T08:02:39.100Z" },
    { version: 1, stage: "client", status: "fulfilled", recorded_at: "2026-10-14T08:02:39.150Z" },
    { version: 1, stage: "bridge", status: "started", recorded_at: "2026-10-14T08:02:39.160Z" },
    { version: 1, stage: "bridge", status: "fulfilled", recorded_at: "2026-10-14T08:02:39.200Z" },
    { version: 1, stage: "bridge_ack", status: "rejected", recorded_at: "2026-10-14T08:02:39.210Z" },
  ], true)
  await fixture.recovery("server.json", { ...fixture.server, version: 2, nativeNodeIDs: [], nativeGuidBindingVerified: false,
    closeMethod: "native-auto-timeout", nativeActionProof: { review: "native-review.json", ledger: "ledger.log",
      snapshots: ["dispatcher-1.yml", "dispatcher-2.yml"], resourceClose: "resource.jsonl" } })
  await fixture.recovery("guard.json", { ...fixture.guard, directoryInode: (await stat(fixture.guard.archivePath)).ino,
    ownerInode: (await stat(path.join(fixture.guard.archivePath, "owner"))).ino })
  await fixture.seal()
  return { ...fixture, acceptance, raw, ledger, dispatcher }
}
