import path from "node:path"
import { createHash } from "node:crypto"
import { lstat, readdir, realpath } from "node:fs/promises"
import type { selectionAttempt } from "../script/run-node-selection-attempt"
import { inspectSelection, inspectSelectionHistory, inspectSelectionProvenance, readSelectionReceipt } from "./node-selection"

// This imports a separately reviewed release. It never repairs an attempt or
// performs recovery, and deliberately does not reuse the normal success closure.
export async function assessTechnicalContinuation(plan: ReturnType<typeof selectionAttempt>, directory: string,
  pinsFile: string, auditVersion: string, runtimeRevision?: string,
  acceptance?: { criteriaVersion: "node-selection-policy-v2"; criteriaSha256: string }) {
  try {
    const descriptorFile = await boundFile(directory, "technical-continuation.json", undefined, true)
    const descriptorHash = await hash(descriptorFile)
    const value = object(await Bun.file(descriptorFile).json())
    const reviewFile = await boundFile(directory, "technical-continuation-review.json", undefined, true)
    const review = object(await Bun.file(reviewFile).json())
    const nativeActionRelease = value.version === 2 && acceptance?.criteriaVersion === "node-selection-policy-v2"
      && digest(acceptance.criteriaSha256) && value.criteriaVersion === acceptance.criteriaVersion && value.criteriaSha256 === acceptance.criteriaSha256
    if (!(value.version === 1 || nativeActionRelease) || value.kind !== "technical-continuation" || value.classification !== "technical-failure"
      || !nonempty(value.reason) || !nonempty(value.preparedBy) || value.runID !== plan.pins.runID || value.phase !== plan.pins.phase
      || value.taskID !== plan.taskID || value.attempt !== plan.number || value.pinsSha256 !== await hash(pinsFile)
      || value.auditVersion !== auditVersion || value.runtimeRevision !== runtimeRevision || !runtimeRevision
      || value.containerID !== plan.pins.container.id || value.account !== plan.pins.connection.username)
      throw Error("TECHNICAL_BINDING_INVALID")
    if (review.version !== 1 || review.descriptorSha256 !== descriptorHash || review.verdict !== "approved"
      || !nonempty(review.reviewer) || review.reviewer === value.preparedBy || !nonempty(review.notes))
      throw Error("TECHNICAL_REVIEW_REQUIRED")
    const originals = object(value.originalFiles)
    for (const [file, expected] of Object.entries(originals)) await boundFile(plan.directory, file, expected)
    for await (const file of new Bun.Glob("**/*").scan({ cwd: plan.directory, onlyFiles: true }))
      if (!["selection-audit.json", "graph-review.json"].includes(file) && !Object.hasOwn(originals, file))
        throw Error("TECHNICAL_ORIGINAL_UNSEALED")
    for (const file of ["attempt.json", "parts.json", "events.jsonl", "cli.pid", "runtime-journals.json", "tool-outputs.json"])
      if (!digest(originals[file])) throw Error("TECHNICAL_ORIGINAL_UNSEALED")
    const attempt = object(await Bun.file(path.join(plan.directory, "attempt.json")).json())
    const returned = object(await Bun.file(path.join(directory, "returned.json")).json())
    const dispatch = object(await Bun.file(path.join(directory, "dispatch.json")).json())
    if (returned.evidence !== plan.directory || returned.attemptSha256 !== originals["attempt.json"]
      || dispatch.pinsSha256 !== value.pinsSha256 || dispatch.taskID !== plan.taskID || dispatch.number !== plan.number
      || attempt.evidence !== plan.directory || attempt.sessionID !== value.sessionID || attempt.taskID !== plan.taskID
      || attempt.mode !== plan.task.mode || attempt.modelStarted !== true || !Number.isInteger(attempt.cliExitCode)
      || !Number.isInteger(attempt.exitCode) || attempt.model !== plan.pins.model || attempt.variant !== plan.pins.variant
      || attempt.expectedSkillDigest !== plan.pins.expectedSkillDigest || attempt.binaryManifestSha256 !== plan.pins.manifestSha256
      || !orderedTimes(attempt.startedAt, attempt.cliStartedAt, attempt.cliFinishedAt, attempt.finishedAt))
      throw Error("TECHNICAL_ATTEMPT_UNBOUND")
    const auditFile = path.join(plan.directory, "selection-audit.json")
    const audit = await Bun.file(auditFile).exists() ? object(await Bun.file(auditFile).json()) : null
    if (plan.pins.phase === "candidate" && (attempt.policyStatus === "failed" || audit?.policyStatus === "failed"))
      throw Error(Array.isArray(audit?.failures) && audit.failures.includes("JAVASCRIPT_NOT_ALLOWED") ? "JAVASCRIPT_NOT_ALLOWED" : "POLICY_VIOLATION_CONFIRMED")
    const snapshot = object(await Bun.file(path.join(plan.directory, "parts.json")).json())
    if (snapshot.sessionID !== value.sessionID || !Array.isArray(snapshot.parts)) throw Error("TECHNICAL_HISTORY_UNTRUSTED")
    const policy = (parts: unknown[], runtime?: Parameters<typeof inspectSelection>[0]["runtime"]) =>
      inspectSelection({ mode: plan.task.mode, nodeTypes: null, parts, runtime })
    if (plan.pins.phase === "candidate" && (returned.interruptReason === "JAVASCRIPT_NOT_ALLOWED"
      || policy(snapshot.parts).failures.includes("JAVASCRIPT_NOT_ALLOWED"))) throw Error("JAVASCRIPT_NOT_ALLOWED")
    const events = await lines(path.join(plan.directory, "events.jsonl"))
    if (!inspectSelectionHistory({ snapshot, events }).historyComplete) throw Error("TECHNICAL_HISTORY_UNTRUSTED")
    const outputs = await Bun.file(path.join(plan.directory, "tool-outputs.json")).json() as unknown
    if (!Array.isArray(outputs)) throw Error("TECHNICAL_OUTPUT_UNAVAILABLE")
    const parts = await Promise.all(snapshot.parts.map(async (raw: unknown) => {
      const part = object(raw), state = record(part.state) ? part.state : undefined
      if (!state || !record(state.metadata) || state.metadata.truncated !== true) return part
      const source = state.metadata.outputPath
      const matches = outputs.filter(record).filter((entry) => entry.partID === part.id && entry.source === source)
      if (matches.length !== 1 || !nonempty(matches[0]!.path)) throw Error("TECHNICAL_OUTPUT_UNAVAILABLE")
      const file = await boundFile(plan.directory, String(matches[0]!.path), matches[0]!.sha256)
      return { ...part, state: { ...state, [state.status === "error" ? "error" : "output"]: await Bun.file(file).text(),
        metadata: { ...state.metadata, truncated: false } } }
    }))
    const manifest = await Bun.file(path.join(plan.directory, "runtime-journals.json")).json() as unknown
    if (!Array.isArray(manifest) || !manifest.length) throw Error("TECHNICAL_RUNTIME_UNBOUND")
    const chat = createHash("sha256").update(String(value.sessionID)).digest("hex")
    const runtimeFiles = new Map<string, string>()
    for (const raw of manifest) {
      const entry = object(raw)
      if (!nonempty(entry.path) || !new RegExp(`^runtime/generations/[^/]+/chats/${chat}/attempts/[^/]+/(session\\.json|execution-events\\.jsonl|terminal-close\\.jsonl)$`).test(entry.path)
        || entry.source !== path.join(plan.pins.profile, "loginom", entry.path) || runtimeFiles.has(entry.path))
        throw Error("TECHNICAL_RUNTIME_UNBOUND")
      runtimeFiles.set(entry.path, await boundFile(plan.directory, entry.path, entry.sha256))
    }
    const sessions = [...runtimeFiles].filter(([name]) => name.endsWith("/session.json"))
    if (sessions.length !== 1) throw Error("TECHNICAL_RUNTIME_UNBOUND")
    const session = object(await Bun.file(sessions[0]![1]).json())
    const journal = runtimeFiles.get(path.join(path.dirname(sessions[0]![0]), "execution-events.jsonl"))
    if (!journal || session.sessionId !== value.resourceSessionID || session.clientRevision !== runtimeRevision)
      throw Error("TECHNICAL_RUNTIME_UNBOUND")
    const runtimeEvents = await lines(journal)
    if (!runtimeEvents.length || runtimeEvents.some((row) => !record(row) || row.session_id !== session.sessionId
      || row.runtime_revision !== runtimeRevision || row.manifest_sha256 !== session.actionManifestDigest))
      throw Error("TECHNICAL_RUNTIME_UNBOUND")
    const runtime = [{ path: path.dirname(sessions[0]![0]), session, events: runtimeEvents }]
    const selection = policy(parts, runtime)
    if (plan.pins.phase === "candidate" && selection.failures.includes("JAVASCRIPT_NOT_ALLOWED")) throw Error("JAVASCRIPT_NOT_ALLOWED")
    if (!inspectSelectionProvenance({ snapshot: { ...snapshot, parts }, runtime, model: plan.pins.model,
      variant: plan.pins.variant, expectedSkillDigest: plan.pins.expectedSkillDigest }).identityVerified
      || selection.failures.some((failure) => !failure.startsWith("JAVASCRIPT_"))) throw Error("TECHNICAL_HISTORY_UNTRUSTED")
    const preparations = parts.filter((part) => part.tool === "loginom_dock_prepare").map(readSelectionReceipt).filter(record)
    if (!preparations.length || preparations.some((prepared) => prepared.sessionId !== value.resourceSessionID || !record(prepared.workspace)
      || prepared.workspace.document_id !== value.documentID || prepared.workspace.loginom_account !== value.account
      || !record(prepared.workspace.workflow_ref) || prepared.workspace.workflow_ref.workflow_id !== value.workflowID))
      throw Error("TECHNICAL_DOCUMENT_UNBOUND")
    if (audit?.oraclePassed === false || audit?.reviewStatus === "failed") throw Error("ANALYTICAL_FAILURE_NOT_TECHNICAL")
    if (attempt.oraclePassed === false || attempt.calculationPassed !== false
      || !(attempt.cliExitCode !== 0 || attempt.cleanupConfirmed !== true || nonempty(attempt.blocker)
        || Array.isArray(attempt.collectionFailures) && attempt.collectionFailures.length)) throw Error("TECHNICAL_FAILURE_UNCONFIRMED")
    const release = object(value.release)
    const recovery = object(value.recoveryFiles)
    for (const [file, expected] of Object.entries(recovery)) await boundFile(directory, file, expected, true)
    const evidence = async (name: unknown) => {
      if (!nonempty(name) || !digest(recovery[name])) throw Error("TECHNICAL_RELEASE_UNBOUND")
      return object(await Bun.file(await boundFile(directory, name, recovery[name], true)).json())
    }
    const host = await evidence(release.host)
    if (host.version !== 1 || !pid(host.pid) || !Number.isInteger(host.exit_code)
      || !orderedTimes(attempt.cliStartedAt, host.started_at, host.completed_at, attempt.cliFinishedAt)) throw Error("TECHNICAL_HOST_UNBOUND")
    const hostRoot = path.join(plan.pins.profile, "loginom/runtime")
    const hostsBefore = dispatch.hostFilesBefore
    if (!nonempty(release.hostSource) || path.dirname(release.hostSource) !== hostRoot
      || !new RegExp(`^runtime-close-${host.pid}-[a-f0-9-]+\\.json$`).test(path.basename(release.hostSource))
      || !Array.isArray(hostsBefore) || hostsBefore.includes(path.basename(release.hostSource)))
      throw Error("TECHNICAL_HOST_UNBOUND")
    await boundFile(hostRoot, path.basename(release.hostSource), recovery[String(release.host)])
    const overlapping = []
    for (const name of (await readdir(hostRoot)).filter((name) => /^runtime-close-.*\.json$/.test(name) && !hostsBefore.includes(name))) {
      const observed = object(await Bun.file(await boundFile(hostRoot, name)).json())
      if (!orderedTimes(observed.started_at, observed.completed_at)) throw Error("TECHNICAL_HOST_UNBOUND")
      if (Date.parse(String(observed.started_at)) <= Date.parse(String(attempt.cliFinishedAt))
        && Date.parse(String(observed.completed_at)) >= Date.parse(String(attempt.cliStartedAt))) overlapping.push(name)
    }
    if (overlapping.length !== 1 || overlapping[0] !== path.basename(release.hostSource)) throw Error("TECHNICAL_HOST_UNBOUND")
    const cliPid = Number((await Bun.file(path.join(plan.directory, "cli.pid")).text()).trim())
    if (!pid(cliPid) || cliPid !== release.cliPid || host.pid === cliPid) throw Error("TECHNICAL_PROCESS_UNBOUND")
    if (!["manual-recovery", "normal-close"].includes(String(release.kind))) throw Error("TECHNICAL_RELEASE_UNBOUND")
    const admin = release.kind === "manual-recovery" ? await evidence(release.admin) : { processIDs: [] }
    if (release.kind === "manual-recovery") {
      const server = await evidence(release.server), guard = await evidence(release.guard)
      const nativeIDs = runtimeEvents.filter(record).filter((event) => event.phase === "completed" && record(event.outcome)
        && event.outcome.status === "SUCCEEDED").flatMap((event) => {
        const outcome = object(event.outcome), output = record(outcome.output) ? outcome.output : outcome
        return record(output.node) && record(output.execution) && output.execution.status === "completed"
          && output.node.document_id === value.documentID && output.node.workflow_id === value.workflowID ? [output.node.node_id] : []
      })
      const withoutExecution = nativeActionRelease && nativeIDs.length === 0 && server.version === 2
        && Array.isArray(server.nativeNodeIDs) && server.nativeNodeIDs.length === 0 && server.nativeGuidBindingVerified === false
        && server.closeMethod === "native-auto-timeout"
      if (!(server.version === 1 || withoutExecution) || ["sessionID", "resourceSessionID", "documentID", "workflowID", "containerID", "account"].some((key) => server[key] !== value[key])
        || !nonempty(server.name) || !server.name.startsWith(String(value.account) + ":") || !Array.isArray(server.nativeNodeIDs)
        || !withoutExecution && (!server.nativeNodeIDs.length || server.nativeNodeIDs.some((id) => !nativeIDs.includes(id)) || server.nativeGuidBindingVerified !== true)
        || server.absentAfterClose !== true
        || !orderedTimes(attempt.cliStartedAt, server.createdAt, attempt.cliFinishedAt, server.closedAt, release.releasedAt, review.reviewedAt))
        throw Error("TECHNICAL_SERVER_RELEASE_UNBOUND")
      if (admin.version !== 1 || admin.containerID !== value.containerID || !nonempty(admin.name) || admin.name === server.name || admin.loggedOut !== true
        || !Array.isArray(admin.processIDs) || !admin.processIDs.length || admin.processIDs.some((value) => !pid(value) || [cliPid, host.pid].includes(value))
        || !orderedTimes(admin.createdAt, server.closedAt, admin.closedAt, admin.processesExitedAt, release.releasedAt)) throw Error("TECHNICAL_ADMIN_RELEASE_UNBOUND")
      if (withoutExecution) await verifyNativeActionRelease(directory, value, server, admin, host, attempt, parts, recovery)
      if (guard.version !== 1 || guard.status !== "archived" || guard.sessionID !== value.sessionID || guard.cliPid !== cliPid
        || guard.sourcePath !== path.join(plan.pins.profile, ".writer") || !nonempty(guard.archivePath)
        || path.dirname(guard.archivePath) !== plan.pins.profile || !path.basename(guard.archivePath).startsWith(".writer-")
        || !nonempty(guard.nonce) || !digest(guard.ownerSha256) || guard.archiveOwnerSha256 !== guard.ownerSha256
        || !Number.isFinite(guard.originalMtimeMs) || guard.archivedMtimeMs !== guard.originalMtimeMs
        || !orderedTimes(attempt.cliStartedAt, guard.createdAt, attempt.cliFinishedAt, server.closedAt, guard.archivedAt, release.releasedAt))
        throw Error("TECHNICAL_GUARD_RELEASE_UNBOUND")
      const archivedOwner = await boundFile(guard.archivePath, "owner", guard.ownerSha256)
      if (await Bun.file(archivedOwner).text() !== guard.nonce || (await lstat(archivedOwner)).mtimeMs !== guard.archivedMtimeMs)
        throw Error("TECHNICAL_GUARD_RELEASE_UNBOUND")
      if (withoutExecution && ((await lstat(guard.archivePath)).ino !== guard.directoryInode || (await lstat(archivedOwner)).ino !== guard.ownerInode))
        throw Error("TECHNICAL_GUARD_RELEASE_UNBOUND")
    }
    if (release.kind === "normal-close") {
      const source = path.join(plan.pins.profile, "loginom", path.dirname(sessions[0]![0]))
      const cleanupSource = await selectionPackageCleanup(source)
      for (const [name, copied] of [[cleanupSource.name, release.packageCleanup], ["resource-close.jsonl", release.resourceClose], ["terminal-close.jsonl", release.terminalClose]]) {
        if (!nonempty(name) || !nonempty(copied) || !digest(recovery[copied])) throw Error("TECHNICAL_NORMAL_CLOSE_UNCONFIRMED")
        await boundFile(source, name, recovery[copied])
      }
      const cleanup = await evidence(release.packageCleanup)
      const saves = parts.filter((part) => part.tool === "loginom_dock_action_run" && record(part.state) && part.state.status === "completed"
        && record(part.state.input) && ["package.save_as", "package.save_checkpoint"].includes(String(part.state.input.action_key)))
        .flatMap((part) => {
          const receipt = readSelectionReceipt(part)
          return record(receipt) && record(part.state) && record(part.state.input) && receipt.operation_id === part.state.input.operation_id
            && receipt.status === "SUCCEEDED" && receipt.cleanup_complete === true && record(receipt.output)
            && (receipt.output.save_completed === true || receipt.output.reopened === true) && record(receipt.output.package_ref)
            ? [{ operationID: receipt.operation_id, packagePath: receipt.output.package_ref.path }] : []
        })
      if (attempt.cleanupConfirmed !== true || host.closed_ack !== true || host.exit_code !== 0 || host.exit_signal !== null || host.request_error !== null
        || cleanup.version !== 1 || cleanup.status !== "SUCCEEDED" || cleanup.reason !== null
        || cleanup.session_id !== value.resourceSessionID || cleanup.document_id !== value.documentID || cleanup.account !== value.account
        || attempt.packagePath !== plan.packagePath || cleanup.package_path !== plan.packagePath
        || !saves.length || saves.some((save) => save.packagePath !== plan.packagePath)
        || saves.filter((save) => save.operationID === cleanup.save_operation_id).length !== 1
        || saves.at(-1)?.operationID !== cleanup.save_operation_id || cleanup.package_closed !== true || cleanup.logged_out !== true
        || cleanup.unsaved_changes_discarded !== false || cleanup.packages_before !== 1 || cleanup.packages_after !== 0
        || !orderedTimes(host.started_at, cleanup.started_at, cleanup.completed_at, host.completed_at, attempt.cliFinishedAt, release.releasedAt, review.reviewedAt))
        throw Error("TECHNICAL_NORMAL_CLOSE_UNCONFIRMED")
      if (!nonempty(release.resourceClose) || !nonempty(release.terminalClose)) throw Error("TECHNICAL_NORMAL_CLOSE_UNCONFIRMED")
      const resources = await lines(await boundFile(directory, release.resourceClose, recovery[release.resourceClose], true))
      const terminal = await lines(await boundFile(directory, release.terminalClose, recovery[release.terminalClose], true))
      if (resources.some((row) => !record(row) || row.version !== 1 || !["started", "fulfilled"].includes(String(row.status))
          || !["drain", "client", "bridge", "bridge_ack", "browser_server", "browser", "profile", "complete"].includes(String(row.stage))
          || !orderedTimes(host.started_at, row.recorded_at, host.completed_at))
        || ["drain", "client", "bridge", "bridge_ack", "browser_server", "browser", "complete"].some((stage) =>
          resources.filter((row) => record(row) && row.stage === stage && row.status === "fulfilled").length !== 1)
        || terminal.some((row) => !record(row) || row.version !== 1
          || !["reply_sending", "reply_flushed", "disconnect_returned", "stop_requested", "exit_requested", "exit_event"].includes(String(row.stage))
          || !orderedTimes(host.started_at, row.recorded_at, host.completed_at))
        || ["reply_flushed", "exit_event"].some((stage) => terminal.filter((row) => record(row) && row.stage === stage).length !== 1))
        throw Error("TECHNICAL_NORMAL_CLOSE_UNCONFIRMED")
    }
    if (!Array.isArray(admin.processIDs)) throw Error("TECHNICAL_ADMIN_RELEASE_UNBOUND")
    for (const value of [cliPid, host.pid, ...admin.processIDs]) if (await exists(`/proc/${value}`)) throw Error("OWN_PROCESS_NOT_GONE")
    if (await exists(path.join(plan.pins.profile, ".writer"))) throw Error("PROFILE_WRITER_PRESENT_OR_UNKNOWN")
    return { decision: "advance" as const, reason: "TECHNICAL_FAILURE_RECORDED", outcome: "technical-failed" as const,
      policyStatus: selection.failures.includes("JAVASCRIPT_NOT_ALLOWED") ? "failed" : "incomplete",
      calculationPassed: false, jsCalls: selection.jsCalls, jsNodes: null,
      continuationSha256: descriptorHash, continuationReviewSha256: await hash(reviewFile) }
  } catch (error) {
    return { decision: "halt" as const, reason: error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : "TECHNICAL_EVIDENCE_UNAVAILABLE" }
  }
}

// The no-execution v2 path uses two unique native action anchors. It never
// substitutes an absence claim for the complete account-session event ledger.
async function verifyNativeActionRelease(directory: string, value: Record<string, unknown>, server: Record<string, unknown>,
  admin: Record<string, unknown>, host: Record<string, unknown>, attempt: Record<string, unknown>,
  parts: Record<string, unknown>[], recovery: Record<string, unknown>) {
  const proof = object(server.nativeActionProof)
  const file = async (name: unknown) => {
    if (!nonempty(name) || !digest(recovery[name])) throw Error("TECHNICAL_NATIVE_ACTION_UNBOUND")
    return boundFile(directory, name, recovery[name], true)
  }
  const review = object(await Bun.file(await file(proof.review)).json())
  if (review.version !== 1 || !nonempty(review.reviewer) || review.reviewer === value.preparedBy
    || ["sessionID", "resourceSessionID", "documentID"].some((key) => review[key] !== value[key])
    || review.targetBackendSession !== server.name || !record(review.nativeActionBinding) || review.nativeActionBinding.verified !== true
    || !record(review.directGuidLogBinding) || review.directGuidLogBinding.verified !== false
    || !orderedTimes(attempt.cliFinishedAt, review.reviewedAt, object(value.release).releasedAt)) throw Error("TECHNICAL_NATIVE_ACTION_REVIEW_REQUIRED")
  const prepared = parts.filter((part) => part.tool === "loginom_dock_prepare" && record(part.state) && part.state.status === "completed")
  if (prepared.length !== 1) throw Error("TECHNICAL_NATIVE_ACTION_UNBOUND")
  const receipt = object(readSelectionReceipt(prepared[0]!)), workspace = object(receipt.workspace)
  const time = object(object(prepared[0]!.state).time)
  if (workspace.authenticated !== true || workspace.created_draft !== true || workspace.ownership_verified !== true
    || workspace.target_verified !== true || workspace.replayed !== false || receipt.sessionId !== value.resourceSessionID
    || workspace.document_id !== value.documentID || workspace.loginom_account !== value.account
    || !Number.isSafeInteger(time.start) || !Number.isSafeInteger(time.end) || Number(time.end) < Number(time.start)
    || Number(time.start) < Date.parse(String(attempt.cliStartedAt)) || Number(time.end) > Date.parse(String(attempt.cliFinishedAt)))
    throw Error("TECHNICAL_NATIVE_ACTION_UNBOUND")
  const resources = await lines(await file(proof.resourceClose))
  if (resources.some((row) => !record(row) || row.version !== 1
    || !["drain", "client", "bridge", "bridge_ack", "browser_server", "browser", "profile", "complete"].includes(String(row.stage))
    || !["started", "fulfilled", "rejected"].includes(String(row.status))
    || !orderedTimes(host.started_at, row.recorded_at, host.completed_at))) throw Error("TECHNICAL_NATIVE_ACTION_UNBOUND")
  const stages = ["client", "bridge"].flatMap((stage) => ["started", "fulfilled"].map((status) => {
    const rows = resources.filter(record).filter((row) => row.stage === stage && row.status === status)
    if (rows.length !== 1) throw Error("TECHNICAL_NATIVE_ACTION_UNBOUND")
    return rows[0]!.recorded_at
  }))
  if (!orderedTimes(...stages)) throw Error("TECHNICAL_NATIVE_ACTION_UNBOUND")
  const raw = (await Bun.file(await file(proof.ledger)).text()).split(/\r?\n/).filter((line) => line.trim())
  if (!raw[0]?.includes(" - Лог-файл создан ") || raw.filter((line) => line.includes(" - Лог-файл создан ")).length !== 1)
    throw Error("TECHNICAL_NATIVE_LEDGER_INCOMPLETE")
  const ledger = raw.reduce<{ time: string; at: number; thread: string; name: string; message: string }[]>((rows, line) => {
    const match = /^(\S+) .* \((loginomd:[^>]+)>([^)]*)\) - (.*)$/s.exec(line)
    if (!match) {
      if (!rows.length || /^\d{4}-\d{2}-\d{2}T/.test(line)) throw Error("TECHNICAL_NATIVE_LEDGER_INCOMPLETE")
      rows[rows.length - 1]!.message += "\n" + line
      return rows
    }
    // Native server logs omit the UTC suffix; the owned RPC anchors establish
    // UTC. Never interpret these timestamps using the operator's local zone.
    const time = /(?:Z|[+-]\d{2}:\d{2})$/.test(match[1]!) ? match[1]! : match[1]! + "Z"
    if (!Number.isFinite(Date.parse(time))) throw Error("TECHNICAL_NATIVE_LEDGER_INCOMPLETE")
    rows.push({ time, at: Date.parse(time), thread: match[2]!, name: match[3]!, message: match[4]! })
    return rows
  }, [])
  const inPrepare = ledger.filter((row) => row.at >= Number(time.start) && row.at <= Number(time.end))
  const init = inPrepare.filter((row) => row.message.startsWith("Инициализирована сессия для пользователя "))
  const draft = inPrepare.filter((row) => row.message === "Создан черновик пакета")
  const inClose = ledger.filter((row) => orderedTimes(host.started_at, row.time, host.completed_at))
  const disconnect = inClose.filter((row) => row.message === "Обнаружен разрыв связи")
  const retained = inClose.filter((row) => row.message === "Сессия сохранена после обнаруженного разрыва связи")
  if ([init, draft, disconnect, retained].some((rows) => rows.length !== 1 || rows[0]!.name !== server.name)
    || init[0]!.at !== Date.parse(String(server.createdAt)) || draft[0]!.thread !== init[0]!.thread || disconnect[0]!.thread !== init[0]!.thread
    || retained[0]!.thread !== init[0]!.thread || !orderedTimes(stages[3], disconnect[0]!.time, retained[0]!.time))
    throw Error("TECHNICAL_NATIVE_ACTION_UNBOUND")
  const pending = new Map<string, number>()
  for (const row of ledger.filter((row) => row.name.startsWith(String(value.account) + ":"))) {
    const key = row.thread + ">" + row.name
    if (row.message.startsWith("Инициализирована сессия для пользователя ")) {
      if (pending.has(key) || object(JSON.parse(row.message.slice(row.message.indexOf("{")))).USER_NAME !== value.account)
        throw Error("TECHNICAL_NATIVE_LEDGER_INCOMPLETE")
      pending.set(key, row.at)
    }
    if (row.message.startsWith("Закрыта сессия для пользователя ")) {
      if (!pending.has(key) || row.at < pending.get(key)! || object(JSON.parse(row.message.slice(row.message.indexOf("{")))).USER_NAME !== value.account)
        throw Error("TECHNICAL_NATIVE_LEDGER_INCOMPLETE")
      pending.delete(key)
    }
  }
  if (pending.size) throw Error("TECHNICAL_ACCOUNT_SESSION_ACTIVE")
  const own = ledger.filter((row) => row.name === server.name && row.thread === init[0]!.thread && row.at >= init[0]!.at)
  const closed = own.filter((row) => row.message.startsWith("Закрыта сессия для пользователя "))
  const timeout = own.filter((row) => row.message.startsWith("Сессия закрыта по тайм-ауту после разрыва связи: "))
  const timeoutSeconds = Number(/: (\d+) секунд$/.exec(timeout[0]?.message ?? "")?.[1])
  if (own.filter((row) => row.message.startsWith("Инициализирована сессия для пользователя ")).length !== 1
    || closed.length !== 1 || closed[0]!.at !== Date.parse(String(server.closedAt)) || timeout.length !== 1
    || !Number.isSafeInteger(timeoutSeconds) || timeoutSeconds <= 0 || timeout[0]!.at - disconnect[0]!.at < timeoutSeconds * 1000
    || !orderedTimes(disconnect[0]!.time, timeout[0]!.time, closed[0]!.time, admin.closedAt)) throw Error("TECHNICAL_NATIVE_TIMEOUT_UNCONFIRMED")
  for (const [message, expected] of [["Инициализирована сессия для пользователя ", admin.createdAt], ["Закрыта сессия для пользователя ", admin.closedAt]]) {
    const rows = ledger.filter((row) => row.name === admin.name && row.message.startsWith(String(message)))
    if (rows.at(-1)?.at !== Date.parse(String(expected))) throw Error("TECHNICAL_ADMIN_RELEASE_UNBOUND")
  }
  if (!Array.isArray(proof.snapshots) || proof.snapshots.length !== 2 || proof.snapshots[0] === proof.snapshots[1])
    throw Error("TECHNICAL_ACCOUNT_SNAPSHOTS_UNBOUND")
  for (const snapshot of proof.snapshots) {
    const text = await Bun.file(await file(snapshot)).text()
    const rows = text.split(/\r?\n/).filter((line) => /^\s*- row "/.test(line))
    if (!text.includes("Администрирование") || !text.includes("Диспетчер") || !text.includes("Сессии и пакеты")
      || !text.includes("- table") || !text.includes("- rowgroup") || !rows.some((row) => row.includes(String(admin.name)))
      || !rows.some((row) => row.includes("Общие пакеты")) || !rows.some((row) => row.includes("Пул пакетов"))
      || text.includes(String(value.account) + ":")) throw Error("TECHNICAL_ACCOUNT_SNAPSHOTS_UNBOUND")
  }
}

export async function selectionPackageCleanup(directory: string) {
  const names = (await Promise.all(["package-cleanup.json", "saved-package-cleanup.json"].map(async (name) =>
    await exists(path.join(directory, name)) ? name : null))).filter((name): name is string => name !== null)
  if (names.length !== 1) throw Error(names.length ? "PACKAGE_CLOSE_AMBIGUOUS" : "PACKAGE_CLOSE_UNCONFIRMED")
  const name = names[0]!
  const file = await boundFile(directory, name)
  const cleanup = object(await Bun.file(file).json())
  if (name === "saved-package-cleanup.json" ? cleanup.policy !== "last_confirmed_own_save" : cleanup.policy !== undefined)
    throw Error("PACKAGE_CLOSE_POLICY_UNSUPPORTED")
  return { name, cleanup }
}

async function boundFile(root: string, relative: string, expected?: unknown, immutable = false) {
  if (!relative || path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === ".."))
    throw Error("TECHNICAL_PATH_INVALID")
  const file = path.join(root, relative), stat = await lstat(file)
  if (!stat.isFile() || await realpath(root) !== root || await realpath(file) !== file
    || immutable && stat.mode & 0o222) throw Error("TECHNICAL_FILE_UNSEALED")
  if (expected !== undefined && (!digest(expected) || await hash(file) !== expected)) throw Error("TECHNICAL_FILE_CHANGED")
  return file
}
async function hash(file: string) { return createHash("sha256").update(await Bun.file(file).bytes()).digest("hex") }
async function lines(file: string): Promise<unknown[]> { return (await Bun.file(file).text()).split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown) }
async function exists(file: string) { return lstat(file).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return false; throw error }) }
function object(value: unknown): Record<string, unknown> { if (!record(value)) throw Error("TECHNICAL_EVIDENCE_INVALID"); return value }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.length > 0 }
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) }
function pid(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 }
function orderedTimes(...values: unknown[]) { return values.every((value, index) => typeof value === "string" && Number.isFinite(Date.parse(value))
  && (index === 0 || Date.parse(value) >= Date.parse(String(values[index - 1])))) }
