import path from "node:path"
import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { parseSlots, type SlotFile, type SlotLease } from "./slots"
import type { AdminReply } from "./loginom-admin"

export async function stageUserPreparation(file: SlotFile, lease: SlotLease, desiredHash: string) {
  await lease.assertHeld()
  if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
  const configured = parseSlots(file, 1).slots.find(slot => slot.id === lease.slot.id)
  if (!configured || Object.entries(configured).some(([key, value]) => lease.slot[key as keyof typeof configured] !== value) ||
    path.dirname(lease.receipt) !== file.controller.stateDir || !/^[0-9a-f]{64}$/.test(desiredHash))
    throw new EvalFailure("USER_PREPARATION_CONFLICT", 2)
  const root = await lstat(file.controller.stateDir)
  if (!root.isDirectory() || root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700 ||
    await realpath(file.controller.stateDir) !== file.controller.stateDir) throw new EvalFailure("USER_PREPARATION_PRIVATE", 2)
  const journal = path.join(file.controller.stateDir, `prepare-${lease.slot.id}.json`)
  const secretFile = path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)
  const existing = await lstat(journal).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("USER_PREPARATION_PRIVATE", 2)
  })
  if (!existing && await lstat(secretFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("USER_PREPARATION_PRIVATE", 2)
  })) throw new EvalFailure("USER_PREPARATION_CONFLICT", 2)
  const handle = await open(journal, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") return undefined
      throw new EvalFailure("USER_PREPARATION_PRIVATE", 2)
    })
  if (handle) {
    try {
      await handle.writeFile(JSON.stringify({ version: 2, kind: "user-preparation", nonce: crypto.randomUUID(),
        slotId: lease.slot.id, username: lease.slot.username, endpoint: file.server.url, identity: lease.identity,
        desiredHash, secretFile, state: "planned", secretHash: null }))
      await handle.sync()
    } finally { await handle.close() }
    const parent = await open(file.controller.stateDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try { await parent.sync() } finally { await parent.close() }
  }
  const intent = record(await readLeaseReceipt(journal).catch(() => { throw new EvalFailure("USER_PREPARATION_UNCONFIRMED", 2) }))
  if (intent.version !== 2 || intent.kind !== "user-preparation" || typeof intent.nonce !== "string" || !/^[0-9a-f-]{36}$/.test(intent.nonce) ||
    intent.slotId !== lease.slot.id || intent.username !== lease.slot.username || intent.endpoint !== file.server.url ||
    JSON.stringify(intent.identity) !== JSON.stringify(lease.identity) || intent.desiredHash !== desiredHash || intent.secretFile !== secretFile ||
    !["planned", "staged"].includes(String(intent.state))) throw new EvalFailure("USER_PREPARATION_CONFLICT", 2)
  const secret = await readLeaseReceipt(secretFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("USER_PREPARATION_PRIVATE", 2)
  })
  if (!secret && intent.state !== "planned") throw new EvalFailure("USER_PREPARATION_UNCONFIRMED", 2)
  if (!secret) await writeLeaseReceipt(secretFile, { username: lease.slot.username,
    password: "E-" + Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url") + "!" })
  const credential = record(secret ?? await readLeaseReceipt(secretFile))
  if (credential.username !== lease.slot.username || Object.keys(credential).length !== 2 ||
    typeof credential.password !== "string" || !credential.password || credential.password.includes("\0"))
    throw new EvalFailure("USER_PREPARATION_UNCONFIRMED", 2)
  const secretHash = new Bun.CryptoHasher("sha256").update(JSON.stringify(credential)).digest("hex")
  if (intent.state === "staged" && intent.secretHash !== secretHash) throw new EvalFailure("USER_PREPARATION_CONFLICT", 2)
  const staged = { version: 2, kind: "user-preparation", nonce: intent.nonce, slotId: lease.slot.id, username: lease.slot.username,
    endpoint: file.server.url, identity: lease.identity, desiredHash, secretFile, secretHash, state: "staged" }
  await lease.assertHeld()
  if (intent.state === "planned") await writeLeaseReceipt(journal, staged)
  return staged
}

export async function readUserPreparation(file: SlotFile, lease: SlotLease, secretFile: string) {
  await lease.assertHeld()
  const configured = parseSlots(file, 1).slots.find(slot => slot.id === lease.slot.id)
  if (!configured || Object.entries(configured).some(([key, value]) => lease.slot[key as keyof typeof configured] !== value) ||
    path.dirname(lease.receipt) !== file.controller.stateDir || secretFile !== path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`))
    throw new EvalFailure("USER_PREPARATION_CONFLICT", 2)
  const intent = record(await readLeaseReceipt(path.join(file.controller.stateDir, `prepare-${lease.slot.id}.json`))
    .catch(() => { throw new EvalFailure("USER_PREPARATION_UNCONFIRMED", 2) }))
  if (intent.version !== 2 || intent.kind !== "user-preparation" || typeof intent.nonce !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(intent.nonce) ||
    intent.slotId !== lease.slot.id || intent.username !== lease.slot.username || intent.endpoint !== file.server.url ||
    JSON.stringify(intent.identity) !== JSON.stringify(lease.identity) || intent.state !== "staged" || intent.secretFile !== secretFile ||
    typeof intent.desiredHash !== "string" || !/^[0-9a-f]{64}$/.test(intent.desiredHash)) throw new EvalFailure("USER_PREPARATION_CONFLICT", 2)
  const credential = record(await readLeaseReceipt(secretFile).catch(() => { throw new EvalFailure("USER_PREPARATION_UNCONFIRMED", 2) }))
  if (credential.username !== lease.slot.username || Object.keys(credential).length !== 2 || typeof credential.password !== "string" ||
    !credential.password || credential.password.includes("\0") ||
    intent.secretHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(credential)).digest("hex"))
    throw new EvalFailure("USER_PREPARATION_CONFLICT", 2)
  await lease.assertHeld()
  return { version: 2, kind: "user-preparation", nonce: intent.nonce, slotId: lease.slot.id, username: lease.slot.username,
    endpoint: file.server.url, identity: lease.identity, desiredHash: intent.desiredHash, secretFile, secretHash: intent.secretHash, state: "staged" }
}

export async function claimUserOwnership(file: SlotFile, lease: SlotLease, secretFile: string, commandFile: string, reply: AdminReply) {
  const prepared = await readUserPreparation(file, lease, secretFile)
  const owned = await ownershipFromCreation(file, lease, prepared, commandFile, reply)
  const target = path.join(file.controller.stateDir, `user-${lease.slot.id}.json`)
  await lease.assertHeld()
  const handle = await open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") return undefined
      throw new EvalFailure("USER_OWNERSHIP_UNCONFIRMED", 2)
    })
  if (handle) {
    try { await handle.writeFile(JSON.stringify(owned)); await handle.sync() }
    finally { await handle.close() }
    const parent = await open(file.controller.stateDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try { await parent.sync() } finally { await parent.close() }
  }
  const current = await readUserOwnership(file, lease, secretFile)
  if (JSON.stringify(current) !== JSON.stringify(owned)) throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
  return current
}

export async function readUserOwnership(file: SlotFile, lease: SlotLease, secretFile: string) {
  const prepared = await readUserPreparation(file, lease, secretFile)
  const value = record(await readLeaseReceipt(path.join(file.controller.stateDir, `user-${lease.slot.id}.json`))
    .catch(() => { throw new EvalFailure("USER_OWNERSHIP_UNCONFIRMED", 2) }))
  const source = record(value.source)
  if (typeof source.path !== "string" || typeof source.id !== "string") throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
  const owned = await ownershipFromCreation(file, lease, prepared, source.path, { v: 1, id: source.id, outcome: "confirmed",
    data: { created: true, user: { objectId: value.objectId, name: value.username, userKind: value.userKind, blocked: true } } })
  if (JSON.stringify(value) !== JSON.stringify(owned)) throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
  const activation = await lstat(path.join(file.controller.stateDir, `activation-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("USER_ACTIVATION_UNCONFIRMED", 2)
  })
  await lease.assertHeld()
  return { ...owned, everActivated: Boolean(activation) }
}

export async function stageUserActivation(file: SlotFile, lease: SlotLease, secretFile: string) {
  await lease.assertHeld()
  if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
  const existing = await readUserActivation(file, lease, secretFile)
  if (existing) return existing
  const prepared = await readUserPreparation(file, lease, secretFile)
  const owned = await readUserOwnership(file, lease, secretFile)
  const intent = userActivationIntent(prepared, owned, crypto.randomUUID())
  await lease.assertHeld()
  await writeLeaseReceipt(path.join(file.controller.stateDir, `activation-${lease.slot.id}.json`), intent)
  return intent
}

export async function readUserActivation(file: SlotFile, lease: SlotLease, secretFile: string) {
  const prepared = await readUserPreparation(file, lease, secretFile)
  const owned = await readUserOwnership(file, lease, secretFile)
  const saved = await readLeaseReceipt(path.join(file.controller.stateDir, `activation-${lease.slot.id}.json`)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("USER_ACTIVATION_UNCONFIRMED", 2)
  })
  if (saved === undefined) return undefined
  const existing = record(saved)
  if (typeof existing.nonce !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(existing.nonce))
    throw new EvalFailure("USER_ACTIVATION_CONFLICT", 2)
  const intent = userActivationIntent(prepared, owned, existing.nonce)
  if (Object.keys(existing).length !== Object.keys(intent).length || Object.entries(intent)
    .some(([key, value]) => JSON.stringify(existing[key]) !== JSON.stringify(value))) throw new EvalFailure("USER_ACTIVATION_CONFLICT", 2)
  await lease.assertHeld()
  return intent
}

function userActivationIntent(prepared: Awaited<ReturnType<typeof readUserPreparation>>, owned: Awaited<ReturnType<typeof readUserOwnership>>, nonce: string) {
  return { version: 2, kind: "user-activation-intent", nonce, slotId: prepared.slotId, username: prepared.username,
    preparationNonce: prepared.nonce, userKey: owned.userKey, objectId: owned.objectId, identity: prepared.identity,
    secretHash: prepared.secretHash, ownerSource: owned.source.sha256, state: "planned" }
}

export async function recordServerSession(file: SlotFile, lease: SlotLease, secretFile: string, commandFile: string, payload: unknown, reply: AdminReply) {
  const entry = await sessionFromProbe(file, lease, secretFile, commandFile, payload, reply)
  const target = path.join(file.controller.stateDir, `session-${reply.id}.json`)
  const existing = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("SESSION_SOURCE_UNCONFIRMED", 2)
  })
  if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) throw new EvalFailure("SESSION_IDENTITY_CHANGED", 2)
  await lease.assertHeld()
  if (!existing) await writeLeaseReceipt(target, entry)
  return entry
}

export async function readServerSession(file: SlotFile, lease: SlotLease, secretFile: string, proofId: string) {
  await lease.assertHeld()
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(proofId)) throw new EvalFailure("SESSION_SOURCE_UNCONFIRMED", 2)
  const entry = record(await readLeaseReceipt(path.join(file.controller.stateDir, `session-${proofId}.json`)))
  const source = record(entry.source)
  const observation = record(entry.observation)
  if (source.id !== proofId || typeof source.path !== "string") throw new EvalFailure("SESSION_SOURCE_UNCONFIRMED", 2)
  const expected = await sessionFromProbe(file, lease, secretFile, source.path, observation.payload, observation.reply as AdminReply)
  if (JSON.stringify(entry) !== JSON.stringify(expected)) throw new EvalFailure("SESSION_SOURCE_UNCONFIRMED", 2)
  const saved = await readLeaseReceipt(path.join(file.controller.stateDir, `session-${proofId}.closed.json`)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  })
  if (saved === undefined) return expected
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  const closed = record(saved)
  const closeSource = record(closed.source)
  if (typeof closeSource.path !== "string") throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  const closure = await sessionClosure(lease, expected, closeSource.path, closed.reply as AdminReply)
  if (JSON.stringify(closed) !== JSON.stringify(closure)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  return { ...expected, state: "closed", close: closure.source }
}

export async function recordServerSessionClosed(file: SlotFile, lease: SlotLease, secretFile: string, proofId: string, commandFile: string, reply: AdminReply) {
  const entry = await readServerSession(file, lease, secretFile, proofId)
  const closure = await sessionClosure(lease, entry, commandFile, reply)
  const target = path.join(file.controller.stateDir, `session-${proofId}.closed.json`)
  const existing = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  })
  if (existing && JSON.stringify(existing) !== JSON.stringify(closure)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  await lease.assertHeld()
  if (!existing) await writeLeaseReceipt(target, closure)
  return readServerSession(file, lease, secretFile, proofId)
}

async function sessionClosure(lease: SlotLease, entry: Awaited<ReturnType<typeof sessionFromProbe>>, commandFile: string, reply: AdminReply) {
  const data = record(reply.data)
  if (Object.keys(reply).length !== 4 || reply.v !== 1 || reply.outcome !== "confirmed" || !/^[a-zA-Z0-9_-]{1,128}$/.test(reply.id) ||
    !path.isAbsolute(commandFile) || path.resolve(commandFile) !== commandFile || path.dirname(commandFile) !== path.dirname(entry.source.path) ||
    path.basename(commandFile) !== `${reply.id}.json` || Object.keys(data).length !== 2 || data.closed !== true ||
    !["observed_absent", "rpc_closed"].includes(String(data.disposition))) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  const source = record(await readLeaseReceipt(commandFile))
  if (Object.keys(source).length !== 10 || source.version !== 1 || source.kind !== "loginom-admin-command" || source.id !== reply.id ||
    source.op !== "close-session" || source.state !== "confirmed" || JSON.stringify(source.expectedIdentity) !== JSON.stringify(lease.identity) ||
    source.desiredHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify({ proofId: entry.source.id, session: entry.binding })).digest("hex") ||
    source.replyHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex") ||
    typeof source.at !== "string" || typeof source.settledAt !== "string" || !Number.isFinite(Date.parse(source.at)) ||
    !Number.isFinite(Date.parse(source.settledAt)) || Date.parse(source.settledAt) < Date.parse(source.at)) throw new EvalFailure("SESSION_CLOSE_UNCONFIRMED", 2)
  await lease.assertHeld()
  return { version: 2, kind: "owned-server-session-close", slotId: lease.slot.id, identity: lease.identity,
    preparationNonce: entry.preparationNonce, binding: entry.binding, source: { path: commandFile, id: reply.id,
      sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(source)).digest("hex") }, reply }
}

async function sessionFromProbe(file: SlotFile, lease: SlotLease, secretFile: string, commandFile: string, payload: unknown, reply: AdminReply) {
  const prepared = await readUserPreparation(file, lease, secretFile)
  const owned = await readUserOwnership(file, lease, secretFile)
  if (!await readUserActivation(file, lease, secretFile)) throw new EvalFailure("SESSION_ADMISSION_UNCONFIRMED", 2)
  const request = record(payload)
  const owner = record(request.owned)
  const data = record(reply.data)
  const current = record(data.ownSession)
  const binding = record(data.binding)
  if (Object.keys(reply).length !== 4 || reply.v !== 1 || reply.outcome !== "confirmed" || !/^[a-zA-Z0-9_-]{1,128}$/.test(reply.id) ||
    !path.isAbsolute(commandFile) || path.resolve(commandFile) !== commandFile || !commandFile.startsWith(file.controller.stateDir + path.sep) ||
    path.basename(commandFile) !== `${reply.id}.json` || Object.keys(request).length !== 8 ||
    !["session-probe", "session-crash-probe"].includes(String(request.phase)) || JSON.stringify(request.slot) !== JSON.stringify(lease.slot) ||
    request.secretFile !== secretFile || request.preparationNonce !== prepared.nonce || request.desiredHash !== prepared.desiredHash ||
    request.secretHash !== prepared.secretHash || Object.keys(owner).length !== 5 || owner.objectId !== owned.objectId ||
    owner.name !== owned.username || owner.userKind !== 0 || owner.preparationNonce !== prepared.nonce || owner.secretHash !== prepared.secretHash ||
    !Array.isArray(request.expectedPolicy) || Object.keys(data).length !== 8 || data.sessionIdentityQualified !== false ||
    Object.keys(current).length !== 6 || typeof current.guid !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(current.guid) ||
    typeof current.objectId !== "string" || !current.objectId || current.userObjectId !== owned.objectId || current.username !== owned.username ||
    current.isAdmin !== false || current.isDesigner !== true || Object.keys(binding).length !== 6 ||
    typeof binding.remoteKey !== "string" || !binding.remoteKey || binding.userKey !== owned.userKey || binding.username !== owned.username ||
    binding.serverEpoch !== lease.identity.serverEpoch || typeof binding.name !== "string" || !binding.name.startsWith(owned.username + ":") ||
    !/^[1-9]\d*$/.test(binding.name.slice(owned.username.length + 1)) || typeof binding.createdAt !== "string" || !Number.isFinite(Date.parse(binding.createdAt)))
    throw new EvalFailure("SESSION_IDENTITY_CHANGED", 2)
  const rows = [data.baseline, data.opened, data.withPackage, data.afterPackage, data.afterDisconnect]
  if (rows.some(list => !Array.isArray(list) || list.some(value => {
    const row = record(value)
    return Object.keys(row).length !== 5 || typeof row.objectId !== "string" || !row.objectId || typeof row.name !== "string" || !row.name ||
      typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt)) || typeof row.pendingDisconnect !== "boolean" ||
      !Number.isSafeInteger(row.packageCount) || Number(row.packageCount) < 0
  }))) throw new EvalFailure("SESSION_IDENTITY_CHANGED", 2)
  const baseline = data.baseline as Record<string, unknown>[]
  const opened = data.opened as Record<string, unknown>[]
  const created = opened.filter(row => !baseline.some(old => old.objectId === row.objectId))
  if (created.length !== 1 || created[0]!.objectId !== binding.remoteKey || created[0]!.name !== binding.name ||
    created[0]!.createdAt !== binding.createdAt || created[0]!.packageCount !== 0 ||
    [data.withPackage, data.afterPackage].some((list, index) => {
      const matches = (list as Record<string, unknown>[]).filter(row => row.objectId === binding.remoteKey)
      return matches.length !== 1 || matches[0]!.name !== binding.name || matches[0]!.createdAt !== binding.createdAt || matches[0]!.packageCount !== (index === 0 ? 1 : 0)
    })) throw new EvalFailure("SESSION_IDENTITY_AMBIGUOUS", 2)
  const source = record(await readLeaseReceipt(commandFile))
  if (Object.keys(source).length !== 10 || source.version !== 1 || source.kind !== "loginom-admin-command" || source.id !== reply.id ||
    source.op !== "reconcile-user" || source.state !== "confirmed" || JSON.stringify(source.expectedIdentity) !== JSON.stringify(lease.identity) ||
    source.desiredHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(payload)).digest("hex") ||
    source.replyHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex") ||
    typeof source.at !== "string" || typeof source.settledAt !== "string" || !Number.isFinite(Date.parse(source.at)) ||
    !Number.isFinite(Date.parse(source.settledAt)) || Date.parse(source.settledAt) < Date.parse(source.at)) throw new EvalFailure("SESSION_SOURCE_UNCONFIRMED", 2)
  const origin = record(await readLeaseReceipt(lease.receipt))
  if (origin.version !== 2 || origin.state !== "retained" || origin.token !== lease.token ||
    JSON.stringify(origin.slot) !== JSON.stringify(lease.slot) || JSON.stringify(origin.identity) !== JSON.stringify(lease.identity) ||
    typeof origin.commandId !== "string" || !origin.commandId) throw new EvalFailure("SESSION_ADMISSION_UNCONFIRMED", 2)
  const entry = { version: 2, kind: "owned-server-session", slotId: lease.slot.id, identity: lease.identity, preparationNonce: prepared.nonce,
    actor: { kind: "management", runId: origin.commandId, attemptId: null }, binding, sessionGuid: current.guid, state: "observed",
    source: { path: commandFile, id: reply.id, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(source)).digest("hex") },
    observation: { payload: request, reply } }
  return entry
}

async function ownershipFromCreation(file: SlotFile, lease: SlotLease, prepared: Awaited<ReturnType<typeof readUserPreparation>>, commandFile: string, reply: AdminReply) {
  const data = record(reply.data)
  const user = record(data.user)
  if (Object.keys(reply).length !== 4 || reply.v !== 1 || reply.outcome !== "confirmed" || !/^[a-zA-Z0-9_-]{1,128}$/.test(reply.id) ||
    path.basename(commandFile) !== `${reply.id}.json` || data.created !== true || Object.keys(data).length !== 2 || Object.keys(user).length !== 4 ||
    typeof user.objectId !== "string" || !user.objectId || user.name !== lease.slot.username || user.userKind !== 0 || user.blocked !== true ||
    !path.isAbsolute(commandFile) || !commandFile.startsWith(file.controller.stateDir + path.sep) || path.resolve(commandFile) !== commandFile)
    throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
  const source = record(await readLeaseReceipt(commandFile).catch(() => { throw new EvalFailure("USER_OWNERSHIP_UNCONFIRMED", 2) }))
  const payload = { phase: "blocked", slot: lease.slot, secretFile: prepared.secretFile, preparationNonce: prepared.nonce,
    desiredHash: prepared.desiredHash, secretHash: prepared.secretHash, owned: null }
  if (Object.keys(source).length !== 10 || source.version !== 1 || source.kind !== "loginom-admin-command" || source.id !== reply.id ||
    source.op !== "reconcile-user" || source.state !== "confirmed" || JSON.stringify(source.expectedIdentity) !== JSON.stringify(lease.identity) ||
    source.desiredHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(payload)).digest("hex") ||
    source.replyHash !== new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex") ||
    typeof source.at !== "string" || typeof source.settledAt !== "string" || !Number.isFinite(Date.parse(source.at)) ||
    !Number.isFinite(Date.parse(source.settledAt)) || Date.parse(source.settledAt) < Date.parse(source.at)) throw new EvalFailure("USER_OWNERSHIP_CONFLICT", 2)
  return { version: 2, kind: "owned-loginom-user", slotId: lease.slot.id, username: lease.slot.username, userKind: 0,
    preparationNonce: prepared.nonce, identity: lease.identity, userKey: new Bun.CryptoHasher("sha256")
      .update(JSON.stringify({ generation: prepared.nonce, name: lease.slot.username, userKind: 0 })).digest("hex"),
    objectId: user.objectId, everActivated: false, source: { path: commandFile, id: reply.id,
      sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(source)).digest("hex") } }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalFailure("USER_PREPARATION_UNCONFIRMED", 2)
  return value as Record<string, unknown>
}
