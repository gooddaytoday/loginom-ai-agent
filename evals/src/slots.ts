import path from "node:path"
import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { globalLockRoot } from "./lease"

export type SlotDefinition = {
  id: string
  username: string
  profileDir: string
  workspaceRoot: string
  historyDir: string
}

export type ServerIdentity = {
  containerId: string
  startedAt: string
  serverEpoch: string
  studioContainerId: string
  studioStartedAt: string
  configurationHash: string
}

export type SlotLease = {
  slot: SlotDefinition
  identity: ServerIdentity
  receipt: string
  token: string
  assertHeld(): Promise<void>
  close(): Promise<void>
  release(cleanupReceipt: string): Promise<void>
}

export type SlotFile = {
  version: 2
  server: { container: string; studioContainer: string; url: string; network: string; alias: string; storageRoot: string; backupRoot: string }
  controller: { stateDir: string; adminCredentialsFile: string }
  auth?: { sharedDir: string }
  judge: { codexHome: string }
  slots: SlotDefinition[]
}

export function parseSlots(value: unknown, parallel: number): SlotFile {
  const input = record(value)
  if (input.version !== 2) throw new EvalFailure("SLOTS_VERSION", 2)
  if (!Array.isArray(input.slots) || !Number.isSafeInteger(parallel) || parallel < 1 || parallel > input.slots.length)
    throw new EvalFailure("SLOT_COUNT", 2)
  const server = record(input.server)
  const controller = record(input.controller)
  const judge = record(input.judge)
  const file: SlotFile = {
    version: 2,
    server: {
      container: text(server.container), studioContainer: text(server.studioContainer), url: text(server.url),
      network: text(server.network), alias: text(server.alias), storageRoot: text(server.storageRoot), backupRoot: text(server.backupRoot),
    },
    controller: { stateDir: text(controller.stateDir), adminCredentialsFile: text(controller.adminCredentialsFile) },
    judge: { codexHome: text(judge.codexHome) },
    ...(input.auth === undefined ? {} : { auth: { sharedDir: text(record(input.auth).sharedDir) } }),
    slots: input.slots.map(value => {
      const slot = record(value)
      return { id: identifier(slot.id), username: identifier(slot.username), profileDir: text(slot.profileDir), workspaceRoot: text(slot.workspaceRoot), historyDir: text(slot.historyDir) }
    }),
  }
  if (file.server.storageRoot !== "/workdir/UserStorage" || file.server.backupRoot !== "/workdir/SessionBackup")
    throw new EvalFailure("SLOTS_SERVER_ROOTS", 2)
  const url = URL.parse(file.server.url)
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || url.search)
    throw new EvalFailure("SLOTS_SERVER_URL", 2)
  if (new Set(file.slots.map(slot => slot.id)).size !== file.slots.length)
    throw new EvalFailure("SLOT_ID_DUPLICATE", 2)
  if (new Set(file.slots.map(slot => slot.username)).size !== file.slots.length)
    throw new EvalFailure("SLOT_USER_DUPLICATE", 2)
  validatePaths(file)
  return file
}

export async function loadSlots(file: string, parallel: number, installRoot?: string): Promise<SlotFile> {
  const input = await readSlotFile(file, parallel)
  const canonical = await canonicalSlots(input)
  validatePaths(canonical, [await canonicalPath(path.resolve(file)), ...(installRoot ? [await canonicalPath(path.resolve(installRoot))] : [])])
  await requirePrivatePath(input.controller.adminCredentialsFile, true)
  await Promise.all([input.controller.stateDir, input.judge.codexHome, ...(input.auth ? [input.auth.sharedDir] : []),
    ...input.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])].map(value => requirePrivatePath(value, false)))
  await Promise.all([canonical.controller.stateDir, canonical.judge.codexHome,
    ...(canonical.auth ? [canonical.auth.sharedDir] : []), ...canonical.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])]
    .map(value => requirePrivatePath(value, false)))
  await requirePrivatePath(canonical.controller.adminCredentialsFile, true)
  return canonical
}

export async function loadJudgeEnvironment(file: string) {
  const input = await readSlotFile(file, 1)
  const canonical = await canonicalSlots(input)
  validatePaths(canonical, [await canonicalPath(path.resolve(file))])
  await Promise.all([input.controller.stateDir, input.judge.codexHome, canonical.controller.stateDir, canonical.judge.codexHome]
    .map(value => requirePrivatePath(value, false)))
  return { codexHome: canonical.judge.codexHome, stateDir: canonical.controller.stateDir }
}

// Resource observation reads configuration metadata; it never admits users or reads their credentials.
export async function loadResourceSlots(file: string) {
  const input = await readSlotFile(file, 1)
  const canonical = await canonicalSlots(input)
  validatePaths(canonical, [await canonicalPath(path.resolve(file))])
  await Promise.all([input.controller.stateDir, canonical.controller.stateDir].map(value => requirePrivatePath(value, false)))
  return canonical
}

export async function acquireSlotLease(file: SlotFile, slot: SlotDefinition, identity: ServerIdentity, lockRoot: string): Promise<SlotLease> {
  if (!file.slots.some(candidate => candidate.id === slot.id && candidate.username === slot.username && candidate.profileDir === slot.profileDir &&
    candidate.workspaceRoot === slot.workspaceRoot && candidate.historyDir === slot.historyDir)) throw new EvalFailure("SLOT_NOT_CONFIGURED", 2)
  const { acquireResourceLease, readLeaseReceipt, writeLeaseReceipt } = await import("./lease")
  const journal = path.join(file.controller.stateDir, "run-journal.json")
  const commandId = text(record(await Bun.file(journal).json()).commandId)
  const resources = [] as Awaited<ReturnType<typeof acquireResourceLease>>[]
  try {
    for (const key of [`user:${identity.containerId}:${slot.username}:0`, `profile:${await canonicalPath(slot.profileDir)}`].sort())
      resources.push(await acquireResourceLease({ key, lockRoot, journal, commandId, identity }))
    const token = crypto.randomUUID()
    const receipt = path.join(file.controller.stateDir, `slot-${slot.id}-${token}.lease.json`)
    const manifest = { version: 2, token, slot, identity, commandId, resources: resources.map(resource => ({ receipt: resource.receipt,
      key: resource.reservation.key, token: resource.reservation.token, revision: resource.reservation.revision })) }
    await writeLeaseReceipt(receipt, { ...manifest, state: "retained" })
    return { slot, identity, receipt, token, async assertHeld() { await Promise.all(resources.map(resource => resource.assertHeld())) },
      async close() { await Promise.all(resources.map(resource => resource.close())) }, async release(cleanupReceipt: string) {
      const evidence = record(await readLeaseReceipt(cleanupReceipt))
      if (evidence.status !== "confirmed" || evidence.slotId !== slot.id || evidence.leaseToken !== token || evidence.serverEpoch !== identity.serverEpoch ||
        evidence.processes !== "confirmed" || evidence.serverSessions !== "confirmed" || evidence.archive !== "committed" ||
        evidence.storageDeletionAllowed !== true || evidence.nextAdmissionAllowed !== true) throw new EvalFailure("SLOT_RELEASE_UNCONFIRMED", 2)
      for (const resource of resources) {
        const proof = `${receipt}.${new Bun.CryptoHasher("sha256").update(resource.reservation.key).digest("hex")}.released.json`
        await writeLeaseReceipt(proof, { version: 2, status: "confirmed", key: resource.reservation.key, token: resource.reservation.token,
          revision: resource.reservation.revision, cleanupReceipt, serverEpoch: identity.serverEpoch })
        await resource.release(proof)
      }
      await writeLeaseReceipt(receipt, { ...manifest, state: "released", cleanupReceipt })
    } }
  } catch (error) {
    // No session, process or user storage has been admitted by this function.
    try {
      for (const resource of resources) {
        const proof = path.join(file.controller.stateDir, `unused-${resource.reservation.token}.json`)
        await writeLeaseReceipt(proof, { version: 2, status: "confirmed", reason: "not-used", key: resource.reservation.key,
          token: resource.reservation.token, revision: resource.reservation.revision, serverEpoch: identity.serverEpoch })
        await resource.release(proof)
      }
    } finally { await Promise.all(resources.map(resource => resource.close())) }
    throw error
  }
}

async function requirePrivatePath(value: string, file: boolean): Promise<void> {
  const info = await lstat(value).catch((error: NodeJS.ErrnoException) => {
    if (!file && error.code === "ENOENT") return undefined
    throw new EvalFailure("SLOT_PATH_PRIVATE", 2)
  })
  if (!info) return requirePrivatePath(path.dirname(value), false)
  if (info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== (file ? 0o600 : 0o700) ||
    (file ? !info.isFile() || info.nlink !== 1 : !info.isDirectory())) throw new EvalFailure("SLOT_PATH_PRIVATE", 2)
}

async function canonicalPath(value: string): Promise<string> {
  return realpath(value).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw new EvalFailure("SLOT_PATH_UNREADABLE", 2)
    return canonicalPath(path.dirname(value)).then(parent => path.join(parent, path.basename(value)))
  })
}

function validatePaths(file: SlotFile, protectedPaths: string[] = []) {
  const paths = [file.controller.stateDir, file.controller.adminCredentialsFile, file.judge.codexHome,
    ...(file.auth ? [file.auth.sharedDir] : []), ...file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir]), globalLockRoot, ...protectedPaths]
  if (paths.some(value => !path.isAbsolute(value))) throw new EvalFailure("SLOT_PATH_ABSOLUTE", 2)
  paths.map(value => path.resolve(value)).forEach((value, index, all) => {
    if (all.slice(index + 1).some(other => value === other || value.startsWith(other.endsWith(path.sep) ? other : other + path.sep) || other.startsWith(value.endsWith(path.sep) ? value : value + path.sep)))
      throw new EvalFailure("SLOT_PATH_OVERLAP", 2)
  })
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalFailure("SLOTS_SCHEMA", 2)
  return value as Record<string, unknown>
}

function text(value: unknown) {
  if (typeof value !== "string" || !value || value.includes("\0")) throw new EvalFailure("SLOTS_SCHEMA", 2)
  return value
}

function identifier(value: unknown) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(text(value))) throw new EvalFailure("SLOT_IDENTIFIER", 2)
  return text(value)
}

async function readSlotFile(file: string, parallel: number) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => {
    throw new EvalFailure("SLOTS_FILE_PRIVATE", 2)
  })
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600)
      throw new EvalFailure("SLOTS_FILE_PRIVATE", 2)
    return parseSlots(JSON.parse(await handle.readFile("utf8")), parallel)
  } catch (error) {
    if (error instanceof EvalFailure) throw error
    throw new EvalFailure("SLOTS_SCHEMA", 2)
  } finally { await handle.close() }
}

async function canonicalSlots(input: SlotFile): Promise<SlotFile> {
  return {
    ...input,
    controller: { stateDir: await canonicalPath(input.controller.stateDir), adminCredentialsFile: await canonicalPath(input.controller.adminCredentialsFile) },
    judge: { codexHome: await canonicalPath(input.judge.codexHome) },
    ...(input.auth ? { auth: { sharedDir: await canonicalPath(input.auth.sharedDir) } } : {}),
    slots: await Promise.all(input.slots.map(async slot => ({ ...slot,
      profileDir: await canonicalPath(slot.profileDir), workspaceRoot: await canonicalPath(slot.workspaceRoot), historyDir: await canonicalPath(slot.historyDir),
    }))),
  }
}
