import path from "node:path"
import { constants } from "node:fs"
import { open } from "node:fs/promises"

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
  const get = async (route: string, params: Record<string, string> = {}) => {
    const url = new URL(route, base)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw Error("MEMORY_HTTP")
    return response.json()
  }
  const health = await get("/health")
  if (health.healthy !== true || Object.entries(memory.identity).some(([key, value]) => health[key] !== value)) throw Error("MEMORY_IDENTITY")
  const list = async (uri: string): Promise<Entry[]> => {
    const doc = await get("/api/v1/fs/ls", { uri, output: "original", show_all_hidden: "true", recursive: "false", node_limit: "10000" })
    if (doc.status !== "ok" || !Array.isArray(doc.result) || doc.result.length >= 10000 || doc.truncated || doc.has_more) throw Error("MEMORY_INCOMPLETE_LIST")
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
  const roots = [memory.userRoot + "/memories", memory.peerRoot + "/memories"]
  if (![user, peer].every(entries => entries.some(item => item.name === "memories" && item.isDir))) throw Error("MEMORY_ROOT_MISSING")
  const directories: Record<string, Entry[]> = {}, files: Record<string, string> = {}, peer_metadata: Record<string, string> = {}
  const queue = [...roots]
  while (queue.length) {
    const uri = queue.shift()!
    if (directories[uri]) throw Error("MEMORY_CYCLE")
    directories[uri] = await list(uri)
    for (const item of directories[uri]) {
      if (item.isDir) queue.push(item.uri)
      else files[item.uri] = await read(item.uri)
    }
  }
  for (const item of [...user, ...peer].filter(item => !item.isDir)) peer_metadata[item.uri] = await read(item.uri)
  return { identity: memory.identity, roots, peers_entries: [{ uri: memory.peerRoot, name: memory.peerRoot.split("/").at(-1), isDir: true }],
    peer_root_entries: { [memory.peerRoot]: peer }, directories, files, peer_metadata }
}

export type MeasurementJob = { id: string; form: string; taskId: string; tasksDir: string; unit: string; resultsDir: string }
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
type NativeJournal = { version: number; kind: string; commandId: string; runDir: string; identity: { serverEpoch: string; containerId: string }; unitBinding?: { unit: string; invocation: string }; slotIds: string[]; attempts: { purpose: string; taskId: string; slotId: string; attempt: number }[] }
export function measurementState(job: MeasurementJob, unit: Record<string, string>, value: unknown) {
  const journal = value as Partial<NativeJournal> | undefined
  if (unit.Id !== job.unit || unit.Delegate !== "no" || !journal || journal.version !== 2 || journal.kind !== "unactivated-preparation" ||
    !journal.runDir?.startsWith(job.resultsDir + path.sep) || journal.unitBinding?.unit !== job.unit ||
    !unit.InvocationID || journal.unitBinding.invocation !== unit.InvocationID || !Array.isArray(journal.attempts) || journal.attempts.some(item => !item || !["measurement", "preflight"].includes(item.purpose) || typeof item.taskId !== "string" || typeof item.slotId !== "string" || item.attempt !== 1)) return "hold"
  if (["active", "activating", "deactivating", "reloading"].includes(unit.ActiveState ?? "")) return "running"
  if (!["inactive", "failed"].includes(unit.ActiveState ?? "") || unit.MainPID !== "0" || unit.ControlGroup !== "") return "hold"
  const measured = journal.attempts.filter(item => item.purpose === "measurement")
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
  return manifest
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
    const events = parseEvents(await Bun.file(path.join(attempt, "events.jsonl")).text()), run = await json(path.join(attempt, "run.json"))
    must(events.sessionId && events.sessionId === run.sessionId && (!result || events.sessionId === result.session_id) && JSON.stringify(events.counters) === JSON.stringify(run.counters))
    must(events.counters.memoryToolCalls === 0)
    const db = new Database(path.join(archive, "data/loginom-ai-agent.db"), { readonly: true })
    try {
      const rows = db.query("SELECT json_extract(data,'$.providerID') providerID,json_extract(data,'$.modelID') modelID,json_extract(data,'$.variant') variant FROM message WHERE session_id=? AND json_extract(data,'$.role')='assistant'").all(events.sessionId!) as { providerID: string; modelID: string; variant: string }[]
      if (!rows.length && (!result || result.score === null)) unavailable.push("assistant_model")
      else must(rows.length && rows.every(row => row.providerID === "openai" && row.modelID === "gpt-6.1-terra" && row.variant === "high"))
    } finally { db.close() }
    const catalogNames = new Set<string>()
    let runtimes = 0
    for await (const relative of new Bun.Glob("loginom/runtime/**/session.json").scan({ cwd: archive, onlyFiles: true })) {
      const metadata = await json(path.join(archive, relative)), catalog = await json(path.join(archive, path.dirname(relative), "tools.json")) as { name: string }[]
      must(metadata.archiveActive === false && metadata.resultProfile === "user-v1" && Array.isArray(catalog))
      must(JSON.stringify(catalog.map(item => item.name).filter(name => !name.startsWith("dock_")).sort()) === JSON.stringify(["find", "glob", "grep", "list", "read", "search", "tree"]))
      catalog.forEach(item => catalogNames.add(item.name)); runtimes++
    }
    must(runtimes > 0 && events.tools.every(item => !item.tool.startsWith("loginom_") || catalogNames.has(item.tool.slice(8))))
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
