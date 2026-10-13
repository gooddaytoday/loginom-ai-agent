import os from "node:os"
import path from "node:path"
import { lstat, mkdtemp, realpath } from "node:fs/promises"
import { agentCommand } from "./cli"
import type { EvalConfig } from "./config"
import { archiveDiagnostics } from "./diagnostics"
import { EvalFailure } from "./fail"
import { writeLeaseReceipt } from "./lease"
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
  const identity = { containerId: `fixture:${new Bun.CryptoHasher("sha256").update(input.storage).digest("hex")}`,
    startedAt: new Date().toISOString(), serverEpoch: crypto.randomUUID(), studioContainerId: "fixture:studio",
    studioStartedAt: new Date().toISOString(), configurationHash: "fixture" }
  await writeLeaseReceipt(path.join(input.file.controller.stateDir, "run-journal.json"),
    { version: 2, commandId: runId, liveQualified: false, identity })
  const leases: SlotLease[] = []
  try {
    for (const slot of input.file.slots.slice(0, config.parallel))
      leases.push(await acquireSlotLease(input.file, slot, identity, input.lockRoot))
    const contexts = []
    for (const lease of leases) {
      const slot = lease.slot
      const own: EvalConfig = { ...config, profileDir: slot.profileDir, artifactSource: `dir:${path.join(input.storage, slot.id)}`,
        loginom: { ...config.loginom, url: input.file.server.url, username: slot.username },
        agent: { ...config.agent, workspaceRoot: slot.workspaceRoot } }
      const stateFile = path.join(input.file.controller.stateDir, `fixture-${slot.id}.json`)
      if (!await Bun.file(stateFile).exists()) await writeLeaseReceipt(stateFile,
        { state: "ready", hasApiKey: true, url: own.loginom.url, username: slot.username })
      const base = agentCommand(own)
      const command = { ...base, cleanupDir: path.join(runDir, "preparation", slot.id),
        env: { ...base.env, EVAL_FAKE_STATE_FILE: stateFile } }
      await ensureProfile(own, command)
      await assertAuth(own, command)
      await recoverIfNeeded(command, 2)
      const archive = await mkdtemp(path.join(slot.historyDir, `${runId}-initial-`))
      const receipt = await archiveProfileEvidence(slot.profileDir, archive,
        path.join(input.file.controller.stateDir, `${runId}-${slot.id}-initial.archive.json`))
      const cleanup = path.join(input.file.controller.stateDir, `slot-${slot.id}.cleanup.json`)
      await writeLeaseReceipt(cleanup, fixtureCleanup(lease, receipt.archive))
      contexts.push({ config: own, command, lease, cleanup, controllerDir: input.file.controller.stateDir })
    }
    return contexts
  } catch (error) {
    await Promise.all(leases.map(lease => lease.close()))
    throw error
  }
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
  result.environment_cleanup = { status: "confirmed", evidence: "cleanup.json", error: null }
  await writeLeaseReceipt(path.join(out, "cleanup.json"), { ...evidence, liveQualified: false, archive: receipt, result: result.environment_cleanup })
  await writeLeaseReceipt(context.cleanup, fixtureCleanup(context.lease, archive))
  await Bun.write(path.join(out, "result.json"), JSON.stringify(result, null, 2))
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
