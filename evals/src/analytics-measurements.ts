import path from "node:path"
import { constants } from "node:fs"
import { open, readFile, realpath, readdir, lstat } from "node:fs/promises"

export async function exclusiveFact(file: string, value: unknown) {
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    .catch(error => { if (error.code === "EEXIST") return; throw error })
  if (!handle) return false
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync() }
  finally { await handle.close() }
  const directory = await open(path.dirname(file), constants.O_RDONLY | constants.O_DIRECTORY)
  try { await directory.sync() } finally { await directory.close() }
  return true
}

type Identity = { account_id: string; user_id: string; role: string }
export type ActorMemory = { scope: "actor"; userRoot: string; peerRoot: string; identity: Identity }
type Entry = { uri: string; name: string; isDir: boolean }
export async function snapshotActor(memory: ActorMemory, base: string, token: string) {
  if (memory.scope !== "actor" || memory.userRoot !== `viking://user/${memory.identity.user_id}` ||
    !memory.peerRoot.startsWith(memory.userRoot + "/peers/") || memory.peerRoot.slice((memory.userRoot + "/peers/").length).includes("/")) throw Error("MEMORY_SCOPE")
  const missingPeer = Symbol("missingPeer")
  const get = async (route: string, params: Record<string, string> = {}) => {
    const url = new URL(route, base)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) })
    if (!response.ok) {
      if (response.status === 404 && route === "/api/v1/fs/ls" && params.uri === memory.peerRoot) {
        const missing = await response.json()
        if (missing.status === "error" && missing.error?.code === "NOT_FOUND") return missingPeer
      }
      throw Error("MEMORY_HTTP")
    }
    return response.json()
  }
  const health = await get("/health")
  if (health.healthy !== true || Object.entries(memory.identity).some(([key, value]) => health[key] !== value)) throw Error("MEMORY_IDENTITY")
  const list = async (uri: string): Promise<Entry[] | null> => {
    const doc = await get("/api/v1/fs/ls", { uri, output: "original", show_all_hidden: "true", recursive: "false", node_limit: "10000" })
    if (doc === missingPeer) return null
    if (!doc || doc.status !== "ok" || !Array.isArray(doc.result) || doc.result.length >= 10000 || doc.truncated || doc.has_more) throw Error("MEMORY_INCOMPLETE_LIST")
    const entries = doc.result as Entry[]
    if (entries.some(item => typeof item.isDir !== "boolean" || typeof item.name !== "string" || item.name.includes("/") || item.name === "." || item.name === ".." || item.uri !== uri + "/" + item.name)) throw Error("MEMORY_ENTRY")
    if (new Set(entries.map(item => item.uri)).size !== entries.length) throw Error("MEMORY_DUPLICATE")
    return entries.sort((a, b) => a.uri.localeCompare(b.uri))
  }
  const read = async (uri: string) => {
    const doc = await get("/api/v1/content/read", { uri, raw: "true", limit: "-1" })
    if (doc.status !== "ok" || typeof doc.result !== "string" || doc.truncated || doc.has_more) throw Error("MEMORY_INCOMPLETE_READ")
    return doc.result as string
  }
  const user = await list(memory.userRoot), peer = await list(memory.peerRoot)
  const roots = [memory.userRoot + "/memories", ...(peer === null ? [] : [memory.peerRoot + "/memories"])]
  if (!user || ![user, ...(peer === null ? [] : [peer])].every(entries => entries.some(item => item.name === "memories" && item.isDir))) throw Error("MEMORY_ROOT_MISSING")
  const directories: Record<string, Entry[]> = {}, files: Record<string, string> = {}, peer_metadata: Record<string, string> = {}
  const queue = [...roots]
  while (queue.length) {
    const uri = queue.shift()!
    if (directories[uri]) throw Error("MEMORY_CYCLE")
    const entries = await list(uri)
    if (!entries) throw Error("MEMORY_ROOT_MISSING")
    directories[uri] = entries
    for (const item of directories[uri]) {
      if (item.isDir) queue.push(item.uri)
      else files[item.uri] = await read(item.uri)
    }
  }
  for (const item of [...user, ...(peer ?? [])].filter(item => !item.isDir)) peer_metadata[item.uri] = await read(item.uri)
  return { identity: memory.identity, roots, peers_entries: peer === null ? [] : [{ uri: memory.peerRoot, name: memory.peerRoot.split("/").at(-1), isDir: true }],
    peer_root_entries: peer === null ? {} : { [memory.peerRoot]: peer }, directories, files, peer_metadata }
}

export type MeasurementJob = { id: string; form: string; taskId: string; tasksDir: string; unit: string; resultsDir: string; retryBindings?: { unit: string; resultsDir: string }[] }
export async function freezeMeasurementInputs(file: string, manifestHash: string, jobs: MeasurementJob[]) {
  const { agentInputsHash, loadTasks, rubricHash } = await import("./task")
  const pins = await Promise.all(jobs.map(async job => {
    const tasks = await loadTasks(job.tasksDir, [job.taskId])
    return { job: job.id, inputs: await agentInputsHash(tasks), rubric: await rubricHash(tasks) }
  }))
  await exclusiveFact(file, { manifestHash, pins })
  const frozen = await Bun.file(file).json()
  if (frozen.manifestHash !== manifestHash || JSON.stringify(frozen.pins) !== JSON.stringify(pins)) throw Error("TASK_PINS_CHANGED")
}
type NativeJournal = { version: number; kind: string; commandId: string; runDir: string; identity: { serverEpoch: string; containerId: string }; unitBinding?: { unit: string; invocation: string; manager?: string }; slotIds: string[]; attempts: { purpose: string; taskId: string; slotId: string; attempt: number }[] }
export function measurementState(job: MeasurementJob, unit: Record<string, string>, value: unknown, entry?: { job: string; binding?: NativeJournal["unitBinding"] }) {
  if (unit.Id !== job.unit || unit.Delegate !== "no") return "hold"
  if (["active", "activating", "deactivating", "reloading"].includes(unit.ActiveState ?? "")) return "running"
  const journal = value as Partial<NativeJournal> | undefined
  if (unit.Id !== job.unit || unit.Delegate !== "no" || !journal || journal.version !== 2 || journal.kind !== "unactivated-preparation" ||
    !journal.runDir?.startsWith(job.resultsDir + path.sep) || journal.unitBinding?.unit !== job.unit ||
    typeof unit.InvocationID !== "string" || !journal.unitBinding.invocation || (unit.InvocationID && journal.unitBinding.invocation !== unit.InvocationID) || !Array.isArray(journal.attempts) || journal.attempts.some(item => !item || !["measurement", "preflight"].includes(item.purpose) || typeof item.taskId !== "string" || typeof item.slotId !== "string" || item.attempt !== 1)) return "hold"
  if (!["inactive", "failed"].includes(unit.ActiveState ?? "") || unit.MainPID !== "0" || unit.ControlGroup !== "") return "hold"
  const measured = journal.attempts.filter(item => item.purpose === "measurement")
  if (!unit.InvocationID && (entry?.job !== job.id || entry.binding?.manager !== "system" || JSON.stringify(entry.binding) !== JSON.stringify(journal.unitBinding) || !measured.length)) return "hold"
  if (!measured.length) return "zero-admissions"
  return measured.length === 1 && measured[0]?.taskId === job.taskId && measured[0].attempt === 1 ? "consumed" : "hold"
}

export type MeasurementManifest = {
  version: 1; kind: "analytics-measurements"; id: string; stateDir: string; controllerEnvFile: string; slotsFile: string; resourceBudgetFile: string
  pins: { controllerEnvSha256: string; slotsSha256: string; resourceBudgetSha256: string; cliBinarySha256: string; cliManifestSha256: string }
  memory: ActorMemory; jobs: MeasurementJob[]
}
export function validateManifest(value: unknown): MeasurementManifest {
  const manifest = value as MeasurementManifest
  if (!manifest || manifest.version !== 1 || manifest.kind !== "analytics-measurements" || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id) ||
    ![manifest.stateDir, manifest.controllerEnvFile, manifest.slotsFile, manifest.resourceBudgetFile].every(item => typeof item === "string" && path.isAbsolute(item)) ||
    !manifest.pins || ![manifest.pins.controllerEnvSha256, manifest.pins.slotsSha256, manifest.pins.resourceBudgetSha256, manifest.pins.cliBinarySha256, manifest.pins.cliManifestSha256].every(item => /^[a-f0-9]{64}$/.test(item)) ||
    !manifest.memory || manifest.memory.scope !== "actor" || !Array.isArray(manifest.jobs) || ![2, 8].includes(manifest.jobs.length)) throw Error("MANIFEST_INVALID")
  for (const job of manifest.jobs) if (!job || !/^[a-z0-9][a-z0-9-]*$/.test(job.id) || !/^[a-z0-9][a-z0-9-]*$/.test(job.taskId) ||
    !["business", "detailed"].includes(job.form) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.service$/.test(job.unit) ||
    ![job.tasksDir, job.resultsDir].every(item => typeof item === "string" && path.isAbsolute(item))) throw Error("MANIFEST_JOB_INVALID")
  for (const key of ["id", "unit", "resultsDir"] as const) if (new Set(manifest.jobs.map(job => job[key])).size !== manifest.jobs.length) throw Error("MANIFEST_JOB_DUPLICATE")
  const bindings = manifest.jobs.flatMap(job => {
    if (job.retryBindings !== undefined && (!Array.isArray(job.retryBindings) || job.retryBindings.length > 3)) throw Error("MANIFEST_RETRY_INVALID")
    return [job, ...(job.retryBindings ?? [])]
  })
  for (const binding of bindings) if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.service$/.test(binding.unit) || typeof binding.resultsDir !== "string" || !path.isAbsolute(binding.resultsDir) || path.resolve(binding.resultsDir) !== binding.resultsDir) throw Error("MANIFEST_RETRY_INVALID")
  if (new Set(bindings.map(binding => binding.unit)).size !== bindings.length || bindings.some((binding, index) => bindings.some((other, at) => at !== index && (binding.resultsDir === other.resultsDir || binding.resultsDir.startsWith(other.resultsDir + path.sep))))) throw Error("MANIFEST_BINDING_DUPLICATE")
  return manifest
}

type RecoveryMetadata = { sessionId: string; clientRevision: string; actionManifestDigest: string; targetIdentity: unknown; archiveActive: boolean; resultProfile: string }
type RecoveryCall = { tool: string; status: string; input: Record<string, unknown>; error?: string }
type RecoveryRecord = { phase?: string; session_id?: string; runtime_revision?: string; manifest_sha256?: string; target?: unknown
  attempt_id?: string; operation_id?: string; stopped?: boolean; tool?: string; arguments_sha256?: string; is_error?: boolean
  transport_error?: string | null; page?: { ok?: boolean; unknown?: boolean }; budget?: { calls_left: number; ms_left: number }
  status?: string; code?: string; reason?: string; cleanup?: { state?: string }; attested_by_model?: unknown; uncertain?: boolean }
export function recoveryToolsCovered(input: {
  calls: RecoveryCall[]; records: RecoveryRecord[]; metadata: RecoveryMetadata; qualifiedRevision: string
  isBrowserRecoveryTool: (name: string) => boolean; isRecoveryBrowserTool: (name: string) => boolean
}) {
  if (input.metadata.archiveActive !== false || input.metadata.resultProfile !== "user-v1" ||
    !input.metadata.sessionId || !/^[a-f0-9]{64}$/.test(input.qualifiedRevision) ||
    !/^[a-f0-9]{64}$/.test(input.metadata.actionManifestDigest) ||
    input.metadata.clientRevision !== input.qualifiedRevision) return false
  const phases = new Set(["browser_recovery_started", "browser_recovery_handoff", "browser_recovery_action",
    "browser_recovery_attested", "browser_recovery_verified", "browser_recovery_stopped"])
  const ledger = input.records.filter(row => phases.has(row.phase ?? ""))
  for (const row of ledger) {
    if (row.session_id !== input.metadata.sessionId || row.runtime_revision !== input.qualifiedRevision ||
      row.manifest_sha256 !== input.metadata.actionManifestDigest || JSON.stringify(row.target) !== JSON.stringify(input.metadata.targetIdentity) ||
      !row.attempt_id || !row.operation_id || row.uncertain === true) return false
  }
  let cursor = 0, current: { id: string; operation: string; calls: number; ms: number } | undefined
  const seen = new Set<string>()
  const require = (condition: unknown) => { if (!condition) throw Error("RECOVERY_LEDGER") }
  const take = (phase: string) => {
    const row = ledger[cursor++]
    require(row?.phase === phase)
    if (current) require(row!.attempt_id === current.id && row!.operation_id === current.operation)
    return row!
  }
  const stop = (code: string) => {
    require(current)
    const row = take("browser_recovery_stopped")
    require(row.code === code && row.cleanup?.state === "retained")
    require(row.budget && row.budget.calls_left === current!.calls && Number.isFinite(row.budget.ms_left) &&
      row.budget.ms_left >= 0 && row.budget.ms_left <= current!.ms)
    current = undefined
    return row
  }
  try {
    for (const call of input.calls) {
      const tool = call.tool.startsWith("loginom_") ? call.tool.slice(8) : ""
      require(input.isBrowserRecoveryTool(tool))
      // A native refusal is a proved non-execution, not a successful gesture.
      if (call.status === "error" && call.error) {
        let refusal: { refused?: unknown; uncertain?: unknown; page?: unknown } | undefined
        try { refusal = JSON.parse(call.error) } catch {}
        const executed = ledger[cursor]?.phase === "browser_recovery_action" && ledger[cursor]?.tool === tool &&
          ledger[cursor]?.arguments_sha256 === new Bun.CryptoHasher("sha256").update(JSON.stringify(call.input)).digest("hex")
        if (!executed && typeof refusal?.refused === "string" && refusal.refused && !refusal.uncertain && !refusal.page) continue
      }
      if (input.isRecoveryBrowserTool(tool)) {
        require(current)
        if (ledger[cursor]?.phase === "browser_recovery_stopped" && ledger[cursor]?.code === "budget_exhausted") {
          require(call.status === "completed")
          const row = stop("budget_exhausted")
          require(row.budget?.calls_left === 0 || row.budget?.ms_left === 0)
          continue
        }
        const row = take("browser_recovery_action")
        require(row.tool === tool && row.arguments_sha256 === new Bun.CryptoHasher("sha256").update(JSON.stringify(call.input)).digest("hex"))
        require(typeof row.is_error === "boolean" && row.transport_error === null && row.page?.ok === true && !row.page.unknown)
        require(call.status === (row.is_error ? "error" : "completed"))
        require(row.budget && row.budget.calls_left === current!.calls - 1 && row.budget.calls_left >= 0 &&
          Number.isFinite(row.budget.ms_left) && row.budget.ms_left >= 0 && row.budget.ms_left <= current!.ms)
        current!.calls = row.budget!.calls_left; current!.ms = row.budget!.ms_left
        continue
      }
      require(tool === "dock_browser_recovery" && call.status === "completed" && typeof call.input.operation_id === "string")
      if (call.input.action === "start") {
        require(!current)
        const row = take("browser_recovery_started")
        require(row.operation_id === call.input.operation_id && !seen.has(row.attempt_id!) && row.budget &&
          Number.isInteger(row.budget.calls_left) && row.budget.calls_left >= 0 && row.budget.calls_left <= 30 &&
          Number.isFinite(row.budget.ms_left) && row.budget.ms_left >= 0 && row.budget.ms_left <= 600000)
        seen.add(row.attempt_id!)
        current = { id: row.attempt_id!, operation: row.operation_id!, calls: row.budget!.calls_left, ms: row.budget!.ms_left }
        const handoff = take("browser_recovery_handoff")
        if (handoff.stopped !== true) stop("executor_not_stopped")
      } else {
        require(current?.operation === call.input.operation_id)
        if (call.input.action === "stop") {
          const row = stop("model_stopped")
          require(row.reason === (call.input.reason ?? "Stopped by the model."))
        } else {
          require(call.input.action === "finish")
          const attested = take("browser_recovery_attested")
          require(JSON.stringify(attested.attested_by_model) === JSON.stringify({
            actions_performed: call.input.actions_performed ?? [], expected_result: call.input.expected_result ?? null,
            browser_settings: call.input.browser_settings ?? [] }))
          const verified = take("browser_recovery_verified")
          require(["completed", "continuable", "unresolved"].includes(verified.status ?? ""))
          if (verified.status !== "unresolved") current = undefined
          else if (ledger[cursor]?.phase === "browser_recovery_stopped" && ledger[cursor]?.code === "unresolved") stop("unresolved")
        }
      }
    }
    // Runtime shutdown is automatic; a model_stopped record requires its explicit CLI stop above.
    if (current && ledger[cursor]?.phase === "browser_recovery_stopped") stop("runtime_closed")
    return !current && cursor === ledger.length
  } catch { return false }
}

export async function auditMeasurement(job: MeasurementJob, journalFile: string, slots: Pick<import("./slots").SlotFile, "slots" | "judge">) {
  const { confirmedProfileArchive } = await import("./profile-archive")
  const { assertProfileClean } = await import("./profile")
  const { parseEvents } = await import("./cli")
  const { Database } = await import("bun:sqlite")
  const { readResourceReservation } = await import("./lease")
  const json = (file: string) => Bun.file(file).json()
  const hash = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex")
  const journal = await json(journalFile) as NativeJournal
  const attempt = path.join(journal.runDir, job.taskId, "1"), slot = slots.slots[0]!
  const result = await json(path.join(attempt, "result.json")).catch(error => { if (error.code === "ENOENT") return null; throw error })
  const rawOutcome = result ? Object.fromEntries(["status", "score", "pass", "judge_status", "oracle_pass", "exit_code", "timed_out", "interrupted", "failure_kind", "environment_cleanup"].map(key => [key, result[key]])) : null
  const checks: { name: string; passed: boolean }[] = [], unavailable: string[] = []
  const must = (value: unknown) => { if (!value) throw Error("AUDIT_CHECK_FAILED") }
  const check = async (name: string, work: () => Promise<void>) => {
    try { await work(); checks.push({ name, passed: true }) }
    catch { checks.push({ name, passed: false }) }
  }
  await check("native_cleanup_archive_models_tools", async () => {
    const config = await json(path.join(journal.runDir, "config.json")), summary = await json(path.join(journal.runDir, "summary.json")), cleanup = await json(path.join(attempt, "cleanup.json"))
    must(config.commandJournal === journalFile && summary.task_ids?.length === 1 && summary.task_ids[0] === job.taskId && journal.slotIds.length === 1 && journal.slotIds[0] === slot.id)
    must(cleanup.processes?.status === "confirmed" && cleanup.processes.capture_complete === true && cleanup.serverSessions === "confirmed" && cleanup.storageDeletionAllowed === true && cleanup.nextAdmissionAllowed === true)
    must(summary.slots?.length === 1 && summary.slots[0].state === "closed" && Array.isArray(summary.storage_leftovers) && summary.storage_leftovers.length === 0 && summary.resources?.status === "passed")
    const archive = await confirmedProfileArchive(attempt, slot.profileDir, slot.historyDir)
    const eventsText = await Bun.file(path.join(attempt, "events.jsonl")).text()
    const events = parseEvents(eventsText), run = await json(path.join(attempt, "run.json"))
    must(events.sessionId && events.sessionId === run.sessionId && (!result || events.sessionId === result.session_id) && JSON.stringify(events.counters) === JSON.stringify(run.counters))
    must(events.counters.memoryToolCalls === 0)
    const db = new Database(path.join(archive, "data/loginom-ai-agent.db"), { readonly: true })
    try {
      const rows = db.query("SELECT json_extract(data,'$.providerID') providerID,json_extract(data,'$.modelID') modelID,json_extract(data,'$.variant') variant FROM message WHERE session_id=? AND json_extract(data,'$.role')='assistant'").all(events.sessionId!) as { providerID: string; modelID: string; variant: string }[]
      if (!rows.length && (!result || result.score === null)) unavailable.push("assistant_model")
      else must(rows.length && rows.every(row => row.providerID === "openai" && row.modelID === "gpt-6.1-terra" && row.variant === "high"))
    } finally { db.close() }
    const catalogNames = new Set<string>()
    const runtimeEvidence: { metadata: RecoveryMetadata; file: string }[] = []
    let runtimes = 0
    for await (const relative of new Bun.Glob("loginom/runtime/**/session.json").scan({ cwd: archive, onlyFiles: true })) {
      const metadata = await json(path.join(archive, relative)), catalog = await json(path.join(archive, path.dirname(relative), "tools.json")) as { name: string }[]
      must(metadata.archiveActive === false && metadata.resultProfile === "user-v1" && Array.isArray(catalog))
      must(JSON.stringify(catalog.map(item => item.name).filter(name => !name.startsWith("dock_")).sort()) === JSON.stringify(["find", "glob", "grep", "list", "read", "search", "tree"]))
      catalog.forEach(item => catalogNames.add(item.name)); runtimes++
      runtimeEvidence.push({ metadata, file: path.join(archive, path.dirname(relative), "execution-events.jsonl") })
    }
    must(runtimes > 0)
    const { verifyAdminRuntime } = await import("./preflight")
    const { pathToFileURL } = await import("node:url")
    const qualified = await verifyAdminRuntime(config.agent.cliBin)
    const contract = await import(pathToFileURL(path.join(qualified.resources, "runtime/client/lib/browser-recovery.mjs")).href)
    must(contract.browserRecoveryToolName === "dock_browser_recovery" &&
      typeof contract.isBrowserRecoveryTool === "function" && typeof contract.isRecoveryBrowserTool === "function")
    must(events.tools.every(item => !item.tool.startsWith("loginom_") || catalogNames.has(item.tool.slice(8)) ||
      contract.isBrowserRecoveryTool(item.tool.slice(8))))
    const calls = eventsText.split("\n").filter(Boolean).flatMap(line => {
      const event = JSON.parse(line) as { type?: string; part?: { tool?: string; state?: { status?: string; input?: Record<string, unknown>; error?: string } } }
      const part = event.part
      return event.type === "tool_use" && part?.tool?.startsWith("loginom_") && contract.isBrowserRecoveryTool(part.tool.slice(8))
        ? [{ tool: part.tool, status: part.state?.status ?? "?", input: part.state?.input ?? {}, error: part.state?.error }] : []
    })
    if (calls.length) {
      must(runtimes === 1)
      const evidence = runtimeEvidence[0]!
      const records = (await Bun.file(evidence.file).text()).split("\n").filter(Boolean).map(line => JSON.parse(line) as RecoveryRecord)
      const clientUrl = pathToFileURL(path.join(qualified.resources, "runtime/client/lib/session.mjs"))
      const { createRuntimeSourcePin } = await import(new URL("./runtime-pin.mjs", clientUrl).href)
      // Reproduce the managed client's pin from the verified bundle, including every executable lib module.
      const sourcePin = await createRuntimeSourcePin(clientUrl, ["../.node-version", "../package.json", "../package-lock.json"])
      must(JSON.stringify(sourcePin.manifest) === JSON.stringify((evidence.metadata as RecoveryMetadata & { clientSourceManifest: unknown }).clientSourceManifest))
      must(recoveryToolsCovered({ calls, records, metadata: evidence.metadata, qualifiedRevision: sourcePin.revision,
        isBrowserRecoveryTool: contract.isBrowserRecoveryTool, isRecoveryBrowserTool: contract.isRecoveryBrowserTool }))
    }
    const readyAttempt = path.join(journal.runDir, `request-preflight-${slot.id}`, "1"), ready = await json(path.join(journal.runDir, "request-preflight.json")), readyCleanup = await json(path.join(readyAttempt, "cleanup.json"))
    must(ready.code === null && readyCleanup.processes?.status === "confirmed" && readyCleanup.processes.capture_complete === true && readyCleanup.nextAdmissionAllowed === true)
    const readyEvents = parseEvents(await Bun.file(path.join(readyAttempt, "events.jsonl")).text())
    must(readyEvents.counters.toolCalls === 0 && readyEvents.counters.memoryToolCalls === 0)
    const proof = await json(summary.slots[0].cleanup_receipt), leaseFile = summary.slots[0].lease_receipt, lease = await json(leaseFile), closure = await json(lease.cleanupReceipt)
    must(proof.status === "confirmed" && proof.slotId === slot.id && proof.archive === "committed" && proof.profileArchive === archive && proof.serverSessions === "confirmed")
    must(lease.state === "released" && lease.commandId === journal.commandId && lease.journal === journalFile && closure.leaseToken === lease.token)
    must(lease.resources?.length === 1 && lease.resources[0].key === "profile:" + slot.profileDir)
    const verifyRelease = async (key: string, file: string) => {
      const release = await json(file), current = await readResourceReservation({ key })
      must(release.version === 2 && release.status === "confirmed" && release.key === key && current?.state === "released" && current.commandId === journal.commandId && current.journal === journalFile && current.token === release.token && current.revision === release.revision && current.releaseEvidence?.path === file && current.releaseEvidence.sha256 === hash(JSON.stringify(release)))
      return release
    }
    const resource = lease.resources[0], release = await verifyRelease(resource.key, leaseFile + "." + hash(resource.key) + ".released.json")
    must(release.slotReceipt === leaseFile && release.cleanupReceipt === lease.cleanupReceipt && release.cleanupReceiptHash === hash(JSON.stringify(closure)) && release.token === resource.token && release.revision === resource.revision && release.serverEpoch === journal.identity.serverEpoch)
    for (const [kind, key] of [["server", "server:" + journal.identity.containerId], ["judge", "judge:" + slots.judge.codexHome]]) await verifyRelease(key!, path.join(path.dirname(journalFile), `cleanup-${journal.commandId}-${kind}.json`))
    await assertProfileClean(slot.profileDir)
  })
  return { version: 1, kind: "analytics-measurement-audit", job: job.id, runDir: journal.runDir, journalFile, rawOutcome,
    outcomeAvailable: result !== null, unavailable, checks, status: checks.every(item => item.passed) ? "PASS" : "INCOMPLETE" }
}

export async function measurementRetrySources(job: MeasurementJob, unit: Record<string, string>, nativeFile: string, entryFile: string, manifestHash: string) {
  const native = await Bun.file(nativeFile).json(), entry = await Bun.file(entryFile).json()
  if (measurementState(job, unit, native) !== "zero-admissions" || entry.manifestHash !== manifestHash || entry.job !== job.id ||
    entry.binding?.manager !== "system" || JSON.stringify(entry.binding) !== JSON.stringify(native.unitBinding)) throw Error("RETRY_SOURCE_UNCONFIRMED")
  return Promise.all([nativeFile, entryFile].map(async file => ({ file, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex") })))
}

type FilePin = { file: string; sha256: string }
export async function prejournalBudgetRetrySources(input: {
  job: MeasurementJob; unit: Record<string, string>; stateDir: string; manifestHash: string; generation: number
  budgetFile: string; budgetSha256: string; entryFile: string; intentFile: string; proofFile: string
  authoritativeJournal: Record<string, string>[]
}) {
  const { readLeaseReceipt } = await import("./lease")
  const hash = (bytes: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
  const fail = () => { throw Error("PREJOURNAL_BUDGET_REFUSAL_UNCONFIRMED") }
  const sources: FilePin[] = []
  const pinned = async (ref: FilePin) => {
    if (!ref || !path.isAbsolute(ref.file) || !/^[a-f0-9]{64}$/.test(ref.sha256) || await realpath(ref.file) !== ref.file) return fail()
    const info = await lstat(ref.file)
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || ![0o400, 0o600].includes(info.mode & 0o777)) return fail()
    const bytes = await readFile(ref.file)
    if (hash(bytes) !== ref.sha256) throw Error("RETRY_EVIDENCE_CHANGED")
    sources.push(ref)
    return bytes.toString()
  }
  const proof = await Bun.file(input.proofFile).json()
  if (proof.version !== 1 || proof.kind !== "post-exit-budget-refusal" || proof.manifestHash !== input.manifestHash ||
    proof.job !== input.job.id || proof.generation !== input.generation || !Number.isInteger(input.generation) || input.generation < 0 || input.generation > 3) return fail()
  await pinned({ file: input.proofFile, sha256: hash(await readFile(input.proofFile)) })
  const entry = await readLeaseReceipt(input.entryFile) as { manifestHash: string; job: string; binding: import("./process-supervisor").UnitBinding }
  const intent = await readLeaseReceipt(input.intentFile) as { manifestHash: string; job: string; unit: string; resultsDir: string }
  const binding = entry.binding, unit = input.unit
  if (entry.manifestHash !== input.manifestHash || entry.job !== input.job.id || intent.manifestHash !== input.manifestHash ||
    intent.job !== input.job.id || intent.unit !== input.job.unit || intent.resultsDir !== input.job.resultsDir ||
    !binding || binding.manager !== "system" || binding.unit !== input.job.unit || unit.Id !== input.job.unit ||
    !/^[a-f0-9]{32}$/.test(binding.invocation) || unit.InvocationID !== binding.invocation ||
    !["failed", "inactive"].includes(unit.ActiveState ?? "") || unit.MainPID !== "0" || unit.ControlGroup !== "" ||
    unit.Restart !== "no" || unit.Delegate !== "no" || unit.ExecMainStatus !== "1" ||
    binding.cgroup !== "/system.slice/" + input.job.unit || !binding.producer || binding.producer.uid !== process.getuid?.() ||
    !Number.isSafeInteger(binding.producer.pid) || binding.producer.pid < 1 || !/^\d+$/.test(binding.producer.starttime) ||
    binding.bootId !== (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim()) return fail()
  if (await lstat("/sys/fs/cgroup" + binding.cgroup).catch(error => { if (error.code === "ENOENT") return; throw error })) return fail()
  const producer = await readFile("/proc/" + binding.producer.pid + "/stat", "utf8").catch(error => { if (error.code === "ENOENT") return; throw error })
  if (producer && producer.slice(producer.lastIndexOf(")") + 2).split(" ")[19] === binding.producer.starttime) return fail()
  const results = await lstat(input.job.resultsDir)
  if (!results.isDirectory() || results.uid !== process.getuid?.() || (results.mode & 0o777) !== 0o700 ||
    await realpath(input.job.resultsDir) !== input.job.resultsDir || (await readdir(input.job.resultsDir)).length) return fail()
  for (const file of await readdir(input.stateDir)) {
    if (!/^run-command-.*\.json$/.test(file)) continue
    const native = await Bun.file(path.join(input.stateDir, file)).json()
    if (native.version !== 2 || native.kind !== "unactivated-preparation" || typeof native.runDir !== "string" ||
      !Array.isArray(native.attempts) || native.runDir.startsWith(input.job.resultsDir + path.sep))
      throw Error("PREJOURNAL_NATIVE_PRESENT")
  }
  const source = JSON.parse(await pinned(proof.sourcePins))
  const metadata = JSON.parse(await pinned(proof.budgetMetadata))
  const journal = (await pinned(proof.journal)).trim().split("\n").map(line => JSON.parse(line) as Record<string, string>)
  if (source.sourceRevision !== proof.sourceRevision || !/^[a-f0-9]{40}$/.test(proof.sourceRevision) ||
    source.manifestSha256 !== input.manifestHash || source.pins?.resourceBudgetSha256 !== input.budgetSha256 ||
    metadata.resourceBudgetSha256 !== input.budgetSha256 || !/^0o[0-7]{3}$/.test(metadata.mode) || metadata.mode === "0o600" ||
    metadata.uid !== binding.producer.uid || metadata.nlink !== 1 || metadata.originalWorkerInvocation !== binding.invocation ||
    metadata.resultsDirectoryEmpty !== true) return fail()
  await readLeaseReceipt(input.budgetFile)
  await pinned({ file: input.budgetFile, sha256: input.budgetSha256 })
  const normalized = (rows: Record<string, string>[]) => rows.map(row => JSON.stringify(Object.entries(row).sort())).sort()
  if (!journal.length || JSON.stringify(normalized(journal)) !== JSON.stringify(normalized(input.authoritativeJournal)) ||
    new Set(journal.map(row => row.__CURSOR)).size !== journal.length ||
    journal.some(row => !row.__CURSOR || row._BOOT_ID !== binding.bootId.replaceAll("-", "") ||
      (row._SYSTEMD_INVOCATION_ID || row.INVOCATION_ID) !== binding.invocation ||
      (row.UNIT || row._SYSTEMD_UNIT) !== binding.unit)) return fail()
  const refusals = journal.filter(row => row.MESSAGE === "LEASE_FILE_PRIVATE")
  if (refusals.length !== 1 || refusals[0]!._PID !== String(binding.producer.pid) ||
    refusals[0]!._UID !== String(binding.producer.uid) || refusals[0]!._SYSTEMD_UNIT !== binding.unit ||
    refusals[0]!._SYSTEMD_CGROUP !== binding.cgroup ||
    !journal.some(row => row._PID === "1" && row._UID === "0" && row.UNIT === binding.unit && row.EXIT_CODE === "exited" && row.EXIT_STATUS === "1")) return fail()
  // Only the reviewed source boundary that reads the private budget before native admission.
  const boundaries: Record<string, string[]> = {
    "evals/src/prepared-run.ts": ["7ca3634462b0c4522bc18cba8006e881c547ca5f751a5cad13869fcce7c6d329", "50e6ab50ec1722f1a91535da2d8da85af877e6d3937c55c2035087b99eb515e9"],
    "evals/src/lease.ts": ["ca5344f927acdfd140718bbc5ac006eb1291081414891116caf5c6d8715a81a8"],
  }
  const executionSources = proof.executionSources as (FilePin & { repositoryPath: string })[]
  if (!Array.isArray(executionSources) || executionSources.length !== 2 || new Set(executionSources.map(ref => ref.repositoryPath)).size !== 2) return fail()
  for (const ref of executionSources) {
    if (!boundaries[ref.repositoryPath]?.includes(ref.sha256)) return fail()
    const blob = Bun.spawn(["git", "show", proof.sourceRevision + ":" + ref.repositoryPath], {
      cwd: path.resolve(import.meta.dir, "../.."), stdout: "pipe", stderr: "ignore", timeout: 10000,
    })
    const [code, bytes] = await Promise.all([blob.exited, new Response(blob.stdout).arrayBuffer()])
    if (code || hash(new Uint8Array(bytes)) !== ref.sha256) return fail()
    await pinned(ref)
  }
  for (const file of [input.entryFile, input.intentFile]) await pinned({ file, sha256: hash(await readFile(file)) })
  return sources
}

export async function verifyMeasurementRetryProof(file: string, manifestHash: string, job: string, generation: number) {
  const proof = await Bun.file(file).json()
  if (proof.manifestHash !== manifestHash || proof.job !== job || proof.generation !== generation || !Array.isArray(proof.sources) || proof.sources.length < 2 || !Array.isArray(proof.releases)) throw Error("RETRY_PROOF_UNCONFIRMED")
  for (const source of [...proof.sources, ...proof.releases]) {
    if (typeof source.file !== "string" || !path.isAbsolute(source.file) || new Bun.CryptoHasher("sha256").update(await Bun.file(source.file).bytes()).digest("hex") !== source.sha256) throw Error("RETRY_EVIDENCE_CHANGED")
  }
}

export async function measurementRetryReleases(keys: string[], lockRoot?: string) {
  const { readResourceReservation } = await import("./lease")
  const releases: { file: string; sha256: string }[] = []
  for (const key of keys) {
    const reservation = await readResourceReservation({ key, lockRoot })
    if (!reservation && key.startsWith("judge:")) continue
    if (reservation?.state !== "released" || !reservation.releaseEvidence) throw Error("RETRY_RELEASE_UNCONFIRMED")
    const file = reservation.releaseEvidence.path
    if (new Bun.CryptoHasher("sha256").update(JSON.stringify(await Bun.file(file).json())).digest("hex") !== reservation.releaseEvidence.sha256) throw Error("RETRY_RELEASE_UNCONFIRMED")
    releases.push({ file, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex") })
  }
  return releases
}
