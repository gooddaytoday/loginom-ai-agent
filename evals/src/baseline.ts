import path from "node:path"
import { chmod, cp, lstat, mkdir, open, readdir, readFile, readlink, realpath, rename, rm, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { loadTasks } from "./task"
import { aggregate, aggregateTask, type AttemptResult, type RunSummary } from "./report"
import { validateNodeRun } from "./node-evals"
import { parseArgs } from "node:util"
import type { NodeOpsConfig, NodeStandLease } from "./node-eval-ops"
import { dockSkillRevision } from "./preflight"
import { compareCsv, parseCsv } from "./oracle"
import type { AgentRun } from "./cli"

export type BaselinePins = {
  mode: "live" | "fixture"; harnessSha: string; corpusSha: string; cliVersion: string; cliSource: string
  cliManifestSha256: string; binarySha256: string; model: string; variant: string; judgeModel: string; judgeReasoning: string
  threshold: number; timeoutMs: number; judgeTimeoutMs: number; promptSha256: string; schemaSha256: string
  opsConfigSha256: string; isolationSha256: string; endpoint: string; containerId: string; imageDigest: string; dockRevision: string
}
export type BaselineCollection = "regular" | "analytic" | "node"
type BaselineCase = { key: string; id: string; collection: BaselineCollection; directory: string; files: { path: string; sha256: string }[] }
export type BaselineManifest = { version: 1; id: string; kind: "baseline" | "smoke"; createdAt: string; pins: BaselinePins
  infraRetries: 0 | 1
  cases: BaselineCase[]; jobs: { key: string; caseKey: string; attempt: number }[]
  smokeOracle?: { caseKey: string; inputSha256: string; expectedCsv: string } }
type RecordedRun = { runDir: string; runId: string; files: { path: string; sha256: string }[]; measured: boolean; cleanup: boolean; verdict: "PASS" | "FAIL" | "ERROR"; judgeDurationMs?: number }
type BaselineRow = { key: string; caseKey: string; attempt: number; collection: BaselineCollection; state: "pending" | "running" | "recorded"
  measured: boolean; cleanup: boolean; verdict: RecordedRun["verdict"] | null; runDir: string | null; result: AttemptResult | null }
type BaselineExecution = { key: string; caseKey: string; attempt: number; kind: "product" | "judge"; record: RecordedRun; result: AttemptResult }
type BaselineRelease = { status: "RELEASED"; evidenceSha256: string; receiptPath?: string; receiptSha256?: string; abandoned?: { reason: string; at: string } }
type RecoveryEvidence = { version: 1; baselineId: string; jobKey: string; executionId: string; executionFilesSha256: string
  kind: "infrastructure" | "judge"; cause: string; fix: { id: string; files: { path: string; sha256: string }[] }
  validation: { path: string; sha256: string }; taskId: string; runId: string }
type BaselineRecovery = { id: string; kind: RecoveryEvidence["kind"]; state: "admitted" | "running" | "recorded"
  sourceExecutionId: string; sourceRunDir: string; evidencePath: string; evidenceSha256: string; evidenceFiles: { path: string; sha256: string }[]
  cause: string; taskId: string; runId: string; record?: RecordedRun }
type BaselineJournal = { version: 1; manifestSha256: string; checkout: string; release?: BaselineRelease
  jobs: { key: string; state: "pending" | "running" | "recorded"; dispatchedAt?: string; record?: RecordedRun; recoveries?: BaselineRecovery[] }[] }
type SmokeAdmission = { version: 1; issue: string; task: string; caseKey: string; seriesDir: string; baselineId: string; manifestSha256: string }

export class BaselineFailure extends Error {}
export const baselineHash = (value: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(value).digest("hex")

export async function verifyBaselineInstallation(bin: string) {
  const root = path.dirname(path.dirname(bin))
  if (!path.isAbsolute(bin) || await realpath(bin) !== bin || await realpath(root) !== root) throw new BaselineFailure("CLI_PATH_REFUSED")
  const raw = await Bun.file(path.join(root, "cli-manifest.json")).text()
  const manifest = JSON.parse(raw) as { format: string; metadata: { version: string; sourceCommit: string; sourceDirty: boolean }
    files: { path: string; sha256: string; mode: number; link?: string }[] }
  if (manifest.format !== "loginom-cli-artifact-v1" || manifest.metadata?.version !== "0.1.17" || manifest.metadata.sourceDirty !== false ||
    manifest.metadata.sourceCommit !== "fc3d97dbf695c2ed8dba942feb6fe83591a33944" || !manifest.files?.length ||
    new Set(manifest.files.map(item => item.path)).size !== manifest.files.length) throw new BaselineFailure("CLI_MANIFEST_REFUSED")
  for (const item of manifest.files) {
    if (path.isAbsolute(item.path) || item.path.split(path.sep).some(part => ["..", ".", ""].includes(part)) ||
      !/^[0-9a-f]{64}$/.test(item.sha256) || !Number.isInteger(item.mode)) throw new BaselineFailure("CLI_MANIFEST_REFUSED")
    const file = path.join(root, item.path)
    const info = await lstat(file)
    const resolved = await realpath(file)
    if (!resolved.startsWith(root + path.sep) || !info.isFile() && !info.isSymbolicLink() || (info.mode & 0o7777) !== (item.mode & 0o7777) ||
      (info.isSymbolicLink() ? await readlink(file) : undefined) !== item.link || baselineHash(await Bun.file(file).bytes()) !== item.sha256)
      throw new BaselineFailure("CLI_FILE_CHANGED")
  }
  const walk = async (directory: string): Promise<string[]> => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async item =>
    item.isDirectory() ? walk(path.join(directory, item.name)) : [path.relative(root, path.join(directory, item.name))]))).flat()
  if (JSON.stringify((await walk(root)).sort()) !== JSON.stringify([...manifest.files.map(item => item.path), "cli-manifest.json"].sort()))
    throw new BaselineFailure("CLI_FILE_SET_CHANGED")
  return { files: manifest.files.length, metadata: manifest.metadata, manifestSha256: baselineHash(raw), binarySha256: baselineHash(await Bun.file(bin).bytes()) }
}

export async function captureBaselinePins(config: NodeOpsConfig, env: Record<string, string | undefined>): Promise<BaselinePins> {
  if (env.EVAL_AGENT_MODEL !== "openai/gpt-6.1-sol" || env.EVAL_AGENT_VARIANT !== "medium" || env.EVAL_AGENT_PROVIDER_ID)
    throw new BaselineFailure("MODEL_PIN_CHANGED")
  if (env.JUDGE_MODEL !== "gpt-6-astra" || env.JUDGE_REASONING !== "high" || Number(env.EVAL_PASS_THRESHOLD ?? "70") !== 70 ||
    Number(env.EVAL_JUDGE_TIMEOUT_MS ?? "300000") !== 300_000) throw new BaselineFailure("JUDGE_PIN_CHANGED")
  if (env.EVAL_JUDGE_COMMAND && env.EVAL_JUDGE_COMMAND !== "codex" && env.EVAL_JUDGE_COMMAND !== Bun.which("codex"))
    throw new BaselineFailure("JUDGE_OVERRIDE_REFUSED")
  const { nodeRoleCli, nodeStandStatus } = await import("./node-eval-ops")
  const role = config.roles.evalbaseline
  if (config.version !== 2 || !role || env.EVAL_CLI_MODE !== "binary" || env.EVAL_CLI_BIN !== nodeRoleCli(config, "evalbaseline") ||
    env.EVAL_PROFILE_DIR !== role.evalProfile || env.EVAL_WORKSPACE_ROOT !== role.workRoots[0] || env.EVAL_ARTIFACT_SOURCE !== "docker" ||
    env.CODEX_HOME !== path.join(path.dirname(role.evalProfile), "judge-home") ||
    env.LOGINOM_URL !== config.endpoint || env.LOGINOM_CONTAINER !== config.container.name || env.LOGINOM_STORAGE_DIR !== config.container.storageDir)
    throw new BaselineFailure("ISOLATION_CONFIG_CHANGED")
  await nodeStandStatus(config)
  const installed = await verifyBaselineInstallation(role.cliBin)
  const sha = (await Bun.$`git -C ${role.checkout} rev-parse HEAD`.quiet()).text().trim()
  if (!/^[0-9a-f]{40}$/.test(sha) || (await Bun.$`git -C ${role.checkout} status --porcelain`.quiet()).text().trim()) throw new BaselineFailure("HARNESS_DIRTY_OR_UNKNOWN")
  const inspected = (await Bun.$`docker inspect ${config.container.name}`.quiet()).json() as {
    Id: string; Image: string; State: { Running: boolean }; Mounts: unknown[]; HostConfig: { RestartPolicy: unknown }; NetworkSettings: { Networks: unknown }
  }[]
  const container = inspected[0]
  if (!container || container.Id !== config.container.id || !container.State.Running || container.Mounts.length) throw new BaselineFailure("CONTAINER_CHANGED")
  const marker = (await Bun.$`docker exec ${config.container.id} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()
  const components = (await Bun.$`docker exec ${config.container.id} cat /workdir/Components.cfg`.quiet()).text()
  const bwrap = await realpath(path.join(config.runtimeRoot, "bin/bwrap"))
  const isolation = { endpoint: config.endpoint, container: { id: container.Id, image: container.Image, mounts: container.Mounts,
    restart: container.HostConfig.RestartPolicy, network: container.NetworkSettings.Networks }, marker, components,
    sandbox: baselineHash(await Bun.file(path.join(role.checkout, "evals/src/sandbox.ts")).bytes()),
    bwrap: baselineHash(await Bun.file(bwrap).bytes()),
    bwrapBinary: baselineHash(await Bun.file("/usr/local/libexec/loginom-evals/bwrap").bytes()),
    apparmor: await Promise.all(["loginom-evals-bwrap", "loginom-evals-chromium", "loginom-evalbaseline-chromium"].map(async name => baselineHash(await Bun.file(`/etc/apparmor.d/${name}`).bytes()))),
    connection: Object.fromEntries(["LOGINOM_USERNAME", "LOGINOM_PASSWORD", "LOGINOM_DOCK_API_KEY", "LOGINOM_DOCK_BASE_URL", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"].map(key => [key, env[key] ?? ""])) }
  const revision = await dockSkillRevision({ apiKey: env.LOGINOM_DOCK_API_KEY ?? "", baseUrl: env.LOGINOM_DOCK_BASE_URL ?? "https://loginom.duckdns.org" })
  return { mode: "live", harnessSha: sha, corpusSha: sha, cliVersion: installed.metadata.version, cliSource: installed.metadata.sourceCommit,
    cliManifestSha256: installed.manifestSha256, binarySha256: installed.binarySha256, model: "openai/gpt-6.1-sol", variant: "medium",
    judgeModel: "gpt-6-astra", judgeReasoning: "high", threshold: 70, timeoutMs: 1_800_000, judgeTimeoutMs: 300_000,
    promptSha256: baselineHash(await Bun.file(path.join(role.checkout, "evals/src/judge-prompt.md")).bytes()),
    schemaSha256: baselineHash(await Bun.file(path.join(role.checkout, "evals/src/verdict.schema.json")).bytes()),
    opsConfigSha256: baselineHash(JSON.stringify(config)), isolationSha256: baselineHash(JSON.stringify(isolation)),
    endpoint: config.endpoint, containerId: config.container.id, imageDigest: container.Image, dockRevision: revision }
}

export async function prepareBaseline(directory: string, options: { checkout: string; pins: BaselinePins; smoke?: boolean; smokeCase?: string; config?: NodeOpsConfig }) {
  validatePins(options.pins)
  const selected = options.smoke ? smokeCaseKey(options.smokeCase) : undefined
  if (!options.smoke && options.smokeCase !== undefined) throw new BaselineFailure("CASE_ONLY_FOR_SMOKE")
  if (options.config && baselineHash(JSON.stringify(options.config)) !== options.pins.opsConfigSha256) throw new BaselineFailure("CONFIG_PIN_CHANGED")
  const collections = [["regular", "tasks"], ["analytic", "tasks/analytic"], ["node", "tasks/node-evals"]] as const
  const cases: BaselineCase[] = []
  for (const [collection, relative] of collections) {
    for (const task of await loadTasks(path.join(options.checkout, "evals", relative))) {
      if (selected && selected !== `${collection}:${task.id}`) continue
      cases.push({ key: `${collection}:${task.id}`, id: task.id, collection, directory: `${relative}/${task.id}`,
        files: await snapshotDirectory(task.dir) })
    }
  }
  if (selected && cases.length !== 1) throw new BaselineFailure("SMOKE_CORPUS_INCOMPLETE")
  const manifest: BaselineManifest = { version: 1, id: crypto.randomUUID(), kind: options.smoke ? "smoke" : "baseline",
    createdAt: new Date().toISOString(), pins: options.pins, cases, infraRetries: options.smoke ? 0 : 1,
    ...(selected === "regular:calc-data-double" ? { smokeOracle: await freezeSmokeOracle(options.checkout, cases[0]!) } : {}),
    jobs: (options.smoke ? [1] : [1, 2, 3]).flatMap(attempt => cases.map(item => ({ key: `${item.collection}-${item.id}-${attempt}`, caseKey: item.key, attempt }))) }
  await mkdir(directory, { mode: 0o700 }).catch(() => { throw new BaselineFailure("SERIES_EXISTS") })
  const raw = JSON.stringify(manifest, null, 2) + "\n"
  await writeFile(path.join(directory, "manifest.json"), raw, { flag: "wx", mode: 0o600 })
  const journal: BaselineJournal = { version: 1, manifestSha256: baselineHash(raw), checkout: options.checkout,
    jobs: manifest.jobs.map(job => ({ key: job.key, state: "pending" })) }
  await atomicJournal(directory, journal)
  if (options.config) await writeFile(path.join(directory, "ops-config.json"), JSON.stringify(options.config), { flag: "wx", mode: 0o600 })
  return manifest
}

/** Durable admission precedes dispatch. A running row is never interpreted as permission to retry. */
export async function beginBaselineMeasurement(directory: string, key: string, current: { checkout: string; pins: BaselinePins }) {
  return mutateBaseline(directory, async (manifest, journal) => {
    if (journal.release) throw new BaselineFailure("SERIES_RELEASED")
    if (JSON.stringify(manifest.pins) !== JSON.stringify(current.pins) || journal.checkout !== current.checkout) throw new BaselineFailure("PINS_CHANGED")
    for (const item of manifest.cases) if (JSON.stringify(await snapshotDirectory(path.join(current.checkout, "evals", item.directory))) !== JSON.stringify(item.files))
      throw new BaselineFailure("CORPUS_CHANGED")
    const job = journal.jobs.find(item => item.key === key)
    if (!job) throw new BaselineFailure("UNKNOWN_JOB")
    if (job.state !== "pending") throw new BaselineFailure("ALREADY_DISPATCHED")
    if (journal.jobs.some(item => item.state === "running" || item.recoveries?.some(recovery => recovery.state === "running"))) throw new BaselineFailure("UNKNOWN_OUTCOME")
    if (journal.jobs.some(item => item.record && !item.record.cleanup || item.recoveries?.some(recovery => recovery.record && !recovery.record.cleanup)))
      throw new BaselineFailure("CLEANUP_UNKNOWN")
    if (manifest.kind === "baseline" && journal.jobs.some(item => item.record && !effectiveMeasurement(item)?.measured)) throw new BaselineFailure("AWAITING_RECOVERY")
    if (journal.jobs.find(item => item.state === "pending") !== job) throw new BaselineFailure("ROUND_ORDER_CHANGED")
    if (manifest.kind === "smoke" && manifest.pins.mode === "live") {
      await admitBaselineSmoke(directory, await readPrivateBaselineJson(path.join(directory, "ops-config.json")) as NodeOpsConfig,
        await readPrivateBaselineJson(path.join(directory, "stand-handle.json")) as NodeStandLease)
    }
    const resultsDir = path.join(directory, "measurements", key, "runs")
    await mkdir(resultsDir, { recursive: true, mode: 0o700 })
    job.state = "running"
    job.dispatchedAt = new Date().toISOString()
    await atomicJournal(directory, journal)
    return { resultsDir, job: manifest.jobs.find(item => item.key === key)!, case: manifest.cases.find(item => item.key === manifest.jobs.find(job => job.key === key)!.caseKey)! }
  })
}

/** An immutable per-case admission survives a crash and replacement series directories. */
export async function admitBaselineSmoke(directory: string, config: NodeOpsConfig, owner: { issue: string; task: string }) {
  const { manifest, journal } = await readBaseline(directory)
  const role = config.roles.evalbaseline
  if (manifest.kind !== "smoke" || manifest.cases.length !== 1 || manifest.jobs.length !== 1 || manifest.jobs[0]!.attempt !== 1 ||
    !role || journal.checkout !== role.checkout || !directory.startsWith(role.resultsRoot + path.sep) || await realpath(directory) !== directory ||
    baselineHash(JSON.stringify(config)) !== manifest.pins.opsConfigSha256 || owner.issue !== role.readinessIssue ||
    typeof owner.task !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(owner.task)) throw new BaselineFailure("SMOKE_ADMISSION_REFUSED")
  const item = manifest.cases[0]!
  if (smokeCaseKey(item.id) !== item.key) throw new BaselineFailure("SMOKE_CASE_REFUSED")
  const root = await readinessRoot(config, true)
  const file = path.join(root!, item.id + ".json")
  const admission: SmokeAdmission = { version: 1, issue: owner.issue, task: owner.task, caseKey: item.key, seriesDir: directory,
    baselineId: manifest.id, manifestSha256: journal.manifestSha256 }
  const handle = await open(file, "wx", 0o400).catch((error: NodeJS.ErrnoException) => { if (error.code === "EEXIST") return undefined; throw error })
  if (!handle) {
    if (JSON.stringify(await readPrivateBaselineJson(file)) !== JSON.stringify(admission)) throw new BaselineFailure("SMOKE_ALREADY_ADMITTED")
    return admission
  }
  try { await handle.writeFile(JSON.stringify(admission)); await handle.sync() }
  finally { await handle.close() }
  const parent = await open(root!, constants.O_RDONLY | constants.O_DIRECTORY)
  try { await parent.sync() } finally { await parent.close() }
  return admission
}

/** Readiness comes from both immutable smoke reports and their distinct verified releases. */
export async function checkBaselineReadiness(config: NodeOpsConfig, pins?: BaselinePins) {
  const root = await readinessRoot(config, false)
  const checks: { caseKey: string; admitted: boolean; complete: boolean; baselineId?: string; pins?: BaselinePins; release?: BaselineRelease }[] = []
  for (const id of ["calc-data-double", "crosstable-fixed-sum"]) {
    const caseKey = smokeCaseKey(id)
    const file = root ? path.join(root, id + ".json") : undefined
    if (!file || !await lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error })) {
      checks.push({ caseKey, admitted: false, complete: false }); continue
    }
    const saved = await readPrivateBaselineJson(file) as SmokeAdmission
    const { manifest, journal } = await readBaseline(saved.seriesDir)
    if (saved.version !== 1 || saved.issue !== config.roles.evalbaseline!.readinessIssue || saved.caseKey !== caseKey ||
      saved.baselineId !== manifest.id || saved.manifestSha256 !== journal.manifestSha256 || manifest.kind !== "smoke" || manifest.cases.length !== 1 ||
      manifest.cases[0]!.key !== caseKey || !saved.seriesDir.startsWith(config.roles.evalbaseline!.resultsRoot + path.sep) ||
      baselineHash(JSON.stringify(config)) !== manifest.pins.opsConfigSha256) throw new BaselineFailure("READINESS_EVIDENCE_CHANGED")
    if (pins && JSON.stringify(pins) !== JSON.stringify(manifest.pins)) throw new BaselineFailure("READINESS_PINS_CHANGED")
    const report = await checkBaseline(saved.seriesDir)
    checks.push({ caseKey, admitted: true, complete: report.status === "complete" && manifest.pins.mode === "live",
      baselineId: manifest.id, pins: manifest.pins, release: journal.release })
  }
  const admitted = checks.filter(check => check.admitted)
  if (admitted.length === 2 && (admitted[0]!.baselineId === admitted[1]!.baselineId ||
    JSON.stringify(admitted[0]!.pins) !== JSON.stringify(admitted[1]!.pins) ||
    admitted[0]!.release?.receiptPath && admitted[0]!.release?.receiptPath === admitted[1]!.release?.receiptPath))
    throw new BaselineFailure("READINESS_EVIDENCE_CHANGED")
  return { issue: config.roles.evalbaseline!.readinessIssue, expected: 2, admitted: admitted.length,
    complete: checks.filter(check => check.complete).length, ready: checks.every(check => check.complete), checks }
}

async function readinessRoot(config: NodeOpsConfig, create: boolean) {
  const issue = config.roles.evalbaseline?.readinessIssue
  if (config.version !== 2 || !issue || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(issue) || !path.isAbsolute(config.runtimeRoot))
    throw new BaselineFailure("READINESS_CONFIGURATION_REQUIRED")
  const root = path.join(config.runtimeRoot, "operations/baseline-readiness", issue)
  if (create) await mkdir(root, { recursive: true, mode: 0o700 })
  const info = await lstat(root).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error })
  if (!info) return undefined
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077 || await realpath(root) !== root)
    throw new BaselineFailure("READINESS_PATH_REFUSED")
  return root
}

/** Record raw evidence, including product FAIL. No original result or judge verdict is rewritten. */
export async function recordBaselineMeasurement(directory: string, key: string, runDir: string, recoveryId?: string) {
  return mutateBaseline(directory, async (manifest, journal) => {
    const job = journal.jobs.find(item => item.key === key)
    const recovery = recoveryId ? job?.recoveries?.find(recovery => recovery.id === recoveryId) : undefined
    if (!job || (recoveryId ? recovery?.state !== "running" : job.state !== "running")) throw new BaselineFailure("NOT_DISPATCHED")
    const root = recovery ? path.join(path.dirname(recovery.evidencePath), "runs") : path.join(directory, "measurements", key, "runs")
    if (await realpath(runDir) !== runDir || !runDir.startsWith(root + path.sep)) throw new BaselineFailure("RUN_PATH_REFUSED")
    const item = manifest.cases.find(item => item.key === manifest.jobs.find(job => job.key === key)!.caseKey)!
    const inspected = await inspectMeasurement(manifest, item, journal.checkout, runDir)
    const record = recovery?.kind === "judge" ? await inspectJudgeRecovery(job, recovery, runDir, inspected, item.id) : inspected
    if (recovery) { recovery.record = record; recovery.state = "recorded" }
    if (!recovery) { job.record = record; job.state = "recorded" }
    await atomicJournal(directory, journal)
    for (const file of record.files) await chmod(path.join(runDir, file.path), 0o444)
    return record
  })
}

export async function checkBaseline(directory: string) {
  const { manifest, journal } = await readBaseline(directory)
  if (journal.release && manifest.pins.mode === "live") {
    if (!journal.release.receiptPath || baselineHash(await Bun.file(journal.release.receiptPath).bytes()) !== journal.release.receiptSha256)
      throw new BaselineFailure("RELEASE_EVIDENCE_CHANGED")
  }
  const rows: BaselineRow[] = []
  const executions: BaselineExecution[] = []
  const recoveries = journal.jobs.flatMap(job => (job.recoveries ?? []).map(recovery => ({ ...recovery, key: job.key })))
  for (const recovery of recoveries) for (const file of [{ path: recovery.evidencePath, sha256: recovery.evidenceSha256 }, ...recovery.evidenceFiles])
    if (baselineHash(await readPrivateBaselineBytes(file.path)) !== file.sha256) throw new BaselineFailure("RECOVERY_EVIDENCE_CHANGED")
  for (const expected of manifest.jobs) {
    const job = journal.jobs.find(item => item.key === expected.key)!
    const item = manifest.cases.find(item => item.key === expected.caseKey)!
    const state = job.recoveries?.some(recovery => recovery.state === "running") ? "running" : job.state
    const records = [...(job.record ? [{ kind: "product" as const, record: job.record }] : []),
      ...(job.recoveries ?? []).flatMap(recovery => recovery.record ? [{ kind: recovery.kind === "judge" ? "judge" as const : "product" as const, record: recovery.record }] : [])]
    for (const execution of records) {
      if (JSON.stringify(await snapshotDirectory(execution.record.runDir)) !== JSON.stringify(execution.record.files)) throw new BaselineFailure("EVIDENCE_CHANGED")
      const summary = await Bun.file(path.join(execution.record.runDir, "summary.json")).json() as RunSummary
      executions.push({ ...expected, ...execution, result: summary.tasks[0]!.attempts[0]! })
    }
    const record = effectiveMeasurement(job)
    if (!record) { rows.push({ ...expected, collection: item.collection, state, measured: false, cleanup: false, verdict: null, runDir: null, result: null }); continue }
    rows.push({ ...expected, collection: item.collection, state, measured: record.measured, cleanup: records.every(execution => execution.record.cleanup),
      verdict: record.verdict, runDir: record.runDir, result: executions.find(execution => execution.record === record)!.result })
  }
  const coverage = { expected: manifest.jobs.length, recorded: rows.filter(row => row.state === "recorded").length,
    measured: rows.filter(row => row.measured).length, pending: rows.filter(row => row.state === "pending").length,
    unknown: rows.filter(row => row.state === "running").length }
  const cleanup = coverage.unknown === 0 && rows.filter(row => row.state === "recorded").every(row => row.cleanup)
  const groups = Object.fromEntries((["regular", "analytic"] as const).map(collection => {
    const attempts = rows.filter(row => row.collection === collection).flatMap(row => row.result ? [{ ...row.result, attempt: row.attempt }] : [])
    return [collection, { metrics: aggregate(attempts, false), tasks: manifest.cases.filter(item => item.collection === collection).map(item => ({
      id: item.id, metrics: aggregateTask(attempts.filter(attempt => attempt.task_id === item.id), false) })) }]
  }))
  const spent = executions.filter(execution => execution.kind === "product").flatMap(execution =>
    (execution.result.infra_retry ? [execution.result.infra_retry.initial, execution.result] : [execution.result]).map(result => ({ execution, result })))
  const judgeCalls: { execution: BaselineExecution; file: string; call: { attempt: number; ok: boolean; error: string | null; duration_ms: number } }[] = []
  for (const execution of executions) for (const file of execution.record.files.filter(file => /\/judge\/attempt-[12]\.json$/.test(file.path))) {
    const call = await Bun.file(path.join(execution.record.runDir, file.path)).json() as { attempt: number; ok: boolean; error: string | null; duration_ms: number }
    if (![1, 2].includes(call.attempt) || typeof call.ok !== "boolean" || !Number.isFinite(call.duration_ms) || call.duration_ms < 0 ||
      !call.ok && typeof call.error !== "string") throw new BaselineFailure("JUDGE_ATTEMPT_INVALID")
    judgeCalls.push({ execution, file: file.path, call })
  }
  const spending = { duration_ms: spent.reduce((sum, item) => sum + item.result.duration_ms, 0),
    cost: spent.reduce((sum, item) => sum + item.result.cost, 0),
    tokens: { input: spent.reduce((sum, item) => sum + item.result.tokens.input, 0), output: spent.reduce((sum, item) => sum + item.result.tokens.output, 0),
      reasoning: spent.reduce((sum, item) => sum + item.result.tokens.reasoning, 0) }, judge_tokens: null,
    judge_duration_ms: judgeCalls.reduce((sum, item) => sum + item.call.duration_ms, 0) + executions.filter(execution => execution.kind === "judge" &&
      !judgeCalls.some(item => item.execution === execution)).reduce((sum, execution) => sum + (execution.record.judgeDurationMs ?? 0), 0) }
  const infrastructure = [...[...spent, ...executions.filter(execution => execution.kind === "judge").map(execution => ({ execution, result: execution.result }))]
    .filter(item => ["infra_error", "harness_error", "interrupted"].includes(item.result.status) || item.result.judge_status === "error")
    .map(item => ({ key: item.execution.key, caseKey: item.execution.caseKey, attempt: item.execution.attempt, executionId: item.execution.record.runId,
      phase: item.result === item.execution.result ? "final" : "infra-retry-initial", status: item.result.status, judge_status: item.result.judge_status })),
    ...judgeCalls.filter(item => !item.call.ok).map(item => ({ key: item.execution.key, caseKey: item.execution.caseKey, attempt: item.execution.attempt,
      executionId: item.execution.record.runId, phase: `judge-attempt-${item.call.attempt}`, status: item.execution.result.status,
      judge_status: "error" as const, error: item.call.error, evidence: item.file }))]
  const smokeVerification = manifest.kind === "smoke" ? await verifySmokeMeasurements(manifest, rows) : null
  return { id: manifest.id, kind: manifest.kind, status: journal.release?.abandoned ? "abandoned" : coverage.measured === coverage.expected && cleanup && journal.release && (smokeVerification?.verified ?? true) ? "complete" : "incomplete",
    abandoned: journal.release?.abandoned ?? null,
    manifest, coverage, cleanup, released: Boolean(journal.release), groups, spending, infrastructure, smokeVerification, recoveries, executions,
    nodes: manifest.cases.filter(item => item.collection === "node").map(item => ({ id: item.id, expected: manifest.kind === "smoke" ? 1 : 3,
      passed: rows.filter(row => row.caseKey === item.key && row.verdict === "PASS").length,
      measured: rows.filter(row => row.caseKey === item.key && row.measured).length })), rows }
}

function smokeCaseKey(id: string | undefined) {
  if (id === undefined) throw new BaselineFailure("SMOKE_CASE_REQUIRED")
  if (id === "calc-data-double") return "regular:calc-data-double"
  if (id === "crosstable-fixed-sum") return "node:crosstable-fixed-sum"
  throw new BaselineFailure("SMOKE_CASE_REFUSED")
}

async function freezeSmokeOracle(checkout: string, item: BaselineCase) {
  const source = await Bun.file(path.join(checkout, "evals", item.directory, "data/amounts.csv")).text()
  const parsed = parseCsv(source)
  if ("error" in parsed || parsed.rows[0]?.join(",") !== "Amount" || parsed.rows.length < 2 ||
    parsed.rows.slice(1).some(row => row.length !== 1 || !row[0]?.trim() || !Number.isFinite(Number(row[0])))) throw new BaselineFailure("SMOKE_ORACLE_INPUT_REFUSED")
  return { caseKey: item.key, inputSha256: baselineHash(source), expectedCsv: `Double\n${parsed.rows.slice(1).map(row => Number(row[0]) * 2).join("\n")}\n` }
}

async function verifySmokeMeasurements(manifest: BaselineManifest, rows: BaselineRow[]) {
  const checks = await Promise.all(rows.map(async row => {
    const out = row.runDir ? path.join(row.runDir, row.caseKey.split(":")[1]!, "1/artifact") : undefined
    const artifact = Boolean(out && row.result?.package_path && await Bun.file(path.join(out, "package.lgp")).exists())
    const oracle = row.collection === "regular" && artifact && manifest.smokeOracle ? await checkSmokeOracle(out!, manifest.smokeOracle.expectedCsv) :
      { checked: false, passed: null, error: null }
    const evaluator = row.collection === "regular" ? manifest.pins.mode === "live" && row.result?.judge_status === "scored" && row.result.judge_attempts > 0 :
      Boolean(row.runDir && row.measured && await Bun.file(path.join(row.runDir, "code-verdict.json")).exists())
    return { caseKey: row.caseKey, artifact, evaluator, oracle, qualityPass: row.collection === "node" ? row.verdict === "PASS" : row.result?.pass ?? null }
  }))
  return { verified: checks.length === 1 && checks.every(check => check.artifact && check.evaluator && (check.caseKey.startsWith("node:") || check.oracle.checked)), checks }
}

async function checkSmokeOracle(artifact: string, expected: string) {
  const files = (await readdir(path.join(artifact, "results")).catch(() => [])).filter(name => name.endsWith(".result.csv"))
  if (files.length !== 1) return { checked: false, passed: null, error: "SMOKE_RESULT_CSV_REQUIRED" }
  const actual = await Bun.file(path.join(artifact, "results", files[0]!)).text()
  const parsed = parseCsv(actual)
  if ("error" in parsed) return { checked: true, passed: false, error: "SMOKE_RESULT_CSV_INVALID" }
  const header = parsed.rows[0] ?? []
  if (header.filter(column => column === "Double").length !== 1 || parsed.rows.slice(1).some(row => row.length !== header.length))
    return { checked: true, passed: false, error: "SMOKE_DOUBLE_COLUMN_INVALID" }
  // SPEC requires Double; optional retained Amount/other columns are not a new acceptance criterion.
  const projected = ["Double", ...parsed.rows.slice(1).map(row => `"${row[header.indexOf("Double")]!.replaceAll('"', '""')}"`)].join("\n") + "\n"
  return { checked: true, ...compareCsv(expected, projected, 0), resultSha256: baselineHash(actual) }
}

export async function sealBaselineRelease(directory: string, receipt: BaselineRelease) {
  return mutateBaseline(directory, async (manifest, journal) => {
    if (journal.release) throw new BaselineFailure("SERIES_RELEASED")
    if (receipt.abandoned && (!receipt.abandoned.reason.trim() || receipt.abandoned.reason.length > 1000 || !Number.isFinite(Date.parse(receipt.abandoned.at))))
      throw new BaselineFailure("ABANDON_REASON_REQUIRED")
    if (!receipt.abandoned && manifest.kind === "baseline" && journal.jobs.some(job => job.record && !effectiveMeasurement(job)?.measured)) throw new BaselineFailure("AWAITING_RECOVERY")
    if (receipt.status !== "RELEASED" || !/^[0-9a-f]{64}$/.test(receipt.evidenceSha256) ||
      journal.jobs.some(job => job.state === "running" || job.record && !job.record.cleanup || job.recoveries?.some(recovery => recovery.state === "running" || recovery.record && !recovery.record.cleanup)))
      throw new BaselineFailure("RELEASE_UNCONFIRMED")
    if (manifest.pins.mode === "live") {
      const lease = await readPrivateBaselineJson(path.join(directory, "stand-handle.json")) as NodeStandLease
      const config = await readPrivateBaselineJson(path.join(directory, "ops-config.json")) as NodeOpsConfig
      if (!receipt.receiptPath || await realpath(receipt.receiptPath) !== receipt.receiptPath || !receipt.receiptPath.includes("/operations/completed/"))
        throw new BaselineFailure("RELEASE_UNCONFIRMED")
      if (baselineHash(JSON.stringify(config)) !== manifest.pins.opsConfigSha256 ||
        !receipt.receiptPath.startsWith(path.join(config.runtimeRoot, "operations/completed") + path.sep)) throw new BaselineFailure("RELEASE_UNCONFIRMED")
      const raw = await Bun.file(receipt.receiptPath!).bytes()
      const proof = JSON.parse(new TextDecoder().decode(raw)) as { status: string; acquiredAt: string; evidenceSha256: string; owner: NodeStandLease; archive: string; containerId: string }
      if (proof.status !== "RELEASED" || proof.acquiredAt !== lease.acquiredAt || proof.owner.role !== "evalbaseline" || proof.owner.task !== lease.task ||
        proof.owner.issue !== lease.issue || proof.owner.sha !== manifest.pins.harnessSha || proof.containerId !== manifest.pins.containerId ||
        proof.evidenceSha256 !== receipt.evidenceSha256 || receipt.receiptPath !== path.join(proof.archive, "release.json")) throw new BaselineFailure("RELEASE_UNCONFIRMED")
      receipt.receiptSha256 = baselineHash(raw)
    }
    journal.release = receipt
    await atomicJournal(directory, journal)
  })
}

export async function runBaseline(argv: string[], env: Record<string, string | undefined> = process.env): Promise<Record<string, unknown> & { code: number }> {
  try {
    const command = argv[0]
    if (argv.includes("--help")) return { code: 0, status: "HELP", help: "run-baseline.ts prepare|start|resume|check|smoke|recover-measurement|abandon --series DIR [smoke: --case calc-data-double|crosstable-fixed-sum] [recover-measurement: --job KEY --kind infrastructure|judge --evidence PRIVATE_JSON] [abandon: --reason REASON --evidence RELEASE_JSON] [--config PRIVATE --issue ID --task ID] [check: --compare SERIES --export] [resume: --recover-executor after inspection]" }
    const values = parseArgs({ args: argv.slice(1), strict: true, options: { series: { type: "string" }, case: { type: "string" }, config: { type: "string" }, issue: { type: "string" }, task: { type: "string" }, compare: { type: "string" }, limit: { type: "string" }, job: { type: "string" }, kind: { type: "string" }, reason: { type: "string" }, evidence: { type: "string" }, export: { type: "boolean" }, "recover-executor": { type: "boolean" } } }).values
    const directory = values.series
    if (!directory || !path.isAbsolute(directory)) throw new BaselineFailure("SERIES_PATH_REQUIRED")
    if (command === "smoke") smokeCaseKey(values.case)
    if (command !== "smoke" && values.case !== undefined) throw new BaselineFailure("CASE_ONLY_FOR_SMOKE")
    if (command === "abandon") {
      if (!values.reason?.trim() || values.reason.length > 1000) throw new BaselineFailure("ABANDON_REASON_REQUIRED")
      if (!values.evidence) throw new BaselineFailure("RELEASE_UNCONFIRMED")
      const { manifest } = await readBaseline(directory)
      if (manifest.pins.mode === "fixture" && (env.EVAL_BASELINE_FIXTURE !== "1" || env.EVAL_CLI_MODE !== "fake" || !env.EVAL_ARTIFACT_SOURCE?.startsWith("dir:")))
        throw new BaselineFailure("FIXTURE_MODE_REQUIRED")
      if (await lstat(path.join(directory, "executor.lock")).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error }))
        throw new BaselineFailure("EXECUTOR_REQUIRES_INSPECTION")
      const report = await checkBaseline(directory)
      if (!report.cleanup || report.coverage.unknown) throw new BaselineFailure("CLEANUP_UNKNOWN")
      const proof = await readPrivateBaselineJson(values.evidence) as BaselineRelease
      await sealBaselineRelease(directory, { status: proof.status, evidenceSha256: proof.evidenceSha256,
        ...(manifest.pins.mode === "live" ? { receiptPath: values.evidence } : {}), abandoned: { reason: values.reason.trim(), at: new Date().toISOString() } })
      return { code: 0, ...await writeCheckResult(directory) }
    }
    if (command === "recover-measurement") {
      if (!values.job || !["infrastructure", "judge"].includes(values.kind ?? "") || !values.evidence) throw new BaselineFailure("RECOVERY_ARGUMENTS_REQUIRED")
      const { manifest, journal } = await readBaseline(directory)
      if (manifest.pins.mode === "fixture") {
        if (env.EVAL_BASELINE_FIXTURE !== "1" || env.EVAL_CLI_MODE !== "fake" || !env.EVAL_ARTIFACT_SOURCE?.startsWith("dir:")) throw new BaselineFailure("FIXTURE_MODE_REQUIRED")
        return await admitBaselineRecovery(directory, values.job, values.kind!, values.evidence, { checkout: journal.checkout, pins: manifest.pins }, env)
      }
      if (!values.config) throw new BaselineFailure("LIVE_CONFIGURATION_REQUIRED")
      const config = await readPrivateBaselineJson(values.config) as NodeOpsConfig
      return await admitBaselineRecovery(directory, values.job, values.kind!, values.evidence,
        { checkout: config.roles.evalbaseline!.checkout, pins: await captureBaselinePins(config, env) }, env)
    }
    if (command === "check") {
      const report = await checkBaseline(directory)
      const reportDir = await writeBaselineReport(directory, report)
      if (values.compare) await writeBaselineComparison(reportDir, await checkBaseline(values.compare), report)
      return { code: 0, status: report.status, ...report.coverage, reportDir,
        ...(values.export ? await exportBaselineReport(directory, reportDir, report, env) : {}) }
    }
    if (["start", "resume"].includes(command ?? "") && env.EVAL_BASELINE_FIXTURE === "1") {
      const { manifest, journal } = await readBaseline(directory)
      if (manifest.pins.mode !== "fixture" || env.EVAL_CLI_MODE !== "fake" || !env.EVAL_ARTIFACT_SOURCE?.startsWith("dir:")) throw new BaselineFailure("FIXTURE_MODE_REQUIRED")
      if (journal.release) throw new BaselineFailure("SERIES_RELEASED")
      if (command === "start" && journal.jobs.some(job => job.state !== "pending")) throw new BaselineFailure("USE_RESUME")
      const limit = Number(values.limit ?? manifest.jobs.length)
      if (!Number.isSafeInteger(limit) || limit < 1) throw new BaselineFailure("INVALID_LIMIT")
      for (const unused of Array.from({ length: Math.min(limit, manifest.jobs.length) })) {
        const job = (await readBaseline(directory)).journal.jobs.find(job => job.state === "pending" || manifest.kind === "baseline" && !effectiveMeasurement(job)?.measured)
        if (!job) break
        const recovery = job.recoveries?.find(recovery => recovery.state === "admitted")
        if (job.state !== "pending" && !recovery) throw new BaselineFailure(job.state === "running" || job.recoveries?.some(recovery => recovery.state === "running") ? "UNKNOWN_OUTCOME" : "AWAITING_RECOVERY")
        const record = await dispatchBaselineJob(directory, job.key, { checkout: journal.checkout, pins: manifest.pins }, env, recovery?.id)
        if (manifest.kind === "baseline" && !record.measured) throw new BaselineFailure("AWAITING_RECOVERY")
      }
      const report = await checkBaseline(directory)
      return { code: 0, status: report.status, ...report.coverage, reportDir: await writeBaselineReport(directory, report) }
    }
    if (values.limit !== undefined) throw new BaselineFailure("LIVE_LIMIT_REFUSED")
    if (!["prepare", "start", "resume", "smoke"].includes(command ?? "")) throw new BaselineFailure("UNKNOWN_COMMAND")
    if (typeof values.config !== "string") throw new BaselineFailure("LIVE_CONFIGURATION_REQUIRED")
    const config = await readPrivateBaselineJson(values.config) as NodeOpsConfig
    const role = config.roles.evalbaseline
    if (!role || !directory.startsWith(role.resultsRoot + path.sep) || await realpath(path.dirname(directory)) !== path.dirname(directory))
      throw new BaselineFailure("SERIES_PATH_REFUSED")
    const pins = await captureBaselinePins(config, env)
    if (command === "prepare" || command === "smoke") {
      const manifest = await prepareBaseline(directory, { checkout: role.checkout, pins, smoke: command === "smoke", smokeCase: values.case, config })
      if (command === "prepare") return { code: 0, status: "PREPARED", id: manifest.id, expected: manifest.jobs.length, cases: manifest.cases.length }
    }
    return await executeLiveBaseline(directory, config, env, pins, { issue: typeof values.issue === "string" ? values.issue : undefined,
      task: typeof values.task === "string" ? values.task : undefined, resume: command === "resume", recoverExecutor: values["recover-executor"] === true })
  } catch (error) {
    const reason = error instanceof BaselineFailure ? error.message : "BASELINE_OPERATION_FAILED"
    return { code: 2, status: reason === "AWAITING_RECOVERY" ? "AWAITING_RECOVERY" : "BLOCKED", reason }
  }
}

async function executeLiveBaseline(directory: string, config: NodeOpsConfig, env: Record<string, string | undefined>, pins: BaselinePins,
  options: { issue?: string; task?: string; resume: boolean; recoverExecutor: boolean }) {
  const { acquireNodeStand, assertNodeStandOwner, preflightNodeStand, verifyBaselineStand, runNodeEvalOps } = await import("./node-eval-ops")
  const { manifest, journal } = await readBaseline(directory)
  if (JSON.stringify(pins) !== JSON.stringify(manifest.pins)) throw new BaselineFailure("PINS_CHANGED")
  if (!options.resume && journal.jobs.some(job => job.state !== "pending")) throw new BaselineFailure("USE_RESUME")
  if (journal.release) return { code: 0, ...await writeCheckResult(directory) }
  const readiness = await checkBaselineReadiness(config, pins)
  if (manifest.kind === "baseline" && !readiness.ready) throw new BaselineFailure("BASELINE_READINESS_INCOMPLETE")
  if (manifest.kind === "smoke") {
    const previous = readiness.checks.find(check => check.caseKey === manifest.cases[0]!.key)
    if (previous?.admitted && previous.baselineId !== manifest.id) throw new BaselineFailure("SMOKE_ALREADY_ADMITTED")
    if (!options.resume && options.issue !== config.roles.evalbaseline!.readinessIssue) throw new BaselineFailure("SMOKE_ADMISSION_REFUSED")
  }
  const handle = path.join(directory, "stand-handle.json")
  const lease = await (async () => {
    if (await Bun.file(handle).exists()) {
      const saved = await readPrivateBaselineJson(handle) as NodeStandLease
      await assertNodeStandOwner(config, saved)
      return saved
    }
    if (journal.jobs.some(job => job.state !== "pending")) throw new BaselineFailure("STAND_ADMISSION_MISSING")
    if (!options.issue || !options.task) throw new BaselineFailure("CARD_AND_TASK_REQUIRED")
    const acquired = await acquireNodeStand(config, { issue: options.issue, task: options.task, role: "evalbaseline", phase: "eval", sha: pins.harnessSha })
    await writeFile(handle, JSON.stringify(acquired), { flag: "wx", mode: 0o600 })
    return acquired
  })()
  const guard = path.join(directory, "executor.lock")
  if (await lstat(guard).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error })) {
    const saved = await readPrivateBaselineJson(path.join(guard, "owner.json")) as { pid: number; starttime: string }
    const before = await lstat(guard)
    if (!options.resume || !options.recoverExecutor || await processBirthPresent(saved)) throw new BaselineFailure("EXECUTOR_REQUIRES_INSPECTION")
    await reconcileRunningBaseline(directory)
    await verifyBaselineStand(config, lease, directory)
    await settleBaselineHarness(config, lease, directory)
    if ((await lstat(guard)).ino !== before.ino || (await readPrivateBaselineJson(path.join(guard, "owner.json")) as { starttime: string }).starttime !== saved.starttime)
      throw new BaselineFailure("EXECUTOR_OWNER_CHANGED")
    await rename(guard, path.join(directory, `executor-recovered-${crypto.randomUUID()}`))
  }
  await mkdir(guard, { mode: 0o700 }).catch(() => { throw new BaselineFailure("EXECUTOR_BUSY") })
  const guarded = await lstat(guard)
  await writeFile(path.join(guard, "owner.json"), JSON.stringify({ pid: process.pid, starttime: await processStarttime(process.pid), uid: process.getuid?.(), nonce: crypto.randomUUID() }), { flag: "wx", mode: 0o600 })
  try {
    if (options.resume) { await reconcileRunningBaseline(directory); await verifyBaselineStand(config, lease, directory); await settleBaselineHarness(config, lease, directory) }
    if (!await Bun.file(path.join(config.runtimeRoot, "operations/stand.lease/admission-complete.json")).exists()) await preflightNodeStand(config, lease, env)
    while (true) {
      const job = (await readBaseline(directory)).journal.jobs.find(job => job.state === "pending" || manifest.kind === "baseline" && !effectiveMeasurement(job)?.measured)
      if (!job) break
      const recovery = job.recoveries?.find(recovery => recovery.state === "admitted")
      if (job.state !== "pending" && !recovery) throw new BaselineFailure(job.state === "running" || job.recoveries?.some(recovery => recovery.state === "running") ? "UNKNOWN_OUTCOME" : "AWAITING_RECOVERY")
      await assertNodeStandOwner(config, lease)
      const current = await captureBaselinePins(config, env)
      const record = await dispatchBaselineJob(directory, job.key, { checkout: journal.checkout, pins: current }, env, recovery?.id)
      await verifyBaselineStand(config, lease, directory)
      await settleBaselineHarness(config, lease, directory)
      const summary = await Bun.file(path.join(record.runDir, "summary.json")).json() as RunSummary
      if (summary.interrupted || summary.stopped_reason) throw new BaselineFailure("SERIES_STOPPED_WITH_RETAINED_STAND")
      if (manifest.kind === "baseline" && !record.measured) throw new BaselineFailure("AWAITING_RECOVERY")
    }
    if ((await checkBaseline(directory)).rows.some(row => manifest.kind === "baseline" && row.state === "recorded" && !row.measured))
      throw new BaselineFailure("AWAITING_RECOVERY")
    const completion = path.join(directory, `stand-completion-${crypto.randomUUID()}.json`)
    await writeFile(completion, JSON.stringify({ version: 1, owner: { issue: lease.issue, task: lease.task, role: lease.role, phase: lease.phase, sha: lease.sha },
      acquiredAt: lease.acquiredAt, kind: "baseline", seriesDir: directory, runSha: pins.harnessSha }), { flag: "wx", mode: 0o600 })
    const configFile = path.join(directory, "ops-config.json")
    if (baselineHash(JSON.stringify(await readPrivateBaselineJson(configFile))) !== pins.opsConfigSha256) throw new BaselineFailure("CONFIG_PIN_CHANGED")
    const released = await runNodeEvalOps(["release", "--config", configFile, "--lease", handle, "--evidence", completion], env)
    if (released.code !== 0 || typeof released.archive !== "string" || typeof released.evidenceSha256 !== "string") throw new BaselineFailure("STAND_RELEASE_BLOCKED")
    await sealBaselineRelease(directory, { status: "RELEASED", evidenceSha256: released.evidenceSha256, receiptPath: path.join(released.archive, "release.json") })
    return { code: 0, ...await writeCheckResult(directory) }
  } finally {
    const current = await lstat(guard)
    if (current.dev === guarded.dev && current.ino === guarded.ino && !current.isSymbolicLink()) await rm(guard, { recursive: true })
  }
}

async function writeCheckResult(directory: string) {
  const report = await checkBaseline(directory)
  return { status: report.status, id: report.id, ...report.coverage, reportDir: await writeBaselineReport(directory, report) }
}

async function reconcileRunningBaseline(directory: string) {
  const { journal } = await readBaseline(directory)
  const running = journal.jobs.flatMap(job => [
    ...(job.state === "running" ? [{ job, recovery: undefined }] : []),
    ...(job.recoveries ?? []).filter(recovery => recovery.state === "running").map(recovery => ({ job, recovery }))])
  for (const { job, recovery } of running) {
    const parent = recovery ? path.dirname(recovery.evidencePath) : path.join(directory, "measurements", job.key)
    const child = await readPrivateBaselineJson(path.join(parent, "harness-process.json")) as { pid: number; starttime: string }
    if (await processBirthPresent(child)) throw new BaselineFailure("HARNESS_STILL_RUNNING")
    const runs = (await readdir(path.join(parent, "runs"), { withFileTypes: true })).filter(item => item.isDirectory())
    if (runs.length !== 1 || !await Bun.file(path.join(parent, "runs", runs[0]!.name, "summary.json")).exists()) throw new BaselineFailure("UNKNOWN_OUTCOME_REQUIRES_RECOVERY")
    await recordBaselineMeasurement(directory, job.key, path.join(parent, "runs", runs[0]!.name), recovery?.id)
  }
}

async function settleBaselineHarness(config: NodeOpsConfig, lease: NodeStandLease, directory: string) {
  const profile = config.roles.evalbaseline!.evalProfile
  if (!await lstat(`${profile}.harness-lease`).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error })) return
  const { verifyBaselineStand } = await import("./node-eval-ops")
  await verifyBaselineStand(config, lease, directory)
  const { retireRecordedHarnessLease } = await import("./lease")
  const report = await checkBaseline(directory)
  const last = report.executions.filter(execution => execution.kind === "product").at(-1)
  if (!last) throw new BaselineFailure("HARNESS_ADMISSION_MISSING")
  const result = await Bun.file(path.join(last.record.runDir, "summary.json")).json() as RunSummary
  const cleanup = await Bun.file(path.join(last.record.runDir, result.tasks[0]!.id, "1/cleanup.json")).json()
  await retireRecordedHarnessLease(profile, path.join(path.dirname(path.dirname(last.record.runDir)), "harness-admission.json"), cleanup.processes)
}

async function readPrivateBaselineJson(file: string) {
  return JSON.parse(new TextDecoder().decode(await readPrivateBaselineBytes(file))) as unknown
}

async function readPrivateBaselineBytes(file: string) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o077) throw new BaselineFailure("PRIVATE_FILE_REQUIRED")
    return await handle.readFile()
  } finally { await handle.close() }
}

async function processStarttime(pid: number) {
  const raw = await readFile(`/proc/${pid}/stat`, "utf8")
  return raw.slice(raw.lastIndexOf(")") + 2).split(" ")[19]!
}

async function processBirthPresent(owner: { pid: number; starttime: string }) {
  return await processStarttime(owner.pid).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error }) === owner.starttime
}

async function admitBaselineRecovery(directory: string, key: string, kind: string, evidence: string,
  current: { checkout: string; pins: BaselinePins }, env: Record<string, string | undefined>) {
  return mutateBaseline(directory, async (manifest, journal) => {
    if (journal.release) throw new BaselineFailure("SERIES_RELEASED")
    if (manifest.kind !== "baseline") throw new BaselineFailure("SMOKE_RECOVERY_REFUSED")
    if (JSON.stringify(manifest.pins) !== JSON.stringify(current.pins) || journal.checkout !== current.checkout) throw new BaselineFailure("PINS_CHANGED")
    if (!path.isAbsolute(evidence) || await realpath(evidence) !== evidence) throw new BaselineFailure("RECOVERY_PROOF_REQUIRED")
    const proof = await readPrivateBaselineJson(evidence) as RecoveryEvidence
    const raw = JSON.stringify(proof)
    const id = baselineHash(raw)
    const job = journal.jobs.find(job => job.key === key)
    const previous = job?.recoveries?.find(recovery => recovery.id === id)
    if (previous) return { code: 0, status: "RECOVERY_ADMITTED", recoveryId: previous.id, state: previous.state }
    if (await lstat(path.join(directory, "executor.lock")).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error }))
      throw new BaselineFailure("EXECUTOR_REQUIRES_INSPECTION")
    if (journal.jobs.some(job => job.state === "running" || job.recoveries?.some(recovery => recovery.state === "running"))) throw new BaselineFailure("UNKNOWN_OUTCOME")
    if (!job?.record || effectiveMeasurement(job)?.measured || journal.jobs.find(job => !effectiveMeasurement(job)?.measured) !== job || job.recoveries?.some(recovery => recovery.state !== "recorded"))
      throw new BaselineFailure("RECOVERY_SLOT_INELIGIBLE")
    const report = await checkBaseline(directory)
    if (!report.cleanup) throw new BaselineFailure("CLEANUP_UNKNOWN")
    const record = job.recoveries?.at(-1)?.record ?? job.record
    const result = (await Bun.file(path.join(record.runDir, "summary.json")).json() as RunSummary).tasks[0]!.attempts[0]!
    const item = manifest.cases.find(item => item.key === manifest.jobs.find(job => job.key === key)!.caseKey)!
    if (record.measured || kind === "infrastructure" && !["infra_error", "harness_error"].includes(result.status) ||
      kind === "judge" && (item.collection === "node" || !["completed", "failed", "timeout"].includes(result.status) || result.judge_status !== "error" ||
        !result.package_path || !await Bun.file(path.join(record.runDir, item.id, "1/artifact/package.lgp")).exists())) throw new BaselineFailure("RECOVERY_SLOT_INELIGIBLE")
    if (proof.version !== 1 || proof.baselineId !== manifest.id || proof.jobKey !== key || proof.kind !== kind || proof.executionId !== record.runId ||
      proof.executionFilesSha256 !== baselineHash(JSON.stringify(record.files)) || typeof proof.cause !== "string" || !proof.cause.trim() ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(proof.taskId) || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(proof.runId) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(proof.fix?.id ?? "") || !proof.fix.files?.length || !proof.validation)
      throw new BaselineFailure("RECOVERY_PROOF_REQUIRED")
    for (const file of [...proof.fix.files, proof.validation]) {
      if (!path.isAbsolute(file.path) || await realpath(file.path) !== file.path || !/^[0-9a-f]{64}$/.test(file.sha256)) throw new BaselineFailure("RECOVERY_PROOF_REQUIRED")
      if (baselineHash(await readPrivateBaselineBytes(file.path)) !== file.sha256) throw new BaselineFailure("RECOVERY_PROOF_CHANGED")
    }
    const validation = await readPrivateBaselineJson(proof.validation.path) as { version: number; baselineId: string; jobKey: string; executionId: string;
      pinsSha256: string; fixSha256: string; status: string; modelCalls: number; exitCode: number; command: string }
    if (validation.version !== 1 || validation.baselineId !== manifest.id || validation.jobKey !== key || validation.executionId !== record.runId ||
      validation.pinsSha256 !== baselineHash(JSON.stringify(manifest.pins)) || validation.fixSha256 !== baselineHash(JSON.stringify(proof.fix)) ||
      validation.status !== "PASS" || validation.modelCalls !== 0 || validation.exitCode !== 0 || !validation.command)
      throw new BaselineFailure("RECOVERY_VALIDATION_REQUIRED")
    for (const previous of job.recoveries ?? []) {
      const saved = await Bun.file(previous.evidencePath).json() as { proof: RecoveryEvidence }
      if (saved.proof.fix.id === proof.fix.id || JSON.stringify(saved.proof.fix.files.map(file => file.sha256).sort()) === JSON.stringify(proof.fix.files.map(file => file.sha256).sort()))
        throw new BaselineFailure("RECOVERY_FIX_ALREADY_USED")
    }
    const childFile = path.join(path.dirname(path.dirname(record.runDir)), "harness-process.json")
    if (await Bun.file(childFile).exists() && await processBirthPresent(await readPrivateBaselineJson(childFile) as { pid: number; starttime: string }))
      throw new BaselineFailure("HARNESS_STILL_RUNNING")
    const root = path.join(directory, "measurements", key, "recoveries")
    await mkdir(root, { recursive: true, mode: 0o700 })
    const recoveryDir = path.join(root, id)
    await mkdir(recoveryDir, { mode: 0o700 }).catch(() => { throw new BaselineFailure("RECOVERY_ADMISSION_UNKNOWN") })
    const evidenceFiles: BaselineRecovery["evidenceFiles"] = []
    for (const [index, file] of [...proof.fix.files, proof.validation].entries()) {
      const bytes = await readPrivateBaselineBytes(file.path)
      if (baselineHash(bytes) !== file.sha256) throw new BaselineFailure("RECOVERY_PROOF_CHANGED")
      const target = path.join(recoveryDir, `proof-${index}.data`)
      await writeBaselineProof(target, bytes)
      evidenceFiles.push({ path: target, sha256: file.sha256 })
    }
    const live = manifest.pins.mode === "live" ? await (async () => {
      const config = await readPrivateBaselineJson(path.join(directory, "ops-config.json")) as NodeOpsConfig
      const lease = await readPrivateBaselineJson(path.join(directory, "stand-handle.json")) as NodeStandLease
      const { verifyBaselineStand, preflightNodeStand } = await import("./node-eval-ops")
      await verifyBaselineStand(config, lease, directory)
      const receipt = await preflightNodeStand(config, lease, env, path.join(config.runtimeRoot, "operations/stand.lease", `baseline-recovery-${id}`))
      if (JSON.stringify(await captureBaselinePins(config, env)) !== JSON.stringify(manifest.pins)) throw new BaselineFailure("PINS_CHANGED")
      return { ...receipt, admissionProof: await readPrivateBaselineJson(receipt.admission), processProof: await readPrivateBaselineJson(receipt.processEvidence) }
    })() : null
    const evidencePath = path.join(recoveryDir, "admission.json")
    await writeBaselineProof(evidencePath, JSON.stringify({ proof, validation, live }))
    const recovery: BaselineRecovery = { id, kind: proof.kind, state: "admitted", sourceExecutionId: record.runId, sourceRunDir: record.runDir, evidencePath,
      evidenceSha256: baselineHash(await Bun.file(evidencePath).bytes()), evidenceFiles, cause: proof.cause, taskId: proof.taskId, runId: proof.runId }
    job.recoveries = [...job.recoveries ?? [], recovery]
    await atomicJournal(directory, journal)
    return { code: 0, status: "RECOVERY_ADMITTED", recoveryId: id, state: recovery.state }
  })
}

async function writeBaselineProof(file: string, raw: string | Uint8Array) {
  const handle = await open(file, "wx", 0o400)
  try { await handle.writeFile(raw); await handle.sync() } finally { await handle.close() }
  const parent = await open(path.dirname(file), constants.O_RDONLY | constants.O_DIRECTORY)
  try { await parent.sync() } finally { await parent.close() }
}

function effectiveMeasurement(job: BaselineJournal["jobs"][number]) {
  const records = [job.record, ...(job.recoveries ?? []).map(recovery => recovery.record)].filter((record): record is RecordedRun => Boolean(record))
  return records.find(record => record.measured) ?? records.at(-1)
}

/** Runs only inside the reserved, supervised judge worker; never calls the product. */
export async function judgeBaselineRecovery(directory: string, key: string, id: string, env: Record<string, string | undefined> = process.env) {
  const { manifest, journal } = await readBaseline(directory)
  const job = journal.jobs.find(job => job.key === key)
  const recovery = job?.recoveries?.find(recovery => recovery.id === id)
  const source = [job?.record, ...(job?.recoveries ?? []).map(recovery => recovery.record)].find(record => record?.runDir === recovery?.sourceRunDir && record?.runId === recovery?.sourceExecutionId)
  if (journal.release || !job || !recovery || recovery.kind !== "judge" || recovery.state !== "running" || !source || source.measured ||
    journal.jobs.find(job => !effectiveMeasurement(job)?.measured) !== job) throw new BaselineFailure("RECOVERY_SLOT_INELIGIBLE")
  if (JSON.stringify(await snapshotDirectory(source.runDir)) !== JSON.stringify(source.files)) throw new BaselineFailure("EVIDENCE_CHANGED")
  const expected = manifest.jobs.find(job => job.key === key)!
  const item = manifest.cases.find(item => item.key === expected.caseKey)!
  if (item.collection === "node" || JSON.stringify(await snapshotDirectory(path.join(journal.checkout, "evals", item.directory))) !== JSON.stringify(item.files))
    throw new BaselineFailure("CORPUS_CHANGED")
  if (manifest.pins.mode === "live") {
    const config = await readPrivateBaselineJson(path.join(directory, "ops-config.json")) as NodeOpsConfig
    if (JSON.stringify(await captureBaselinePins(config, env)) !== JSON.stringify(manifest.pins)) throw new BaselineFailure("PINS_CHANGED")
  }
  if (manifest.pins.mode === "fixture" && (env.EVAL_BASELINE_FIXTURE !== "1" || env.EVAL_CLI_MODE !== "fake" ||
    !env.EVAL_JUDGE_COMMAND?.split(" ").includes(path.join(journal.checkout, "evals/fixtures/fake-codex.ts")))) throw new BaselineFailure("FIXTURE_JUDGE_REQUIRED")
  const parent = path.dirname(recovery.evidencePath)
  await writeFile(path.join(parent, "harness-process.json"), JSON.stringify({ pid: process.pid, starttime: await processStarttime(process.pid), uid: process.getuid?.() }), { flag: "wx", mode: 0o600 })
  const previous = await Bun.file(path.join(source.runDir, "summary.json")).json() as RunSummary
  const result = previous.tasks[0]!.attempts[0]!
  if (!source.cleanup || !["completed", "failed", "timeout"].includes(result.status) || result.judge_status !== "error" || !result.package_path)
    throw new BaselineFailure("RECOVERY_SLOT_INELIGIBLE")
  const { loadConfig } = await import("./config")
  const config = loadConfig(["--judge-only", source.runId], env)
  const { judgeInfo, judgeTask, judgedFields } = await import("./judge")
  const judge = await judgeInfo(config)
  if (judge.model !== manifest.pins.judgeModel || judge.reasoning !== manifest.pins.judgeReasoning || manifest.pins.mode === "live" &&
    (judge.prompt_sha256 !== manifest.pins.promptSha256 || judge.schema_sha256 !== manifest.pins.schemaSha256)) throw new BaselineFailure("JUDGE_PINS_CHANGED")
  const task = (await loadTasks(path.join(journal.checkout, "evals", path.dirname(item.directory)), [item.id]))[0]!
  const runDir = path.join(parent, "runs", `judge-${id}`)
  await mkdir(runDir, { mode: 0o700 })
  const out = path.join(runDir, item.id, "1")
  const original = path.join(source.runDir, item.id, "1")
  for (const relative of ["artifact", "run.json", "prompt.txt", "cleanup.json", ...(result.infra_retry ? ["infra-error/cleanup.json"] : [])]) {
    await mkdir(path.dirname(path.join(out, relative)), { recursive: true, mode: 0o700 })
    await cp(path.join(original, relative), path.join(out, relative), { recursive: true, force: false, errorOnExist: true })
  }
  if (await Bun.file(path.join(source.runDir, "config.json")).exists()) await cp(path.join(source.runDir, "config.json"), path.join(runDir, "config.json"), { errorOnExist: true })
  const started = Date.now()
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  const judged = await (async () => {
    try { return await judgeTask({ task, run: await Bun.file(path.join(out, "run.json")).json() as AgentRun,
      artifactDir: path.join(out, "artifact"), prompt: await Bun.file(path.join(out, "prompt.txt")).text(), outDir: path.join(out, "judge"),
      judge: { command: config.judge.command, model: manifest.pins.judgeModel, reasoning: manifest.pins.judgeReasoning,
        timeoutMs: manifest.pins.judgeTimeoutMs, passThreshold: manifest.pins.threshold }, signal: controller.signal }) }
    catch { return { ok: false as const, error: "JUDGE_OPERATION_FAILED", attempts: 0 as const } }
    finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop) }
  })()
  const { evaluationContractHash } = await import("./evaluation")
  const { rubricHash } = await import("./task")
  const rubric = await rubricHash([task])
  if (manifest.pins.mode === "live" && previous.rubric_hash !== rubric) throw new BaselineFailure("MEASUREMENT_LINEAGE_CHANGED")
  const updated: AttemptResult = { ...result, ...judgedFields(judged), evaluation_contract_hash: evaluationContractHash({ rubric_hash: rubric, judge, pass_threshold: manifest.pins.threshold }) }
  await writeFile(path.join(out, "result.json"), JSON.stringify(updated), { flag: "wx", mode: 0o600 })
  await writeFile(path.join(runDir, "judge-recovery.json"), JSON.stringify({ version: 1, sourceRunId: source.runId, sourceFilesSha256: baselineHash(JSON.stringify(source.files)),
    artifactSha256: baselineHash(await Bun.file(path.join(out, "artifact/package.lgp")).bytes()), durationMs: Date.now() - started }), { flag: "wx", mode: 0o600 })
  await writeFile(path.join(runDir, "summary.json"), JSON.stringify({ ...previous, run_id: `judge-${id}`, started_at: new Date(started).toISOString(), finished_at: new Date().toISOString(),
    interrupted: controller.signal.aborted, stopped_reason: controller.signal.aborted ? "JUDGE_RECOVERY_INTERRUPTED" : null, judge, rubric_hash: rubric,
    metrics: aggregate([updated], false), tasks: [{ ...previous.tasks[0]!, attempts: [updated], metrics: aggregateTask([updated], false) }] }), { flag: "wx", mode: 0o600 })
  return { code: 0, status: judged.ok ? "SCORED" : "JUDGE_ERROR" }
}

async function inspectJudgeRecovery(job: BaselineJournal["jobs"][number], recovery: BaselineRecovery, runDir: string, record: RecordedRun, taskId: string) {
  const source = [job.record, ...(job.recoveries ?? []).map(recovery => recovery.record)].find(record => record?.runDir === recovery.sourceRunDir && record?.runId === recovery.sourceExecutionId)
  const metadata = await Bun.file(path.join(runDir, "judge-recovery.json")).json() as { version: number; sourceRunId: string; sourceFilesSha256: string; artifactSha256: string; durationMs: number }
  if (!source || metadata.version !== 1 || metadata.sourceRunId !== source.runId || metadata.sourceFilesSha256 !== baselineHash(JSON.stringify(source.files)) ||
    !Number.isFinite(metadata.durationMs) || metadata.durationMs < 0 || metadata.artifactSha256 !== baselineHash(await Bun.file(path.join(source.runDir, taskId, "1/artifact/package.lgp")).bytes()) ||
    metadata.artifactSha256 !== baselineHash(await Bun.file(path.join(runDir, taskId, "1/artifact/package.lgp")).bytes())) throw new BaselineFailure("JUDGE_ARTIFACT_CHANGED")
  const previous = (await Bun.file(path.join(source.runDir, "summary.json")).json() as RunSummary).tasks[0]!.attempts[0]!
  const current = (await Bun.file(path.join(runDir, "summary.json")).json() as RunSummary).tasks[0]!.attempts[0]!
  const product = (result: AttemptResult) => JSON.stringify([result.status, result.duration_ms, result.cost, result.tokens, result.package_path, result.infra_retry])
  if (product(previous) !== product(current)) throw new BaselineFailure("JUDGE_PRODUCT_CHANGED")
  const processes = await Bun.file(path.join(runDir, "judge-process-cleanup.json")).json()
  const cleanup = record.cleanup && source.cleanup && processes.status === "confirmed" && !processes.error && processes.capture_complete === true &&
    !processes.unknownProcesses?.length && processes.verification?.length >= 2 && processes.verification.every((pass: { owned_remaining: number }) => pass.owned_remaining === 0)
  return { ...record, cleanup, judgeDurationMs: metadata.durationMs }
}

async function beginBaselineRecovery(directory: string, key: string, id: string, current: { checkout: string; pins: BaselinePins }) {
  return mutateBaseline(directory, async (manifest, journal) => {
    if (journal.release) throw new BaselineFailure("SERIES_RELEASED")
    if (JSON.stringify(current.pins) !== JSON.stringify(manifest.pins) || current.checkout !== journal.checkout) throw new BaselineFailure("PINS_CHANGED")
    for (const item of manifest.cases) if (JSON.stringify(await snapshotDirectory(path.join(current.checkout, "evals", item.directory))) !== JSON.stringify(item.files))
      throw new BaselineFailure("CORPUS_CHANGED")
    const job = journal.jobs.find(job => job.key === key)
    const recovery = job?.recoveries?.find(recovery => recovery.id === id)
    if (!job || !recovery || recovery.state !== "admitted" || effectiveMeasurement(job)?.measured ||
      journal.jobs.find(job => !effectiveMeasurement(job)?.measured) !== job) throw new BaselineFailure("RECOVERY_SLOT_INELIGIBLE")
    const report = await checkBaseline(directory)
    if (report.coverage.unknown || !report.cleanup) throw new BaselineFailure("CLEANUP_UNKNOWN")
    const resultsDir = path.join(path.dirname(recovery.evidencePath), "runs")
    await mkdir(resultsDir, { mode: 0o700 })
    recovery.state = "running"
    await atomicJournal(directory, journal)
    const expected = manifest.jobs.find(job => job.key === key)!
    return { resultsDir, job: expected, case: manifest.cases.find(item => item.key === expected.caseKey)!, kind: recovery.kind }
  })
}

async function dispatchBaselineJob(directory: string, key: string, current: { checkout: string; pins: BaselinePins }, env: Record<string, string | undefined>, recoveryId?: string) {
  const { manifest } = await readBaseline(directory)
  const admitted = recoveryId ? await beginBaselineRecovery(directory, key, recoveryId, current) : await beginBaselineMeasurement(directory, key, current)
  const parent = path.dirname(admitted.resultsDir)
  if ("kind" in admitted && admitted.kind === "judge") {
    const { superviseProcess } = await import("./process-supervisor")
    await mkdir(path.join(parent, "judge-processes"), { mode: 0o700 })
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.on("SIGINT", stop)
    process.on("SIGTERM", stop)
    const supervised = await (async () => {
      try { return await superviseProcess({ cmd: [process.execPath, path.join(current.checkout, "evals/script/judge-baseline-recovery.ts"), directory, key, recoveryId!],
        cwd: path.join(current.checkout, "evals"), env: Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
        outDir: path.join(parent, "judge-processes"), timeoutMs: current.pins.judgeTimeoutMs * 2 + 60_000, signal: controller.signal }) }
      finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop) }
    })()
    const runs = (await readdir(admitted.resultsDir, { withFileTypes: true })).filter(item => item.isDirectory())
    if (runs.length !== 1 || !await Bun.file(path.join(admitted.resultsDir, runs[0]!.name, "summary.json")).exists())
      throw new BaselineFailure("UNKNOWN_OUTCOME_REQUIRES_RECOVERY")
    const runDir = path.join(admitted.resultsDir, runs[0]!.name)
    await writeBaselineProof(path.join(runDir, "judge-process-cleanup.json"), JSON.stringify(supervised.processCleanup))
    const record = await recordBaselineMeasurement(directory, key, runDir, recoveryId)
    if (!record.cleanup) throw new BaselineFailure("CLEANUP_UNKNOWN")
    if (supervised.interrupted) throw new BaselineFailure("SERIES_STOPPED_WITH_RETAINED_STAND")
    return record
  }
  const script = admitted.case.collection === "node" ? "script/run-node-evals.ts" : "src/run.ts"
  const argv = [process.execPath, path.join(current.checkout, "evals", script), "--tasks", path.join(current.checkout, "evals", path.dirname(admitted.case.directory)),
    "--only", admitted.case.id, "--repeat", "1", "--infra-retries", String(manifest.infraRetries), "--timeout-ms", String(current.pins.timeoutMs), "--label", key]
  const child = Bun.spawn(argv, { cwd: path.join(current.checkout, "evals"), env: { ...env, EVAL_RESULTS_DIR: admitted.resultsDir,
    EVAL_HARNESS_LEASE_RECEIPT: path.join(parent, "harness-admission.json"), EVAL_REPEAT: "1",
    EVAL_PASS_THRESHOLD: String(current.pins.threshold), EVAL_JUDGE_TIMEOUT_MS: String(current.pins.judgeTimeoutMs) },
    stdout: Bun.file(path.join(parent, "harness.stdout")), stderr: Bun.file(path.join(parent, "harness.stderr")) })
  await writeFile(path.join(parent, "harness-process.json"), JSON.stringify({ pid: child.pid, starttime: await processStarttime(child.pid), uid: process.getuid?.() }), { flag: "wx", mode: 0o600 })
  const stop = () => child.kill("SIGINT")
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  try { await child.exited }
  finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop) }
  const runs = (await readdir(admitted.resultsDir, { withFileTypes: true })).filter(item => item.isDirectory())
  if (runs.length !== 1) throw new BaselineFailure("UNKNOWN_OUTCOME")
  const record = await recordBaselineMeasurement(directory, key, path.join(admitted.resultsDir, runs[0]!.name), recoveryId)
  if (!record.cleanup) throw new BaselineFailure("CLEANUP_UNKNOWN")
  return record
}

async function writeBaselineReport(directory: string, report: Awaited<ReturnType<typeof checkBaseline>>) {
  const out = path.join(directory, "reports", crypto.randomUUID())
  await mkdir(out, { recursive: true, mode: 0o700 })
  const rows = report.rows.map(row => ({ key: row.key, caseKey: row.caseKey, attempt: row.attempt, state: row.state, measured: row.measured,
    cleanup: row.cleanup, verdict: row.verdict, runDir: row.runDir, status: row.result?.status ?? null,
    judge_status: row.result?.judge_status ?? null, score: row.result?.score ?? null, pass: row.result?.pass ?? null,
    duration_ms: row.result?.duration_ms ?? 0, tokens: row.result?.tokens ?? null, cost: row.result?.cost ?? 0 }))
  await writeFile(path.join(out, "baseline.json"), JSON.stringify({ ...report, rows }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  await writeFile(path.join(out, "report.md"), [
    `# ${report.kind === "smoke" ? "Smoke" : "Baseline"} ${report.id}: ${report.status}`, "",
    `Ожидается ${report.coverage.expected}; сохранено ${report.coverage.recorded}; измерено ${report.coverage.measured}; не запущено ${report.coverage.pending}; неизвестный исход ${report.coverage.unknown}.`,
    `Очистка: ${report.cleanup ? "подтверждена" : "не подтверждена"}; стенд: ${report.released ? "освобождён" : "освобождение не подтверждено"}.`, "",
    ...(report.smokeVerification ? [`Проверки smoke: ${JSON.stringify(report.smokeVerification)}.`, ""] : []),
    "Метрики судьи представлены отдельно для regular и analytic. Узловой code PASS не входит в общий score.", "",
    `Расход продукта с infra retry: ${JSON.stringify(report.spending)}. Токены судьи не предоставлены текущим harness.`, "",
    ...report.infrastructure.map(error => `${error.caseKey}#${error.attempt} (${error.phase}): ${error.status}; judge=${error.judge_status}.`), "",
    ...Object.entries(report.groups).map(([collection, group]) => `${collection}: ${JSON.stringify(group.metrics)}`), "",
    ...report.nodes.map(node => `${node.id}: PASS ${node.passed}/${node.expected}; измерено ${node.measured}/${node.expected}.`), "",
    "| Кейс | Попытка | Состояние | Результат | Измерено | Судья | Время, мс |",
    "|---|---:|---|---|---|---|---:|",
    ...rows.map(row => `| ${row.caseKey} | ${row.attempt} | ${row.state} | ${row.verdict ?? "—"} (${row.status ?? "—"}) | ${row.measured} | ${row.judge_status ?? "—"} | ${row.duration_ms} |`), "",
  ].join("\n"), { flag: "wx", mode: 0o600 })
  return out
}

// Each original harness run evaluates one case. Preserve that evaluation lineage when
// combining its logical attempts; a synthetic corpus-wide rubric would invalidate it.
async function writeBaselineComparison(out: string, before: Awaited<ReturnType<typeof checkBaseline>>, after: Awaited<ReturnType<typeof checkBaseline>>) {
  const { compare } = await import("./compare")
  const environment = before.manifest.pins.isolationSha256 === after.manifest.pins.isolationSha256
    ? "Пины изоляции совпадают." : "Пины изоляции различаются: контролируемое сравнение качества не подтверждено."
  for (const collection of ["regular", "analytic"] as const) {
    const keys = [...new Set([...before.manifest.cases, ...after.manifest.cases].filter(item => item.collection === collection).map(item => item.key))]
    const sections: string[] = []
    for (const key of keys) {
      const a = await baselineCaseSummary(before, key)
      const b = await baselineCaseSummary(after, key)
      sections.push(a && b ? compare(a, b) : `${key}: нет сохранённых результатов в одной из серий; сравнение недоступно.`)
    }
    await writeFile(path.join(out, `compare-${collection}.md`), [`# ${collection}: ${before.id} → ${after.id}`, environment,
      "Сравнения штатного harness представлены по кейсам; их повторения сохраняют исходные rubric/evaluation hashes.", ...sections].join("\n\n"), { flag: "wx", mode: 0o600 })
  }
  await writeFile(path.join(out, "compare-node.json"), JSON.stringify({ before: before.id, after: after.id, environment,
    nodes: [...new Set([...before.nodes, ...after.nodes].map(node => node.id))].map(id => ({ id,
      before: before.nodes.find(node => node.id === id) ?? null, after: after.nodes.find(node => node.id === id) ?? null })) }, null, 2), { flag: "wx", mode: 0o600 })
}

async function baselineCaseSummary(report: Awaited<ReturnType<typeof checkBaseline>>, key: string): Promise<RunSummary | undefined> {
  const rows = report.rows.filter(row => row.caseKey === key && row.runDir)
  if (!rows.length) return undefined
  const summaries = await Promise.all(rows.map(async row => Bun.file(path.join(row.runDir!, "summary.json")).json() as Promise<RunSummary>))
  const first = summaries[0]!
  if (summaries.some(summary => summary.agent_inputs_hash !== first.agent_inputs_hash || summary.rubric_hash !== first.rubric_hash ||
    JSON.stringify(summary.judge) !== JSON.stringify(first.judge))) throw new BaselineFailure("MEASUREMENT_LINEAGE_CHANGED")
  const attempts = rows.map(row => ({ ...row.result!, attempt: row.attempt }))
  const expected = report.manifest.kind === "smoke" ? 1 : 3
  return { ...first, run_id: `${report.id}:${first.task_ids[0]}`, label: report.kind, started_at: summaries.map(run => run.started_at).sort()[0]!,
    finished_at: summaries.map(run => run.finished_at).sort().at(-1)!, interrupted: summaries.some(run => run.interrupted),
    stopped_reason: rows.length === expected ? summaries.find(run => run.stopped_reason)?.stopped_reason ?? null : "INCOMPLETE_BASELINE_CASE",
    config: { ...first.config, repeat: expected }, metrics: aggregate(attempts, false),
    tasks: [{ ...first.tasks[0]!, attempts, metrics: aggregateTask(attempts, false) }] }
}

async function exportBaselineReport(directory: string, reportDir: string, report: Awaited<ReturnType<typeof checkBaseline>>, env: Record<string, string | undefined>) {
  const out = path.join(directory, "exports", crypto.randomUUID())
  const payload = path.join(out, "payload")
  await mkdir(payload, { recursive: true, mode: 0o700 })
  const secrets = [env.LOGINOM_PASSWORD, env.LOGINOM_DOCK_API_KEY, env.EVAL_AGENT_PROVIDER_API_KEY].filter((value): value is string => Boolean(value && value.length > 3))
  if (report.manifest.pins.mode === "live") {
    const config = await readPrivateBaselineJson(path.join(directory, "ops-config.json")) as NodeOpsConfig
    const auth = await readPrivateBaselineJson(path.join(config.roles.evalbaseline!.evalProfile, "data/auth.json")) as { openai?: { access?: string; refresh?: string } }
    secrets.push(...[auth.openai?.access, auth.openai?.refresh].filter((value): value is string => Boolean(value)))
  }
  const selected: { source: string; target: string }[] = [
    { source: path.join(directory, "manifest.json"), target: "manifest.json" },
    ...(await readdir(reportDir)).filter(name => ["baseline.json", "report.md", "compare-regular.md", "compare-analytic.md", "compare-node.json"].includes(name))
      .map(name => ({ source: path.join(reportDir, name), target: name })),
  ]
  for (const execution of report.executions) {
    const recovery = report.recoveries.find(recovery => recovery.record?.runDir === execution.record.runDir)
    for (const item of execution.record.files) {
      if (!/^(summary\.json|config\.json|report\.md|code-verdict\.json|code-report\.md|judge-recovery\.json)$/.test(item.path) &&
        !/^[^/]+\/1\/(?:infra-error\/)?(?:judge\/(?:verdict(?:-[12])?|attempt-[12])\.json|verdict(?:\.prev)?\.json|oracle\.json|artifact\/package\.lgp|artifact\/results\/[^/]+\.csv)$/.test(item.path)) continue
      selected.push({ source: path.join(execution.record.runDir, item.path), target: `measurements/${execution.key}${recovery ? `/recoveries/${recovery.id}` : ""}/${item.path}` })
    }
  }
  for (const item of selected) {
    const bytes = await Bun.file(item.source).bytes()
    const text = item.source.endsWith(".lgp") ? (await Bun.$`unzip -p ${item.source}`.quiet()).text() : new TextDecoder().decode(bytes)
    if (secrets.some(secret => text.includes(secret))) throw new BaselineFailure("EXPORT_SECRET_DETECTED")
    await mkdir(path.dirname(path.join(payload, item.target)), { recursive: true, mode: 0o700 })
    await cp(item.source, path.join(payload, item.target), { errorOnExist: true, force: false })
    await chmod(path.join(payload, item.target), 0o444)
  }
  const files = await snapshotDirectory(payload)
  await writeFile(path.join(payload, "delivery-manifest.json"), JSON.stringify({ version: 1, baselineId: report.id, files }, null, 2), { flag: "wx", mode: 0o444 })
  const archive = path.join(out, "baseline-evidence.tar.gz")
  const script = path.join(import.meta.dir, "../script/baseline-archive.py")
  await Bun.$`python3 ${script} create ${payload} ${archive}`.quiet()
  const archiveSha256 = baselineHash(await Bun.file(archive).bytes())
  await Bun.$`python3 ${script} verify ${archive} ${archiveSha256}`.quiet()
  await chmod(archive, 0o444)
  return { archive, archiveSha256, deliveryManifestSha256: baselineHash(await Bun.file(path.join(payload, "delivery-manifest.json")).bytes()) }
}

async function inspectMeasurement(manifest: BaselineManifest, item: BaselineCase, checkout: string, runDir: string): Promise<RecordedRun> {
  const summary = await Bun.file(path.join(runDir, "summary.json")).json() as RunSummary
  if (summary.config?.repeat !== 1 || JSON.stringify(summary.task_ids) !== JSON.stringify([item.id]) || summary.tasks?.length !== 1 ||
    summary.tasks[0]?.id !== item.id || summary.tasks[0].attempts.length !== 1 || summary.tasks[0].attempts[0]?.attempt !== 1 || summary.tasks[0].attempts[0].task_id !== item.id)
    throw new BaselineFailure("INVALID_MEASUREMENT")
  const result = summary.tasks[0].attempts[0]
  if ((summary.config.infra_retries ?? 1) !== manifest.infraRetries || manifest.infraRetries === 0 && result.infra_retry)
    throw new BaselineFailure("RETRY_BUDGET_CHANGED")
  const cleanups = await Promise.all([path.join(runDir, item.id, "1"), ...(result.infra_retry ? [path.join(runDir, item.id, "1", "infra-error")] : [])]
    .map(async out => Bun.file(path.join(out, "cleanup.json")).json()))
  const cleanup = summary.storage_leftovers?.length === 0 && !result.cleanup_error && result.environment_cleanup?.status === "confirmed" && cleanups.every(proof =>
    proof.result?.status === "confirmed" && !proof.result?.error && proof.processes?.status === "confirmed" &&
    ["processes", "diagnostics", "writer", "ready", "profile_history", ...(manifest.pins.mode === "live" ? ["storage"] : [])].every(stage => proof.stages?.some((item: { stage: string; status: string }) => item.stage === stage && item.status === "confirmed")))
  if (manifest.pins.mode === "live" && (summary.agent?.cli_version !== manifest.pins.cliVersion || summary.agent.source_commit !== manifest.pins.cliSource ||
    summary.agent.binary_sha256 !== manifest.pins.binarySha256 || summary.agent.model !== manifest.pins.model || summary.agent.variant !== manifest.pins.variant ||
    summary.harness?.dirty || !manifest.pins.harnessSha.startsWith(summary.harness?.git_sha ?? "UNKNOWN") || summary.agent.source_dirty !== false ||
    summary.config.timeout_ms !== manifest.pins.timeoutMs || summary.config.infra_retries !== manifest.infraRetries || summary.config.judge_timeout_ms !== manifest.pins.judgeTimeoutMs || summary.config.pass_threshold !== manifest.pins.threshold ||
    summary.loginom?.image_digest !== manifest.pins.imageDigest || summary.dock?.skill_revision !== manifest.pins.dockRevision)) throw new BaselineFailure("RUN_PINS_CHANGED")
  const product = ["completed", "failed", "timeout", "no_artifact"].includes(result.status)
  if (item.collection === "node") {
    const verdict = await validateNodeRun(runDir, [item.id], path.join(checkout, "evals", path.dirname(item.directory)))
    return { runDir, runId: summary.run_id, files: await snapshotDirectory(runDir), measured: product && verdict.code !== 2,
      cleanup, verdict: verdict.code === 2 ? "ERROR" : verdict.code === 1 ? "FAIL" : "PASS" }
  }
  const evaluated = ["scored", "no_artifact"].includes(result.judge_status) && typeof result.pass === "boolean"
  if (manifest.pins.mode === "live" && (summary.judge?.model !== manifest.pins.judgeModel || summary.judge.reasoning !== manifest.pins.judgeReasoning ||
    summary.judge.prompt_sha256 !== manifest.pins.promptSha256 || summary.judge.schema_sha256 !== manifest.pins.schemaSha256)) throw new BaselineFailure("JUDGE_PINS_CHANGED")
  return { runDir, runId: summary.run_id, files: await snapshotDirectory(runDir), measured: product && evaluated, cleanup,
    verdict: !product || !evaluated ? "ERROR" : result.pass ? "PASS" : "FAIL" }
}

async function readBaseline(directory: string) {
  const raw = await Bun.file(path.join(directory, "manifest.json")).text()
  const manifest = JSON.parse(raw) as BaselineManifest
  const journal = await Bun.file(path.join(directory, "journal.json")).json() as BaselineJournal
  if (manifest.version !== 1 || manifest.infraRetries !== (manifest.kind === "smoke" ? 0 : 1) || journal.version !== 1 || journal.manifestSha256 !== baselineHash(raw) ||
    JSON.stringify(journal.jobs.map(job => job.key)) !== JSON.stringify(manifest.jobs.map(job => job.key))) throw new BaselineFailure("MANIFEST_CHANGED")
  return { manifest, journal }
}

async function mutateBaseline<T>(directory: string, operation: (manifest: BaselineManifest, journal: BaselineJournal) => Promise<T>) {
  const guard = path.join(directory, "journal.lock")
  await mkdir(guard, { mode: 0o700 }).catch(() => { throw new BaselineFailure("JOURNAL_BUSY_REQUIRES_INSPECTION") })
  const info = await lstat(guard)
  try { const { manifest, journal } = await readBaseline(directory); return await operation(manifest, journal) }
  finally {
    const current = await lstat(guard)
    if (current.dev === info.dev && current.ino === info.ino && !current.isSymbolicLink()) await rm(guard, { recursive: true })
  }
}

async function atomicJournal(directory: string, journal: BaselineJournal) {
  const temp = path.join(directory, `journal-${crypto.randomUUID()}.tmp`)
  const file = await open(temp, "wx", 0o600)
  try { await file.writeFile(JSON.stringify(journal, null, 2) + "\n"); await file.sync() }
  finally { await file.close() }
  await rename(temp, path.join(directory, "journal.json"))
  const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY)
  try { await parent.sync() } finally { await parent.close() }
}

async function snapshotDirectory(directory: string, relative = ""): Promise<{ path: string; sha256: string }[]> {
  const files: { path: string; sha256: string }[] = []
  for (const name of (await readdir(path.join(directory, relative))).sort()) {
    const file = path.join(relative, name)
    const info = await lstat(path.join(directory, file))
    if (info.isSymbolicLink()) throw new BaselineFailure("CORPUS_SYMLINK_REFUSED")
    if (info.isDirectory()) files.push(...await snapshotDirectory(directory, file))
    if (info.isFile()) files.push({ path: file, sha256: baselineHash(await Bun.file(path.join(directory, file)).bytes()) })
  }
  return files
}

function validatePins(pins: BaselinePins) {
  if (!["live", "fixture"].includes(pins.mode) || ![pins.harnessSha, pins.corpusSha, pins.cliSource].every(value => /^[0-9a-f]{40}$/.test(value)) ||
    ![pins.cliManifestSha256, pins.binarySha256, pins.promptSha256, pins.schemaSha256, pins.opsConfigSha256, pins.isolationSha256].every(value => /^[0-9a-f]{64}$/.test(value)) ||
    pins.model !== "openai/gpt-6.1-sol" || pins.variant !== "medium" || pins.judgeModel !== "gpt-6-astra" || pins.judgeReasoning !== "high" ||
    pins.cliVersion !== "0.1.17" || pins.cliSource !== "fc3d97dbf695c2ed8dba942feb6fe83591a33944" || pins.threshold !== 70 ||
    pins.timeoutMs !== 1_800_000 || pins.judgeTimeoutMs !== 300_000) throw new BaselineFailure("INVALID_PINS")
}
