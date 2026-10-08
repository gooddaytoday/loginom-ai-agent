import path from "node:path"
import { parseArgs } from "node:util"
import { constants } from "node:fs"
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises"
import { archiveProfileHistory, assertProfileClean, assertAuth, management, parseView, recoverIfNeeded, releaseStaleWriter, waitProfileIdle } from "./profile"
import { loadConfig } from "./config"
import { agentCommand } from "./cli"
import { preflight } from "./preflight"
import { assertNoDebuggers, sandboxCommand } from "./sandbox"
import { checkIsolatedStorage, assertIsolatedStorageEmpty, cleanupOrphanResult, storageEntryExists } from "./artifact"
import { groupProcesses } from "./process-group"
import { observeWriterReleaseSettlement, registrationIdentity, verifyOwnedRegistration, superviseProcess, type OwnedRegistration, type ProcessCleanup } from "./process-supervisor"
import { validateNodeRun } from "./node-evals"
import type { RunSummary } from "./report"
import { archiveDiagnostics } from "./diagnostics"

type OfflinePaths = { checkout: string; workRoots: string[]; resultsRoot: string }
type RolePaths = OfflinePaths & { referenceProfile: string; evalProfile: string }
export type NodeOpsConfig = { version: 1; runtimeRoot: string; endpoint: string; container: { name: string; id: string; storageDir: string }; cliBin: string; roles: { rich: RolePaths; ben: RolePaths }; offline?: OfflinePaths }
export type NodeStandOwner = { issue: string; task: string; role: "rich" | "ben"; phase: "unit" | "reference" | "cold" | "eval" | "recovery"; sha: string }
export type NodeStandLease = NodeStandOwner & { version: 1; token: string; device: number; inode: number; endpoint: string; containerId: string; acquiredAt: string; configSha256: string }
export type NodeStandCompletion = { version: 1; owner: NodeStandOwner; acquiredAt: string } & (
  { kind: "unit"; checks: { command: string; exitCode: number; processes: ProcessCleanup }[] } |
  { kind: "eval"; runDir: string; runSha: string; caseIds: string[] } |
  { kind: "recovery"; receipt: string; profile: "reference" | "eval"; historyArchive: string; processEvidence: string } |
  { kind: "cold"; browserCloseEvidence: string; storageLedger: string } |
  { kind: "reference"; processEvidence: string; historyArchive: string; storageLedger: string; browserCloseEvidence?: string }
)
export type NodeStandRecovery = { version: 1; owner: NodeStandOwner; acquiredAt: string; profile: "reference" | "eval"; processEvidence: string; storageLedger?: string }
type WriterReleaseSettlement = { version: 1; owner: NodeStandOwner; acquiredAt: string; incident: string; profile: "reference" | "eval";
  followupTask: string; original: { path: string; sha256: string; resultSha256: string }; processes: ProcessCleanup; operation?: "LAB-31-owned-registration-v1" }
const registrationIncident = "LAB-31-product-namefix-v1-multi-facts-writer-owner-unavailable"
const registrationAdmissionSha = "c79db297982c257c41c5a60dff46fb7311a87c539f260b5106bba6c927f237e5"

export class NodeOpsFailure extends Error {
  constructor(readonly reason: string) { super(reason) }
}

const inside = (file: string, root: string) => file === root || file.startsWith(root + path.sep)
const directory = (config: NodeOpsConfig) => path.join(config.runtimeRoot, "operations", "stand.lease")

export async function acquireNodeStand(config: NodeOpsConfig, owner: NodeStandOwner): Promise<NodeStandLease> {
  await validateConfig(config)
  validateOwner(owner)
  await mkdir(path.dirname(directory(config)), { recursive: true, mode: 0o700 })
  const operations = await lstat(path.dirname(directory(config)))
  if (await realpath(path.dirname(directory(config))) !== path.dirname(directory(config)) || operations.uid !== process.getuid?.() || (operations.mode & 0o077))
    throw new NodeOpsFailure("INVALID_CONFIG_PATH")
  await mkdir(directory(config), { mode: 0o700 }).catch(() => { throw new NodeOpsFailure("BUSY") })
  const info = await lstat(directory(config))
  const lease: NodeStandLease = { ...owner, version: 1, token: crypto.randomUUID(), device: info.dev, inode: info.ino,
    endpoint: config.endpoint, containerId: config.container.id, acquiredAt: new Date().toISOString(), configSha256: configDigest(config) }
  // A failure after mkdir deliberately leaves a blocked lease for inspection.
  await writeFile(path.join(directory(config), "owner.json"), JSON.stringify(lease), { flag: "wx", mode: 0o600 })
  return lease
}

export async function assertNodeStandOwner(config: NodeOpsConfig, expected: NodeStandLease) {
  await validateConfig(config)
  const current = await readLease(config)
  if (!ownerMatches(current, expected) || ["version", "token", "device", "inode", "endpoint", "containerId", "acquiredAt", "configSha256"].some(key =>
    current[key as keyof NodeStandLease] !== expected[key as keyof NodeStandLease])) throw new NodeOpsFailure("LEASE_OWNER_CHANGED")
  return current
}

export async function releaseNodeStand(config: NodeOpsConfig, lease: NodeStandLease, evidence: string) {
  return exclusive(config, lease, async () => {
    const completion = await readCompletion(config, lease, evidence)
    await verifyCompletion(config, lease, completion, evidence)
    await assertAllProfilesClean(config)
    await assertBrowsersClosed()
    const storage = await assertIsolatedStorageEmpty(source(config))
    if (storage.containerId !== lease.containerId) throw new NodeOpsFailure("CONTAINER_CHANGED")
    await assertNodeStandOwner(config, lease)
    await mkdir(path.join(config.runtimeRoot, "operations", "completed"), { recursive: true, mode: 0o700 })
    const archive = path.join(config.runtimeRoot, "operations", "completed", crypto.randomUUID())
    const receipt = { status: "RELEASED", owner: completion.owner, acquiredAt: lease.acquiredAt,
      releasedAt: new Date().toISOString(), kind: completion.kind, evidenceSha256: await digest(evidence), containerId: lease.containerId, archive }
    await writeFile(path.join(directory(config), "release.json"), JSON.stringify(receipt), { mode: 0o600 })
    // The common guard is removed last: every failure above keeps the stand blocked.
    await rename(directory(config), archive)
    return receipt
  })
}

export async function runNodeEvalOps(argv: string[], env: Record<string, string | undefined> = process.env): Promise<Record<string, unknown> & { code: number }> {
  try { return await executeOps(argv, env) }
  catch (error) {
    return { code: 2, status: error instanceof NodeOpsFailure && error.reason === "BUSY" ? "BUSY" : "BLOCKED",
      reason: error instanceof NodeOpsFailure ? error.reason : "OPERATION_FAILED" }
  }
}

export const nodeOpsHelp = `Usage: bun script/node-eval-ops.ts <command> --config <private-runtime.json> [options]
Commands:
  status                         Inspect shared lease; FREE=0, BUSY=2; no token.
  acquire --issue ID --task ID --role rich|ben --phase unit|reference|cold|eval|recovery --sha FULL --receipt FILE
  preflight --lease FILE          No model execution; clean profiles + existing live preflight.
  unit --lease FILE               Supervised bun test then bun typecheck, no arbitrary command.
  release --lease FILE --evidence FILE
  release --lease FILE --run DIR --ids a,b --run-sha FULL
  recover --lease FILE --incident ID --evidence FILE
  settle-writer-release --lease FILE --incident ID --profile reference|eval --followup-task ID --evidence ORIGINAL --receipt NEW
  lab31-owned-registration --lease FILE --evidence RECOVERY --admission OPERATOR_PROOF --followup-task ID
  check-run --run DIR --ids a,b [--tasks DIR]  Offline; never writes summary or verdict.
Lease handles must stay private (0600); no TTL, waiting, PID stealing, or external retry.
Runtime config v1 contains runtimeRoot, endpoint, container {name,id,storageDir}, cliBin,
roles {rich,ben}, each {checkout,referenceProfile,evalProfile,workRoots,resultsRoot}.
Optional offline {checkout,workRoots,resultsRoot} gives Evaler read-only evidence paths.
One operator recovery is reserved per immutable lease; incident renaming cannot reset it.
Successful release archives the private lease and proofs under operations/completed.
`;

async function executeOps(argv: string[], env: Record<string, string | undefined>): Promise<Record<string, unknown> & { code: number }> {
  if (argv.includes("--help") || !argv.length) return { code: 0, status: "HELP", help: nodeOpsHelp }
  const command = argv[0]
  if (!["status", "acquire", "preflight", "unit", "release", "recover", "check-run", "settle-writer-release", "lab31-owned-registration"].includes(command ?? "")) throw new NodeOpsFailure("UNKNOWN_COMMAND")
  const values = parseArgs({ args: argv.slice(1), strict: true, options: Object.fromEntries(
    ["config", "lease", "issue", "task", "role", "phase", "sha", "receipt", "evidence", "incident", "run", "ids", "tasks", "run-sha", "profile", "followup-task", "admission"].map(name => [name, { type: "string" as const }])) }).values
  const required = (name: string) => {
    const value = values[name]
    if (typeof value !== "string" || !value) throw new NodeOpsFailure("MISSING_ARGUMENT")
    return value
  }
  const config = await readPrivateJson(required("config")) as NodeOpsConfig
  await validateConfig(config)
  if (command === "status") {
    const status = await nodeStandStatus(config)
    return { ...status, code: status.status === "FREE" ? 0 : 2 }
  }
  if (command === "acquire") {
    const receipt = required("receipt")
    const owner = { issue: required("issue"), task: required("task"), role: required("role"), phase: required("phase"), sha: required("sha") } as NodeStandOwner
    validateOwner(owner)
    const roots = config.roles[owner.role].workRoots
    if (!path.isAbsolute(receipt) || !roots.some(root => inside(receipt, root)) || await realpath(path.dirname(receipt)) !== path.dirname(receipt))
      throw new NodeOpsFailure("RECEIPT_PATH_REFUSED")
    const lease = await acquireNodeStand(config, owner)
    await writeFile(receipt, JSON.stringify(lease), { flag: "wx", mode: 0o600 })
    return { code: 0, status: "ACQUIRED", owner, receipt }
  }
  if (command === "check-run") {
    const run = required("run")
    const ids = required("ids").split(",")
    const readers = [...Object.values(config.roles), ...(config.offline ? [config.offline] : [])]
    if (!path.isAbsolute(run) || await realpath(run) !== run || !readers.some(role => inside(run, role.resultsRoot) || role.workRoots.some(root => inside(run, root))))
      throw new NodeOpsFailure("EVIDENCE_PATH_REFUSED")
    const tasks = typeof values.tasks === "string" ? values.tasks : undefined
    if (tasks && !readers.some(role => tasks === path.join(role.checkout, "evals/tasks/node-evals"))) throw new NodeOpsFailure("TASKS_PATH_REFUSED")
    const result = await validateNodeRun(run, ids, tasks)
    // Error strings can include paths/source contents; preserve full diagnostics only in original artifacts.
    return { code: result.code, status: result.verdict, errorCount: result.errors.length, failureCount: result.failures.length,
      attempts: result.attempts.map(attempt => ({ task_id: attempt.task_id, attempt: attempt.attempt, status: attempt.status,
        session_id: attempt.session_id, cleanup: attempt.cleanup, verdict: attempt.verdict, infra_retry_initial_status: attempt.infra_retry_initial?.status ?? null })) }
  }
  const lease = await readPrivateJson(required("lease")) as NodeStandLease
  await assertNodeStandOwner(config, lease)
  if (command === "preflight") return { code: 0, ...await preflightNodeStand(config, lease, env) }
  if (command === "unit") return runNodeUnitChecks(config, lease)
  if (command === "settle-writer-release") return { code: 0, ...await settleNodeWriterRelease(config, lease, required("incident"),
    required("profile"), required("followup-task"), required("evidence"), required("receipt")) }
  if (command === "recover") return { code: 0, ...await recoverNodeStand(config, lease, required("incident"), required("evidence"), env) }
  if (command === "lab31-owned-registration") return { code: 0, ...await continueLab31OwnedRegistration(config, lease,
    required("evidence"), required("admission"), required("followup-task"), env) }
  const evidence = typeof values.run === "string" ? await writeEvalCompletion(config, lease, values.run, required("ids").split(","), required("run-sha")) : required("evidence")
  return { code: 0, ...await releaseNodeStand(config, lease, evidence) }
}

async function writeEvalCompletion(config: NodeOpsConfig, lease: NodeStandLease, runDir: string, caseIds: string[], runSha: string) {
  await evidencePath(config, lease, runDir)
  const evidence = path.join(directory(config), `eval-completion-${crypto.randomUUID()}.json`)
  const completion: NodeStandCompletion = { version: 1, owner: ownerOf(lease), acquiredAt: lease.acquiredAt, kind: "eval", runDir, caseIds, runSha }
  await writeFile(evidence, JSON.stringify(completion), { flag: "wx", mode: 0o600 })
  return evidence
}

async function readPrivateJson(file: string) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o077)) throw new NodeOpsFailure("PRIVATE_FILE_REQUIRED")
    return JSON.parse(await handle.readFile("utf8")) as unknown
  } finally { await handle.close() }
}

export async function runNodeUnitChecks(config: NodeOpsConfig, lease: NodeStandLease) {
  return exclusive(config, lease, async () => {
    await assertAllProfilesClean(config)
    await assertBrowsersClosed()
    if ((await assertIsolatedStorageEmpty(source(config))).containerId !== lease.containerId) throw new NodeOpsFailure("CONTAINER_CHANGED")
    const checks: { command: string; exitCode: number; processes: ProcessCleanup }[] = []
    const unit = path.join(directory(config), `unit-${crypto.randomUUID()}`)
    await mkdir(unit, { mode: 0o700 })
    for (const command of ["test", "typecheck"]) {
      const outDir = await nodeProcessOutput(config, lease, command === "test" ? "unit-test" : "unit-typecheck")
      const run = await superviseProcess({ cmd: [process.execPath, command], cwd: path.join(config.roles[lease.role].checkout, "evals"),
        env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined &&
          /^(PATH|HOME|LANG|LC_[A-Z_]+|TMPDIR|https?_proxy|all_proxy|no_proxy|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|NODE_USE_ENV_PROXY|EVAL_TEST_LOGINOM_IMAGE)$/.test(entry[0]))),
        timeoutMs: 900_000, outDir, observationMode: "unit_after_exit" })
      checks.push({ command: `bun ${command}`, exitCode: run.exitCode, processes: run.processCleanup })
      await verifyProcesses(run.processCleanup, lease, true)
    }
    const completion: NodeStandCompletion = { version: 1, owner: ownerOf(lease), acquiredAt: lease.acquiredAt, kind: "unit", checks }
    const evidence = path.join(unit, "completion.json")
    await writeFile(evidence, JSON.stringify(completion), { mode: 0o600 })
    return { status: "COMPLETE", code: checks.some(check => check.exitCode !== 0) ? 1 : 0, evidence }
  })
}

/** superviseProcess opens capture files immediately; its caller owns their private directory. */
export async function nodeProcessOutput(config: NodeOpsConfig, lease: NodeStandLease, kind: "unit-test" | "unit-typecheck" | "native-check") {
  await assertNodeStandOwner(config, lease)
  if (!["unit-test", "unit-typecheck", "native-check"].includes(kind)) throw new NodeOpsFailure("INVALID_CAPTURE_KIND")
  const outDir = path.join(directory(config), `capture-${kind}-${crypto.randomUUID()}`)
  await mkdir(outDir, { mode: 0o700 })
  return outDir
}

export async function preflightNodeStand(config: NodeOpsConfig, lease: NodeStandLease, env: Record<string, string | undefined> = process.env) {
  return exclusive(config, lease, async () => {
    await assertAllProfilesClean(config)
    await assertBrowsersClosed()
    const git = await checkoutIdentity(config.roles[lease.role].checkout)
    if (git.sha !== lease.sha) throw new NodeOpsFailure("BASE_SHA_CHANGED")
    const storage = await checkIsolatedStorage(source(config))
    if (storage.containerId !== lease.containerId) throw new NodeOpsFailure("CONTAINER_CHANGED")
    const current = evalConfig(config, lease, env)
    const environment = await preflight(current, source(config))
    const command = { ...agentCommand(current, env), cleanupDir: path.join(directory(config), "preflight"),
      cleanupSecrets: [current.loginom.password, current.dock.apiKey, current.agent.provider?.apiKey ?? ""] }
    await assertAuth(current, command)
    const admission = { owner: ownerOf(lease), acquiredAt: lease.acquiredAt, containerId: storage.containerId, configSha256: configDigest(config),
      profiles: Object.values(config.roles).flatMap(role => [role.referenceProfile, role.evalProfile]), checkedAt: new Date().toISOString() }
    await writeFile(path.join(directory(config), "admission.json"), JSON.stringify(admission), { mode: 0o600 })
    const view = parseView((await management(command, ["loginom", "status", "--format", "json"])).stdout)
    if (view?.state !== "ready" || view.recoveries?.length) throw new NodeOpsFailure("PROFILE_NOT_READY")
    // Validate Loginom credentials, websocket and licence with the installed product's real browser.
    // No run/model command is admitted here, and no settings or credentials are replaced.
    const workdir = await mkdtemp(path.join(config.roles[lease.role].workRoots[0]!, ".ops-check-"))
    const checkDir = await nodeProcessOutput(config, lease, "native-check")
    const cmd = [...command.cmd, "loginom", "check", "--format", "json"]
    const boundary = await sandboxCommand({ cmd, profileDir: current.profileDir, workdir, env: command.env })
    const check = await superviseProcess({ cmd, cwd: boundary.cwd, env: boundary.env, sandbox: boundary.cmd, profileDir: current.profileDir, outDir: checkDir, timeoutMs: 120_000 })
    await verifyProcesses(check.processCleanup, lease)
    await archiveDiagnostics(current.profileDir, check.processCleanup.runtimeDirectories, checkDir, command.cleanupSecrets)
    await releaseStaleWriter(current.profileDir, check.processCleanup.writer)
    const receipt = JSON.parse(check.stdout.trim().split("\n").at(-1) ?? "null") as { ok?: boolean; code?: string } | null
    if (check.exitCode !== 0 || check.sandboxError || check.timedOut || check.interrupted || receipt?.ok !== true || receipt.code !== "LOGINOM_CONNECTION_VALID")
      throw new NodeOpsFailure("NATIVE_LOGINOM_CHECK_FAILED")
    await archiveProfileHistory(current.profileDir, `node-ops-admission-${lease.task}`)
    await rm(workdir, { recursive: true })
    await assertAllProfilesClean(config)
    await assertBrowsersClosed()
    if ((await assertIsolatedStorageEmpty(source(config))).containerId !== lease.containerId) throw new NodeOpsFailure("CONTAINER_CHANGED")
    return { status: "READY", sha: git.sha, dirty: git.dirty, containerId: storage.containerId,
      cliSourceSha: environment.agent?.sourceCommit ?? null, model: current.agent.model, variant: current.agent.variant }
  })
}

async function assertOriginalAdmission(config: NodeOpsConfig, lease: NodeStandLease) {
  const admission = await readPrivateJson(path.join(directory(config), "admission.json")).catch(() => undefined) as
    { owner?: NodeStandOwner; acquiredAt?: string; containerId?: string; profiles?: string[]; configSha256?: string } | undefined
  if (!admission || !ownerMatches(admission.owner, lease) || admission.acquiredAt !== lease.acquiredAt || admission.containerId !== lease.containerId ||
    admission.configSha256 !== configDigest(config) || JSON.stringify(admission.profiles) !== JSON.stringify(Object.values(config.roles).flatMap(role => [role.referenceProfile, role.evalProfile])))
    throw new NodeOpsFailure("ADMISSION_PROOF_REQUIRED")
}

export async function settleNodeWriterRelease(config: NodeOpsConfig, lease: NodeStandLease, incident: string, profileName: string,
  followupTask: string, original: string, receipt: string) {
  return exclusive(config, lease, async () => {
    await assertOriginalAdmission(config, lease)
    if (!safeName(incident) || !safeName(followupTask) || !["reference", "eval"].includes(profileName)) throw new NodeOpsFailure("INVALID_SETTLEMENT_REQUEST")
    await evidencePath(config, lease, original)
    if (!path.isAbsolute(receipt) || !config.roles[lease.role].workRoots.some(root => inside(receipt, root)) ||
      await realpath(path.dirname(receipt)) !== path.dirname(receipt)) throw new NodeOpsFailure("RECEIPT_PATH_REFUSED")
    if (await Bun.file(path.join(directory(config), "writer-release-settlement.json")).exists()) throw new NodeOpsFailure("SETTLEMENT_ALREADY_RECORDED")
    const bytes = await readFile(original)
    const proof = JSON.parse(bytes.toString()) as { processes: ProcessCleanup; result?: { status: string; error: string } }
    if (proof.result?.status !== "failed" || proof.result.error !== "Writer owner unavailable") throw new NodeOpsFailure("SETTLEMENT_SOURCE_INELIGIBLE")
    const cli = await stat(config.cliBin)
    if (proof.processes.selectedCli?.executable !== await realpath(config.cliBin) || proof.processes.selectedCli.device !== cli.dev ||
      proof.processes.selectedCli.inode !== cli.ino) throw new NodeOpsFailure("SETTLEMENT_CLI_CHANGED")
    const resultFile = path.join(path.dirname(original), "result.json")
    const result = await Bun.file(resultFile).json() as { status: string; session_id: string; package_path: string; environment_cleanup: { status: string; error: string } }
    if (result.status !== "completed" || !result.session_id || result.environment_cleanup?.status !== "failed" ||
      result.environment_cleanup.error !== "Writer owner unavailable" || !/^\/user\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.lgp$/.test(result.package_path))
      throw new NodeOpsFailure("SETTLEMENT_SOURCE_INELIGIBLE")
    const profile = profileName === "reference" ? config.roles[lease.role].referenceProfile : config.roles[lease.role].evalProfile
    for (const role of Object.values(config.roles)) for (const candidate of [role.referenceProfile, role.evalProfile]) {
      if (!await waitProfileIdle(candidate, 1_000)) throw new NodeOpsFailure("PROCESSES_BUSY")
      if (candidate !== profile) await assertProfileClean(candidate).catch(() => { throw new NodeOpsFailure("PROFILE_NOT_CLEAN") })
    }
    await assertBrowsersClosed()
    if ((await checkIsolatedStorage(source(config))).containerId !== lease.containerId) throw new NodeOpsFailure("CONTAINER_CHANGED")
    const settlement: WriterReleaseSettlement = { version: 1, owner: ownerOf(lease), acquiredAt: lease.acquiredAt, incident,
      profile: profileName as "reference" | "eval", followupTask, original: { path: original,
        sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), resultSha256: await digest(resultFile) },
      processes: await observeWriterReleaseSettlement(profile, proof.processes, lease.acquiredAt) }
    if (await digest(original) !== settlement.original.sha256) throw new NodeOpsFailure("SETTLEMENT_SOURCE_CHANGED")
    await writeFile(receipt, JSON.stringify(settlement, null, 2), { flag: "wx", mode: 0o600 })
    await writeFile(path.join(directory(config), "writer-release-settlement.json"), JSON.stringify({ version: 1,
      owner: ownerOf(lease), acquiredAt: lease.acquiredAt, incident, profile: profileName, evidence: receipt,
      evidenceSha256: await digest(receipt), original: settlement.original }), { flag: "wx", mode: 0o600 })
    return { status: "PROCESS_SETTLED", incident, evidence: receipt, originalSha256: settlement.original.sha256, leaseRetained: true }
  })
}

async function verifyWriterReleaseSettlement(config: NodeOpsConfig, lease: NodeStandLease, proof: WriterReleaseSettlement,
  evidence: string, incident?: string) {
  if (proof.processes.observation_mode !== "writer_release_settlement") return undefined
  const recorded = await readPrivateJson(path.join(directory(config), proof.operation === "LAB-31-owned-registration-v1" ?
    "owned-registration-settlement-attestation.json" : "writer-release-settlement.json"))
    .catch(() => { throw new NodeOpsFailure("SETTLEMENT_PROOF_UNKNOWN") }) as
    { owner: NodeStandOwner; acquiredAt: string; incident: string; profile: string; evidence: string; evidenceSha256: string; original: WriterReleaseSettlement["original"] }
  if (proof.version !== 1 || !ownerMatches(proof.owner, lease) || proof.acquiredAt !== lease.acquiredAt ||
    !ownerMatches(recorded.owner, lease) || recorded.acquiredAt !== lease.acquiredAt || recorded.evidence !== evidence ||
    recorded.evidenceSha256 !== await digest(evidence) || recorded.incident !== proof.incident || incident && incident !== proof.incident ||
    recorded.profile !== proof.profile || JSON.stringify(recorded.original) !== JSON.stringify(proof.original) ||
    await digest(proof.original.path) !== proof.original.sha256 ||
    await digest(path.join(path.dirname(proof.original.path), "result.json")) !== proof.original.resultSha256)
    throw new NodeOpsFailure("SETTLEMENT_PROOF_UNKNOWN")
  return proof.original.path
}

export async function recoverNodeStand(config: NodeOpsConfig, lease: NodeStandLease, incident: string, evidence: string, env: Record<string, string | undefined> = process.env) {
  return exclusive(config, lease, async () => {
    await assertOriginalAdmission(config, lease)
    if (!safeName(incident)) throw new NodeOpsFailure("INVALID_INCIDENT")
    await evidencePath(config, lease, evidence)
    const recovery = await Bun.file(evidence).json() as NodeStandRecovery
    if (recovery.version !== 1 || recovery.acquiredAt !== lease.acquiredAt || !ownerMatches(recovery.owner, lease) ||
      !["reference", "eval"].includes(recovery.profile)) throw new NodeOpsFailure("RECOVERY_OWNER_UNKNOWN")
    await evidencePath(config, lease, recovery.processEvidence)
    const proof = await Bun.file(recovery.processEvidence).json()
    const processes = (proof.processes ?? proof) as ProcessCleanup
    const settledOriginal = await verifyWriterReleaseSettlement(config, lease, proof, recovery.processEvidence, incident)
    await verifyProcesses(processes, lease)
    const profile = recovery.profile === "reference" ? config.roles[lease.role].referenceProfile : config.roles[lease.role].evalProfile
    if (processes.runtimeDirectories.some(root => !inside(root, profile))) throw new NodeOpsFailure("RECOVERY_OWNER_UNKNOWN")
    for (const role of Object.values(config.roles)) for (const candidate of [role.referenceProfile, role.evalProfile]) {
      if (!await waitProfileIdle(candidate, 1_000)) throw new NodeOpsFailure("PROCESSES_BUSY")
      if (candidate !== profile) await assertProfileClean(candidate).catch(() => { throw new NodeOpsFailure("PROFILE_NOT_CLEAN") })
    }
    await assertBrowsersClosed()
    const storage = await checkIsolatedStorage(source(config))
    if (storage.containerId !== lease.containerId) throw new NodeOpsFailure("CONTAINER_CHANGED")
    const receipt = await reserveNodeRecovery(config, lease, incident)
    // No killing, resetting, or broad deletion: these functions inspect the saved writer and exact profile.
    await releaseStaleWriter(profile, processes.writer)
    return completeNodeRecovery(config, lease, incident, recovery, receipt, settledOriginal, env)
  })
}

/** The normal non-model chain, shared verbatim by the narrowly admitted continuation. */
async function completeNodeRecovery(config: NodeOpsConfig, lease: NodeStandLease, incident: string, recovery: NodeStandRecovery,
  receipt: string, settledOriginal: string | undefined, env: Record<string, string | undefined>) {
    const profile = recovery.profile === "reference" ? config.roles[lease.role].referenceProfile : config.roles[lease.role].evalProfile
    const current = evalConfig(config, lease, env, recovery.profile)
    const command = { ...agentCommand(current, env), cleanupDir: path.join(directory(config), "recovery", incident),
      cleanupSecrets: [current.loginom.password, current.dock.apiKey, current.agent.provider?.apiKey ?? ""] }
    await recoverIfNeeded(command, 2)
    const historyArchive = await archiveProfileHistory(profile, `node-ops-${incident}`)
    await verifyHistoryArchive(profile, historyArchive)
    if (recovery.storageLedger) await cleanupOwnedLedger(config, lease, recovery.storageLedger, incident, settledOriginal)
    if ((await assertIsolatedStorageEmpty(source(config))).containerId !== lease.containerId) throw new NodeOpsFailure("CONTAINER_CHANGED")
    await assertAllProfilesClean(config)
    await assertNodeStandOwner(config, lease)
    await writeFile(receipt, JSON.stringify({ owner: ownerOf(lease), acquiredAt: lease.acquiredAt, incident, status: "SETTLED", at: new Date().toISOString(), historyArchive,
      profile: recovery.profile, processEvidence: recovery.processEvidence }), { mode: 0o600 })
    const completion: NodeStandCompletion = { version: 1, owner: ownerOf(lease), acquiredAt: lease.acquiredAt, kind: "recovery", receipt,
      profile: recovery.profile, historyArchive, processEvidence: recovery.processEvidence }
    const completionFile = path.join(directory(config), `recovery-completion-${crypto.randomUUID()}.json`)
    await writeFile(completionFile, JSON.stringify(completion), { flag: "wx", mode: 0o600 })
    return { status: "SETTLED", incident, historyArchive, evidence: completionFile, leaseRetained: true }
}

function recoveryReceiptPath(config: NodeOpsConfig, lease: NodeStandLease) {
  const key = new Bun.CryptoHasher("sha256").update(`${lease.token}:${lease.issue}:${lease.task}:${lease.acquiredAt}`).digest("hex")
  return path.join(config.runtimeRoot, "operations", "recovery-incidents", `${key}.json`)
}

/** An irreversible once marker, not a reset/resume of the original reservation. */
export async function reserveOwnedRegistrationContinuation(config: NodeOpsConfig, lease: NodeStandLease,
  originalSha256: string, newSha: string, followupTask: string) {
  await assertNodeStandOwner(config, lease)
  const original = recoveryReceiptPath(config, lease)
  const attempted = await readPrivateJson(original) as { status: string; owner: NodeStandOwner; acquiredAt: string; incident: string }
  if (attempted.status !== "ATTEMPTED" || !ownerMatches(attempted.owner, lease) || attempted.acquiredAt !== lease.acquiredAt ||
    attempted.incident !== registrationIncident || await digest(original) !== originalSha256 || !/^[0-9a-f]{40}$/.test(newSha) || !safeName(followupTask))
    throw new NodeOpsFailure("CONTINUATION_RESERVATION_UNKNOWN")
  const once = path.join(directory(config), "owned-registration-once.json")
  await writeFile(once, JSON.stringify({ operation: "LAB-31-owned-registration-v1", status: "CONSUMED_BEFORE_MUTATION",
    owner: ownerOf(lease), acquiredAt: lease.acquiredAt, incident: registrationIncident, originalReceipt: original,
    originalSha256, newSha, followupTask, at: new Date().toISOString(), historicalException: "UNKNOWN" }), { flag: "wx", mode: 0o600 })
    .catch(() => { throw new NodeOpsFailure("CONTINUATION_ALREADY_ATTEMPTED") })
  return once
}

async function noHistoryMutations(profile: string, after: number) {
  let entries = 0, maxMtime = 0, maxCtime = 0
  const visit = async (file: string): Promise<void> => {
    const info = await lstat(file)
    if (info.isSymbolicLink() || info.mtimeMs >= after || info.ctimeMs >= after) throw new NodeOpsFailure("CONTINUATION_HISTORY_CHANGED")
    entries++; maxMtime = Math.max(maxMtime, info.mtimeMs); maxCtime = Math.max(maxCtime, info.ctimeMs)
    if (info.isDirectory()) for (const name of await readdir(file)) await visit(path.join(file, name))
  }
  await visit(profile)
  return { entries, maxMtime, maxCtime }
}

/** Closed operator exception for this one LAB-31 reservation and pinned admission. No retry API. */
export async function continueLab31OwnedRegistration(config: NodeOpsConfig, lease: NodeStandLease, evidence: string,
  admissionFile: string, followupTask: string, env: Record<string, string | undefined> = process.env) {
  return exclusive(config, lease, async () => {
    await assertOriginalAdmission(config, lease)
    if (lease.issue !== "01a11a54-25a7-7e22-9ef4-9645c6e25017" || lease.task !== "01a11b02-b4c6-7438-a4d8-8b45d3534b86" ||
      lease.role !== "rich" || lease.phase !== "eval" || lease.acquiredAt !== "2026-10-08T10:19:37.441Z") throw new NodeOpsFailure("CONTINUATION_SCOPE_REFUSED")
    if (await Bun.file(path.join(directory(config), "owned-registration-once.json")).exists()) throw new NodeOpsFailure("CONTINUATION_ALREADY_ATTEMPTED")
    await evidencePath(config, lease, admissionFile); await evidencePath(config, lease, evidence)
    const admission = await readPrivateJson(admissionFile) as { source_sha: string; original_recovery_receipt_sha256: string;
      registration: { bytes: string; device: number; inode: number; uid: number; mode: string; mtime_ns: number; ctime_ns: number };
      inventories: { profile_metadata: { entries: number }; history_metadata: { entries: number } };
      source_sha256: Record<string, string>; storage: { name: string; sha256: string }[] }
    if (await digest(admissionFile) !== registrationAdmissionSha) throw new NodeOpsFailure("CONTINUATION_ADMISSION_UNKNOWN")
    const current = await checkoutIdentity(config.roles.rich.checkout)
    if (current.dirty) throw new NodeOpsFailure("CHECKOUT_DIRTY")
    for (const [file, hash] of Object.entries(admission.source_sha256)) {
      const old = await Bun.$`git show ${`${admission.source_sha}:${file}`}`.cwd(config.roles.rich.checkout).quiet().nothrow()
      if (old.exitCode || new Bun.CryptoHasher("sha256").update(old.stdout).digest("hex") !== hash) throw new NodeOpsFailure("CONTINUATION_SOURCE_UNKNOWN")
    }
    const recovery = await readPrivateJson(evidence) as NodeStandRecovery
    if (recovery.version !== 1 || recovery.profile !== "eval" || !ownerMatches(recovery.owner, lease) || recovery.acquiredAt !== lease.acquiredAt)
      throw new NodeOpsFailure("RECOVERY_OWNER_UNKNOWN")
    await evidencePath(config, lease, recovery.processEvidence)
    const previous = await Bun.file(recovery.processEvidence).json() as WriterReleaseSettlement
    const original = await verifyWriterReleaseSettlement(config, lease, previous, recovery.processEvidence, registrationIncident)
    if (!original) throw new NodeOpsFailure("SETTLEMENT_SOURCE_INELIGIBLE")
    const raw = await Bun.file(original).json() as { processes: ProcessCleanup }
    const cli = await stat(config.cliBin)
    if (raw.processes.selectedCli?.executable !== await realpath(config.cliBin) || raw.processes.selectedCli.device !== cli.dev || raw.processes.selectedCli.inode !== cli.ino)
      throw new NodeOpsFailure("SETTLEMENT_CLI_CHANGED")
    const attempted = await readPrivateJson(recoveryReceiptPath(config, lease)) as { at: string }
    if (await digest(recoveryReceiptPath(config, lease)) !== admission.original_recovery_receipt_sha256) throw new NodeOpsFailure("CONTINUATION_RESERVATION_UNKNOWN")
    const profile = config.roles.rich.evalProfile
    const marker = await registrationIdentity(profile), expected = admission.registration
    if (marker.bytes !== expected.bytes || marker.device !== expected.device || marker.inode !== expected.inode || marker.uid !== expected.uid ||
      marker.mode !== Number.parseInt(expected.mode.slice(2), 8) || Number(marker.mtimeNs) !== expected.mtime_ns || Number(marker.ctimeNs) !== expected.ctime_ns)
      throw new NodeOpsFailure("CONTINUATION_REGISTRATION_CHANGED")
    const histories = { profile: await noHistoryMutations(profile, Date.parse(attempted.at)),
      history: await noHistoryMutations(`${profile}.history`, Date.parse(attempted.at)) }
    if (histories.profile.entries !== admission.inventories.profile_metadata.entries || histories.history.entries !== admission.inventories.history_metadata.entries)
      throw new NodeOpsFailure("CONTINUATION_HISTORY_CHANGED")
    for (const role of Object.values(config.roles)) for (const candidate of [role.referenceProfile, role.evalProfile]) {
      if (!await waitProfileIdle(candidate, 1000)) throw new NodeOpsFailure("PROCESSES_BUSY")
      if (candidate !== profile) await assertProfileClean(candidate)
    }
    await assertBrowsersClosed()
    if ((await checkIsolatedStorage(source(config))).containerId !== lease.containerId) throw new NodeOpsFailure("CONTAINER_CHANGED")
    const names = await Bun.$`docker exec ${lease.containerId} find ${config.container.storageDir} -type f -printf ${"%P\\n"}`.quiet()
    if (JSON.stringify(names.text().trim().split("\n").sort()) !== JSON.stringify(admission.storage.map(f=>f.name).sort())) throw new NodeOpsFailure("CONTINUATION_STORAGE_CHANGED")
    const backup = await Bun.$`docker exec ${lease.containerId} find /workdir/SessionBackup -type f`.quiet()
    if (backup.text().trim()) throw new NodeOpsFailure("CONTINUATION_STORAGE_CHANGED")
    for (const file of admission.storage) {
      const sum = await Bun.$`docker exec ${lease.containerId} sha256sum -- ${`${config.container.storageDir}/${file.name}`}`.quiet()
      if (sum.text().trim().split(/\s+/)[0] !== file.sha256) throw new NodeOpsFailure("CONTINUATION_STORAGE_CHANGED")
    }
    const registration: OwnedRegistration = { profile, acquiredAt: lease.acquiredAt, original: raw.processes, marker }
    const fresh: WriterReleaseSettlement = { ...previous, operation: "LAB-31-owned-registration-v1", followupTask,
      processes: await verifyOwnedRegistration(profile, registration) }
    const processEvidence = path.join(directory(config), "owned-registration-processes.json")
    await writeFile(processEvidence, JSON.stringify(fresh, null, 2), { flag: "wx", mode: 0o600 })
    await writeFile(path.join(directory(config), "owned-registration-settlement-attestation.json"), JSON.stringify({ version: 1,
      owner: ownerOf(lease), acquiredAt: lease.acquiredAt, incident: registrationIncident, profile: "eval", evidence: processEvidence,
      evidenceSha256: await digest(processEvidence), original: fresh.original }), { flag: "wx", mode: 0o600 })
    await writeFile(path.join(directory(config), "owned-registration-admission.json"), JSON.stringify({ registration, histories,
      admissionSha256: registrationAdmissionSha, newSha: current.sha, historicalException: "UNKNOWN" }), { flag: "wx", mode: 0o600 })
    await verifyWriterReleaseSettlement(config, lease, fresh, processEvidence, registrationIncident)
    await reserveOwnedRegistrationContinuation(config, lease, admission.original_recovery_receipt_sha256, current.sha, followupTask)
    await releaseStaleWriter(profile, raw.processes.writer, registration)
    const receipt = path.join(directory(config), "owned-registration-settled.json")
    return completeNodeRecovery(config, lease, registrationIncident, { ...recovery, processEvidence }, receipt, original, env)
  })
}

/** Reserve before the first mutation. Renaming an incident cannot reset a lease's operator budget. */
export async function reserveNodeRecovery(config: NodeOpsConfig, lease: NodeStandLease, incident: string) {
  await assertNodeStandOwner(config, lease)
  if (!safeName(incident)) throw new NodeOpsFailure("INVALID_INCIDENT")
  const incidents = path.join(config.runtimeRoot, "operations", "recovery-incidents")
  await mkdir(incidents, { recursive: true, mode: 0o700 })
  const key = new Bun.CryptoHasher("sha256").update(`${lease.token}:${lease.issue}:${lease.task}:${lease.acquiredAt}`).digest("hex")
  const receipt = path.join(incidents, `${key}.json`)
  await writeFile(receipt, JSON.stringify({ owner: ownerOf(lease), acquiredAt: lease.acquiredAt, incident, status: "ATTEMPTED", at: new Date().toISOString() }),
    { flag: "wx", mode: 0o600 }).catch(() => { throw new NodeOpsFailure("RECOVERY_ALREADY_ATTEMPTED") })
  return receipt
}

async function cleanupOwnedLedger(config: NodeOpsConfig, lease: NodeStandLease, file: string, incident: string, settledOriginal?: string) {
  await evidencePath(config, lease, file)
  const ledger = await Bun.file(file).json()
  const originalResult = settledOriginal ? await Bun.file(path.join(path.dirname(settledOriginal), "result.json")).json() as { package_path: string } : undefined
  if (!Array.isArray(ledger.storage_before) || ledger.storage_before.length || !Array.isArray(ledger.files) ||
    !Number.isFinite(Date.parse(ledger.started_utc)) || Date.parse(ledger.started_utc) < Date.parse(lease.acquiredAt) ||
    ledger.files.some((item: { name: string; sha256?: string }) => !ownedRecoveryEntry(item, originalResult?.package_path) || !/^[0-9a-f]{64}$/.test(item.sha256 ?? "")) ||
    new Set(ledger.files.map((item: { name: string }) => item.name)).size !== ledger.files.length) throw new NodeOpsFailure("STORAGE_OWNER_UNKNOWN")
  const fixed = { ...source(config), container: lease.containerId }
  for (const item of ledger.files as { name: string; sha256: string }[]) {
    if (!await storageEntryExists(fixed, item.name)) continue
    const sha = await Bun.$`docker exec ${lease.containerId} sha256sum -- ${`${config.container.storageDir}/${item.name}`}`.quiet().nothrow()
    if (sha.exitCode !== 0 || sha.text().trim().split(/\s+/)[0] !== item.sha256) throw new NodeOpsFailure("STORAGE_OWNER_UNKNOWN")
    await cleanupOrphanResult({ source: fixed, name: item.name, existingNames: [], processesConfirmed: true,
      outDir: path.join(directory(config), "recovery", incident, "owned-storage", item.name) })
  }
}

/** A dot-prefixed lock is admitted only for the package bound by the recorded settlement. */
export function ownedRecoveryEntry(item: { name: string; kind?: string; package_path?: string; sha256?: string }, settledPackage?: string) {
  return safeName(item.name) || Boolean(settledPackage && /^\/user\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.lgp$/.test(settledPackage) &&
    item.kind === "package_lock" && item.package_path === settledPackage && item.name === `.${path.posix.basename(settledPackage)}.lck` &&
    item.sha256 === new Bun.CryptoHasher("sha256").update("").digest("hex"))
}

function evalConfig(config: NodeOpsConfig, lease: NodeStandLease, env: Record<string, string | undefined>, profile: "reference" | "eval" = "eval") {
  if (env.LOGINOM_URL !== undefined && env.LOGINOM_URL !== config.endpoint) throw new NodeOpsFailure("ENDPOINT_OVERRIDE_REFUSED")
  const role = config.roles[lease.role]
  return loadConfig(["--skip-judge", "--repeat", "1"], { ...env, EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: config.cliBin,
    EVAL_PROFILE_DIR: profile === "reference" ? role.referenceProfile : role.evalProfile, EVAL_WORKSPACE_ROOT: role.workRoots[0],
    EVAL_RESULTS_DIR: role.resultsRoot, EVAL_ARTIFACT_SOURCE: "docker", LOGINOM_URL: config.endpoint,
    LOGINOM_CONTAINER: config.container.name, LOGINOM_STORAGE_DIR: config.container.storageDir })
}

async function exclusive<T>(config: NodeOpsConfig, lease: NodeStandLease, operation: () => Promise<T>) {
  await assertNodeStandOwner(config, lease)
  const guard = path.join(directory(config), "operation")
  await mkdir(guard, { mode: 0o700 }).catch(() => { throw new NodeOpsFailure("OPERATION_BUSY") })
  const info = await lstat(guard)
  try { await assertNodeStandOwner(config, lease); return await operation() }
  finally {
    const current = await lstat(guard).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (current?.dev === info.dev && current?.ino === info.ino && !current.isSymbolicLink()) await rm(guard, { recursive: true })
  }
}

async function readCompletion(config: NodeOpsConfig, lease: NodeStandLease, evidence: string) {
  await evidencePath(config, lease, evidence, true)
  const completion = await Bun.file(evidence).json() as NodeStandCompletion
  if (completion.version !== 1 || !["unit", "eval", "cold", "reference", "recovery"].includes(completion.kind) ||
    completion.acquiredAt !== lease.acquiredAt || !ownerMatches(completion.owner, lease))
    throw new NodeOpsFailure("INVALID_COMPLETION")
  return completion
}

async function verifyCompletion(config: NodeOpsConfig, lease: NodeStandLease, completion: NodeStandCompletion, evidence: string) {
  if (completion.kind === "recovery") {
    const key = new Bun.CryptoHasher("sha256").update(`${lease.token}:${lease.issue}:${lease.task}:${lease.acquiredAt}`).digest("hex")
    const continued = completion.receipt === path.join(directory(config), "owned-registration-settled.json")
    if (!inside(evidence, directory(config)) || !continued && completion.receipt !== path.join(config.runtimeRoot, "operations", "recovery-incidents", `${key}.json`))
      throw new NodeOpsFailure("RECOVERY_PROOF_UNKNOWN")
    if (continued) {
      const once = await readPrivateJson(path.join(directory(config), "owned-registration-once.json")) as
        { owner: NodeStandOwner; acquiredAt: string; incident: string; originalReceipt: string; originalSha256: string; status: string }
      if (!ownerMatches(once.owner, lease) || once.acquiredAt !== lease.acquiredAt || once.incident !== registrationIncident ||
        once.status !== "CONSUMED_BEFORE_MUTATION" || once.originalReceipt !== recoveryReceiptPath(config, lease) ||
        await digest(once.originalReceipt) !== once.originalSha256) throw new NodeOpsFailure("RECOVERY_PROOF_UNKNOWN")
    }
    const receipt = await readPrivateJson(completion.receipt) as { status?: string; owner?: NodeStandOwner; acquiredAt?: string; profile?: string; historyArchive?: string; processEvidence?: string }
    if (receipt.status !== "SETTLED" || !ownerMatches(receipt.owner, lease) || receipt.acquiredAt !== lease.acquiredAt || receipt.profile !== completion.profile ||
      receipt.historyArchive !== completion.historyArchive || receipt.processEvidence !== completion.processEvidence) throw new NodeOpsFailure("RECOVERY_PROOF_UNKNOWN")
    await evidencePath(config, lease, completion.processEvidence)
    const cleanup = await Bun.file(completion.processEvidence).json()
    await verifyWriterReleaseSettlement(config, lease, cleanup, completion.processEvidence)
    await verifyProcesses(cleanup.processes ?? cleanup, lease)
    await verifyHistoryArchive(completion.profile === "reference" ? config.roles[lease.role].referenceProfile : config.roles[lease.role].evalProfile, completion.historyArchive)
    return
  }
  if (completion.kind === "unit") {
    if (lease.phase !== "unit" || !inside(evidence, directory(config)) || completion.checks.length !== 2 ||
      completion.checks.some((check, index) => check.command !== ["bun test", "bun typecheck"][index] || !Number.isInteger(check.exitCode)))
      throw new NodeOpsFailure("INVALID_UNIT_PROOF")
    for (const check of completion.checks) await verifyProcesses(check.processes, lease, true)
    return
  }
  if (completion.kind === "eval") {
    await evidencePath(config, lease, completion.runDir)
    if (!/^[0-9a-f]{40}$/.test(completion.runSha) || !completion.caseIds.length || completion.caseIds.some(id => !/^[a-z0-9][a-z0-9-]*$/.test(id)))
      throw new NodeOpsFailure("INVALID_EVAL_PROOF")
    const git = await checkoutIdentity(config.roles[lease.role].checkout)
    const summary = await Bun.file(path.join(completion.runDir, "summary.json")).json() as RunSummary
    if (git.sha !== completion.runSha || git.dirty || typeof summary.harness?.git_sha !== "string" || !/^[0-9a-f]{7,40}$/.test(summary.harness.git_sha) ||
      !completion.runSha.startsWith(summary.harness.git_sha) || summary.harness.dirty ||
      !Number.isFinite(Date.parse(summary.started_at)) || Date.parse(summary.started_at) < Date.parse(lease.acquiredAt)) throw new NodeOpsFailure("STALE_EVAL_PROOF")
    const result = await validateNodeRun(completion.runDir, completion.caseIds, path.join(config.roles[lease.role].checkout, "evals/tasks/node-evals"))
    if (result.code === 2) throw new NodeOpsFailure("EVAL_EVIDENCE_ERROR")
    for (const task of summary.tasks) for (const attempt of task.attempts) {
      const cleanup = await Bun.file(path.join(completion.runDir, task.id, String(attempt.attempt), "cleanup.json")).json()
      await verifyProcesses(cleanup.processes, lease)
      const archive = cleanup.stages.find((stage: { stage: string }) => stage.stage === "profile_history")?.path
      await verifyHistoryArchive(config.roles[lease.role].evalProfile, archive)
      if (!cleanup.stages.some((stage: { stage: string; status: string }) => stage.stage === "storage" && stage.status === "confirmed"))
        throw new NodeOpsFailure("STORAGE_CLEANUP_UNKNOWN")
    }
    return
  }
  await verifyStorageLedger(config, lease, completion.storageLedger)
  if (completion.kind === "cold") await verifyBrowserClose(config, lease, completion.browserCloseEvidence)
  if (completion.kind === "reference") {
    await evidencePath(config, lease, completion.processEvidence)
    const cleanup = await Bun.file(completion.processEvidence).json()
    await verifyProcesses(cleanup.processes ?? cleanup, lease)
    await verifyHistoryArchive(config.roles[lease.role].referenceProfile, completion.historyArchive)
    if (completion.browserCloseEvidence) await verifyBrowserClose(config, lease, completion.browserCloseEvidence)
  }
}

async function verifyProcesses(processes: ProcessCleanup, lease: NodeStandLease, trustedUnit = false) {
  if (processes?.observation_mode === "unit_after_exit" && !trustedUnit ||
    processes?.status !== "confirmed" || processes.error || processes.capture_complete !== true || !Array.isArray(processes.processes) ||
    processes.unknownProcesses?.length || !processes.verification || processes.verification.length < 2 ||
    processes.verification.some(pass => pass.owned_remaining !== 0 || !Number.isFinite(Date.parse(pass.observed_at)) || Date.parse(pass.observed_at) < Date.parse(lease.acquiredAt)))
    throw new NodeOpsFailure("PROCESS_CLEANUP_UNKNOWN")
  const groups = [...new Set(processes.processes.map(process => process.group))]
  if (groups.some(group => !Number.isSafeInteger(group) || group <= 0) ||
    (await Promise.all(groups.map(group => groupProcesses(group)))).some(group => group.length)) throw new NodeOpsFailure("PROCESSES_BUSY")
}

async function verifyHistoryArchive(profile: string, archive: string) {
  if (typeof archive !== "string" || !inside(archive, `${profile}.history`) || archive === `${profile}.history` || await realpath(archive) !== archive)
    throw new NodeOpsFailure("HISTORY_ARCHIVE_UNKNOWN")
  for (const file of [path.dirname(archive), archive]) {
    const info = await lstat(file)
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077)) throw new NodeOpsFailure("HISTORY_ARCHIVE_UNKNOWN")
  }
}

async function verifyBrowserClose(config: NodeOpsConfig, lease: NodeStandLease, file: string) {
  await evidencePath(config, lease, file)
  const entries = (await Bun.file(file).text()).trim().split("\n").map(line => JSON.parse(line))
  const last = entries.filter(entry => entry.request?.method === "tools/call").at(-1)
  if (last?.request?.params?.name !== "browser_close" || last.response?.error || !last.response?.result || last.response.result.isError === true ||
    typeof last.time !== "number" || last.time * 1000 < Date.parse(lease.acquiredAt)) throw new NodeOpsFailure("BROWSER_CLOSE_UNKNOWN")
}

async function verifyStorageLedger(config: NodeOpsConfig, lease: NodeStandLease, file: string) {
  await evidencePath(config, lease, file)
  const ledger = await Bun.file(file).json()
  if (ledger.cleanup_confirmed !== true || !Array.isArray(ledger.storage_before) || ledger.storage_before.length ||
    !Array.isArray(ledger.storage_after) || ledger.storage_after.length || !Array.isArray(ledger.files) || !ledger.files.length || !Array.isArray(ledger.removed) ||
    !Number.isFinite(Date.parse(ledger.started_utc)) || Date.parse(ledger.started_utc) < Date.parse(lease.acquiredAt) ||
    !Number.isFinite(Date.parse(ledger.cleaned_utc)) || Date.parse(ledger.cleaned_utc) < Date.parse(ledger.started_utc) ||
    ledger.files.some((item: { name: string; sha256?: string }) => !safeName(item.name) || !/^[0-9a-f]{64}$/.test(item.sha256 ?? "")) ||
    ledger.removed.some((name: string) => !ledger.files.some((item: { name: string }) => item.name === name))) throw new NodeOpsFailure("STORAGE_CLEANUP_UNKNOWN")
}

async function evidencePath(config: NodeOpsConfig, lease: NodeStandLease, file: string, allowLease = false) {
  if (typeof file !== "string" || !path.isAbsolute(file) || await realpath(file) !== file ||
    ![...config.roles[lease.role].workRoots, config.roles[lease.role].resultsRoot, ...(allowLease ? [directory(config)] : [])].some(root => inside(file, root)))
    throw new NodeOpsFailure("EVIDENCE_PATH_REFUSED")
  return file
}

async function assertAllProfilesClean(config: NodeOpsConfig) {
  for (const role of Object.values(config.roles)) for (const profile of [role.referenceProfile, role.evalProfile])
    await assertProfileClean(profile).catch(() => { throw new NodeOpsFailure("PROFILE_NOT_CLEAN") })
}

async function assertBrowsersClosed() {
  await assertNoDebuggers().catch(() => { throw new NodeOpsFailure("BROWSER_BUSY_OR_UNKNOWN") })
  const names = await Promise.all((await readdir("/proc")).filter(name => /^\d+$/.test(name)).map(async pid => {
    const info = await lstat(`/proc/${pid}`).catch(() => undefined)
    if (info?.uid !== process.getuid?.()) return ""
    const state = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => undefined)
    if (!state || ["Z", "X"].includes(state.slice(state.lastIndexOf(")") + 2).split(" ")[0]!)) return ""
    return readFile(`/proc/${pid}/comm`, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return ""
      throw new NodeOpsFailure("BROWSER_BUSY_OR_UNKNOWN")
    })
  }))
  if (names.some(name => /^(chrome|chromium)([-\s]|$)/.test(name))) throw new NodeOpsFailure("BROWSER_BUSY_OR_UNKNOWN")
}

const ownerOf = (lease: NodeStandLease): NodeStandOwner => ({ issue: lease.issue, task: lease.task, role: lease.role, phase: lease.phase, sha: lease.sha })
const ownerMatches = (value: NodeStandOwner | undefined, expected: NodeStandOwner) => Boolean(value &&
  ["issue", "task", "role", "phase", "sha"].every(key => value[key as keyof NodeStandOwner] === expected[key as keyof NodeStandOwner]))
const source = (config: NodeOpsConfig) => ({ kind: "docker" as const, container: config.container.name, storageDir: config.container.storageDir })
const safeName = (name: string) => typeof name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) && name !== "." && name !== ".."
const digest = async (file: string) => new Bun.CryptoHasher("sha256").update(await Bun.file(file).arrayBuffer()).digest("hex")
const configDigest = (config: NodeOpsConfig) => new Bun.CryptoHasher("sha256").update(JSON.stringify(config)).digest("hex")

async function checkoutIdentity(checkout: string) {
  const sha = await Bun.$`git rev-parse HEAD`.cwd(checkout).quiet().nothrow()
  const status = await Bun.$`git status --porcelain`.cwd(checkout).quiet().nothrow()
  if (sha.exitCode || status.exitCode || !/^[0-9a-f]{40}$/.test(sha.text().trim())) throw new NodeOpsFailure("CHECKOUT_UNKNOWN")
  return { sha: sha.text().trim(), dirty: status.text().trim().length !== 0 }
}

export async function nodeStandStatus(config: NodeOpsConfig) {
  await validateConfig(config)
  const info = await lstat(directory(config)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!info) return { status: "FREE" }
  const lease = await readLease(config).catch(() => undefined)
  return { status: "BUSY", owner: lease ? { issue: lease.issue, task: lease.task, role: lease.role, phase: lease.phase,
    sha: lease.sha, acquiredAt: lease.acquiredAt } : null }
}

async function readLease(config: NodeOpsConfig) {
  const info = await lstat(directory(config))
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077)) throw new NodeOpsFailure("LEASE_IDENTITY_CHANGED")
  const file = await open(path.join(directory(config), "owner.json"), constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const ownerInfo = await file.stat()
    if (!ownerInfo.isFile() || ownerInfo.uid !== info.uid || (ownerInfo.mode & 0o077)) throw new NodeOpsFailure("LEASE_IDENTITY_CHANGED")
    const lease = JSON.parse(await file.readFile("utf8")) as NodeStandLease
    validateOwner(lease)
    const current = await lstat(directory(config))
    const currentOwner = await lstat(path.join(directory(config), "owner.json"))
    if (lease.version !== 1 || lease.device !== info.dev || lease.inode !== info.ino || lease.containerId !== config.container.id || lease.endpoint !== config.endpoint || lease.configSha256 !== configDigest(config) ||
      current.dev !== info.dev || current.ino !== info.ino || current.isSymbolicLink() || currentOwner.dev !== ownerInfo.dev || currentOwner.ino !== ownerInfo.ino || currentOwner.isSymbolicLink() ||
      typeof lease.token !== "string" || !/^[0-9a-f-]{36}$/.test(lease.token) || !Number.isFinite(Date.parse(lease.acquiredAt)))
      throw new NodeOpsFailure("LEASE_IDENTITY_CHANGED")
    return lease
  } finally { await file.close() }
}

function validateOwner(owner: NodeStandOwner) {
  if (![owner.issue, owner.task].every(id => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)) ||
    !["rich", "ben"].includes(owner.role) || !["unit", "reference", "cold", "eval", "recovery"].includes(owner.phase) || !/^[0-9a-f]{40}$/.test(owner.sha))
    throw new NodeOpsFailure("INVALID_OWNER")
}

async function validateConfig(config: NodeOpsConfig) {
  if (config.version !== 1 || !path.isAbsolute(config.runtimeRoot) || !/^[0-9a-f]{64}$/.test(config.container.id) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.container.name) || !/^\/workdir\/UserStorage\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.container.storageDir) ||
    Object.keys(config.roles).sort().join(",") !== "ben,rich" || Object.values(config.roles).some(role => !Array.isArray(role.workRoots) || !role.workRoots.length))
    throw new NodeOpsFailure("INVALID_CONFIG")
  const endpoint = new URL(config.endpoint)
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw new NodeOpsFailure("INVALID_CONFIG")
  if (await realpath(config.runtimeRoot) !== config.runtimeRoot) throw new NodeOpsFailure("INVALID_CONFIG_PATH")
  const profiles = Object.values(config.roles).flatMap(role => [role.referenceProfile, role.evalProfile])
  const installation = path.dirname(path.dirname(config.cliBin))
  if (!path.isAbsolute(config.cliBin) || !inside(config.cliBin, config.runtimeRoot) || await realpath(config.cliBin) !== config.cliBin)
    throw new NodeOpsFailure("INVALID_CONFIG_PATH")
  for (const role of Object.values(config.roles)) for (const root of [role.checkout, role.referenceProfile, role.evalProfile, ...role.workRoots, role.resultsRoot]) {
    if (!path.isAbsolute(root) || !inside(root, config.runtimeRoot) || await realpath(root) !== root || inside(directory(config), root))
      throw new NodeOpsFailure("INVALID_CONFIG_PATH")
  }
  if (config.offline) for (const root of [config.offline.checkout, ...config.offline.workRoots, config.offline.resultsRoot]) {
    if (!path.isAbsolute(root) || !inside(root, config.runtimeRoot) || await realpath(root) !== root || profiles.some(profile => inside(root, profile) || inside(profile, root)) ||
      inside(root, installation) || inside(directory(config), root)) throw new NodeOpsFailure("INVALID_CONFIG_PATH")
  }
  const roots = Object.values(config.roles).flatMap(role => [role.checkout, role.referenceProfile, `${role.referenceProfile}.history`, role.evalProfile, `${role.evalProfile}.history`, ...role.workRoots, role.resultsRoot])
  const offline = config.offline ? [config.offline.checkout, ...config.offline.workRoots, config.offline.resultsRoot] : []
  const boundaries = [...roots, ...offline, installation, path.join(config.runtimeRoot, "operations")]
  if (boundaries.some((root, index) => root === config.runtimeRoot || boundaries.some((other, otherIndex) =>
    index !== otherIndex && (inside(root, other) || inside(other, root))))) throw new NodeOpsFailure("INVALID_CONFIG_PATH")
}
