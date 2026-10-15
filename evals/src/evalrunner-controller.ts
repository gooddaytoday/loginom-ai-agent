import path from "node:path"
import { lstat, mkdir, readFile, unlink, rmdir, writeFile } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { durableEvalrunnerJson, evalrunnerHash, createEvalrunnerManifest, loadEvalrunnerCorpus, reserveEvalrunnerSeries,
  readEvalrunnerSeries, admitEvalrunnerSlot, type EvalrunnerSeriesManifest, type EvalrunnerSeriesScope, type EvalrunnerSlot } from "./evalrunner-series"
import { qualifyEvalrunner, dispatchEvalrunner, sealEvalrunnerEvidence, checkEvalrunnerEvidence, type EvalrunnerConfig } from "./evalrunner"
import { inspectEvalrunnerSeries, verifyEvalrunnerSlot } from "./evalrunner-series-check"
import { verifyEvalrunnerModel } from "./evalrunner-model"
import { assertProfileClean } from "./profile"
import { checkIsolatedLoginom } from "./preflight"
import { parseArtifactSource } from "./artifact"

export async function prepareEvalrunnerSeries(config: EvalrunnerConfig, input: { issue: string; task: string; scope: EvalrunnerSeriesScope }) {
  if (config.version !== 2) throw new EvalFailure("Version 2 runtime required", 2)
  if (input.issue !== config.readinessIssue) throw new EvalFailure("Assigned issue differs", 2)
  const proof = await qualifyEvalrunner(config)
  const corpus = await loadEvalrunnerCorpus(path.join(config.checkout, "evals"))
  await requireQualification(config, proof, corpus.sha256)
  const changed = await Bun.$`git diff 0afc231618daefd27cebfdd8b40e4c269dc97fef -- evals/tasks`.cwd(config.checkout).quiet()
  if (changed.text().trim()) throw new EvalFailure("Accepted corpus changed from base", 2)
  const series = path.join(config.results, input.scope === "full" ? `v02-full-${input.issue}` : `v02-${input.scope}-${input.issue}`)
  const manifest = createEvalrunnerManifest({ ...input, series, pins: { ...proof, env: undefined }, corpus })
  await reserveEvalrunnerSeries(config, manifest)
  await writeFile(path.join(series, "cli-manifest.json"), await readFile(path.join(path.dirname(path.dirname(config.cliBin)), "cli-manifest.json")), { flag: "wx", mode: 0o600 })
  await writeFile(path.join(series, "qualification.json"), await readFile(config.qualificationFile!), { flag: "wx", mode: 0o600 })
  return { status: "PREPARED", series, expected: manifest.slots.length, manifestSha256: evalrunnerHash(JSON.stringify(manifest, null, 2)) }
}

export async function runEvalrunnerSeries(config: EvalrunnerConfig, input: { series: string; task: string; resume: boolean }) {
  if (config.version !== 2) throw new EvalFailure("Version 2 runtime required", 2)
  const manifest = await readEvalrunnerSeries(config, input.series)
  if (manifest.issue !== config.readinessIssue || !/^[\w-]+$/.test(input.task)) throw new EvalFailure("Assigned issue/task differs", 2)
  if (await Bun.file(path.join(input.series, "release.json")).exists()) return checkEvalrunnerSeries(config, input.series)
  if (await Bun.file(path.join(input.series, "finalizing.json")).exists()) throw new EvalFailure("Finalization admitted; preserve evidence for recovery", 2)
  await pinnedSeriesProof(config, manifest)
  for (const scope of manifest.scope === "full" ? ["readiness-calc", "readiness-node"] : manifest.scope === "readiness-node" ? ["readiness-calc"] : []) {
    const ready = await checkEvalrunnerSeries(config, path.join(config.results, `v02-${scope}-${manifest.issue}`))
    if (ready.status !== "RELEASED" || ready.completed !== 1) throw new EvalFailure("Prior readiness not released", 2)
  }
  const executor = await acquireEvalrunnerExecutor(config, { issue: manifest.issue, series: manifest.series, task: input.task })
  try {
    const lease = await acquireEvalrunnerSeriesLease(config, manifest)
    for (const slot of manifest.slots) {
      const admitted = path.join(config.root, "operations/series-admissions", `${manifest.issue}-${manifest.scope}`, `${slot.id}.json`)
      if (!await Bun.file(admitted).exists()) break
      if (!input.resume) throw new EvalFailure("Series already started; use resume with original manifest", 2)
      await completeEvalrunnerSlot(config, manifest, slot)
    }
    let progress = await inspectEvalrunnerSeries(config, manifest.series)
    while (progress.status === "READY" && progress.next) {
      const proof = await pinnedSeriesProof(config, manifest)
      const slot = progress.next
      const series = await admitEvalrunnerSlot(config, manifest, slot, input.task)
      await dispatchEvalrunner(config, { series, case: slot.case, collection: slot.collection, issue: manifest.issue, task: input.task }, proof, async () => {})
      await completeEvalrunnerSlot(config, manifest, slot)
      progress = await inspectEvalrunnerSeries(config, manifest.series)
      await checkpoint(config, manifest, input.task, progress.completed, progress.status)
    }
    if (progress.status !== "COMPLETE" || progress.completed !== manifest.slots.length)
      throw new EvalFailure(`Series BLOCKED: ${progress.reason ?? "coverage unconfirmed"}`, 2)
    const proof = await pinnedSeriesProof(config, manifest)
    await assertProfileClean(config.profile)
    await checkIsolatedLoginom(parseArtifactSource("docker", { container: proof.env.LOGINOM_CONTAINER!, storageDir: proof.env.LOGINOM_STORAGE_DIR! }))
    const summary = { kind: "evalrunner-series-summary", expected: progress.expected, completed: progress.completed,
      measurements: progress.measurements, scope: manifest.scope, comparison: "DESCRIPTIVE_ONLY/INCOMPARABLE", at: new Date().toISOString() }
    if (!await Bun.file(path.join(manifest.series, "summary.json")).exists()) await durableEvalrunnerJson(path.join(manifest.series, "summary.json"), summary)
    await durableEvalrunnerJson(path.join(manifest.series, "finalizing.json"), { kind: "evalrunner-series-finalization", owner: executor.owner,
      completed: progress.completed, manifestSha256: evalrunnerHash(JSON.stringify(manifest, null, 2)), at: new Date().toISOString() })
    await lease.release()
  } catch (error) {
    await checkpoint(config, manifest, input.task, (await inspectEvalrunnerSeries(config, manifest.series)).completed, "BLOCKED")
    throw error
  } finally { await executor.release() }
  const release = { status: "RELEASED", kind: "evalrunner-full-series-release", scope: manifest.scope, expected: manifest.slots.length,
    completed: manifest.slots.length, evidence: await sealEvalrunnerEvidence(manifest.series), at: new Date().toISOString() }
  await durableEvalrunnerJson(path.join(manifest.series, "release.json"), release)
  await checkpoint(config, manifest, input.task, manifest.slots.length, "RELEASED")
  return checkEvalrunnerSeries(config, manifest.series)
}

export async function checkEvalrunnerSeries(config: { root: string; results: string; checkout?: string; profile?: string }, series: string) {
  const manifest = await readEvalrunnerSeries(config, series)
  const progress = await inspectEvalrunnerSeries(config, series)
  if (!await Bun.file(path.join(series, "release.json")).exists()) return { ...progress, released: false }
  if (progress.status !== "COMPLETE" || progress.completed !== (manifest.scope === "full" ? 144 : 1))
    throw new EvalFailure("Incomplete series cannot be RELEASED", 2)
  const receipt = await checkEvalrunnerEvidence(series) as Awaited<ReturnType<typeof checkEvalrunnerEvidence>> & { completed: number; expected: number }
  if (receipt.completed !== progress.completed || receipt.expected !== progress.expected) throw new EvalFailure("Release coverage differs", 2)
  const owner = path.join(config.root, "operations/stand.lease/owner.json")
  if (await Bun.file(owner).exists() && (await Bun.file(owner).json()).nonce === manifest.nonce) throw new EvalFailure("Series stand lease still held", 2)
  const executor = path.join(config.root, "operations/series-executor.lock/owner.json")
  if (await Bun.file(executor).exists() && (await Bun.file(executor).json()).series === series) throw new EvalFailure("Series executor still held", 2)
  return { ...progress, status: "RELEASED" as const, released: true }
}

async function pinnedSeriesProof(config: EvalrunnerConfig, manifest: EvalrunnerSeriesManifest) {
  const proof = await qualifyEvalrunner(config)
  const corpus = await loadEvalrunnerCorpus(path.join(config.checkout, "evals"))
  if (JSON.stringify({ ...proof, env: undefined }) !== JSON.stringify(manifest.pins) || corpus.sha256 !== manifest.corpus.sha256 ||
    evalrunnerHash(await readFile(path.join(manifest.series, "cli-manifest.json"))) !== config.cliManifestSha256)
    throw new EvalFailure("Series pins, corpus, environment, CLI or container changed", 2)
  await requireQualification(config, proof, corpus.sha256)
  return proof
}

async function requireQualification(config: EvalrunnerConfig, proof: Awaited<ReturnType<typeof qualifyEvalrunner>>, corpusSha256: string) {
  if (!config.qualificationFile || !config.qualificationSha256 || !config.qualificationFile.startsWith(config.root + path.sep) ||
    await realpathQualification(config.qualificationFile) !== config.qualificationFile ||
    evalrunnerHash(await readFile(config.qualificationFile)) !== config.qualificationSha256) throw new EvalFailure("Nonmodel qualification receipt required", 2)
  const receipt = await Bun.file(config.qualificationFile).json()
  if (receipt.kind !== "evalrunner-nonmodel-qualification" || receipt.status !== "QUALIFIED" || receipt.harnessSha !== proof.harnessSha ||
    receipt.binarySha256 !== proof.binarySha256 || receipt.manifestSha256 !== proof.manifestSha256 || receipt.envSha256 !== proof.envSha256 ||
    receipt.corpusSha256 !== corpusSha256 || receipt.containerId !== proof.containerId || receipt.imageDigest !== proof.imageDigest ||
    receipt.judgeSha256 !== config.judgeSha256 || receipt.bunSha256 !== config.bunSha256 || receipt.tests?.exitCode !== 0 ||
    receipt.tests?.fail !== 0 || receipt.typecheck?.exitCode !== 0 || receipt.native?.cleanup !== "confirmed" ||
    receipt.sandbox !== "confirmed" || receipt.exportDownloadRegression !== "confirmed" || receipt.historicalRecovery?.status !== "RECOVERED")
    throw new EvalFailure("Nonmodel qualification incomplete or pins differ", 2)
}

async function realpathQualification(file: string) {
  const { realpath } = await import("node:fs/promises")
  if ((await lstat(file)).isSymbolicLink()) throw new EvalFailure("Qualification link refused", 2)
  return realpath(file)
}

async function completeEvalrunnerSlot(config: EvalrunnerConfig, manifest: EvalrunnerSeriesManifest, slot: EvalrunnerSlot) {
  const record = path.join(manifest.series, "completions", `${slot.id}.json`)
  if (await Bun.file(record).exists()) return verifyEvalrunnerSlot(config, manifest, slot)
  const measured = await verifyEvalrunnerSlot(config, manifest, slot, false)
  const model = await verifyEvalrunnerModel(config, { sessionId: measured.sessionId, cleanupFile: measured.cleanupFile })
  await durableEvalrunnerJson(record, { releaseSha256: measured.releaseSha256, model })
  return verifyEvalrunnerSlot(config, manifest, slot)
}

async function checkpoint(config: EvalrunnerConfig, manifest: EvalrunnerSeriesManifest, task: string, completed: number, status: string) {
  const directory = path.join(config.root, "roles/evalrunner/work")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(path.join(directory, "lab77-checkpoint.md"), [
    `SHA ${config.harnessSha}; CLI ${config.cliVersion}/${config.cliSourceSha}`,
    `Issue ${manifest.issue}; task ${task}; series ${manifest.series}; scope ${manifest.scope}`,
    `Coverage ${completed}/${manifest.slots.length}; state ${status}`,
    `Manifest ${evalrunnerHash(JSON.stringify(manifest, null, 2))}; config ${manifest.pins.configSha256}`,
    `Release ${status === "RELEASED"}; delivery pending; preserve all admissions and incidents`,
    `Next: ${status === "BLOCKED" ? "investigate original admitted evidence; no product redispatch" : status === "RELEASED" ? "independent check and curated delivery" : "same manifest and executor only"}`,
  ].join("\n") + "\n", { mode: 0o600 })
}

export async function acquireEvalrunnerExecutor(config: { root: string }, input: { issue: string; task: string; series: string }) {
  const directory = path.join(config.root, "operations/series-executor.lock")
  await mkdir(directory, { mode: 0o700 }).catch(() => { throw new EvalFailure("Executor BUSY/BLOCKED; inspect existing controller", 2) })
  const info = await lstat(directory)
  const owner = { kind: "evalrunner-series-executor", ...input, pid: process.pid, uid: process.getuid?.(),
    stat: await readFile(`/proc/${process.pid}/stat`, "utf8"), nonce: crypto.randomUUID() }
  await durableEvalrunnerJson(path.join(directory, "owner.json"), owner)
  const raw = JSON.stringify(owner, null, 2)
  return { owner, release: async () => {
    const current = await lstat(directory)
    if (current.isSymbolicLink() || current.dev !== info.dev || current.ino !== info.ino ||
      await readFile(path.join(directory, "owner.json"), "utf8") !== raw) throw new EvalFailure("Executor owner changed", 2)
    await unlink(path.join(directory, "owner.json")); await rmdir(directory)
  } }
}

export async function acquireEvalrunnerSeriesLease(config: { root: string }, manifest: EvalrunnerSeriesManifest) {
  const directory = path.join(config.root, "operations/stand.lease")
  const owner = { kind: "evalrunner-versioned-series-lease", issue: manifest.issue, scope: manifest.scope, series: manifest.series,
    manifestSha256: evalrunnerHash(JSON.stringify(manifest, null, 2)), nonce: manifest.nonce }
  const raw = JSON.stringify(owner, null, 2)
  const created = await mkdir(directory, { mode: 0o700 }).then(() => true, error => {
    if (error.code === "EEXIST") return false
    throw error
  })
  if (created) await durableEvalrunnerJson(path.join(directory, "owner.json"), owner)
  const info = await lstat(directory)
  if (info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077 ||
    await readFile(path.join(directory, "owner.json"), "utf8") !== raw) throw new EvalFailure("Stand BUSY/BLOCKED; foreign or historical lease retained", 2)
  return { nonce: manifest.nonce, release: async () => {
    const { inspectEvalrunnerSeries } = await import("./evalrunner-series-check")
    const progress = await inspectEvalrunnerSeries({ ...config, results: path.dirname(manifest.series) }, manifest.series)
    if (progress.status !== "COMPLETE" || progress.completed !== (manifest.scope === "full" ? 144 : 1))
      throw new EvalFailure("Series coverage unconfirmed; stand retained", 2)
    const current = await lstat(directory)
    if (current.isSymbolicLink() || current.dev !== info.dev || current.ino !== info.ino ||
      await readFile(path.join(directory, "owner.json"), "utf8") !== raw) throw new EvalFailure("Series stand owner changed", 2)
    await unlink(path.join(directory, "owner.json")); await rmdir(directory)
  } }
}
