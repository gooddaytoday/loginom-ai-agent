export type ServerSession = {
  remoteKey: string
  userKey: string
  username: string
  serverEpoch: string
  pendingDisconnect: boolean
  activeOperations: number | null
}

export function selectOwnedSessions(observed: ServerSession[], owned: ServerSession[]): ServerSession[] {
  if ([observed, owned].some(rows => new Set(rows.map(row => row.remoteKey)).size !== rows.length))
    throw new EvalFailure("SESSION_IDENTITY_AMBIGUOUS", 2)
  return observed.filter(row => {
    const session = owned.find(session => session.remoteKey === row.remoteKey)
    if (!session) return false
    if (row.serverEpoch !== session.serverEpoch) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
    if (row.userKey !== session.userKey || row.username !== session.username) throw new EvalFailure("SESSION_IDENTITY_CHANGED", 2)
    return true
  })
}
import { EvalFailure } from "./fail"
import { readManagementSession, recordManagementSessionClosed } from "./management-sessions"
import { readAgentArchive, readAgentSession, recordAgentSessionClosed } from "./agent-sessions"
import type { ServerIdentity, SlotFile, SlotLease } from "./slots"
import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdir, mkdtemp, open, readdir, realpath } from "node:fs/promises"
import { acquireResourceLease, readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { verifyAdminRuntime } from "./preflight"
import { inspectUserStorage, readServerIdentity, reserveUserStorage, verifyParallelPair } from "./parallel-pair"
import { superviseProcess, type ProcessCleanup } from "./process-supervisor"
import { qualifyClosedProcessEvidence } from "./closed-process-evidence"
import { claimUserOwnership, readServerSession, readUnactivatedUserObservation, readUserActivation, readUserConfiguration, readUserOwnership, readUserPreparation, recordServerSession, recordServerSessionClosed, recordUserConfiguration, stageUserActivation } from "./user-environment"

export type AdminOperation = "init" | "inspect" | "reconcile-user" | "close-session" | "confirm-session-absent" | "dispose"
export type AdminRequest = { v: 1; id: string; op: AdminOperation; expectedIdentity: ServerIdentity; deadline: number; payload: unknown }
export type AdminReply = { v: 1; id: string; outcome: "confirmed" | "not_applied" | "unknown"; data: unknown }
const frameLimit = 1024 * 1024

export type SharedDirectoryPolicy = { objectId: string; name: string; permissions: { objectId: string; name: string; userKind: 0 | 1 | 2 }[] }[]
type AdminSessionRow = { objectId: string; sessionGuid: string | null; name: string; createdAt: string | null;
  pendingDisconnect: boolean; packageCount: number; activeOperations: null }

export type AdminConnection = {
  identity: ServerIdentity
  inspectPolicy(): Promise<{ identity: ServerIdentity; sharedDirectories: SharedDirectoryPolicy }>
  inspectSessionInventory(): Promise<{ identity: ServerIdentity; sessionIdentityQualified: false; sessions: AdminSessionRow[];
    observation: { startedAt: string; finishedAt: string }; source: { path: string; sha256: string } }>
  inspect(): Promise<{ identity: ServerIdentity; sessions: ServerSession[]; configurationHash: string }>
  inspectUnactivatedUser(lease: SlotLease, secretFile: string): Promise<{ identity: ServerIdentity; username: string;
    account: { objectId: string; name: string; blocked: boolean } | null; serverSessions: "absent";
    source: { path: string; sha256: string } }>
  createBlockedUser(lease: SlotLease, secretFile: string): Promise<Awaited<ReturnType<typeof readUserOwnership>>>
  configureOwnedUser(lease: SlotLease, secretFile: string): Promise<Awaited<ReturnType<typeof recordUserConfiguration>>>
  reconcileOwnedAcl(lease: SlotLease, secretFile: string): Promise<{ userKey: string; aclHash: string; policy: SharedDirectoryPolicy;
    source: { path: string; id: string; sha256: string } }>
  observeOwnedSession(lease: SlotLease, secretFile: string, policy: unknown, mode?: "retained-package"): Promise<Awaited<ReturnType<typeof recordServerSession>>>
  closeOwnedSession(lease: SlotLease, secretFile: string, proofId: string): Promise<void>
  closeManagementSession(lease: SlotLease, secretFile: string, id: string, mode?: "confirm-absent"): Promise<void>
  closeAgentSession(lease: SlotLease, secretFile: string, id: string, archive: { path: string; sha256: string }, mode?: "confirm-absent"): Promise<void>
  activateOwnedUser(lease: SlotLease, secretFile: string): Promise<{ activated: boolean; userKey: string; source: { path: string; id: string; sha256: string } }>
  reconcileUser(lease: SlotLease, secretFile: string): Promise<{ userKey: string; aclHash: string }>
  closeSession(session: ServerSession): Promise<void>
  dispose(): Promise<void>
}

const inventoryWrites = new Map<string, Promise<void>>()

export async function openLoginomAdmin(file: SlotFile, identity: ServerIdentity, options: {
  binary?: string; signal?: AbortSignal; serverLease?: Awaited<ReturnType<typeof acquireResourceLease>>; processInventory?: string
} = {}): Promise<AdminConnection> {
  if (options.signal?.aborted) throw new EvalFailure("ADMIN_INTERRUPTED", 2)
  if (options.serverLease) {
    const command = await readLeaseReceipt(options.serverLease.reservation.journal)
    if (jsonObject(command) && ["unactivated-preparation", "unactivated-recovery"].includes(String(command.kind))) {
      await options.serverLease.assertHeld()
      if (options.processInventory !== command.processInventory || typeof options.processInventory !== "string" ||
        command.commandId !== options.serverLease.reservation.commandId || JSON.stringify(command.identity) !== JSON.stringify(identity))
        throw new EvalFailure("ADMIN_PROCESS_INVENTORY_UNCONFIRMED", 2)
      if (command.phase !== "unactivated" && (command.kind !== "unactivated-preparation" || command.phase !== "cli_admitted"))
        throw new EvalFailure("ADMIN_PROCESS_INVENTORY_SEALED", 2)
    }
  }
  const binary = options.binary ?? process.env.EVAL_CLI_BIN ?? Bun.which("loginom-ai-agent-cli")
  if (!binary) throw new EvalFailure("ADMIN_RUNTIME_UNAVAILABLE", 2)
  const runtime = await verifyAdminRuntime(binary)
  if (JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
  const info = await lstat(file.controller.stateDir)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700 ||
    await realpath(file.controller.stateDir) !== file.controller.stateDir) throw new EvalFailure("ADMIN_JOURNAL_PRIVATE", 2)
  const directory = await mkdtemp(path.join(file.controller.stateDir, "admin-"))
  await mkdir(path.join(directory, "commands"), { mode: 0o700 })
  await mkdir(path.join(directory, "profile"), { mode: 0o700 })
  const driver = path.resolve(import.meta.dir, "../script/loginom-admin-driver.mjs")
  const receipt = { version: 1, kind: "loginom-admin-connection", identity, status: "starting", initialization: "not_started", dispose: "not_started",
    finalization: null as { reply: AdminReply; command: { path: string; sha256: string } } | null,
    processInventory: options.processInventory && options.serverLease ? { file: options.processInventory,
      journal: options.serverLease.reservation.journal, commandId: options.serverLease.reservation.commandId } : null,
    transportDisconnect: null as "confirmed" | "unknown" | null,
    initializationCode: null as string | null, initializationStage: null as string | null, passwordState: null as string | null, disposeCode: null as string | null,
    runtimeManifestHash: runtime.manifestHash, driverHash: new Bun.CryptoHasher("sha256").update(await Bun.file(driver).bytes()).digest("hex"),
    processes: null as ProcessCleanup | null }
  await writeLeaseReceipt(path.join(directory, "connection.json"), receipt)
  if (options.processInventory) {
    const inventory = options.processInventory, lease = options.serverLease
    if (!lease || lease.reservation.key !== `server:${identity.containerId}` || JSON.stringify(lease.reservation.identity) !== JSON.stringify(identity))
      throw new EvalFailure("SERVER_FENCE_UNCONFIRMED", 2)
    await withAdminInventoryWrite(inventory, async () => {
      await lease.assertHeld()
      const current = await readAdminInventory(file, identity, { file: inventory, journal: lease.reservation.journal, commandId: lease.reservation.commandId })
      const command = await readLeaseReceipt(lease.reservation.journal)
      if (jsonObject(command) && ["unactivated-preparation", "unactivated-recovery"].includes(String(command.kind)) &&
        command.phase !== "unactivated" && (command.kind !== "unactivated-preparation" || command.phase !== "cli_admitted"))
        throw new EvalFailure("ADMIN_PROCESS_INVENTORY_SEALED", 2)
      await writeLeaseReceipt(inventory, { ...current, connections: [...current.connections, { directory, producerPid: process.pid }] })
      await lease.assertHeld()
    })
  }
  let stopInput = (_error: EvalFailure) => {}, stopOutput = (_error: EvalFailure) => {}
  const input = new TransformStream<Uint8Array, Uint8Array>({ start(controller) { stopInput = error => controller.error(error) } })
  const output = new TransformStream<Uint8Array, Uint8Array>({ start(controller) { stopOutput = error => controller.error(error) } })
  const abort = new AbortController()
  const stop = () => abort.abort()
  options.signal?.addEventListener("abort", stop, { once: true })
  if (options.signal?.aborted) stop()
  const pending = superviseProcess({ cmd: [runtime.node, driver], cwd: directory,
    env: { PATH: "/usr/bin:/bin", HOME: directory, LANG: "C.UTF-8", LOGINOM_AI_AGENT_CLI_BUNDLE: runtime.resources },
    timeoutMs: null, profileDir: path.join(directory, "profile"), stdin: input.readable, stdout: output.writable, signal: abort.signal,
    owner: { kind: "admin", id: directory } })
  void pending.catch(() => { stopInput(new EvalFailure("ADMIN_PROCESS_UNKNOWN", 2)); stopOutput(new EvalFailure("ADMIN_PROCESS_UNKNOWN", 2)) })
  const channel = createJournaledAdminChannel(output.readable, input.writable, path.join(directory, "commands"))
  let sequence = Promise.resolve()
  const request = (op: AdminOperation, payload: unknown, beforeSend?: () => Promise<void>) => {
    const result = sequence.then(async () => {
      if (op !== "dispose" && JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
      if (op === "reconcile-user") await verifyParallelPair(file, identity)
      if (op === "reconcile-user" || op === "close-session" || op === "confirm-session-absent") {
        if (!options.serverLease || options.serverLease.reservation.key !== `server:${identity.containerId}` ||
          JSON.stringify(options.serverLease.reservation.identity) !== JSON.stringify(identity) ||
          op === "reconcile-user" && options.serverLease.reservation.state !== "retained") throw new EvalFailure("SERVER_FENCE_UNCONFIRMED", 2)
        await options.serverLease.assertHeld()
      }
      await beforeSend?.()
      return channel.request({ v: 1, id: crypto.randomUUID(), op, expectedIdentity: identity, deadline: Date.now() + 30_000, payload })
    })
    sequence = result.then(() => undefined, () => undefined)
    return result
  }
  const observe = async (beforeSend?: () => Promise<void>) => {
    const reply = await request("inspect", {}, beforeSend)
    const data = requireAdminReply(reply)
    if (jsonObject(data) && data.sessionIdentityQualified === false && Array.isArray(data.rawSessions)) {
      const own = jsonObject(data.ownSession) ? data.ownSession : {}
      if (JSON.stringify(data.identity) !== JSON.stringify(identity) || typeof own.guid !== "string" || !own.guid ||
        typeof own.isAdmin !== "boolean" || typeof own.isDesigner !== "boolean" ||
        typeof own.username !== "string" || !own.username || typeof own.userObjectId !== "string" || !own.userObjectId ||
        !Array.isArray(data.users) || data.users.some(user => !jsonObject(user) || typeof user.objectId !== "string" || !user.objectId ||
          typeof user.name !== "string" || !user.name || user.userKind !== 0 ||
          [user.isAdmin, user.isDesigner, user.isViewer, user.blocked, user.useGlobalFileStorage, user.schedulerFullAccess].some(value => typeof value !== "boolean")) ||
        !Array.isArray(data.sharedDirectories) || data.sharedDirectories.some(directory => !jsonObject(directory) || typeof directory.objectId !== "string" ||
          !directory.objectId || typeof directory.name !== "string" || !directory.name || !Array.isArray(directory.permissions) ||
          directory.permissions.some(principal => !jsonObject(principal) || typeof principal.objectId !== "string" || !principal.objectId ||
            typeof principal.name !== "string" || !principal.name || ![0, 1, 2].includes(Number(principal.userKind)) || typeof principal.userKind !== "number")) ||
        typeof own.objectId !== "string" || !own.objectId || own.managedObjectId !== null && typeof own.managedObjectId !== "string" || data.rawSessions.some(row => !jsonObject(row) ||
          typeof row.objectId !== "string" || !row.objectId || row.sessionGuid !== null && typeof row.sessionGuid !== "string" || typeof row.name !== "string" || typeof row.pendingDisconnect !== "boolean" ||
          !Number.isSafeInteger(row.packageCount) || Number(row.packageCount) < 0)) throw new EvalFailure("ADMIN_PROTOCOL", 2)
      await writeLeaseReceipt(path.join(directory, "session-observations.json"), { version: 1, kind: "admin-session-observations", identity,
        sessionIdentityQualified: false, ownSession: { guid: own.guid, objectId: own.objectId, managedObjectId: own.managedObjectId,
          username: own.username, userObjectId: own.userObjectId, isAdmin: own.isAdmin, isDesigner: own.isDesigner }, users: data.users.map(value => {
          const user = value as Record<string, unknown>
          return { objectId: user.objectId, name: user.name, userKind: user.userKind, isAdmin: user.isAdmin, isDesigner: user.isDesigner,
            isViewer: user.isViewer, blocked: user.blocked, useGlobalFileStorage: user.useGlobalFileStorage, schedulerFullAccess: user.schedulerFullAccess }
        }), sharedDirectories: data.sharedDirectories.map(value => {
          const directory = value as Record<string, unknown>
          return { objectId: directory.objectId, name: directory.name, permissions: (directory.permissions as Record<string, unknown>[]).map(principal =>
            ({ objectId: principal.objectId, name: principal.name, userKind: principal.userKind })) }
        }), sessions: data.rawSessions.map(row => {
          const session = row as Record<string, unknown>
          return { objectId: session.objectId, sessionGuid: session.sessionGuid, name: session.name, createdAt: typeof session.createdAt === "string" ? session.createdAt : null,
            pendingDisconnect: session.pendingDisconnect, packageCount: session.packageCount, activeOperations: null }
        }) })
    }
    return { data, reply }
  }
  let disposal: Promise<void> | undefined
  const connection: AdminConnection = {
    identity,
    async inspectPolicy() {
      const data = (await observe()).data
      if (!jsonObject(data) || JSON.stringify(data.identity) !== JSON.stringify(identity)) throw new EvalFailure("ADMIN_PROTOCOL", 2)
      return { identity, sharedDirectories: sharedPolicy(data.sharedDirectories) }
    },
    async inspect() {
      const data = (await observe()).data
      if (!jsonObject(data) || data.sessionIdentityQualified !== true || !Array.isArray(data.sessions)) throw new EvalFailure("SESSION_IDENTITY_UNSUPPORTED", 2)
      return { identity, sessions: data.sessions as ServerSession[], configurationHash: identity.configurationHash }
    },
    async inspectSessionInventory() {
      const observation = await observe()
      const data = observation.data
      if (!jsonObject(data) || data.sessionIdentityQualified !== false || !Array.isArray(data.rawSessions) ||
        !jsonObject(data.ownSession) || data.ownSession.isAdmin !== true) throw new EvalFailure("ADMIN_PROTOCOL", 2)
      const commandFile = path.join(directory, "commands", `${observation.reply.id}.json`)
      const sessions = (data.rawSessions as AdminSessionRow[]).map(row => ({ objectId: row.objectId, sessionGuid: row.sessionGuid, name: row.name,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : null, pendingDisconnect: row.pendingDisconnect,
        packageCount: row.packageCount, activeOperations: null }))
      const receipt = { version: 2, kind: "admin-session-inventory", identity, sessionIdentityQualified: false, sessions,
        command: { path: commandFile, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(await readLeaseReceipt(commandFile))).digest("hex") },
        reply: { id: observation.reply.id, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(observation.reply)).digest("hex") } }
      const target = path.join(directory, `session-inventory-${observation.reply.id}.json`)
      await writeLeaseReceipt(target, receipt)
      return readAdminSessionInventory(file, identity, { path: target, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(receipt)).digest("hex") })
    },
    async inspectUnactivatedUser(lease, secretFile) {
      const current = async () => {
        await lease.assertHeld()
        if (!options.serverLease || options.serverLease.reservation.key !== `server:${identity.containerId}` ||
          JSON.stringify(options.serverLease.reservation.identity) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_FENCE_UNCONFIRMED", 2)
        await options.serverLease.assertHeld()
        const prepared = await readUserPreparation(file, lease, secretFile)
        if (JSON.stringify(prepared.identity) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
        if (await lstat(path.join(file.controller.stateDir, `activation-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined
          throw new EvalFailure("USER_ACTIVATION_UNCONFIRMED", 2)
        })) throw new EvalFailure("USER_IDLE_UNCONFIRMED", 2)
        const owned = await lstat(path.join(file.controller.stateDir, `user-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined
          throw new EvalFailure("USER_OWNERSHIP_UNCONFIRMED", 2)
        }) ? await readUserOwnership(file, lease, secretFile) : null
        return { prepared, owned }
      }
      const before = await current()
      await verifyParallelPair(file, identity)
      const observation = await observe(async () => {
        if (JSON.stringify(await current()) !== JSON.stringify(before)) throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
      })
      const data = observation.data
      if (!jsonObject(data) || data.sessionIdentityQualified !== false || !jsonObject(data.ownSession) || data.ownSession.isAdmin !== true ||
        !Array.isArray(data.users) || !Array.isArray(data.rawSessions))
        throw new EvalFailure("ADMIN_PROTOCOL", 2)
      const matches = data.users.filter(user => jsonObject(user) && typeof user.name === "string" && user.name.toLowerCase() === lease.slot.username.toLowerCase())
      const account = matches[0]
      if (!before.owned && matches.length || before.owned && (matches.length !== 1 || !jsonObject(account) ||
        account.objectId !== before.owned.objectId || account.name !== before.owned.username || account.userKind !== 0 || account.blocked !== true))
        throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
      if (data.rawSessions.some(row => jsonObject(row) && typeof row.name === "string" &&
        (row.name.toLowerCase() === lease.slot.username.toLowerCase() || row.name.toLowerCase().startsWith(lease.slot.username.toLowerCase() + ":"))))
        throw new EvalFailure("USER_IDLE_UNCONFIRMED", 2)
      if (JSON.stringify(await current()) !== JSON.stringify(before)) throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
      const commandFile = path.join(directory, "commands", `${observation.reply.id}.json`)
      const command = await readLeaseReceipt(commandFile)
      if (!jsonObject(command) || command.version !== 1 || command.kind !== "loginom-admin-command" || command.op !== "inspect" ||
        command.state !== "confirmed" || command.id !== observation.reply.id ||
        JSON.stringify(command.expectedIdentity) !== JSON.stringify(identity) ||
        command.desiredHash !== new Bun.CryptoHasher("sha256").update("{}").digest("hex") ||
        command.replyHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(observation.reply)).digest("hex")) throw new EvalFailure("ADMIN_PROTOCOL", 2)
      const result = { identity, username: lease.slot.username, account: before.owned ? { objectId: before.owned.objectId,
        name: before.owned.username, blocked: true } : null, serverSessions: "absent" as const }
      const receipt = { version: 2, kind: "unactivated-user-observation", ...result, slotId: lease.slot.id, leaseToken: lease.token,
        preparationNonce: before.prepared.nonce, ownership: before.owned?.source ?? null, observation: observation.reply,
        command: { path: commandFile, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(command)).digest("hex") } }
      const target = path.join(directory, `unactivated-${lease.slot.id}-${observation.reply.id}.json`)
      await writeLeaseReceipt(target, receipt)
      return readUnactivatedUserObservation(file, lease, secretFile, { path: target,
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(receipt)).digest("hex") })
    },
    async reconcileUser(lease, secretFile) {
      // Readiness activates the user only after storage and effective-access probes.
      await connection.createBlockedUser(lease, secretFile)
      await connection.configureOwnedUser(lease, secretFile)
      const acl = await connection.reconcileOwnedAcl(lease, secretFile)
      return { userKey: acl.userKey, aclHash: acl.aclHash }
    },
    async createBlockedUser(lease, secretFile) {
      await lease.assertHeld()
      if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
      const prepared = await readUserPreparation(file, lease, secretFile)
      if (JSON.stringify(prepared.identity) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
      const info = await lstat(path.join(file.controller.stateDir, `user-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw new EvalFailure("USER_OWNERSHIP_UNCONFIRMED", 2)
      })
      const owned = info ? await readUserOwnership(file, lease, secretFile) : null
      if (owned?.everActivated) throw new EvalFailure("USER_IDLE_UNCONFIRMED", 2)
      const reserved = !owned && options.serverLease ? await (async () => {
        await verifyParallelPair(file, identity)
        const observed = (await observe()).data
        if (!jsonObject(observed) || !Array.isArray(observed.users)) throw new EvalFailure("ADMIN_PROTOCOL", 2)
        if (observed.users.some(user => jsonObject(user) && typeof user.name === "string" && user.name.toLowerCase() === lease.slot.username.toLowerCase())) return undefined
        return reserveUserStorage(file, lease, secretFile, options.serverLease!)
      })() : undefined
      const reply = await request("reconcile-user", { phase: "blocked", slot: lease.slot, secretFile, preparationNonce: prepared.nonce,
        desiredHash: prepared.desiredHash, secretHash: prepared.secretHash, owned: owned ? { objectId: owned.objectId, name: owned.username,
          userKind: owned.userKind, preparationNonce: owned.preparationNonce } : null }, async () => {
        if (JSON.stringify(await readUserPreparation(file, lease, secretFile)) !== JSON.stringify(prepared))
          throw new EvalFailure("USER_PREPARATION_CONFLICT", 2)
        if (reserved && options.serverLease) await reserveUserStorage(file, lease, secretFile, options.serverLease)
        if (owned && JSON.stringify(await readUserOwnership(file, lease, secretFile)) !== JSON.stringify(owned))
          throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
        if (!owned && await lstat(path.join(file.controller.stateDir, `user-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined
          throw new EvalFailure("USER_OWNERSHIP_UNCONFIRMED", 2)
        })) throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
      })
      const data = requireAdminReply(reply)
      if (!owned) return claimUserOwnership(file, lease, secretFile, path.join(directory, "commands", `${reply.id}.json`), reply)
      if (!jsonObject(data) || data.created !== false || !jsonObject(data.user) || data.user.objectId !== owned.objectId ||
        data.user.name !== owned.username || data.user.userKind !== 0 || data.user.blocked !== true)
        throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
      return readUserOwnership(file, lease, secretFile)
    },
    async configureOwnedUser(lease, secretFile) {
      await lease.assertHeld()
      if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
      const prepared = await readUserPreparation(file, lease, secretFile)
      const owned = await readUserOwnership(file, lease, secretFile)
      if (owned.everActivated) throw new EvalFailure("USER_IDLE_UNCONFIRMED", 2)
      if (JSON.stringify(prepared.identity) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
      const configured = await readUserConfiguration(file, lease, secretFile)
      const payload = { phase: "configure", slot: lease.slot, secretFile, preparationNonce: prepared.nonce,
        desiredHash: prepared.desiredHash, secretHash: prepared.secretHash, owned: { objectId: owned.objectId, name: owned.username,
          userKind: owned.userKind, preparationNonce: owned.preparationNonce, secretHash: configured?.secretHash ?? null } }
      const reply = await request("reconcile-user", payload, async () => {
        if (JSON.stringify(await readUserPreparation(file, lease, secretFile)) !== JSON.stringify(prepared) ||
          JSON.stringify(await readUserOwnership(file, lease, secretFile)) !== JSON.stringify(owned) ||
          JSON.stringify(await readUserConfiguration(file, lease, secretFile)) !== JSON.stringify(configured))
          throw new EvalFailure("USER_CONFIGURATION_UNCONFIRMED", 2)
      })
      requireAdminReply(reply)
      return recordUserConfiguration(file, lease, secretFile, path.join(directory, "commands", `${reply.id}.json`), payload, reply)
    },
    async reconcileOwnedAcl(lease, secretFile) {
      await lease.assertHeld()
      if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
      const prepared = await readUserPreparation(file, lease, secretFile)
      const owned = await readUserOwnership(file, lease, secretFile)
      if (owned.everActivated) throw new EvalFailure("USER_IDLE_UNCONFIRMED", 2)
      if (JSON.stringify(prepared.identity) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
      const configured = await readUserConfiguration(file, lease, secretFile)
      if (!configured) throw new EvalFailure("USER_CONFIGURATION_UNCONFIRMED", 2)
      const expectedPolicy = (await connection.inspectPolicy()).sharedDirectories
      const payload = { phase: "acl", slot: lease.slot, secretFile, preparationNonce: prepared.nonce,
        desiredHash: prepared.desiredHash, secretHash: prepared.secretHash, owned: { objectId: owned.objectId, name: owned.username,
          userKind: owned.userKind, preparationNonce: owned.preparationNonce, secretHash: configured.secretHash }, expectedPolicy }
      const reply = await request("reconcile-user", payload, async () => {
        if (JSON.stringify(await readUserPreparation(file, lease, secretFile)) !== JSON.stringify(prepared) ||
          JSON.stringify(await readUserOwnership(file, lease, secretFile)) !== JSON.stringify(owned) ||
          JSON.stringify(await readUserConfiguration(file, lease, secretFile)) !== JSON.stringify(configured))
          throw new EvalFailure("USER_CONFIGURATION_UNCONFIRMED", 2)
      })
      const data = requireAdminReply(reply)
      if (!jsonObject(data) || Object.keys(data).length !== 2 || !Number.isSafeInteger(data.removed) || Number(data.removed) < 0)
        throw new EvalFailure("ADMIN_PROTOCOL", 2)
      const forbidden = (principal: SharedDirectoryPolicy[number]["permissions"][number]) =>
        principal.name === "Everyone" && principal.userKind === 2 || principal.objectId === owned.objectId && principal.name === owned.username && principal.userKind === 0
      const policy = sharedPolicy(data.policy)
      if (data.removed !== expectedPolicy.flatMap(directory => directory.permissions.filter(forbidden)).length ||
        JSON.stringify(normalizedPolicy(policy)) !== JSON.stringify(normalizedPolicy(expectedPolicy.map(directory =>
          ({ ...directory, permissions: directory.permissions.filter(principal => !forbidden(principal)) })))))
        throw new EvalFailure("ADMIN_ACL_READBACK_UNCONFIRMED", 2)
      const commandFile = path.join(directory, "commands", `${reply.id}.json`)
      const source = await readLeaseReceipt(commandFile)
      if (!jsonObject(source) || source.id !== reply.id || source.op !== "reconcile-user" || source.state !== "confirmed" ||
        JSON.stringify(source.expectedIdentity) !== JSON.stringify(identity) || source.desiredHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(payload)).digest("hex") ||
        source.replyHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex")) throw new EvalFailure("ADMIN_ACL_READBACK_UNCONFIRMED", 2)
      await lease.assertHeld()
      return { userKey: owned.userKey, aclHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(normalizedPolicy(policy))).digest("hex"), policy,
        source: { path: commandFile, id: reply.id, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(source)).digest("hex") } }
    },
    async activateOwnedUser(lease, secretFile) {
      await lease.assertHeld()
      if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
      const sources = async () => {
        const prepared = await readUserPreparation(file, lease, secretFile), owned = await readUserOwnership(file, lease, secretFile)
        const configured = await readUserConfiguration(file, lease, secretFile)
        if (!configured) throw new EvalFailure("USER_CONFIGURATION_UNCONFIRMED", 2)
        const published = await readLeaseReceipt(path.join(file.controller.stateDir, `storage-${lease.slot.id}.json`)).catch(() => null)
        if (!jsonObject(published) || published.kind !== "owned-user-storage" || published.state !== "published" ||
          published.preparationNonce !== prepared.nonce || published.userKey !== owned.userKey || published.ownerSource !== owned.source.sha256 ||
          published.slotId !== lease.slot.id || published.username !== owned.username || JSON.stringify(published.identity) !== JSON.stringify(identity))
          throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
        const storage = await inspectUserStorage(file, identity, lease.slot, prepared.nonce)
        if (published.root !== storage.root || storage.entries.length || ["device", "inode", "uid", "gid"].some(key => published[key] !== storage[key as keyof typeof storage]))
          throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
        return { prepared, owned, configured, published, storage }
      }
      const before = await sources()
      const policy = (await connection.inspectPolicy()).sharedDirectories
      if (policy.some(directory => directory.permissions.length)) throw new EvalFailure("ADMIN_USER_POLICY_CHANGED", 2)
      const activation = await stageUserActivation(file, lease, secretFile)
      const expected = { ...before, owned: { ...before.owned, everActivated: true } }
      const payload = { phase: "activate", slot: lease.slot, secretFile, preparationNonce: before.prepared.nonce,
        desiredHash: before.prepared.desiredHash, secretHash: before.prepared.secretHash, owned: { objectId: before.owned.objectId,
          name: before.owned.username, userKind: before.owned.userKind, preparationNonce: before.prepared.nonce, secretHash: before.configured.secretHash }, expectedPolicy: policy }
      const reply = await request("reconcile-user", payload, async () => {
        if (JSON.stringify(await sources()) !== JSON.stringify(expected) ||
          JSON.stringify(await readUserActivation(file, lease, secretFile)) !== JSON.stringify(activation))
          throw new EvalFailure("USER_ACTIVATION_CONFLICT", 2)
      })
      const data = requireAdminReply(reply)
      if (!jsonObject(data) || Object.keys(data).length !== 2 || typeof data.activated !== "boolean" || !jsonObject(data.user) ||
        Object.keys(data.user).length !== 4 || data.user.objectId !== before.owned.objectId || data.user.name !== before.owned.username ||
        data.user.userKind !== 0 || data.user.blocked !== false) throw new EvalFailure("USER_ACTIVATION_UNCONFIRMED", 2)
      const commandFile = path.join(directory, "commands", `${reply.id}.json`), command = await readLeaseReceipt(commandFile)
      if (!jsonObject(command) || command.id !== reply.id || command.op !== "reconcile-user" || command.state !== "confirmed" ||
        JSON.stringify(command.expectedIdentity) !== JSON.stringify(identity) ||
        command.desiredHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(payload)).digest("hex") ||
        command.replyHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex")) throw new EvalFailure("USER_ACTIVATION_UNCONFIRMED", 2)
      await lease.assertHeld()
      const source = { path: commandFile, id: reply.id, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(command)).digest("hex") }
      const receipt = { version: 2, kind: "owned-user-activation", identity, slotId: lease.slot.id, preparationNonce: before.prepared.nonce,
        activationNonce: activation.nonce, userKey: before.owned.userKey, objectId: before.owned.objectId, source, observation: { payload, reply } }
      const target = path.join(file.controller.stateDir, `activate-${lease.slot.id}.receipt.json`)
      await writeLeaseReceipt(target, receipt)
      if (JSON.stringify(await readLeaseReceipt(target)) !== JSON.stringify(receipt)) throw new EvalFailure("USER_ACTIVATION_UNCONFIRMED", 2)
      return { activated: data.activated, userKey: before.owned.userKey, source }
    },
    async observeOwnedSession(lease, secretFile, policy, mode) {
      await lease.assertHeld()
      if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
      const prepared = await readUserPreparation(file, lease, secretFile)
      const owned = await readUserOwnership(file, lease, secretFile)
      const activation = await readUserActivation(file, lease, secretFile)
      if (!activation) throw new EvalFailure("SESSION_ADMISSION_UNCONFIRMED", 2)
      if (JSON.stringify(prepared.identity) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
      const payload = { phase: mode === "retained-package" ? "session-package-crash-probe" : "session-probe", slot: lease.slot, secretFile, preparationNonce: prepared.nonce,
        desiredHash: prepared.desiredHash, secretHash: prepared.secretHash, owned: { objectId: owned.objectId, name: owned.username,
          userKind: owned.userKind, preparationNonce: owned.preparationNonce, secretHash: prepared.secretHash }, expectedPolicy: structuredClone(policy) }
      const reply = await request("reconcile-user", payload, async () => {
        if (JSON.stringify(await readUserPreparation(file, lease, secretFile)) !== JSON.stringify(prepared) ||
          JSON.stringify(await readUserOwnership(file, lease, secretFile)) !== JSON.stringify(owned) ||
          JSON.stringify(await readUserActivation(file, lease, secretFile)) !== JSON.stringify(activation))
          throw new EvalFailure("SESSION_ADMISSION_UNCONFIRMED", 2)
      })
      requireAdminReply(reply)
      return recordServerSession(file, lease, secretFile, path.join(directory, "commands", `${reply.id}.json`), payload, reply)
    },
    async closeOwnedSession(lease, secretFile, proofId) {
      const entry = await readServerSession(file, lease, secretFile, proofId)
      if (JSON.stringify(entry.identity) !== JSON.stringify(identity) || JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(identity))
        throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
      if (entry.state === "closed") return
      const adopt = path.dirname(entry.source.path) === path.join(directory, "commands") ? undefined : {
        receipt: path.join(file.controller.stateDir, `session-${proofId}.json`),
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(entry)).digest("hex"),
      }
      const reply = await request("close-session", { proofId: entry.source.id, session: entry.binding, ...(adopt ? { adopt } : {}) }, async () => {
        if (JSON.stringify(await readServerSession(file, lease, secretFile, proofId)) !== JSON.stringify(entry))
          throw new EvalFailure("SESSION_SOURCE_UNCONFIRMED", 2)
        await verifyParallelPair(file, identity)
      })
      requireAdminReply(reply)
      await recordServerSessionClosed(file, lease, secretFile, proofId, path.join(directory, "commands", `${reply.id}.json`), reply)
    },
    async closeManagementSession(lease, secretFile, id, mode) {
      const entry = await readManagementSession(file, lease, secretFile, id)
      if (entry.state === "closed") return
      if (JSON.stringify(entry.identity) !== JSON.stringify(identity) || JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(identity))
        throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
      const adopt = { receipt: path.join(file.controller.stateDir, `management-session-${id}.json`),
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(entry)).digest("hex") }
      const reply = await request(mode === "confirm-absent" ? "confirm-session-absent" : "close-session", { proofId: id, session: entry.binding, adopt }, async () => {
        if (JSON.stringify(await readManagementSession(file, lease, secretFile, id)) !== JSON.stringify(entry))
          throw new EvalFailure("SESSION_SOURCE_UNCONFIRMED", 2)
        await verifyParallelPair(file, identity)
      })
      requireAdminReply(reply)
      await recordManagementSessionClosed(file, lease, secretFile, id, path.join(directory, "commands", `${reply.id}.json`), reply)
    },
    async closeAgentSession(lease, secretFile, id, archive, mode) {
      const entry = await readAgentSession(file, lease, secretFile, id)
      if (entry.state === "closed") {
        if (JSON.stringify(entry.archive) !== JSON.stringify(archive)) throw new EvalFailure("AGENT_ARCHIVE_UNCONFIRMED", 2)
        return
      }
      if (JSON.stringify(entry.identity) !== JSON.stringify(identity) || JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(identity))
        throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
      const adopt = { receipt: path.join(file.controller.stateDir, `agent-session-${id}.json`),
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(entry)).digest("hex"),
        archive: await readAgentArchive(file, lease, secretFile, id, archive) }
      const reply = await request(mode === "confirm-absent" ? "confirm-session-absent" : "close-session", { proofId: id, session: entry.binding, adopt }, async () => {
        if (JSON.stringify(await readAgentSession(file, lease, secretFile, id)) !== JSON.stringify(entry))
          throw new EvalFailure("SESSION_SOURCE_UNCONFIRMED", 2)
        await readAgentArchive(file, lease, secretFile, id, archive)
        await verifyParallelPair(file, identity)
      })
      requireAdminReply(reply)
      await recordAgentSessionClosed(file, lease, secretFile, id, archive, path.join(directory, "commands", `${reply.id}.json`), reply)
    },
    async closeSession(session) {
      const data = requireAdminReply(await request("close-session", { session }))
      if (!jsonObject(data) || data.closed !== true || selectOwnedSessions((await connection.inspect()).sessions, [session]).length)
        throw new EvalFailure("ADMIN_CLOSE_UNCONFIRMED", 2)
    },
    dispose() {
      disposal ??= (async () => {
        const ack = await request("dispose", {}).catch(() => undefined)
        receipt.dispose = ack?.outcome ?? "unknown"
        receipt.disposeCode = ack?.outcome === "confirmed" ? null : ack ? adminReplyCode(ack) : "ADMIN_OPERATION_UNKNOWN"
        receipt.transportDisconnect = ack?.outcome === "confirmed" && jsonObject(ack.data) && ack.data.transportDisconnect === "confirmed" ? "confirmed" : "unknown"
        const disposed = ack?.outcome === "confirmed" && jsonObject(ack.data) && ack.data.disposed === true &&
          (receipt.initialization !== "confirmed" || receipt.transportDisconnect === "confirmed")
        if (!disposed) stop()
        await channel.end().catch(stop)
        const result = await pending.catch(() => undefined)
        await channel.close().catch(stop)
        options.signal?.removeEventListener("abort", stop)
        receipt.processes = result?.processCleanup ?? null
        if (ack) {
          const command = path.join(directory, "commands", `${ack.id}.json`)
          const source = await readLeaseReceipt(command).catch(() => undefined)
          if (source) receipt.finalization = { reply: ack, command: { path: command,
            sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(source)).digest("hex") } }
        }
        receipt.initializationStage = result?.stderr.split("\n").filter(line =>
          /^ADMIN_INIT_STAGE_(BROWSER|NAVIGATION|FORM|USERNAME|PASSWORD|BLUR|LOGIN|SESSION|ROLE)$/.test(line)).at(-1)?.slice("ADMIN_INIT_STAGE_".length) ?? null
        receipt.passwordState = result?.stderr.split("\n").filter(line =>
          /^ADMIN_INIT_PASSWORD_(READY|DISABLED|READONLY|HIDDEN)$/.test(line)).at(-1)?.slice("ADMIN_INIT_PASSWORD_".length) ?? null
        receipt.status = disposed && result?.exitCode === 0 && result.processCleanup.status === "confirmed" &&
          result.processCleanup.capture_complete && !result.interrupted && !result.timedOut ? "disposed" : "quarantined"
        await writeLeaseReceipt(path.join(directory, "connection.json"), receipt)
        if (receipt.status !== "disposed") throw new EvalFailure("ADMIN_DISPOSE_UNKNOWN", 2)
      })()
      return disposal
    },
  }
  try {
    const initialized = await request("init", { resourceRoot: runtime.resources, manifestHash: runtime.manifestHash, url: file.server.url,
      credentialsFile: file.controller.adminCredentialsFile, profileDir: path.join(directory, "profile/loginom/runtime/admin/attempts/context/browser-profile") })
    receipt.initialization = initialized.outcome
    receipt.initializationCode = initialized.outcome === "confirmed" ? null : adminReplyCode(initialized)
    receipt.status = "initializing"
    await writeLeaseReceipt(path.join(directory, "connection.json"), receipt)
    const data = requireAdminReply(initialized)
    if (!jsonObject(data) || data.initialized !== true) throw new EvalFailure("ADMIN_PROTOCOL", 2)
    if (JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
    receipt.status = "ready"
    await writeLeaseReceipt(path.join(directory, "connection.json"), receipt)
    return connection
  } catch (error) { await connection.dispose(); throw error }
}

function requireAdminReply(reply: AdminReply): unknown {
  if (reply.outcome === "confirmed") return reply.data
  throw new EvalFailure(adminReplyCode(reply), 2)
}

export async function sealAdminProcessInventory(file: SlotFile, server: Awaited<ReturnType<typeof acquireResourceLease>>, expectedHash: string, slots?: SlotLease[]) {
  await server.assertHeld()
  const initial = await readLeaseReceipt(server.reservation.journal)
  const identity = server.reservation.identity
  if (!identity || server.reservation.key !== `server:${identity.containerId}` || !jsonObject(initial) || typeof initial.processInventory !== "string")
    throw new EvalFailure("ADMIN_PROCESS_INVENTORY_UNCONFIRMED", 2)
  return withAdminInventoryWrite(initial.processInventory, async () => {
    await readAdminInventory(file, identity, { file: initial.processInventory as string, journal: server.reservation.journal, commandId: server.reservation.commandId })
    const command = await readLeaseReceipt(server.reservation.journal)
    if (jsonObject(command) && command.phase === "cli_admitted" && slots) {
      const { sealManagementProcessInventories } = await import("./management-process-evidence")
      return sealManagementProcessInventories(file, server, slots, expectedHash)
    }
    if (!jsonObject(command) || !["unactivated-preparation", "unactivated-recovery"].includes(String(command.kind)) || command.phase !== "unactivated" ||
      new Bun.CryptoHasher("sha256").update(JSON.stringify(command)).digest("hex") !== expectedHash)
      throw new EvalFailure("ADMIN_PROCESS_INVENTORY_SEALED", 2)
    const sealed = { ...command, phase: "finalizing" }
    await server.assertHeld()
    await writeLeaseReceipt(server.reservation.journal, sealed)
    return sealed
  })
}

async function withAdminInventoryWrite<T>(file: string, callback: () => Promise<T>) {
  const pending = (inventoryWrites.get(file) ?? Promise.resolve()).then(callback)
  const settled = pending.then(() => {}, () => {})
  inventoryWrites.set(file, settled)
  try { return await pending } finally { if (inventoryWrites.get(file) === settled) inventoryWrites.delete(file) }
}

/** Immutable native observations; this reader grants no session ownership or cleanup authority. */
export async function readAdminSessionInventory(file: { controller: { stateDir: string } }, identity: ServerIdentity, source: { path: string; sha256: string }) {
  const directory = path.dirname(source.path)
  if (path.dirname(directory) !== file.controller.stateDir || !/^admin-[a-zA-Z0-9_-]+$/.test(path.basename(directory)) ||
    path.resolve(source.path) !== source.path || !/^[a-f0-9]{64}$/.test(source.sha256)) throw new EvalFailure("SESSION_INVENTORY_UNCONFIRMED", 2)
  const root = await lstat(directory).catch(() => undefined)
  if (!root?.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700 ||
    await realpath(directory).catch(() => undefined) !== directory) throw new EvalFailure("SESSION_INVENTORY_UNCONFIRMED", 2)
  const hash = (value: unknown) => new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
  const receipt = await readLeaseReceipt(source.path).catch(() => null)
  if (!jsonObject(receipt) || Object.keys(receipt).length !== 7 || receipt.version !== 2 || receipt.kind !== "admin-session-inventory" ||
    hash(receipt) !== source.sha256 || JSON.stringify(receipt.identity) !== JSON.stringify(identity) || receipt.sessionIdentityQualified !== false ||
    !Array.isArray(receipt.sessions) || !jsonObject(receipt.command) || Object.keys(receipt.command).length !== 2 ||
    !jsonObject(receipt.reply) || Object.keys(receipt.reply).length !== 2 || typeof receipt.reply.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(receipt.reply.id) || typeof receipt.reply.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(receipt.reply.sha256) ||
    path.basename(source.path) !== `session-inventory-${receipt.reply.id}.json` ||
    receipt.command.path !== path.join(directory, "commands", `${receipt.reply.id}.json`) || receipt.sessions.some(value => {
      if (!jsonObject(value)) return true
      return Object.keys(value).length !== 7 || typeof value.objectId !== "string" || !value.objectId ||
        value.sessionGuid !== null && (typeof value.sessionGuid !== "string" || !value.sessionGuid) || typeof value.name !== "string" || !value.name ||
        value.createdAt !== null && (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) ||
        typeof value.pendingDisconnect !== "boolean" || !Number.isSafeInteger(value.packageCount) || Number(value.packageCount) < 0 || value.activeOperations !== null
    }) || new Set(receipt.sessions.map(value => (value as AdminSessionRow).objectId)).size !== receipt.sessions.length)
    throw new EvalFailure("SESSION_INVENTORY_UNCONFIRMED", 2)
  const command = await readLeaseReceipt(receipt.command.path as string).catch(() => null)
  if (!jsonObject(command) || Object.keys(command).length !== 10 || command.version !== 1 || command.kind !== "loginom-admin-command" ||
    hash(command) !== receipt.command.sha256 || command.op !== "inspect" || command.state !== "confirmed" || command.id !== receipt.reply.id ||
    JSON.stringify(command.expectedIdentity) !== JSON.stringify(identity) || command.desiredHash !== hash({}) || command.replyHash !== receipt.reply.sha256 ||
    typeof command.at !== "string" || !Number.isFinite(Date.parse(command.at)) || typeof command.settledAt !== "string" ||
    !Number.isFinite(Date.parse(command.settledAt)) || Date.parse(command.settledAt) < Date.parse(command.at))
    throw new EvalFailure("SESSION_INVENTORY_UNCONFIRMED", 2)
  return { identity, sessionIdentityQualified: false as const, sessions: receipt.sessions as AdminSessionRow[],
    observation: { startedAt: command.at, finishedAt: command.settledAt }, source }
}

export async function readAdminProcessInventory(file: { controller: { stateDir: string } }, identity: ServerIdentity, input: { file: string; journal: string; commandId: string; producerPid: number }) {
  const inventory = await readAdminInventory(file, identity, input)
  const connections = []
  for (const entry of inventory.connections) {
    if (entry.producerPid !== input.producerPid) throw new EvalFailure("ADMIN_PROCESS_INVENTORY_UNCONFIRMED", 2)
    const finalization = await readAdminFinalization(file, identity, entry.directory, input.producerPid)
    const receipt = await readLeaseReceipt(finalization.source.path)
    if (!jsonObject(receipt) || JSON.stringify(receipt.processInventory) !== JSON.stringify({ file: input.file, journal: input.journal, commandId: input.commandId }) ||
      new Bun.CryptoHasher("sha256").update(JSON.stringify(receipt)).digest("hex") !== finalization.source.sha256)
      throw new EvalFailure("ADMIN_PROCESS_INVENTORY_UNCONFIRMED", 2)
    connections.push(finalization)
  }
  if (JSON.stringify(await readAdminInventory(file, identity, input)) !== JSON.stringify(inventory))
    throw new EvalFailure("ADMIN_PROCESS_INVENTORY_CHANGED", 2)
  return { commandId: input.commandId, connections,
    source: { path: input.file, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(inventory)).digest("hex") } }
}

async function readAdminInventory(file: { controller: { stateDir: string } }, identity: ServerIdentity, input: { file: string; journal: string; commandId: string }) {
  if (path.dirname(input.file) !== file.controller.stateDir || !input.journal.startsWith(file.controller.stateDir + path.sep) ||
    path.resolve(input.journal) !== input.journal) throw new EvalFailure("ADMIN_PROCESS_INVENTORY_UNCONFIRMED", 2)
  const journal = await readLeaseReceipt(input.journal).catch(() => null)
  const inventory = await readLeaseReceipt(input.file).catch(() => null)
  if (!jsonObject(journal) || journal.commandId !== input.commandId || !input.commandId || !jsonObject(inventory) || Object.keys(inventory).length !== 6 ||
    inventory.version !== 2 || inventory.kind !== "admin-processes" || inventory.commandId !== input.commandId || inventory.journal !== input.journal ||
    JSON.stringify(inventory.identity) !== JSON.stringify(identity) || !Array.isArray(inventory.connections) || inventory.connections.some(entry =>
      !jsonObject(entry) || Object.keys(entry).length !== 2 || typeof entry.directory !== "string" || path.dirname(entry.directory) !== file.controller.stateDir ||
      !/^admin-[a-zA-Z0-9_-]+$/.test(path.basename(entry.directory)) || !Number.isSafeInteger(entry.producerPid) || Number(entry.producerPid) < 1) ||
    new Set(inventory.connections.map(entry => entry.directory)).size !== inventory.connections.length)
    throw new EvalFailure("ADMIN_PROCESS_INVENTORY_UNCONFIRMED", 2)
  return inventory as Record<string, unknown> & { connections: { directory: string; producerPid: number }[] }
}

export async function readAdminFinalization(file: { controller: { stateDir: string } }, identity: ServerIdentity, directory: string, producerPid: number) {
  const root = await lstat(directory).catch(() => undefined)
  if (path.dirname(directory) !== file.controller.stateDir || !/^admin-[a-zA-Z0-9_-]+$/.test(path.basename(directory)) ||
    !root?.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700 ||
    await realpath(directory).catch(() => undefined) !== directory) throw new EvalFailure("ADMIN_FINALIZATION_UNCONFIRMED", 2)
  const source = path.join(directory, "connection.json")
  const receipt = await readLeaseReceipt(source).catch(() => null)
  if (!jsonObject(receipt) || receipt.version !== 1 || receipt.kind !== "loginom-admin-connection" ||
    JSON.stringify(receipt.identity) !== JSON.stringify(identity) || receipt.status !== "disposed" || receipt.initialization !== "confirmed" ||
    receipt.dispose !== "confirmed" || receipt.transportDisconnect !== "confirmed" || !jsonObject(receipt.finalization) ||
    !jsonObject(receipt.finalization.reply) || !jsonObject(receipt.finalization.command))
    throw new EvalFailure("ADMIN_FINALIZATION_UNCONFIRMED", 2)
  const processes = qualifyClosedProcessEvidence(receipt.processes, { owner: { kind: "admin", id: directory }, producerPid })
  if (!processes) throw new EvalFailure("ADMIN_FINALIZATION_UNCONFIRMED", 2)
  const reply = receipt.finalization.reply, command = receipt.finalization.command
  if (reply.v !== 1 || reply.outcome !== "confirmed" || typeof reply.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(reply.id) ||
    !jsonObject(reply.data) || reply.data.disposed !== true || reply.data.transportDisconnect !== "confirmed" ||
    command.path !== path.join(directory, "commands", `${reply.id}.json`) || typeof command.sha256 !== "string")
    throw new EvalFailure("ADMIN_FINALIZATION_UNCONFIRMED", 2)
  const recorded = await readLeaseReceipt(command.path).catch(() => null)
  if (!jsonObject(recorded) || Object.keys(recorded).length !== 10 || recorded.version !== 1 || recorded.kind !== "loginom-admin-command" ||
    recorded.id !== reply.id || recorded.op !== "dispose" || recorded.state !== "confirmed" ||
    JSON.stringify(recorded.expectedIdentity) !== JSON.stringify(identity) ||
    recorded.desiredHash !== new Bun.CryptoHasher("sha256").update("{}").digest("hex") ||
    recorded.replyHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex") ||
    new Bun.CryptoHasher("sha256").update(JSON.stringify(recorded)).digest("hex") !== command.sha256 ||
    typeof recorded.at !== "string" || typeof recorded.settledAt !== "string" || !Number.isFinite(Date.parse(recorded.at)) ||
    !Number.isFinite(Date.parse(recorded.settledAt)) || Date.parse(recorded.at) > Date.parse(recorded.settledAt) ||
    Date.parse(recorded.at) < Date.parse(processes.startedAt) || Date.parse(recorded.settledAt) > Date.parse(processes.finishedAt))
    throw new EvalFailure("ADMIN_FINALIZATION_UNCONFIRMED", 2)
  return { status: "confirmed" as const, identity, transportDisconnect: "confirmed" as const, processes: "confirmed" as const,
    identities: processes.identities, source: { path: source, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(receipt)).digest("hex") } }
}

function adminReplyCode(reply: AdminReply) {
  return jsonObject(reply.data) && typeof reply.data.code === "string" && /^(ADMIN|SESSION|SERVER)_[A-Z_]{1,64}$/.test(reply.data.code)
    ? reply.data.code : "ADMIN_OPERATION_UNKNOWN"
}

function sharedPolicy(value: unknown): SharedDirectoryPolicy {
  if (!Array.isArray(value) || value.some(directory => !jsonObject(directory) || Object.keys(directory).length !== 3 ||
    typeof directory.objectId !== "string" || !directory.objectId || typeof directory.name !== "string" || !directory.name ||
    !Array.isArray(directory.permissions) || directory.permissions.some(principal => !jsonObject(principal) || Object.keys(principal).length !== 3 ||
      typeof principal.objectId !== "string" || !principal.objectId || typeof principal.name !== "string" || !principal.name ||
      ![0, 1, 2].includes(Number(principal.userKind)) || typeof principal.userKind !== "number"))) throw new EvalFailure("ADMIN_PROTOCOL", 2)
  return value as SharedDirectoryPolicy
}

function normalizedPolicy(policy: SharedDirectoryPolicy) {
  return policy.map(directory => ({ objectId: directory.objectId, name: directory.name,
    permissions: directory.permissions.map(principal => ({ objectId: principal.objectId, name: principal.name, userKind: principal.userKind }))
      .sort((a, b) => a.objectId.localeCompare(b.objectId)) })).sort((a, b) => a.objectId.localeCompare(b.objectId))
}

export function createJournaledAdminChannel(input: ReadableStream<Uint8Array>, output: WritableStream<Uint8Array>, journalDir: string) {
  const channel = createAdminChannel(input, output)
  let sequence = Promise.resolve()
  let unresolved = false
  let reconciled = false
  return {
    request(input: unknown) {
      const result = sequence.then(async () => {
        const request = requireAdminRequest(input)
        if (unresolved && request.op !== "inspect" && request.op !== "confirm-session-absent" && request.op !== "dispose")
          return { v: 1 as const, id: request.id, outcome: "not_applied" as const, data: { code: "ADMIN_RECONCILIATION_REQUIRED" } }
        const info = await lstat(journalDir).catch(() => { throw new EvalFailure("ADMIN_JOURNAL_PRIVATE", 2) })
        if (!path.isAbsolute(journalDir) || await realpath(journalDir) !== journalDir || !info.isDirectory() || info.isSymbolicLink() ||
          info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700) throw new EvalFailure("ADMIN_JOURNAL_PRIVATE", 2)
        if (!reconciled) {
          unresolved = (await Promise.all((await readdir(journalDir)).map(async name => {
            if (!/^[a-zA-Z0-9_-]{1,128}\.json$/.test(name)) return true
            const row = await readLeaseReceipt(path.join(journalDir, name)).catch(() => { throw new EvalFailure("ADMIN_JOURNAL_INVALID", 2) })
            if (!jsonObject(row) || row.version !== 1 || row.kind !== "loginom-admin-command" || `${row.id}.json` !== name ||
              !["intent", "confirmed", "not_applied", "unknown"].includes(String(row.state)) ||
              Object.keys(row).length !== (row.state === "intent" ? 8 : 10) || typeof row.desiredHash !== "string" || !/^[a-f0-9]{64}$/.test(row.desiredHash) ||
              typeof row.at !== "string" || !Number.isFinite(Date.parse(row.at)) || row.state !== "intent" &&
              (typeof row.replyHash !== "string" || !/^[a-f0-9]{64}$/.test(row.replyHash) || typeof row.settledAt !== "string" || !Number.isFinite(Date.parse(row.settledAt))))
              throw new EvalFailure("ADMIN_JOURNAL_INVALID", 2)
            try { requireAdminRequest({ v: 1, id: row.id, op: row.op, expectedIdentity: row.expectedIdentity, deadline: 0, payload: null }) }
            catch { throw new EvalFailure("ADMIN_JOURNAL_INVALID", 2) }
            return row.state === "intent" || row.state === "unknown" || JSON.stringify(row.expectedIdentity) !== JSON.stringify(request.expectedIdentity)
          }))).some(Boolean)
          reconciled = true
        }
        if (unresolved && request.op !== "inspect" && request.op !== "confirm-session-absent" && request.op !== "dispose")
          return { v: 1 as const, id: request.id, outcome: "not_applied" as const, data: { code: "ADMIN_RECONCILIATION_REQUIRED" } }
        const file = path.join(journalDir, `${request.id}.json`)
        const journal = { version: 1, kind: "loginom-admin-command", id: request.id, op: request.op, expectedIdentity: request.expectedIdentity,
          desiredHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(request.payload)).digest("hex"), state: "intent", at: new Date().toISOString() }
        const handle = await open(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
          .catch((error: NodeJS.ErrnoException) => { throw new EvalFailure(error.code === "EEXIST" ? "ADMIN_COMMAND_REUSED" : "ADMIN_JOURNAL_UNAVAILABLE", 2) })
        try { await handle.writeFile(JSON.stringify(journal)); await handle.sync() }
        finally { await handle.close() }
        const directory = await open(journalDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
        try { await directory.sync() } finally { await directory.close() }
        const reply = await channel.request(request)
        unresolved ||= reply.outcome === "unknown"
        const settled = await (async () => {
          const current = await lstat(journalDir)
          if (current.dev !== info.dev || current.ino !== info.ino || current.isSymbolicLink() || current.uid !== info.uid ||
            (current.mode & 0o777) !== 0o700 || await realpath(journalDir) !== journalDir ||
            JSON.stringify(await readLeaseReceipt(file)) !== JSON.stringify(journal)) throw new EvalFailure("ADMIN_JOURNAL_UNAVAILABLE", 2)
          await writeLeaseReceipt(file, { ...journal, state: reply.outcome,
            replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex"), settledAt: new Date().toISOString() })
        })().then(() => true, () => false)
        if (!settled) {
          unresolved = true
          return { v: 1 as const, id: request.id, outcome: "unknown" as const, data: { code: "ADMIN_JOURNAL_UNAVAILABLE" } }
        }
        return reply
      })
      sequence = result.then(() => undefined, () => undefined)
      return result
    },
    end: channel.end,
    close: channel.close,
  }
}

export function createAdminChannel(input: ReadableStream<Uint8Array>, output: WritableStream<Uint8Array>) {
  const reader = input.getReader()
  const writer = output.getWriter()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const encoder = new TextEncoder()
  let buffer = ""
  let bufferBytes = 0
  let failed = false
  let sequence = Promise.resolve()
  let ended: Promise<void> | undefined
  const end = () => ended ??= writer.close()
  return {
    request(input: unknown) {
      const result = sequence.then(async (): Promise<AdminReply> => {
        const value = requireAdminRequest(input)
        const encoded = encoder.encode(JSON.stringify(value) + "\n")
        if (encoded.byteLength > frameLimit) throw new EvalFailure("ADMIN_REQUEST_INVALID", 2)
        if (failed) return { v: 1, id: value.id, outcome: "unknown", data: { code: "ADMIN_RECONCILIATION_REQUIRED" } }
        if (value.deadline <= Date.now()) return { v: 1, id: value.id, outcome: "not_applied", data: { code: "ADMIN_DEADLINE" } }
        const deadline = Promise.withResolvers<never>()
        const timer = setTimeout(() => deadline.reject(new EvalFailure("ADMIN_DEADLINE", 2)), value.deadline - Date.now())
        try {
          const reply = await Promise.race([(async () => {
            await writer.write(encoded)
            while (!buffer.includes("\n")) {
              const chunk = await reader.read()
              if (chunk.done) throw new EvalFailure("ADMIN_EOF", 2)
              bufferBytes += chunk.value.byteLength
              if (bufferBytes > frameLimit) throw new EvalFailure("ADMIN_FRAME_TOO_LARGE", 2)
              buffer += decoder.decode(chunk.value, { stream: true })
            }
            const end = buffer.indexOf("\n")
            const frame = buffer.slice(0, end)
            buffer = buffer.slice(end + 1)
            bufferBytes -= encoder.encode(frame + "\n").byteLength
            return JSON.parse(frame) as unknown
          })(), deadline.promise])
          if (!jsonObject(reply) || Object.keys(reply).length !== 4 || reply.v !== 1 || reply.id !== value.id || typeof reply.outcome !== "string" ||
            !["confirmed", "not_applied", "unknown"].includes(reply.outcome) || !Object.hasOwn(reply, "data"))
            throw new EvalFailure("ADMIN_PROTOCOL", 2)
          return reply as AdminReply
        } catch (error) {
          failed = true
          return { v: 1, id: value.id, outcome: "unknown", data: { code: error instanceof EvalFailure &&
            ["ADMIN_EOF", "ADMIN_DEADLINE", "ADMIN_FRAME_TOO_LARGE"].includes(error.message) ? error.message : "ADMIN_PROTOCOL" } }
        } finally { clearTimeout(timer) }
      })
      sequence = result.then(() => undefined, () => undefined)
      return result
    },
    end,
    async close() { await end(); await reader.cancel() },
  }
}

function requireAdminRequest(value: unknown): AdminRequest {
  if (!jsonObject(value) || Object.keys(value).length !== 6 || value.v !== 1 || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id) ||
    typeof value.op !== "string" || !["init", "inspect", "reconcile-user", "close-session", "confirm-session-absent", "dispose"].includes(value.op) ||
    typeof value.deadline !== "number" || !Number.isSafeInteger(value.deadline) || !Object.hasOwn(value, "payload") ||
    !jsonObject(value.expectedIdentity) || Object.keys(value.expectedIdentity).length !== 6)
    throw new EvalFailure("ADMIN_REQUEST_INVALID", 2)
  const identity = value.expectedIdentity
  if (["containerId", "serverEpoch", "studioContainerId", "configurationHash"].some(key => typeof identity[key] !== "string" || !/^[a-f0-9]{64}$/.test(identity[key])) ||
    ["startedAt", "studioStartedAt"].some(key => typeof identity[key] !== "string" || !Number.isFinite(Date.parse(identity[key]))))
    throw new EvalFailure("ADMIN_REQUEST_INVALID", 2)
  return value as AdminRequest
}

function jsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
