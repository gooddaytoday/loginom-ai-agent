import path from "node:path"
import { lstat } from "node:fs/promises"
import { loadConfig, type EvalConfig } from "./config"
import { agentCommand } from "./cli"
import { EvalFailure } from "./fail"
import { globalLockRoot, readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { openLoginomAdmin } from "./loginom-admin"
import { prepareUserStorage, readServerIdentity, verifyParallelPair } from "./parallel-pair"
import { checkIsolatedLoginom } from "./preflight"
import { assertAuth, ensureProfile, management, parseView, setupProfile, verifyProfile } from "./profile"
import { assertSessionBackupEmpty, cleanupSlotStorage } from "./slot-storage"
import { acquireEnvironmentLeases, loadSlots, type SlotFile, type SlotLease } from "./slots"
import { reconcileEnvironment } from "./startup-reconciliation"
import { readUserConfiguration, readUserOwnership, readUserPreparation, stageUserPreparation } from "./user-environment"

export class EnvironmentFailure extends EvalFailure {
  constructor(message: string, readonly receipt: string) { super(message, 2) }
}

export async function prepareEnvironment(input: { slotsFile: string; parallel: number; config?: EvalConfig; previousSlotsFile?: string }, lockRoot = globalLockRoot) {
  return checkEnvironment(input, lockRoot, "prepare")
}

export async function verifyEnvironment(input: { slotsFile: string; parallel: number; config?: EvalConfig }, lockRoot = globalLockRoot) {
  return checkEnvironment(input, lockRoot, "verify")
}

export async function scopedSlotConfig(config: EvalConfig, file: SlotFile, lease: SlotLease) {
  const prepared = await readUserPreparation(file, lease, path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`))
  const credentials = await Bun.file(prepared.secretFile).json() as { username: string; password: string }
  return { ...config, profileDir: lease.slot.profileDir, auth: file.auth, artifactSource: "docker",
    agent: { ...config.agent, workspaceRoot: lease.slot.workspaceRoot }, loginom: { ...config.loginom,
      url: file.server.url, username: lease.slot.username, password: credentials.password,
      container: lease.identity.containerId, storageDir: `${file.server.storageRoot}/${lease.slot.username}` } }
}

async function checkEnvironment(input: { slotsFile: string; parallel: number; config?: EvalConfig; previousSlotsFile?: string }, lockRoot: string, operation: "prepare" | "verify") {
  const file = await loadSlots(input.slotsFile, input.parallel)
  const previous = operation === "prepare" && input.previousSlotsFile ? await loadSlots(input.previousSlotsFile, input.parallel) : undefined
  if (previous && (file.controller.stateDir === previous.controller.stateDir ||
    JSON.stringify({ ...file, controller: { ...file.controller, stateDir: previous.controller.stateDir },
      slots: file.slots.map((slot, index) => ({ ...slot, username: previous.slots[index]?.username })) }) !== JSON.stringify(previous) ||
    file.slots.some(slot => previous.slots.some(old => old.username === slot.username))))
    throw new EvalFailure("PREPARATION_GENERATION_MISMATCH", 2)
  const config = input.config ?? loadConfig(["--skip-judge"], { ...process.env, EVAL_SLOTS_FILE: input.slotsFile })
  if (config.agent.cliMode !== "binary" || !path.isAbsolute(config.agent.cliBin ?? "")) throw new EvalFailure("PREPARATION_BINARY_REQUIRED", 2)
  const identity = await readServerIdentity(file)
  await verifyParallelPair(file, identity)
  if (previous) {
    await verifyParallelPair(previous, identity)
    for (const slot of previous.slots.slice(0, input.parallel)) {
      const prepared = await readLeaseReceipt(path.join(previous.controller.stateDir, `prepare-${slot.id}.json`)) as Awaited<ReturnType<typeof readUserPreparation>>
      if (prepared?.version !== 2 || prepared.kind !== "user-preparation" || prepared.state !== "staged" ||
        prepared.slotId !== slot.id || prepared.username !== slot.username || prepared.endpoint !== previous.server.url ||
        prepared.identity?.containerId !== identity.containerId || prepared.identity.studioContainerId !== identity.studioContainerId ||
        typeof prepared.identity.serverEpoch !== "string" || !/^[a-f0-9]{64}$/.test(prepared.identity.serverEpoch) ||
        prepared.identity.serverEpoch === identity.serverEpoch) throw new EvalFailure("PREPARATION_GENERATION_MISMATCH", 2)
    }
  }
  await reconcileEnvironment(file, identity, config.agent.cliBin!, lockRoot)
  const commandId = crypto.randomUUID(), journal = path.join(file.controller.stateDir, `${operation}-command-${commandId}.json`)
  const receipt = path.join(file.controller.stateDir, `${operation === "prepare" ? "preparation" : "verification"}-${commandId}.json`)
  const record = { version: 2, kind: "unactivated-preparation", commandId, identity,
    slotIds: file.slots.slice(0, input.parallel).map(slot => slot.id), phase: "unactivated" }
  await writeLeaseReceipt(journal, record)
  const environment = await acquireEnvironmentLeases(file, input.parallel, identity, journal, lockRoot)
  try {
    const admin = await openLoginomAdmin(file, identity, { serverLease: environment.server, binary: config.agent.cliBin })
    const slots = [], cleanups = [], changedPasswords: string[] = []
    let poolPolicy: Awaited<ReturnType<typeof admin.inspectPoolPolicy>> | undefined
    try {
      await assertSessionBackupEmpty(file, identity)
      poolPolicy = operation === "prepare" ? await admin.configurePoolPolicy() : await admin.inspectPoolPolicy()
      for (const lease of environment.slots) {
        const prepared = operation === "verify" ? await readUserPreparation(file, lease, path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)) :
          await stageUserPreparation(file, lease, new Bun.CryptoHasher("sha256").update(JSON.stringify({ identity, slot: lease.slot,
            authMode: 1, isAdmin: false, isDesigner: true, isViewer: false, useGlobalFileStorage: false, schedulerFullAccess: false, allowPublish: false })).digest("hex"))
        const exists = await lstat(path.join(file.controller.stateDir, `user-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined
          throw error
        })
        const owned = exists ? await readUserOwnership(file, lease, prepared.secretFile) : undefined
        if (operation === "prepare" && !owned?.everActivated) {
          await admin.reconcileUser(lease, prepared.secretFile)
          const configuration = await readUserConfiguration(file, lease, prepared.secretFile)
          if ((configuration?.observation.reply.data as { passwordChanged?: boolean })?.passwordChanged) changedPasswords.push(lease.slot.username)
          await prepareUserStorage(file, lease, prepared.secretFile, environment.server)
          await admin.activateOwnedUser(lease, prepared.secretFile)
        }
        if (!(await readUserOwnership(file, lease, prepared.secretFile)).everActivated) throw new EvalFailure("USER_ACTIVATION_UNCONFIRMED", 2)
        await admin.verifySlotUser(lease.slot.username)
        const scoped = await scopedSlotConfig(config, file, lease)
        const command = { ...agentCommand(scoped), cleanupDir: path.join(file.controller.stateDir, `management-${commandId}-${lease.slot.id}`),
          cleanupSecrets: [scoped.loginom.password, scoped.dock.apiKey, scoped.agent.provider?.apiKey ?? ""] }
        await checkIsolatedLoginom({ kind: "docker", container: identity.containerId, storageDir: scoped.loginom.storageDir }, { file, lease, secretFile: prepared.secretFile })
        if (previous) {
          const observed = await management(command, ["loginom", "status", "--format", "json"])
          const view = parseView(observed.stdout)
          const old = previous.slots.find(slot => slot.id === lease.slot.id)!
          if (observed.exitCode !== 0 || !view || view.url !== scoped.loginom.url ||
            ![old.username, lease.slot.username].includes(view.username ?? "")) throw new EvalFailure("PROFILE_CONNECTION_MISMATCH", 2)
          if (view.username === old.username) await setupProfile(scoped, command)
        }
        if (operation === "prepare") await ensureProfile(scoped, command)
        await assertAuth(scoped, command)
        const checked = await verifyProfile(scoped, command)
        const cleanup = await cleanupSlotStorage(file, environment.server, lease, admin, checked.processCleanup, [])
        const proof = path.join(file.controller.stateDir, `cleanup-${commandId}-${lease.slot.id}.json`)
        await writeLeaseReceipt(proof, { version: 2, status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
          processes: "confirmed", serverSessions: "confirmed", storageDeletionAllowed: true, nextAdmissionAllowed: true,
          closed: cleanup.closed, removed: cleanup.removed, profileArchive: cleanup.archive, archive: "committed" })
        cleanups.push({ lease, proof })
        slots.push({ id: lease.slot.id, username: lease.slot.username, created: !exists, preparationNonce: prepared.nonce })
      }
      await writeLeaseReceipt(receipt, { version: 2, kind: operation === "prepare" ? "environment-preparation" : "environment-verification",
        commandId, identity, journal, status: "checked", ready: false, slots, poolPolicy })
    } finally { await admin.dispose() }
    for (const cleanup of cleanups) await cleanup.lease.release(cleanup.proof)
    const proof = path.join(file.controller.stateDir, `cleanup-${commandId}-server.json`)
    await writeLeaseReceipt(proof, { version: 2, status: "confirmed", reason: "prepared-environment-clean", key: environment.server.reservation.key,
      token: environment.server.reservation.token, revision: environment.server.reservation.revision, serverEpoch: identity.serverEpoch })
    await environment.server.release(proof)
    await writeLeaseReceipt(journal, { ...record, phase: "released" })
    const result = { version: 2, kind: operation === "prepare" ? "environment-preparation" : "environment-verification",
      commandId, identity, journal, receipt, status: "ready", ready: true, slots, code: 0 as const, reason: null as string | null, poolPolicy,
      changedUsers: slots.filter(slot => slot.created).map(slot => slot.username), changedPasswords,
      finalization: { status: "released", server: { path: proof }, slots: cleanups.map(cleanup => ({ slotId: cleanup.lease.slot.id, cleanup: { path: cleanup.proof } })) } }
    await writeLeaseReceipt(receipt, result)
    return result
  } catch (error) {
    const reason = error instanceof EvalFailure ? error.message : "PREPARATION_FAILED"
    await writeLeaseReceipt(receipt, { version: 2, commandId, identity, journal, receipt, status: "quarantined", ready: false, reason })
    throw new EnvironmentFailure(reason, receipt)
  } finally { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]) }
}
