import path from "node:path"
import { lstat, mkdir, readdir, readlink, realpath, rename, rm, writeFile } from "node:fs/promises"
import { loadTasks } from "./task"
import { aggregate, aggregateTask, type AttemptResult, type RunSummary } from "./report"
import { validateNodeRun } from "./node-evals"
import { parseArgs } from "node:util"

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
type BaselineJournal = { version: 1; manifestSha256: string; checkout: string; release?: { status: "RELEASED"; evidenceSha256: string }
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
    if (!resolved.startsWith(root + path.sep) || !info.isFile() && !info.isSymbolicLink() || (info.mode & 0o777) !== (item.mode & 0o777) ||
      (info.isSymbolicLink() ? await readlink(file) : undefined) !== item.link || baselineHash(await Bun.file(file).bytes()) !== item.sha256)
      throw new BaselineFailure("CLI_FILE_CHANGED")
  }
  const walk = async (directory: string): Promise<string[]> => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async item =>
    item.isDirectory() ? walk(path.join(directory, item.name)) : [path.relative(root, path.join(directory, item.name))]))).flat()
  if (JSON.stringify((await walk(root)).sort()) !== JSON.stringify([...manifest.files.map(item => item.path), "cli-manifest.json"].sort()))
    throw new BaselineFailure("CLI_FILE_SET_CHANGED")
  return { files: manifest.files.length, metadata: manifest.metadata, manifestSha256: baselineHash(raw), binarySha256: baselineHash(await Bun.file(bin).bytes()) }
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
  return { id: manifest.id, kind: manifest.kind, status: coverage.measured === coverage.expected && cleanup && journal.release ? "complete" : "incomplete",
    manifest, coverage, cleanup, released: Boolean(journal.release), groups,
    nodes: manifest.cases.filter(item => item.collection === "node").map(item => ({ id: item.id, expected: manifest.kind === "smoke" ? 1 : 3,
      passed: rows.filter(row => row.caseKey === item.key && row.verdict === "PASS").length,
      measured: rows.filter(row => row.caseKey === item.key && row.measured).length })), rows }
}

export async function sealBaselineRelease(directory: string, receipt: { status: "RELEASED"; evidenceSha256: string }) {
  return mutateBaseline(directory, async (manifest, journal) => {
    // Live release is admitted only by the executor after the common helper's verified receipt.
    if (manifest.pins.mode !== "fixture" || receipt.status !== "RELEASED" || !/^[0-9a-f]{64}$/.test(receipt.evidenceSha256) ||
      journal.jobs.some(job => job.state === "running" || job.record && !job.record.cleanup)) throw new BaselineFailure("RELEASE_UNCONFIRMED")
    journal.release = receipt
    await atomicJournal(directory, journal)
  })
}

export async function runBaseline(argv: string[], env: Record<string, string | undefined> = process.env): Promise<Record<string, unknown> & { code: number }> {
  try {
    const command = argv[0]
    if (argv.includes("--help")) return { code: 0, status: "HELP", help: "run-baseline.ts prepare|start|resume|check|smoke --series DIR [--config PRIVATE --issue ID --task ID] [--compare SERIES]" }
    const values = parseArgs({ args: argv.slice(1), strict: true, options: Object.fromEntries(["series", "config", "issue", "task", "compare", "limit"].map(name => [name, { type: "string" as const }])) }).values
    const directory = values.series
    if (!directory || !path.isAbsolute(directory)) throw new BaselineFailure("SERIES_PATH_REQUIRED")
    if (command === "check") {
      const report = await checkBaseline(directory)
      const reportDir = await writeBaselineReport(directory, report)
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
    throw new BaselineFailure("LIVE_CONFIGURATION_REQUIRED")
  } catch (error) { return { code: 2, status: "BLOCKED", reason: error instanceof BaselineFailure ? error.message : "BASELINE_OPERATION_FAILED" } }
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
  await child.exited
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
    ...Object.entries(report.groups).map(([collection, group]) => `${collection}: ${JSON.stringify(group.metrics)}`), "",
    ...report.nodes.map(node => `${node.id}: PASS ${node.passed}/${node.expected}; измерено ${node.measured}/${node.expected}.`), "",
    "| Кейс | Попытка | Состояние | Результат | Измерено | Судья | Время, мс |",
    "|---|---:|---|---|---|---|---:|",
    ...rows.map(row => `| ${row.caseKey} | ${row.attempt} | ${row.state} | ${row.verdict ?? "—"} (${row.status ?? "—"}) | ${row.measured} | ${row.judge_status ?? "—"} | ${row.duration_ms} |`), "",
  ].join("\n"), { flag: "wx", mode: 0o600 })
  return out
}

async function inspectMeasurement(manifest: BaselineManifest, item: BaselineCase, checkout: string, runDir: string): Promise<RecordedRun> {
  const summary = await Bun.file(path.join(runDir, "summary.json")).json() as RunSummary
  if (summary.config?.repeat !== 1 || JSON.stringify(summary.task_ids) !== JSON.stringify([item.id]) || summary.tasks?.length !== 1 ||
    summary.tasks[0]?.id !== item.id || summary.tasks[0].attempts.length !== 1 || summary.tasks[0].attempts[0]?.attempt !== 1)
    throw new BaselineFailure("INVALID_MEASUREMENT")
  const result = summary.tasks[0].attempts[0]
  const cleanups = await Promise.all([path.join(runDir, item.id, "1"), ...(result.infra_retry ? [path.join(runDir, item.id, "1", "infra-error")] : [])]
    .map(async out => Bun.file(path.join(out, "cleanup.json")).json()))
  const cleanup = summary.storage_leftovers?.length === 0 && result.environment_cleanup?.status === "confirmed" && cleanups.every(proof =>
    proof.result?.status === "confirmed" && proof.processes?.status === "confirmed" &&
    ["processes", "diagnostics", "writer", "ready", "profile_history", ...(manifest.pins.mode === "live" ? ["storage"] : [])].every(stage => proof.stages?.some((item: { stage: string; status: string }) => item.stage === stage && item.status === "confirmed")))
  if (manifest.pins.mode === "live" && (summary.agent?.cli_version !== manifest.pins.cliVersion || summary.agent.source_commit !== manifest.pins.cliSource ||
    summary.agent.binary_sha256 !== manifest.pins.binarySha256 || summary.agent.model !== manifest.pins.model || summary.agent.variant !== manifest.pins.variant ||
    summary.harness?.dirty || !manifest.pins.harnessSha.startsWith(summary.harness?.git_sha ?? "UNKNOWN"))) throw new BaselineFailure("RUN_PINS_CHANGED")
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
  await writeFile(temp, JSON.stringify(journal, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  await rename(temp, path.join(directory, "journal.json"))
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
