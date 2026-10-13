import os from "node:os"
import path from "node:path"
import { lstat, mkdir, mkdtemp, readdir, realpath, unlink } from "node:fs/promises"
import { agentCommand } from "./cli"
import { listStorage } from "./artifact"
import type { EvalConfig } from "./config"
import { archiveDiagnostics } from "./diagnostics"
import { EvalFailure } from "./fail"
import { acquireJudgeLease, readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { archiveProfileEvidence } from "./profile-archive"
import { assertAuth, ensureProfile, recoverIfNeeded, releaseStaleWriter } from "./profile"
import type { ProcessCleanup } from "./process-supervisor"
import type { AttemptResult } from "./report"
import { acquireSlotLease, parseSlots, type SlotFile, type SlotLease } from "./slots"

export type ParallelFixture = { slots: SlotFile; lockRoot: string }

// Only the programmatic fake-CLI seam can create a synthetic, non-live admission.
export async function validateFixture(config: EvalConfig, input: ParallelFixture, env: Record<string, string | undefined>) {
  if (env.EVAL_CLI_MODE !== "fake" || !env.EVAL_ARTIFACT_SOURCE?.startsWith("dir:") || config.judgeOnly !== undefined || config.calibrate)
    throw new EvalFailure("FIXTURE_MODE", 2)
  const file = parseSlots(input.slots, config.parallel)
  const storage = env.EVAL_ARTIFACT_SOURCE.slice(4)
  const roots = [storage, input.lockRoot, file.controller.stateDir, file.judge.codexHome,
    ...(file.auth ? [file.auth.sharedDir] : []), ...file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])]
  const temp = await realpath(os.tmpdir())
  for (const root of roots) {
    const info = await lstat(root)
    if (!root.startsWith(temp + path.sep) || path.resolve(root) !== root || await realpath(root) !== root ||
      !info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700)
      throw new EvalFailure("FIXTURE_ROOT_PRIVATE", 2)
  }
  if (!config.resultsDir.startsWith(temp + path.sep) || await canonicalPath(config.resultsDir) !== config.resultsDir)
    throw new EvalFailure("FIXTURE_ROOT_PRIVATE", 2)
  if ([...roots, config.resultsDir].some((root, index, all) => all.slice(index + 1).some(other =>
    root === other || root.startsWith(other + path.sep) || other.startsWith(root + path.sep))))
    throw new EvalFailure("FIXTURE_ROOT_OVERLAP", 2)
  for (const slot of file.slots) {
    const source = path.join(storage, slot.id)
    const info = await lstat(source)
    if (await realpath(source) !== source || !info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700)
      throw new EvalFailure("FIXTURE_ROOT_PRIVATE", 2)
  }
  return { file, storage, lockRoot: input.lockRoot }
}

export async function prepareFixture(config: EvalConfig, input: Awaited<ReturnType<typeof validateFixture>>, runId: string, runDir: string) {
  const file = { ...input.file, controller: { ...input.file.controller, stateDir: path.join(input.file.controller.stateDir, runId) } }
  await mkdir(file.controller.stateDir, { mode: 0o700 })
  const identity = { containerId: `fixture:${new Bun.CryptoHasher("sha256").update(input.storage).digest("hex")}`,
    startedAt: new Date().toISOString(), serverEpoch: crypto.randomUUID(), studioContainerId: "fixture:studio",
    studioStartedAt: new Date().toISOString(), configurationHash: "fixture" }
  await writeLeaseReceipt(path.join(file.controller.stateDir, "run-journal.json"),
    { version: 2, commandId: runId, liveQualified: false, identity })
  const judgeLease = config.skipJudge ? undefined : await acquireJudgeLease({ codexHome: file.judge.codexHome,
    journal: path.join(file.controller.stateDir, "run-journal.json"), commandId: runId, lockRoot: input.lockRoot })
  const leases: SlotLease[] = []
  try {
    for (const slot of input.file.slots.slice(0, config.parallel))
      leases.push(await acquireSlotLease(file, slot, identity, input.lockRoot))
    const contexts = []
    for (const lease of leases) {
      const slot = lease.slot
      const storage = path.join(input.storage, slot.id)
      const storageInfo = await lstat(storage)
      const own: EvalConfig = { ...config, profileDir: slot.profileDir, artifactSource: `dir:${path.join(input.storage, slot.id)}`,
        loginom: { ...config.loginom, url: input.file.server.url, username: slot.username },
        agent: { ...config.agent, workspaceRoot: slot.workspaceRoot } }
      const stateFile = path.join(input.file.controller.stateDir, `fixture-${slot.id}.json`)
      if (!await Bun.file(stateFile).exists()) await writeLeaseReceipt(stateFile,
        { state: "ready", hasApiKey: true, url: own.loginom.url, username: slot.username })
      const base = agentCommand(own)
      const command = { ...base, cleanupDir: path.join(runDir, "preparation", slot.id),
        env: { ...base.env, EVAL_FAKE_STATE_FILE: stateFile, EVAL_FAKE_SLOT_STORAGE: path.join(input.storage, slot.id) } }
      await ensureProfile(own, command)
      await assertAuth(own, command)
      await recoverIfNeeded(command, 2)
      const archive = await mkdtemp(path.join(slot.historyDir, `${runId}-initial-`))
      const receipt = await archiveProfileEvidence(slot.profileDir, archive,
        path.join(file.controller.stateDir, `${runId}-${slot.id}-initial.archive.json`))
      const cleanup = path.join(file.controller.stateDir, `slot-${slot.id}.cleanup.json`)
      await writeLeaseReceipt(cleanup, fixtureCleanup(lease, receipt.archive))
      contexts.push({ config: own, command, lease, cleanup, controllerDir: file.controller.stateDir, judgeLease,
        storage: { path: storage, device: storageInfo.dev, inode: storageInfo.ino } })
    }
    return contexts
  } catch (error) {
    try {
      if (judgeLease) {
        const proof = path.join(file.controller.stateDir, "judge-unused.json")
        await writeLeaseReceipt(proof, { version: 2, status: "confirmed", key: judgeLease.reservation.key,
          token: judgeLease.reservation.token, revision: judgeLease.reservation.revision, reason: "no-judge-dispatch", liveQualified: false })
        await judgeLease.release(proof)
      }
    } finally { await Promise.all([...leases.map(lease => lease.close()), judgeLease?.close()]) }
    throw error
  }
}

export async function finishFixtureJudge(context: Awaited<ReturnType<typeof prepareFixture>>[number], runDir: string) {
  if (!context.judgeLease) return
  try {
    const proofs = await Promise.all((await Array.fromAsync(new Bun.Glob("*/*/judge-processes-[12]").scan({ cwd: runDir, absolute: true, onlyFiles: false, dot: true })))
      .map(async directory => {
        const root = await lstat(directory)
        const file = path.join(directory, "process-cleanup.json")
        const info = await lstat(file)
        const bytes = await Bun.file(file).bytes()
        const proof = JSON.parse(new TextDecoder().decode(bytes)) as ProcessCleanup
        if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700 ||
          !info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.nlink !== 1 ||
          proof.status !== "confirmed" || proof.capture_complete !== true)
          throw Error("Judge process cleanup unconfirmed")
        return { path: file, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }
      }))
    const receipt = path.join(context.controllerDir, "judge-release.json")
    await writeLeaseReceipt(receipt, { version: 2, status: "confirmed", liveQualified: false, key: context.judgeLease.reservation.key,
      token: context.judgeLease.reservation.token, revision: context.judgeLease.reservation.revision, judgeProcesses: "confirmed", proofs })
    await context.judgeLease.release(receipt)
  } finally { await context.judgeLease.close() }
}

export async function finishFixtureAttempt(context: Awaited<ReturnType<typeof prepareFixture>>[number], result: AttemptResult, out: string) {
  const evidence = await Bun.file(path.join(out, "cleanup.json")).json() as { processes: ProcessCleanup }
  if (evidence.processes.status !== "confirmed" || result.environment_cleanup?.status === "failed")
    throw Error(result.environment_cleanup?.error ?? evidence.processes.error ?? "Process cleanup unconfirmed")
  await archiveDiagnostics(context.config.profileDir, evidence.processes.runtimeDirectories, out, [])
  const released = await releaseStaleWriter(context.config.profileDir, evidence.processes.writer)
  const recovered = await recoverIfNeeded({ ...context.command, cleanupDir: path.join(out, "management") }, 1)
  result.profile_recovered = released || recovered.recovered
  const archive = await mkdtemp(path.join(context.lease.slot.historyDir, `${result.task_id}-${result.attempt}-`))
  const receipt = await archiveProfileEvidence(context.config.profileDir, archive,
    path.join(context.controllerDir, `${path.basename(archive)}.archive.json`))
  const storage = await cleanupFixtureStorage(context, result, out)
  const remaining = await inspectFixtureStorage(context, path.basename(path.dirname(path.dirname(out))))
  const error = remaining.names === null ? remaining.error ?? "Slot storage inspection failed"
    : remaining.names.length ? `Slot storage not empty: ${context.lease.slot.id}` : null
  result.environment_cleanup = { status: error ? "failed" : "confirmed", evidence: "cleanup.json", error }
  await writeLeaseReceipt(path.join(out, "cleanup.json"), { ...evidence, liveQualified: false, archive: receipt, storage, result: result.environment_cleanup,
    stages: [...["processes", "diagnostics", "writer", "ready"].map(stage => ({ stage, status: "confirmed" })),
      { stage: "profile_history", status: "confirmed", path: archive }] })
  await writeLeaseReceipt(context.cleanup, { ...fixtureCleanup(context.lease, archive), ...(error
    ? { status: "failed", storageDeletionAllowed: false, nextAdmissionAllowed: false, storage: remaining } : {}) })
  await Bun.write(path.join(out, "result.json"), JSON.stringify(result, null, 2))
  if (error) throw Error(error)
}

export async function beginFixtureAttempt(context: Awaited<ReturnType<typeof prepareFixture>>[number]) {
  await writeLeaseReceipt(context.cleanup, { ...fixtureCleanup(context.lease, ""), status: "pending",
    processes: "pending", archive: "pending", storageDeletionAllowed: false, nextAdmissionAllowed: false })
}

async function cleanupFixtureStorage(context: Awaited<ReturnType<typeof prepareFixture>>[number], result: AttemptResult, out: string) {
  await requireFixtureStorage(context)
  if (!result.package_path) return { deleted: [] }
  const prefix = `eval-${path.basename(path.dirname(path.dirname(out)))}-${result.task_id}-${result.attempt}`
  const names = [path.basename(result.package_path), ...await readdir(path.join(out, "artifact/results"))]
  const files = await Promise.all(names.map(async name => {
    if (path.basename(name) !== name || !name.startsWith(`${prefix}.`) && !name.startsWith(`${prefix}-`))
      throw Error("Fixture artifact ownership unconfirmed")
    const file = path.join(context.storage.path, name)
    const info = await lstat(file)
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1) throw Error("Fixture artifact identity changed")
    const copy = name === path.basename(result.package_path!) ? path.join(out, "artifact/package.lgp") : path.join(out, "artifact/results", name)
    const digest = (target: string) => Bun.file(target).bytes().then(bytes => new Bun.CryptoHasher("sha256").update(bytes).digest("hex"))
    if (await digest(file) !== await digest(copy)) throw Error("Fixture artifact content changed")
    return { file, device: info.dev, inode: info.ino, name }
  }))
  for (const file of files) {
    const current = await lstat(file.file)
    if (current.dev !== file.device || current.ino !== file.inode) throw Error("Fixture artifact identity changed")
    await unlink(file.file)
  }
  return { deleted: files.map(file => file.name) }
}

async function requireFixtureStorage(context: Awaited<ReturnType<typeof prepareFixture>>[number]) {
  const root = await lstat(context.storage.path)
  if (!root.isDirectory() || root.dev !== context.storage.device || root.ino !== context.storage.inode ||
    root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700 || await realpath(context.storage.path) !== context.storage.path)
    throw Error("Fixture storage identity changed")
}

export async function inspectFixtureStorage(context: Awaited<ReturnType<typeof prepareFixture>>[number], runId: string) {
  return requireFixtureStorage(context).then(async () => ({ names: (await listStorage({ kind: "dir", dir: context.storage.path }))
    .map(entry => entry.name).filter(name => name.startsWith(`eval-${runId}-`)).sort(), error: null as string | null }))
    .catch((error: unknown) => ({ names: null, error: error instanceof Error ? error.message : String(error) }))
}

export async function fenceFixtureStorage(context: Awaited<ReturnType<typeof prepareFixture>>[number], storage: Awaited<ReturnType<typeof inspectFixtureStorage>>) {
  await writeLeaseReceipt(context.cleanup, { ...await readLeaseReceipt(context.cleanup) as object, status: "failed",
    storageDeletionAllowed: false, nextAdmissionAllowed: false, storage })
}

function fixtureCleanup(lease: SlotLease, archivePath: string) {
  return { version: 2, status: "confirmed", liveQualified: false, scope: "synthetic-no-server",
    slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: lease.identity.serverEpoch,
    processes: "confirmed", serverSessions: "confirmed", archive: "committed", archivePath,
    storageDeletionAllowed: true, nextAdmissionAllowed: true }
}

async function canonicalPath(value: string): Promise<string> {
  return realpath(value).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error
    return canonicalPath(path.dirname(value)).then(parent => path.join(parent, path.basename(value)))
  })
}
