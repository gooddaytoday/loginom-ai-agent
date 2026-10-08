import path from "node:path"
import { lstat, mkdir, open, readdir, readFile, readlink, realpath, rename, rm, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { loadTasks } from "./task"
import { aggregate, aggregateTask, type AttemptResult, type RunSummary } from "./report"
import { validateNodeRun } from "./node-evals"
import { parseArgs } from "node:util"
import type { NodeOpsConfig, NodeStandLease } from "./node-eval-ops"
import { dockSkillRevision } from "./preflight"

export type BaselinePins = {
  mode: "live" | "fixture"; harnessSha: string; corpusSha: string; cliVersion: string; cliSource: string
  cliManifestSha256: string; binarySha256: string; model: string; variant: string; judgeModel: string; judgeReasoning: string
  threshold: number; timeoutMs: number; judgeTimeoutMs: number; promptSha256: string; schemaSha256: string
  opsConfigSha256: string; isolationSha256: string; endpoint: string; containerId: string; imageDigest: string; dockRevision: string
}
export type BaselineCollection = "regular" | "analytic" | "node"
type BaselineCase = { key: string; id: string; collection: BaselineCollection; directory: string; files: { path: string; sha256: string }[] }
export type BaselineManifest = { version: 1; id: string; kind: "baseline" | "smoke"; createdAt: string; pins: BaselinePins
  cases: BaselineCase[]; jobs: { key: string; caseKey: string; attempt: number }[] }
type RecordedRun = { runDir: string; runId: string; files: { path: string; sha256: string }[]; measured: boolean; cleanup: boolean; verdict: "PASS" | "FAIL" | "ERROR" }
type BaselineRow = { key: string; caseKey: string; attempt: number; collection: BaselineCollection; state: "pending" | "running" | "recorded"
  measured: boolean; cleanup: boolean; verdict: RecordedRun["verdict"] | null; runDir: string | null; result: AttemptResult | null }
type BaselineRelease = { status: "RELEASED"; evidenceSha256: string; receiptPath?: string; receiptSha256?: string }
type BaselineJournal = { version: 1; manifestSha256: string; checkout: string; release?: BaselineRelease
  jobs: { key: string; state: "pending" | "running" | "recorded"; dispatchedAt?: string; record?: RecordedRun }[] }

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
  const { nodeRoleCli, nodeStandStatus } = await import("./node-eval-ops")
  const role = config.roles.evalbaseline
  if (config.version !== 2 || !role || env.EVAL_CLI_MODE !== "binary" || env.EVAL_CLI_BIN !== nodeRoleCli(config, "evalbaseline") ||
    env.EVAL_PROFILE_DIR !== role.evalProfile || env.EVAL_WORKSPACE_ROOT !== role.workRoots[0] || env.EVAL_ARTIFACT_SOURCE !== "docker" ||
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

export async function prepareBaseline(directory: string, options: { checkout: string; pins: BaselinePins; smoke?: boolean }) {
  validatePins(options.pins)
  const collections = [["regular", "tasks"], ["analytic", "tasks/analytic"], ["node", "tasks/node-evals"]] as const
  const cases: BaselineCase[] = []
  for (const [collection, relative] of collections) {
    for (const task of await loadTasks(path.join(options.checkout, "evals", relative))) {
      if (options.smoke && !["regular:calc-data-double", "node:crosstable-fixed-sum"].includes(`${collection}:${task.id}`)) continue
      cases.push({ key: `${collection}:${task.id}`, id: task.id, collection, directory: `${relative}/${task.id}`,
        files: await snapshotDirectory(task.dir) })
    }
  }
  const manifest: BaselineManifest = { version: 1, id: crypto.randomUUID(), kind: options.smoke ? "smoke" : "baseline",
    createdAt: new Date().toISOString(), pins: options.pins, cases,
    jobs: (options.smoke ? [1] : [1, 2, 3]).flatMap(attempt => cases.map(item => ({ key: `${item.collection}-${item.id}-${attempt}`, caseKey: item.key, attempt }))) }
  await mkdir(directory, { mode: 0o700 }).catch(() => { throw new BaselineFailure("SERIES_EXISTS") })
  const raw = JSON.stringify(manifest, null, 2) + "\n"
  await writeFile(path.join(directory, "manifest.json"), raw, { flag: "wx", mode: 0o600 })
  const journal: BaselineJournal = { version: 1, manifestSha256: baselineHash(raw), checkout: options.checkout,
    jobs: manifest.jobs.map(job => ({ key: job.key, state: "pending" })) }
  await atomicJournal(directory, journal)
  return manifest
}

/** Durable admission precedes dispatch. A running row is never interpreted as permission to retry. */
export async function beginBaselineMeasurement(directory: string, key: string, current: { checkout: string; pins: BaselinePins }) {
  return mutateBaseline(directory, async (manifest, journal) => {
    if (JSON.stringify(manifest.pins) !== JSON.stringify(current.pins) || journal.checkout !== current.checkout) throw new BaselineFailure("PINS_CHANGED")
    for (const item of manifest.cases) if (JSON.stringify(await snapshotDirectory(path.join(current.checkout, "evals", item.directory))) !== JSON.stringify(item.files))
      throw new BaselineFailure("CORPUS_CHANGED")
    const job = journal.jobs.find(item => item.key === key)
    if (!job) throw new BaselineFailure("UNKNOWN_JOB")
    if (job.state !== "pending") throw new BaselineFailure("ALREADY_DISPATCHED")
    if (journal.jobs.some(item => item.state === "running")) throw new BaselineFailure("UNKNOWN_OUTCOME")
    if (journal.jobs.find(item => item.state === "pending") !== job) throw new BaselineFailure("ROUND_ORDER_CHANGED")
    const resultsDir = path.join(directory, "measurements", key, "runs")
    await mkdir(resultsDir, { recursive: true, mode: 0o700 })
    job.state = "running"
    job.dispatchedAt = new Date().toISOString()
    await atomicJournal(directory, journal)
    return { resultsDir, job: manifest.jobs.find(item => item.key === key)!, case: manifest.cases.find(item => item.key === manifest.jobs.find(job => job.key === key)!.caseKey)! }
  })
}

/** Record raw evidence, including product FAIL. No original result or judge verdict is rewritten. */
export async function recordBaselineMeasurement(directory: string, key: string, runDir: string) {
  return mutateBaseline(directory, async (manifest, journal) => {
    const job = journal.jobs.find(item => item.key === key)
    if (!job || job.state !== "running") throw new BaselineFailure("NOT_DISPATCHED")
    const root = path.join(directory, "measurements", key, "runs")
    if (await realpath(runDir) !== runDir || !runDir.startsWith(root + path.sep)) throw new BaselineFailure("RUN_PATH_REFUSED")
    const item = manifest.cases.find(item => item.key === manifest.jobs.find(job => job.key === key)!.caseKey)!
    const record = await inspectMeasurement(manifest, item, journal.checkout, runDir)
    job.record = record
    job.state = "recorded"
    await atomicJournal(directory, journal)
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
  for (const expected of manifest.jobs) {
    const job = journal.jobs.find(item => item.key === expected.key)!
    const item = manifest.cases.find(item => item.key === expected.caseKey)!
    if (!job.record) { rows.push({ ...expected, collection: item.collection, state: job.state, measured: false, cleanup: false, verdict: null, runDir: null, result: null }); continue }
    if (JSON.stringify(await snapshotDirectory(job.record.runDir)) !== JSON.stringify(job.record.files)) throw new BaselineFailure("EVIDENCE_CHANGED")
    const summary = await Bun.file(path.join(job.record.runDir, "summary.json")).json() as RunSummary
    rows.push({ ...expected, collection: item.collection, state: job.state, measured: job.record.measured, cleanup: job.record.cleanup,
      verdict: job.record.verdict, runDir: job.record.runDir, result: summary.tasks[0]!.attempts[0]! })
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
  const spent = rows.flatMap(row => row.result ? (row.result.infra_retry ? [row.result.infra_retry.initial, row.result] : [row.result]).map(result => ({ row, result })) : [])
  const spending = { duration_ms: spent.reduce((sum, item) => sum + item.result.duration_ms, 0),
    cost: spent.reduce((sum, item) => sum + item.result.cost, 0),
    tokens: { input: spent.reduce((sum, item) => sum + item.result.tokens.input, 0), output: spent.reduce((sum, item) => sum + item.result.tokens.output, 0),
      reasoning: spent.reduce((sum, item) => sum + item.result.tokens.reasoning, 0) }, judge_tokens: null }
  const infrastructure = spent.filter(item => ["infra_error", "harness_error", "interrupted"].includes(item.result.status) || item.result.judge_status === "error")
    .map(item => ({ key: item.row.key, caseKey: item.row.caseKey, attempt: item.row.attempt,
      phase: item.result === item.row.result ? "final" : "infra-retry-initial", status: item.result.status, judge_status: item.result.judge_status }))
  return { id: manifest.id, kind: manifest.kind, status: coverage.measured === coverage.expected && cleanup && journal.release ? "complete" : "incomplete",
    manifest, coverage, cleanup, released: Boolean(journal.release), groups, spending, infrastructure,
    nodes: manifest.cases.filter(item => item.collection === "node").map(item => ({ id: item.id, expected: manifest.kind === "smoke" ? 1 : 3,
      passed: rows.filter(row => row.caseKey === item.key && row.verdict === "PASS").length,
      measured: rows.filter(row => row.caseKey === item.key && row.measured).length })), rows }
}

export async function sealBaselineRelease(directory: string, receipt: BaselineRelease) {
  return mutateBaseline(directory, async (manifest, journal) => {
    if (receipt.status !== "RELEASED" || !/^[0-9a-f]{64}$/.test(receipt.evidenceSha256) ||
      journal.jobs.some(job => job.state === "running" || job.record && !job.record.cleanup)) throw new BaselineFailure("RELEASE_UNCONFIRMED")
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
    if (argv.includes("--help")) return { code: 0, status: "HELP", help: "run-baseline.ts prepare|start|resume|check|smoke --series DIR [--config PRIVATE --issue ID --task ID] [--compare SERIES]" }
    const values = parseArgs({ args: argv.slice(1), strict: true, options: { series: { type: "string" }, config: { type: "string" }, issue: { type: "string" }, task: { type: "string" }, compare: { type: "string" }, limit: { type: "string" }, "recover-executor": { type: "boolean" } } }).values
    const directory = values.series
    if (!directory || !path.isAbsolute(directory)) throw new BaselineFailure("SERIES_PATH_REQUIRED")
    if (command === "check") {
      const report = await checkBaseline(directory)
      const reportDir = await writeBaselineReport(directory, report)
      if (values.compare) await writeBaselineComparison(reportDir, await checkBaseline(values.compare), report)
      return { code: 0, status: report.status, ...report.coverage, reportDir }
    }
    if (["start", "resume"].includes(command ?? "") && env.EVAL_BASELINE_FIXTURE === "1") {
      const { manifest, journal } = await readBaseline(directory)
      if (manifest.pins.mode !== "fixture" || env.EVAL_CLI_MODE !== "fake" || !env.EVAL_ARTIFACT_SOURCE?.startsWith("dir:")) throw new BaselineFailure("FIXTURE_MODE_REQUIRED")
      if (command === "start" && journal.jobs.some(job => job.state !== "pending")) throw new BaselineFailure("USE_RESUME")
      const limit = Number(values.limit ?? manifest.jobs.length)
      if (!Number.isSafeInteger(limit) || limit < 1) throw new BaselineFailure("INVALID_LIMIT")
      for (const job of journal.jobs.filter(job => job.state === "pending").slice(0, limit)) {
        await dispatchBaselineJob(directory, job.key, { checkout: journal.checkout, pins: manifest.pins }, env)
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
      const manifest = await prepareBaseline(directory, { checkout: role.checkout, pins, smoke: command === "smoke" })
      if (command === "prepare") return { code: 0, status: "PREPARED", id: manifest.id, expected: manifest.jobs.length, cases: manifest.cases.length }
    }
    return await executeLiveBaseline(directory, config, env, pins, { issue: typeof values.issue === "string" ? values.issue : undefined,
      task: typeof values.task === "string" ? values.task : undefined, resume: command === "resume", recoverExecutor: values["recover-executor"] === true })
  } catch (error) { return { code: 2, status: "BLOCKED", reason: error instanceof BaselineFailure ? error.message : "BASELINE_OPERATION_FAILED" } }
}

async function executeLiveBaseline(directory: string, config: NodeOpsConfig, env: Record<string, string | undefined>, pins: BaselinePins,
  options: { issue?: string; task?: string; resume: boolean; recoverExecutor: boolean }) {
  const { acquireNodeStand, assertNodeStandOwner, preflightNodeStand, verifyBaselineStand, runNodeEvalOps } = await import("./node-eval-ops")
  const { manifest, journal } = await readBaseline(directory)
  if (JSON.stringify(pins) !== JSON.stringify(manifest.pins)) throw new BaselineFailure("PINS_CHANGED")
  if (!options.resume && journal.jobs.some(job => job.state !== "pending")) throw new BaselineFailure("USE_RESUME")
  if (journal.release) return { code: 0, ...await writeCheckResult(directory) }
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
    await preflightNodeStand(config, lease, env)
    for (const job of (await readBaseline(directory)).journal.jobs.filter(job => job.state === "pending")) {
      await assertNodeStandOwner(config, lease)
      const current = await captureBaselinePins(config, env)
      const record = await dispatchBaselineJob(directory, job.key, { checkout: journal.checkout, pins: current }, env)
      await verifyBaselineStand(config, lease, directory)
      await settleBaselineHarness(config, lease, directory)
      const summary = await Bun.file(path.join(record.runDir, "summary.json")).json() as RunSummary
      if (summary.interrupted || summary.stopped_reason) throw new BaselineFailure("SERIES_STOPPED_WITH_RETAINED_STAND")
    }
    const completion = path.join(directory, "stand-completion.json")
    await writeFile(completion, JSON.stringify({ version: 1, owner: { issue: lease.issue, task: lease.task, role: lease.role, phase: lease.phase, sha: lease.sha },
      acquiredAt: lease.acquiredAt, kind: "baseline", seriesDir: directory, runSha: pins.harnessSha }), { flag: "wx", mode: 0o600 })
    const configFile = path.join(directory, "ops-config.json")
    await writeFile(configFile, JSON.stringify(config), { flag: "wx", mode: 0o600 })
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
  for (const job of journal.jobs.filter(job => job.state === "running")) {
    const parent = path.join(directory, "measurements", job.key)
    const child = await readPrivateBaselineJson(path.join(parent, "harness-process.json")) as { pid: number; starttime: string }
    if (await processBirthPresent(child)) throw new BaselineFailure("HARNESS_STILL_RUNNING")
    const runs = (await readdir(path.join(parent, "runs"), { withFileTypes: true })).filter(item => item.isDirectory())
    if (runs.length !== 1 || !await Bun.file(path.join(parent, "runs", runs[0]!.name, "summary.json")).exists()) throw new BaselineFailure("UNKNOWN_OUTCOME_REQUIRES_RECOVERY")
    await recordBaselineMeasurement(directory, job.key, path.join(parent, "runs", runs[0]!.name))
  }
}

async function settleBaselineHarness(config: NodeOpsConfig, lease: NodeStandLease, directory: string) {
  const profile = config.roles.evalbaseline!.evalProfile
  if (!await lstat(`${profile}.harness-lease`).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error })) return
  const { verifyBaselineStand } = await import("./node-eval-ops")
  await verifyBaselineStand(config, lease, directory)
  const { retireRecordedHarnessLease } = await import("./lease")
  const report = await checkBaseline(directory)
  const last = report.rows.filter(row => row.runDir).at(-1)
  if (!last?.runDir) throw new BaselineFailure("HARNESS_ADMISSION_MISSING")
  const result = await Bun.file(path.join(last.runDir, "summary.json")).json() as RunSummary
  const cleanup = await Bun.file(path.join(last.runDir, result.tasks[0]!.id, "1/cleanup.json")).json()
  await retireRecordedHarnessLease(profile, path.join(directory, "measurements", last.key, "harness-admission.json"), cleanup.processes)
}

async function readPrivateBaselineJson(file: string) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o077) throw new BaselineFailure("PRIVATE_FILE_REQUIRED")
    return JSON.parse(await handle.readFile("utf8")) as unknown
  } finally { await handle.close() }
}

async function processStarttime(pid: number) {
  const raw = await readFile(`/proc/${pid}/stat`, "utf8")
  return raw.slice(raw.lastIndexOf(")") + 2).split(" ")[19]!
}

async function processBirthPresent(owner: { pid: number; starttime: string }) {
  return await processStarttime(owner.pid).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error }) === owner.starttime
}


async function dispatchBaselineJob(directory: string, key: string, current: { checkout: string; pins: BaselinePins }, env: Record<string, string | undefined>) {
  const admitted = await beginBaselineMeasurement(directory, key, current)
  const parent = path.dirname(admitted.resultsDir)
  const script = admitted.case.collection === "node" ? "script/run-node-evals.ts" : "src/run.ts"
  const argv = [process.execPath, path.join(current.checkout, "evals", script), "--tasks", path.join(current.checkout, "evals", path.dirname(admitted.case.directory)),
    "--only", admitted.case.id, "--repeat", "1", "--timeout-ms", String(current.pins.timeoutMs), "--label", key]
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
  const record = await recordBaselineMeasurement(directory, key, path.join(admitted.resultsDir, runs[0]!.name))
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

async function inspectMeasurement(manifest: BaselineManifest, item: BaselineCase, checkout: string, runDir: string): Promise<RecordedRun> {
  const summary = await Bun.file(path.join(runDir, "summary.json")).json() as RunSummary
  if (summary.config?.repeat !== 1 || JSON.stringify(summary.task_ids) !== JSON.stringify([item.id]) || summary.tasks?.length !== 1 ||
    summary.tasks[0]?.id !== item.id || summary.tasks[0].attempts.length !== 1 || summary.tasks[0].attempts[0]?.attempt !== 1 || summary.tasks[0].attempts[0].task_id !== item.id)
    throw new BaselineFailure("INVALID_MEASUREMENT")
  const result = summary.tasks[0].attempts[0]
  const cleanups = await Promise.all([path.join(runDir, item.id, "1"), ...(result.infra_retry ? [path.join(runDir, item.id, "1", "infra-error")] : [])]
    .map(async out => Bun.file(path.join(out, "cleanup.json")).json()))
  const cleanup = summary.storage_leftovers?.length === 0 && !result.cleanup_error && result.environment_cleanup?.status === "confirmed" && cleanups.every(proof =>
    proof.result?.status === "confirmed" && !proof.result?.error && proof.processes?.status === "confirmed" &&
    ["processes", "diagnostics", "writer", "ready", "profile_history", ...(manifest.pins.mode === "live" ? ["storage"] : [])].every(stage => proof.stages?.some((item: { stage: string; status: string }) => item.stage === stage && item.status === "confirmed")))
  if (manifest.pins.mode === "live" && (summary.agent?.cli_version !== manifest.pins.cliVersion || summary.agent.source_commit !== manifest.pins.cliSource ||
    summary.agent.binary_sha256 !== manifest.pins.binarySha256 || summary.agent.model !== manifest.pins.model || summary.agent.variant !== manifest.pins.variant ||
    summary.harness?.dirty || !manifest.pins.harnessSha.startsWith(summary.harness?.git_sha ?? "UNKNOWN") || summary.agent.source_dirty !== false ||
    summary.config.timeout_ms !== manifest.pins.timeoutMs || summary.config.judge_timeout_ms !== manifest.pins.judgeTimeoutMs || summary.config.pass_threshold !== manifest.pins.threshold ||
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
  if (manifest.version !== 1 || journal.version !== 1 || journal.manifestSha256 !== baselineHash(raw) ||
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
