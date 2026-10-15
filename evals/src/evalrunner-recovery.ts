import path from "node:path"
import { mkdir, readFile, lstat, realpath, readdir, mkdtemp, writeFile, rename, open } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readEvalrunnerSeries, readEvalrunnerDocument, durableEvalrunnerJson, durableEvalrunnerBytes, evalrunnerHash,
  loadEvalrunnerCorpus, createEvalrunnerManifest, reserveEvalrunnerSeries } from "./evalrunner-series"
import { sealEvalrunnerEvidence, qualifyEvalrunner, type EvalrunnerConfig } from "./evalrunner"

const authorizedIssue = "01a13fd2-a6b1-7459-b641-fb41b04eb229"
type Roots = { root: string; results: string; profile: string }

/** This is not a retry policy. It recognizes only LAB-77's independently audited catalog refusal. */
export async function auditEvalrunnerPreInference(config: Roots, input: { series: string; proofFile: string; sealFile?: string }) {
  const manifest = await readEvalrunnerSeries(config, input.series)
  if (manifest.issue !== authorizedIssue || manifest.scope !== "readiness-calc" || manifest.generation ||
    manifest.series !== path.join(config.results, `v02-readiness-calc-${authorizedIssue}`) || manifest.slots.length !== 1)
    throw new EvalFailure("Only original authorized calc readiness may recover", 2)
  const proof = JSON.parse(await readEvalrunnerDocument(input.proofFile))
  const admission = path.join(config.root, "operations/series-admissions", authorizedIssue + "-readiness-calc/readiness-calc-r1.json")
  const ownerFile = path.join(config.root, "operations/stand.lease/owner.json")
  if (JSON.stringify((await readdir(path.dirname(ownerFile))).sort()) !== '["owner.json"]') throw new EvalFailure("Unknown files in recovery lease", 2)
  const manifestSha256 = evalrunnerHash(await readEvalrunnerDocument(path.join(input.series, "manifest.json")))
  const admissionSha256 = evalrunnerHash(await readEvalrunnerDocument(admission))
  const ownerRaw = await readEvalrunnerDocument(ownerFile), owner = JSON.parse(ownerRaw)
  if (proof.kind !== "lab77-independent-pre-inference-refusal-proof" || proof.status !== "VERIFIED_PRE_INFERENCE_PROVIDER_REFUSAL" ||
    proof.issue !== authorizedIssue || proof.scope !== manifest.scope || proof.series !== input.series || proof.manifestSha256 !== manifestSha256 ||
    proof.globalAdmissionSha256 !== admissionSha256 || proof.standOwnerSha256 !== evalrunnerHash(ownerRaw) ||
    proof.sessionCount !== 0 || proof.messageCount !== 0 || proof.productInferenceCalls !== 0 || proof.judgeCalls !== 0 || proof.dbSourcesUnchanged !== true ||
    proof.processCaptureComplete !== true || proof.unknownProcesses !== 0 || proof.emptyVerificationChecks < 2 || proof.releaseCreated !== false ||
    proof.currentProfileAndStorage?.originalProfile !== "CLEAN" || proof.currentProfileAndStorage?.newProfile !== "CLEAN" ||
    proof.currentProfileAndStorage?.storage !== "EMPTY_AND_ISOLATED" || owner.kind !== "evalrunner-versioned-series-lease" ||
    owner.issue !== authorizedIssue || owner.scope !== manifest.scope || owner.series !== manifest.series || owner.nonce !== manifest.nonce || owner.manifestSha256 !== manifestSha256)
    throw new EvalFailure("Independent recovery proof/owner differs", 2)
  const slot = path.join(input.series, "slots/readiness-calc-r1")
  if (await readEvalrunnerDocument(path.join(slot, "manifest.json")) !== await readEvalrunnerDocument(admission)) throw new EvalFailure("Admission changed", 2)
  if ([path.join(input.series, "release.json"), path.join(slot, "release.json")].some(file => Bun.file(file).size > 0) ||
    (await readdir(path.join(input.series, "completions"))).length) throw new EvalFailure("Measured/released readiness cannot recover", 2)
  const runs = await readdir(path.join(slot, "runs"))
  if (runs.length !== 1) throw new EvalFailure("Recovery run identity differs", 2)
  const run = path.join(slot, "runs", runs[0]!), attempt = path.join(run, "calc-data-double/1")
  const summary = JSON.parse(await readEvalrunnerDocument(path.join(run, "summary.json")))
  const measured = summary.tasks?.[0]?.attempts?.[0]
  if (summary.task_ids?.length !== 1 || summary.task_ids[0] !== "calc-data-double" || summary.tasks.length !== 1 || summary.tasks[0].attempts.length !== 1 ||
    summary.config?.infra_retries !== 0 || summary.storage_leftovers?.length !== 0 || measured?.status !== "failed" || measured.failure_kind !== "provider" ||
    measured.session_id || measured.judge_attempts !== 0 || JSON.stringify(measured.errors) !== '["ProviderModelNotFoundError"]' ||
    ["input", "output", "reasoning"].some(key => measured.tokens?.[key] !== 0) || measured.counters?.toolCalls !== 0 || measured.environment_cleanup?.status !== "confirmed")
    throw new EvalFailure("Pre-inference summary unconfirmed", 2)
  const events = (await readFile(path.join(attempt, "events.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line))
  if (!events.length || events.some(event => event.sessionID || event.type !== "error" || event.error?.name !== "ProviderModelNotFoundError"))
    throw new EvalFailure("Events include inference/Session or unknown activity", 2)
  const cleanup = JSON.parse(await readEvalrunnerDocument(path.join(attempt, "cleanup.json")))
  if (cleanup.result?.status !== "confirmed" || cleanup.processes?.status !== "confirmed" || cleanup.processes.capture_complete !== true ||
    cleanup.processes.observation_mode !== "continuous" || cleanup.processes.error || cleanup.processes.unknownProcesses?.length !== 0 ||
    !Array.isArray(cleanup.processes.verification) || cleanup.processes.verification.length < 2 ||
    cleanup.processes.verification.some((pass: { owned_remaining: number }) => pass.owned_remaining !== 0) ||
    !["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].every(stage => cleanup.stages?.some((item: { stage: string; status: string }) => item.stage === stage && item.status === "confirmed")))
    throw new EvalFailure("Recovery cleanup/UNKNOWN unconfirmed", 2)
  const archive: string = cleanup.stages.find((item: { stage: string }) => item.stage === "profile_history").path
  if (!archive?.startsWith(config.profile + ".history/") || await realpath(archive) !== archive) throw new EvalFailure("Closed history boundary differs", 2)
  const sources = await historyHashes(archive)
  const copyRoot = path.join(config.root, "roles/evalrunner/work/recovery-verification")
  await mkdir(copyRoot, { recursive: true, mode: 0o700 })
  const copy = await mkdtemp(path.join(copyRoot, "closed-"))
  for (const source of sources) await writeFile(path.join(copy, source.name), await readFile(path.join(archive, "data", source.name)), { flag: "wx", mode: 0o600 })
  const { Database } = await import("bun:sqlite")
  const db = new Database(path.join(copy, "loginom-ai-agent.db"), { readonly: true })
  const counts = (() => { try { return ["session", "message"].map(table => (db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n) } finally { db.close() } })()
  if (counts.some(count => count !== 0)) throw new EvalFailure("Session/message exists; inference cannot be excluded", 2)
  if (JSON.stringify(sources) !== JSON.stringify(await historyHashes(archive)) || proof.sourceDbFiles && JSON.stringify(proof.sourceDbFiles) !== JSON.stringify(sources))
    throw new EvalFailure("Closed history source changed", 2)
  const evidence = await sealEvalrunnerEvidence(input.series)
  if (input.sealFile) {
    const seal = JSON.parse(await readEvalrunnerDocument(input.sealFile))
    if (JSON.stringify(seal.files.map((item: { path: string; sha256: string }) => ({ path: item.path, sha256: item.sha256 }))) !== JSON.stringify(evidence))
      throw new EvalFailure("Original evidence seal changed", 2)
  }
  return { kind: "evalrunner-pre-inference-recovery-audit", issue: authorizedIssue, scope: "readiness-calc", series: input.series,
    manifestSha256, admissionSha256, ownerSha256: evalrunnerHash(ownerRaw), proofSha256: evalrunnerHash(await readFile(input.proofFile)),
    reservationSha256: evalrunnerHash(await readFile(path.join(config.root, "operations/series-registry", authorizedIssue + "-readiness-calc.json"))),
    evidence, sources, archive, productInferenceCalls: 0, judgeCalls: 0 }
}

async function historyHashes(archive: string) {
  const files = []
  for (const name of ["loginom-ai-agent.db", "loginom-ai-agent.db-shm", "loginom-ai-agent.db-wal"]) {
    const file = path.join(archive, "data", name)
    const info = await lstat(file).catch(error => { if (error.code === "ENOENT" && name !== "loginom-ai-agent.db") return undefined; throw error })
    if (!info) continue
    if (!info.isFile() || info.isSymbolicLink() || await realpath(file) !== file) throw new EvalFailure("Unsafe recovery history", 2)
    files.push({ name, bytes: info.size, sha256: evalrunnerHash(await readFile(file)) })
  }
  return files
}

/** A crash at any later boundary spends the sole request and fails closed; never auto-resume it. */
export async function claimEvalrunnerRecovery(config: { root: string }, audit: Awaited<ReturnType<typeof auditEvalrunnerPreInference>>) {
  if (audit.issue !== authorizedIssue || audit.scope !== "readiness-calc" || audit.productInferenceCalls !== 0 || audit.judgeCalls !== 0)
    throw new EvalFailure("Unauthorized recovery request", 2)
  const directory = path.join(config.root, "operations/series-recovery", authorizedIssue + "-readiness-calc")
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 })
  await mkdir(directory, { mode: 0o700 }).catch(() => { throw new EvalFailure("Recovery already requested; preserve journal and investigate", 2) })
  await durableEvalrunnerJson(path.join(directory, "request.json"), { ...audit, requestedAt: new Date().toISOString() })
  return directory
}

export async function recoverEvalrunnerReadiness(config: EvalrunnerConfig, input: { series: string; task: string; proofSha256: string }) {
  if (config.version !== 2 || config.readinessIssue !== authorizedIssue || !/^[\w-]+$/.test(input.task)) throw new EvalFailure("Unauthorized readiness recovery", 2)
  if (await lstat(path.join(config.root, "operations/series-recovery", authorizedIssue + "-readiness-calc")).then(() => true, error => {
    if (error.code === "ENOENT") return false; throw error
  })) throw new EvalFailure("Recovery already requested; preserve journal", 2)
  const { acquireEvalrunnerExecutor, requireEvalrunnerQualification } = await import("./evalrunner-controller")
  const executor = await acquireEvalrunnerExecutor(config, { issue: authorizedIssue, task: input.task, series: input.series })
  try {
    const proofFile = path.join(config.root, "roles/evalrunner/work/lab77-operator-catalog/pre-inference-audit/proof.json")
    const sealFile = path.join(config.root, "roles/evalrunner/work/incidents/lab77-readiness-calc-provider/original-series-seal.json")
    if (evalrunnerHash(await readFile(proofFile)) !== input.proofSha256) throw new EvalFailure("Operator proof pin changed", 2)
    const proof = await qualifyEvalrunner(config), corpus = await loadEvalrunnerCorpus(path.join(config.checkout, "evals"))
    await requireEvalrunnerQualification(config, proof, corpus.sha256)
    const { qualifyEvalrunnerCatalog } = await import("./evalrunner-catalog")
    await qualifyEvalrunnerCatalog(config, proof.env, config.catalog!)
    const { assertProfileClean } = await import("./profile")
    const { checkIsolatedLoginom } = await import("./preflight")
    const { parseArtifactSource } = await import("./artifact")
    await assertProfileClean(config.profile)
    await checkIsolatedLoginom(parseArtifactSource("docker", { container: proof.env.LOGINOM_CONTAINER!, storageDir: proof.env.LOGINOM_STORAGE_DIR! }))
    const audit = await auditEvalrunnerPreInference(config, { series: input.series, proofFile, sealFile })
    const lease = path.join(config.root, "operations/stand.lease"), identity = await lstat(lease)
    const journal = await claimEvalrunnerRecovery(config, audit)
    // No rollback or repeat after spending the request, even if this process crashes.
    await assertProfileClean(config.profile)
    const current = await lstat(lease)
    if (current.isSymbolicLink() || current.uid !== process.getuid?.() || current.mode & 0o077 || current.dev !== identity.dev || current.ino !== identity.ino ||
      evalrunnerHash(await readFile(path.join(lease, "owner.json"))) !== audit.ownerSha256) throw new EvalFailure("Recovery lease identity changed; preserve request", 2)
    await rename(lease, path.join(journal, "original-stand.lease"))
    for (const parent of [path.dirname(lease), journal]) {
      const handle = await open(parent, "r"); try { await handle.sync() } finally { await handle.close() }
    }
    const newSeries = input.series + "-g1", pins = { ...proof, env: undefined }
    const preserved = [
      { file: proofFile, sha256: audit.proofSha256 },
      { file: sealFile, sha256: evalrunnerHash(await readFile(sealFile)) },
      { file: path.join(input.series, "manifest.json"), sha256: audit.manifestSha256 },
      { file: path.join(config.root, "operations/series-registry", authorizedIssue + "-readiness-calc.json"), sha256: audit.reservationSha256 },
      { file: path.join(config.root, "operations/series-admissions", authorizedIssue + "-readiness-calc/readiness-calc-r1.json"), sha256: audit.admissionSha256 },
      { file: path.join(journal, "original-stand.lease/owner.json"), sha256: audit.ownerSha256 },
      ...audit.evidence.map(item => ({ file: path.join(input.series, item.path), sha256: item.sha256 })),
    ]
    const receipt = { kind: "evalrunner-readiness-recovery", status: "RECOVERED_PRE_INFERENCE", issue: authorizedIssue, scope: "readiness-calc", generation: 1,
      originalSeries: input.series, newSeries, newPinsSha256: evalrunnerHash(JSON.stringify(pins)), preserved, audit,
      productInferenceCalls: 0, judgeCalls: 0, originalReleased: false, at: new Date().toISOString() }
    const file = path.join(journal, "receipt.json")
    await durableEvalrunnerJson(file, receipt)
    const manifest = createEvalrunnerManifest({ issue: authorizedIssue, task: input.task, scope: "readiness-calc", series: newSeries,
      pins, corpus, generation: 1, recovery: { file, sha256: evalrunnerHash(await readFile(file)) } })
    await reserveEvalrunnerSeries(config, manifest)
    await durableEvalrunnerBytes(path.join(newSeries, "cli-manifest.json"), await readFile(path.join(path.dirname(path.dirname(config.cliBin)), "cli-manifest.json")))
    await durableEvalrunnerBytes(path.join(newSeries, "qualification.json"), await readFile(config.qualificationFile!))
    await durableEvalrunnerBytes(path.join(newSeries, "recovery.json"), await readFile(file))
    return { status: "RECOVERED_PRE_INFERENCE", series: newSeries, generation: 1, productInferenceCalls: 0, judgeCalls: 0 }
  } finally { await executor.release() }
}

export async function resolveEvalrunnerReadiness(config: { root: string; results: string }, issue: string, scope: string) {
  const original = path.join(config.results, `v02-${scope}-${issue}`)
  if (scope !== "readiness-calc") return original
  const journal = path.join(config.root, "operations/series-recovery", issue + "-readiness-calc")
  const exists = await lstat(journal).then(() => true, error => { if (error.code === "ENOENT") return false; throw error })
  if (!exists) return original
  const receipt = JSON.parse(await readEvalrunnerDocument(path.join(journal, "receipt.json")))
  if (receipt.status !== "RECOVERED_PRE_INFERENCE" || receipt.newSeries !== original + "-g1") throw new EvalFailure("Recovery incomplete; no next readiness", 2)
  await readEvalrunnerSeries(config, receipt.newSeries)
  return receipt.newSeries as string
}
