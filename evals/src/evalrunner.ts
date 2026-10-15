import path from "node:path"
import { lstat, mkdir, readFile, rm, writeFile, readdir, readlink, realpath, stat } from "node:fs/promises"
import { EvalFailure } from "./fail"
import type { RunSummary } from "./report"

export type EvalrunnerConfig = {
  kind: "evalrunner-runtime"; version: 1 | 2; root: string; checkout: string; harnessSha: string
  cliBin: string; cliManifestSha256: string; binarySha256: string; profile: string; workspace: string
  results: string; envFile: string; judgeHome: string; containerId: string; imageDigest: string
  endpoint: string; readinessIssue: string
  cliVersion?: string; cliSourceSha?: string
  judgeBin?: string; judgeVersion?: string; judgeSha256?: string; bunSha256?: string
  qualificationFile?: string; qualificationSha256?: string
}

export function checkEvalrunnerOutcome(summary: RunSummary, node = false) {
  if (summary.interrupted || summary.stopped_reason || summary.storage_leftovers === null || summary.storage_leftovers.length ||
    summary.config.infra_retries !== 0 || !summary.tasks.length) throw new EvalFailure("Run cleanup/config unconfirmed", 2)
  const attempts = summary.tasks.flatMap(item => item.attempts)
  if (!attempts.length || attempts.some(item => item.infra_retry || item.cleanup_error || item.failure_kind === "recovery" || item.failure_kind === "provider" ||
    !["completed", "failed", "timeout", "no_artifact"].includes(item.status))) throw new EvalFailure("Run infrastructure/unknown outcome", 2)
  if (attempts.some(item => item.environment_cleanup?.status !== "confirmed")) throw new EvalFailure("Run cleanup unconfirmed", 2)
  if (!node && attempts.some(item => item.judge_status === "error" || item.status === "completed" && item.judge_status !== "scored"))
    throw new EvalFailure("Judge outcome unconfirmed", 2)
  return attempts.every(item => item.status === "completed" && (node || item.pass === true)) ? "PASS" : "FAIL"
}

export async function qualifyEvalrunner(config: EvalrunnerConfig) {
  for (const directory of [config.root, config.checkout, config.profile, config.workspace, config.results, config.judgeHome]) {
    if (await realpath(directory) !== directory) throw new EvalFailure("Runtime boundary is not canonical", 2)
  }
  const git = await Bun.$`git rev-parse HEAD`.cwd(config.checkout).quiet()
  const dirty = await Bun.$`git status --porcelain`.cwd(config.checkout).quiet()
  if (git.text().trim() !== config.harnessSha || dirty.text().trim()) throw new EvalFailure("Harness pin changed", 2)
  const metadata = await verifyEvalrunnerCli(config.cliBin, config.version === 2
    ? { version: config.cliVersion!, sourceCommit: config.cliSourceSha! } : undefined)
  if (await fileHash(config.cliBin) !== config.binarySha256 ||
    await fileHash(path.join(path.dirname(path.dirname(config.cliBin)), "cli-manifest.json")) !== config.cliManifestSha256)
    throw new EvalFailure("CLI pins changed", 2)
  const info = await lstat(config.envFile)
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077)
    throw new EvalFailure("Private environment required", 2)
  const env = await Bun.file(config.envFile).json() as Record<string, string>
  if (Object.entries(env).some(([name, value]) => typeof value !== "string" || /TOKEN|SSH|SUDO|MULTICA/.test(name)) ||
    env.EVAL_CLI_BIN !== config.cliBin || env.EVAL_PROFILE_DIR !== config.profile || env.EVAL_WORKSPACE_ROOT !== config.workspace ||
    env.LOGINOM_URL !== config.endpoint || env.CODEX_HOME !== config.judgeHome || env.EVAL_AGENT_MODEL !== "openai/gpt-6.1-sol" ||
    env.EVAL_AGENT_VARIANT !== "medium" || env.JUDGE_MODEL !== "gpt-6-sol" || env.JUDGE_REASONING !== "xhigh")
    throw new EvalFailure("Runtime environment pins changed", 2)
  const judge = config.version === 2 ? await (async () => {
    if (await fileHash(process.execPath) !== config.bunSha256 || env.EVAL_JUDGE_COMMAND !== config.judgeBin ||
      await fileHash(config.judgeBin!) !== config.judgeSha256) throw new EvalFailure("Management/judge binary pins changed", 2)
    const { judgeEnvironment } = await import("./judge")
    const version = await Bun.$`${config.judgeBin!} --version`.env(judgeEnvironment({ CODEX_HOME: config.judgeHome })).quiet()
    if (version.text().trim() !== config.judgeVersion) throw new EvalFailure("Judge version changed", 2)
    return { version: config.judgeVersion, binarySha256: config.judgeSha256, bunSha256: config.bunSha256 }
  })() : undefined
  const inspected = await Bun.$`docker inspect ${config.containerId}`.quiet()
  const container = inspected.json()[0] as { Id: string; Image: string; State: { Running: boolean }; Mounts: unknown[] }
  if (container.Id !== config.containerId || container.Image !== config.imageDigest || !container.State.Running || container.Mounts.length)
    throw new EvalFailure("Loginom container pins changed", 2)
  return { version: 1, cli: metadata, configSha256: hash(JSON.stringify(config)), envSha256: await fileHash(config.envFile),
    manifestSha256: config.cliManifestSha256, binarySha256: config.binarySha256, harnessSha: config.harnessSha,
    containerId: config.containerId, imageDigest: config.imageDigest, judge, comparison: "INCOMPARABLE", env }
}

export type EvalrunnerInput = { series: string; case: string; issue: string; task: string; collection?: string }

export async function executeEvalrunner(config: EvalrunnerConfig, input: EvalrunnerInput) {
  if (config.version === 2) throw new EvalFailure("Version 2 requires versioned series admission", 2)
  const proof = await qualifyEvalrunner(config)
  await selectedEvalrunnerTask(config, input)
  const admitted = await admitEvalrunner(config, input)
  return dispatchEvalrunner(config, input, proof, admitted.release)
}

/** Both legacy smoke and versioned controller use this one dispatch/validation boundary. */
export async function dispatchEvalrunner(config: EvalrunnerConfig, input: EvalrunnerInput,
  proof: Awaited<ReturnType<typeof qualifyEvalrunner>>, release: () => Promise<void>) {
  if (!await Bun.file(path.join(input.series, "manifest.json")).exists()) throw new EvalFailure("Durable admission required", 2)
  const admission = await Bun.file(path.join(input.series, "manifest.json")).json()
  if (admission.issue !== input.issue || admission.task !== input.task ||
    (admission.kind === "evalrunner-series" ? admission.case !== input.case :
      admission.kind !== "evalrunner-slot-admission" || admission.slot?.case !== input.case || admission.slot?.collection !== input.collection))
    throw new EvalFailure("Durable admission differs", 2)
  if (admission.kind === "evalrunner-slot-admission") {
    const { readEvalrunnerSeries, readEvalrunnerDocument, loadEvalrunnerCorpus, evalrunnerHash } = await import("./evalrunner-series")
    const manifest = await readEvalrunnerSeries(config, admission.series)
    const global = path.join(config.root, "operations/series-admissions", `${manifest.issue}-${manifest.scope}`, `${admission.slot.id}.json`)
    if (JSON.stringify(JSON.parse(await readEvalrunnerDocument(global))) !== JSON.stringify(admission) ||
      admission.manifestSha256 !== evalrunnerHash(JSON.stringify(manifest, null, 2)) ||
      input.series !== path.join(manifest.series, "slots", admission.slot.id) || manifest.pins.configSha256 !== proof.configSha256)
      throw new EvalFailure("Durable series admission differs", 2)
    if ((await loadEvalrunnerCorpus(path.join(config.checkout, "evals"))).sha256 !== manifest.corpus.sha256)
      throw new EvalFailure("Corpus changed before dispatch; admission retained", 2)
  }
  const { node, tasks, taskFile } = await selectedEvalrunnerTask(config, input)
  await Bun.write(path.join(input.series, "pins.json"), JSON.stringify({ ...proof, env: undefined, taskSha256: await fileHash(taskFile) }, null, 2), { mode: 0o600 })
  const env = { ...proof.env, EVAL_CLI_MODE: "binary", EVAL_INFRA_RETRIES: "0", EVAL_EXECUTION_POLICY: "evalrunner-v1",
    EVAL_RESULTS_DIR: path.join(input.series, "runs"), EVAL_HARNESS_LEASE_RECEIPT: path.join(input.series, "harness-lease.json"),
    EVAL_TASK_TIMEOUT_MS: "1800000", EVAL_JUDGE_TIMEOUT_MS: "300000", EVAL_PASS_THRESHOLD: "70" }
  await mkdir(env.EVAL_RESULTS_DIR, { mode: 0o700 })
  const cmd = [process.execPath, node ? "script/run-node-evals.ts" : "src/run.ts", "--tasks", tasks, "--only", input.case,
    "--repeat", "1", "--timeout-ms", "1800000", "--label", input.issue]
  const child = Bun.spawn(cmd, { cwd: path.join(config.checkout, "evals"), env,
    stdout: Bun.file(path.join(input.series, "stdout.log")), stderr: Bun.file(path.join(input.series, "stderr.log")) })
  const recorded = await Bun.write(path.join(input.series, "dispatch.json"), JSON.stringify({ pid: child.pid, command: cmd, at: new Date().toISOString() }), { mode: 0o600 })
    .then(() => true, () => false)
  const interrupt = () => child.kill("SIGINT")
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  const code = await child.exited
  process.removeListener("SIGINT", interrupt)
  process.removeListener("SIGTERM", interrupt)
  if (!recorded) throw new EvalFailure("Dispatch receipt failed; child collected; admission retained", 2)
  const directories = await readdir(env.EVAL_RESULTS_DIR)
  if (directories.length !== 1) throw new EvalFailure("Run directory unconfirmed; stand retained", 2)
  const runDir = path.join(env.EVAL_RESULTS_DIR, directories[0]!)
  const summary = await Bun.file(path.join(runDir, "summary.json")).json() as RunSummary
  const verdict = checkEvalrunnerOutcome(summary, node)
  if (summary.task_ids.length !== 1 || summary.task_ids[0] !== input.case || summary.tasks[0]?.attempts.length !== 1)
    throw new EvalFailure("Run coverage differs", 2)
  const attempt = summary.tasks[0]!.attempts[0]!
  const cleanup = await Bun.file(path.join(runDir, input.case, "1/cleanup.json")).json() as {
    result?: { status: string }; processes?: { status: string }; stages?: { stage: string; status: string }[]
  }
  if (cleanup.result?.status !== "confirmed" || cleanup.processes?.status !== "confirmed" ||
    !["processes", "diagnostics", "writer", "ready", "profile_history"].every(stage => cleanup.stages?.some(item => item.stage === stage && item.status === "confirmed")))
    throw new EvalFailure("Native cleanup evidence unconfirmed", 2)
  const codeVerdict = node ? await Bun.file(path.join(runDir, "code-verdict.json")).json() as { verdict: string; code: number } : undefined
  if (node && (!codeVerdict || codeVerdict.code === 2) || !node && code !== 0 || node && ![0, 1].includes(code))
    throw new EvalFailure("Executor/validator infrastructure failure", 2)
  const { assertProfileClean } = await import("./profile")
  const { checkIsolatedLoginom } = await import("./preflight")
  const { parseArtifactSource } = await import("./artifact")
  await assertProfileClean(config.profile)
  await checkIsolatedLoginom(parseArtifactSource("docker", { container: proof.env.LOGINOM_CONTAINER!, storageDir: proof.env.LOGINOM_STORAGE_DIR! }))
  const receipt = { status: "RELEASED", verdict: codeVerdict?.verdict ?? verdict, case: input.case, runDir, code,
    sessionId: attempt.session_id, summarySha256: await fileHash(path.join(runDir, "summary.json")),
    evidence: await sealEvalrunnerEvidence(input.series),
    configSha256: proof.configSha256, comparison: "INCOMPARABLE", at: new Date().toISOString() }
  await writeFile(path.join(input.series, "release.json"), JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o600 })
  await release()
  return receipt
}

async function selectedEvalrunnerTask(config: EvalrunnerConfig, input: EvalrunnerInput) {
  if (!/^[\w-]+$/.test(input.case) || input.collection && !["regular", "analytic", "node"].includes(input.collection))
    throw new EvalFailure("Unknown selected case", 2)
  const node = input.collection === "node" || input.case === "crosstable-fixed-sum"
  const tasks = path.join(config.checkout, "evals/tasks", node ? "node-evals" : input.collection === "analytic" ? "analytic" : "")
  const taskFile = path.join(tasks, input.case, "task.json")
  if (!await Bun.file(taskFile).exists()) throw new EvalFailure("Unknown selected case", 2)
  return { node, tasks, taskFile }
}

export async function sealEvalrunnerEvidence(series: string) {
  return Promise.all((await payloadFiles(series)).sort().map(async file => {
    if ((await lstat(path.join(series, file))).isSymbolicLink()) throw new EvalFailure("Unsafe evidence link", 2)
    return { path: file, sha256: await fileHash(path.join(series, file)) }
  }))
}

export async function checkEvalrunnerEvidence(series: string) {
  const receipt = await Bun.file(path.join(series, "release.json")).json() as {
    status: string; evidence: { path: string; sha256: string }[]
  }
  if (receipt.status !== "RELEASED" || !receipt.evidence?.length) throw new EvalFailure("Release evidence required", 2)
  const root = await realpath(series)
  for (const item of receipt.evidence) {
    const file = path.join(root, item.path)
    if (path.isAbsolute(item.path) || path.resolve(file) !== file || !file.startsWith(root + path.sep) ||
      await realpath(file) !== file || !(await lstat(file)).isFile() || await fileHash(file) !== item.sha256)
      throw new EvalFailure("Evidence changed", 2)
  }
  return receipt
}

export async function verifyEvalrunnerCli(binary: string, expected = { version: "0.2.0", sourceCommit: "0c975a73676d9aba556085dbda97e1a9ceb23cc6" }) {
  const root = path.dirname(path.dirname(binary))
  const manifest = await Bun.file(path.join(root, "cli-manifest.json")).json() as {
    format: string; metadata: { version: string; sourceCommit: string; sourceDirty: boolean }
    files: { path: string; sha256: string; mode: number; link?: string }[]
  }
  if (!/^[a-f0-9]{40}$/.test(expected.sourceCommit) || !/^[\w.+-]+$/.test(expected.version) ||
    manifest.format !== "loginom-cli-artifact-v1" || manifest.metadata.version !== expected.version || manifest.metadata.sourceDirty !== false ||
    manifest.metadata.sourceCommit !== expected.sourceCommit) throw new EvalFailure("Unexpected CLI build", 2)
  const actual = await payloadFiles(root, "", true)
  if (actual.length !== manifest.files.length || new Set(manifest.files.map(item => item.path)).size !== actual.length)
    throw new EvalFailure("CLI payload file set changed", 2)
  for (const item of manifest.files) {
    if (!actual.includes(item.path) || item.path.split("/").includes("..") || path.isAbsolute(item.path)) throw new EvalFailure("CLI payload path changed", 2)
    const file = path.join(root, item.path)
    const info = await lstat(file)
    const link = info.isSymbolicLink() ? await readlink(file) : undefined
    if (!(await realpath(file)).startsWith(root + path.sep)) throw new EvalFailure("CLI payload link escaped", 2)
    if ((info.mode & 0o7777) !== item.mode || link !== item.link ||
      (link !== undefined && (await stat(file)).isDirectory() ? hash(link) : await fileHash(file)) !== item.sha256) throw new EvalFailure("CLI payload integrity changed", 2)
  }
  return manifest.metadata
}

async function payloadFiles(root: string, relative = "", excludeManifest = false): Promise<string[]> {
  return (await Promise.all((await readdir(path.join(root, relative), { withFileTypes: true })).map(async item => {
    const file = path.join(relative, item.name)
    if (excludeManifest && file === "cli-manifest.json") return []
    return item.isDirectory() ? payloadFiles(root, file, excludeManifest) : [file]
  }))).flat()
}

const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex")

async function fileHash(file: string) {
  const digest = new Bun.CryptoHasher("sha256")
  for await (const chunk of Bun.file(file).stream()) digest.update(chunk)
  return digest.digest("hex")
}

export async function readEvalrunnerConfig(file: string) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077)
    throw new EvalFailure("Private runtime config required", 2)
  const value: unknown = await Bun.file(file).json()
  if (!value || typeof value !== "object") throw new EvalFailure("Invalid runtime config", 2)
  const config = value as EvalrunnerConfig
  if (config.kind !== "evalrunner-runtime" || ![1, 2].includes(config.version) ||
    config.version === 2 && (!/^[a-f0-9]{40}$/.test(config.cliSourceSha ?? "") || !/^[\w.+-]+$/.test(config.cliVersion ?? "") ||
      !config.judgeBin || !path.isAbsolute(config.judgeBin) || path.resolve(config.judgeBin) !== config.judgeBin || !config.judgeVersion ||
      ![config.judgeSha256, config.bunSha256].every(value => /^[a-f0-9]{64}$/.test(value ?? ""))) ||
    ![config.root, config.checkout, config.cliBin, config.profile, config.workspace, config.results, config.envFile, config.judgeHome]
      .every(item => typeof item === "string" && path.isAbsolute(item) && path.resolve(item) === item) ||
    !/^[a-f0-9]{40}$/.test(config.harnessSha) ||
    ![config.cliManifestSha256, config.binarySha256, config.containerId].every(item => /^[a-f0-9]{64}$/.test(item)) ||
    !/^sha256:[a-f0-9]{64}$/.test(config.imageDigest) || !config.endpoint || !/^[\w-]+$/.test(config.readinessIssue))
    throw new EvalFailure("Invalid runtime config", 2)
  const directories = [config.checkout, path.dirname(path.dirname(config.cliBin)), config.profile, config.workspace, config.results, config.judgeHome]
  if (directories.some(item => !item.startsWith(config.root + path.sep)) ||
    directories.some((item, index) => directories.some((other, second) => second !== index && (item === other || item.startsWith(other + path.sep)))))
    throw new EvalFailure("Overlapping runtime boundaries", 2)
  return config
}

/** A failed or crashed admission is durable. Never infer release from a dead PID. */
export async function admitEvalrunner(config: EvalrunnerConfig, input: { series: string; case: string; issue: string; task: string }) {
  if (!/^[\w-]+$/.test(input.case) || !/^[\w-]+$/.test(input.issue) || !/^[\w-]+$/.test(input.task) ||
    !input.series.startsWith(config.results + path.sep) || path.resolve(input.series) !== input.series)
    throw new EvalFailure("Invalid admission", 2)
  await mkdir(path.join(config.root, "operations/admissions"), { recursive: true, mode: 0o700 })
  const directory = path.join(config.root, "operations/stand.lease")
  await mkdir(directory, { mode: 0o700 }).catch(() => { throw new EvalFailure("Stand BUSY/BLOCKED", 2) })
  const stat = await lstat(directory)
  const owner = { nonce: crypto.randomUUID(), pid: process.pid, uid: process.getuid?.(),
    stat: await readFile(`/proc/${process.pid}/stat`, "utf8"), issue: input.issue, task: input.task }
  const raw = JSON.stringify(owner)
  await Bun.write(path.join(directory, "owner.json"), raw, { mode: 0o600 })
  const manifest = { version: 1, kind: "evalrunner-series", config, ...input, owner, infraRetries: 0,
    model: "openai/gpt-6.1-sol", variant: "medium", judge: "gpt-6-sol/xhigh", createdAt: new Date().toISOString() }
  const release = async () => {
    const current = await lstat(directory)
    if (current.dev !== stat.dev || current.ino !== stat.ino || current.isSymbolicLink() || await Bun.file(path.join(directory, "owner.json")).text() !== raw)
      throw new EvalFailure("Stand owner changed", 2)
    await rm(directory, { recursive: true })
  }
  try {
    const admission = path.join(config.root, "operations/admissions", `${input.issue}-${input.case}.json`)
    await writeFile(admission, JSON.stringify(manifest, null, 2), { mode: 0o600, flag: "wx" })
    await mkdir(input.series, { mode: 0o700 })
    await Bun.write(path.join(input.series, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 })
  } catch (error) {
    await release()
    throw new EvalFailure(error instanceof Error && "code" in error && error.code === "EEXIST" ? "Case already admitted; inspect original evidence" : "Admission persistence failed", 2)
  }
  return { manifest, release }
}
