import path from "node:path"
import { lstat, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { qualifyClosedProcessEvidence } from "./closed-process-evidence"
import { superviseProcess } from "./process-supervisor"
import type { ServerIdentity, SlotFile, SlotLease } from "./slots"
import type { acquireResourceLease } from "./lease"
import type { AdminConnection } from "./loginom-admin"

export type ManagementProcessEvidence = { file: string; lease: SlotLease; admin?: AdminConnection }
type InventoryInput = { file: string; journal: string; commandId: string; identity: ServerIdentity; leaseToken: string;
  slotId: string; profileDir: string; producerPid: number }
const active = new Set<string>()
const registrations = new Map<string, Promise<void>>()
const operations = new Set(["loginom setup", "loginom status", "loginom check", "loginom recover", "providers status"])

export async function superviseManagementProcess(input: Parameters<typeof superviseProcess>[0], evidence: ManagementProcessEvidence & { directory: string; operation: string[] }) {
  await evidence.lease.assertHeld()
  if (evidence.lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
  if (evidence.operation.length !== 2 || !operations.has(evidence.operation.join(" "))) throw new EvalFailure("MANAGEMENT_OPERATION_INVALID", 2)
  if (input.profileDir !== evidence.lease.slot.profileDir || path.dirname(evidence.file) !== path.dirname(evidence.lease.receipt) ||
    evidence.directory === input.profileDir || evidence.directory.startsWith(input.profileDir + path.sep)) throw new EvalFailure("MANAGEMENT_PROCESS_SCOPE_INVALID", 2)
  if (active.has(evidence.file)) throw new EvalFailure("MANAGEMENT_PROCESS_BUSY", 2)
  active.add(evidence.file)
  try {
    const origin = await readLeaseReceipt(evidence.lease.receipt)
    if (!object(origin) || typeof origin.journal !== "string" || typeof origin.commandId !== "string") throw new EvalFailure("MANAGEMENT_PROCESS_SCOPE_INVALID", 2)
    const command = await readLeaseReceipt(origin.journal)
    if (!object(command) || command.kind !== "unactivated-preparation" || command.phase !== "cli_admitted")
      throw new EvalFailure("MANAGEMENT_ADMISSION_UNCONFIRMED", 2)
    const expected = { file: evidence.file, journal: origin.journal, commandId: origin.commandId, identity: evidence.lease.identity,
      leaseToken: evidence.lease.token, slotId: evidence.lease.slot.id, profileDir: evidence.lease.slot.profileDir, producerPid: process.pid }
    const previous = await readManagementProcessInventory(expected)
    const inventory = await readInventory(expected)
    if (hash(inventory) !== previous.source.sha256) throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
    await privateDirectory(evidence.directory)
    await registerManagementInventory(expected, evidence.lease)
    const owner = { kind: "slot" as const, id: `${expected.commandId}:${expected.slotId}:${crypto.randomUUID()}` }
    if (evidence.admin && JSON.stringify(evidence.admin.identity) !== JSON.stringify(expected.identity)) throw new EvalFailure("MANAGEMENT_SESSION_SCOPE_INVALID", 2)
    const before = await evidence.admin?.inspectSessionInventory()
    const entry = { owner, directory: evidence.directory, operation: evidence.operation, state: "planned",
      ...(before ? { sessions: { before: before.source } } : {}) }
    await evidence.lease.assertHeld()
    await writeLeaseReceipt(evidence.file, { ...inventory, processes: [...inventory.processes, entry] })
    const state = { finished: false }
    const during: Awaited<ReturnType<AdminConnection["inspectSessionInventory"]>>[] = []
    const running = superviseProcess({ ...input, owner }).finally(() => { state.finished = true })
    const observed = (async () => {
      if (!before || !evidence.admin) return
      while (!state.finished) {
        during.push(await evidence.admin.inspectSessionInventory())
        await evidence.lease.assertHeld()
        await writeLeaseReceipt(evidence.file, { ...inventory, processes: [...inventory.processes, { ...entry,
          sessions: { before: before.source, during: during.map(snapshot => snapshot.source) } }] })
        if (!state.finished) await Bun.sleep(100)
      }
    })()
    const settled = await Promise.allSettled([running, observed])
    if (settled[0].status === "rejected") throw settled[0].reason
    const result = settled[0].value
    const proof = path.join(evidence.directory, "process-cleanup.json")
    await writeLeaseReceipt(proof, result.processCleanup)
    const parsed = await new Response(result.stdout).json().catch(() => null)
    const reply = object(parsed) ? { url: typeof parsed.url === "string" ? parsed.url : null, username: typeof parsed.username === "string" ? parsed.username : null,
      hasApiKey: typeof parsed.hasApiKey === "boolean" ? parsed.hasApiKey : null, ok: typeof parsed.ok === "boolean" ? parsed.ok : null,
      code: parsed.code === "LOGINOM_CONNECTION_VALID" ? parsed.code : null,
      browser: object(parsed.browser) && ["verified", "failed", "unknown"].includes(String(parsed.browser.state)) ? String(parsed.browser.state) : "unknown" } : null
    const completed = { version: 2, kind: "management-command-result", identity: expected.identity, commandId: expected.commandId,
      leaseToken: expected.leaseToken, slotId: expected.slotId, profileDir: expected.profileDir, owner, operation: evidence.operation,
      process: { path: proof, sha256: hash(result.processCleanup) }, exitCode: result.exitCode, timedOut: result.timedOut, interrupted: result.interrupted,
      stdoutSha256: new Bun.CryptoHasher("sha256").update(result.stdout).digest("hex"), reply }
    const resultFile = path.join(evidence.directory, "management-result.json")
    await writeLeaseReceipt(resultFile, completed)
    await evidence.lease.assertHeld()
    const qualified = qualifyClosedProcessEvidence(result.processCleanup, { owner, producerPid: process.pid })
    const after = qualified && settled[1].status === "fulfilled" ? await evidence.admin?.inspectSessionInventory() : undefined
    const snapshots = qualified ? during.filter(snapshot => Date.parse(snapshot.observation.startedAt) <= Date.parse(qualified.finishedAt) &&
      Date.parse(snapshot.observation.finishedAt) >= Date.parse(qualified.startedAt)) : during
    await writeLeaseReceipt(evidence.file, { ...inventory, processes: [...inventory.processes, { ...entry,
      state: qualified && settled[1].status === "fulfilled" ? "confirmed" : "unconfirmed", proof: { path: proof, sha256: hash(result.processCleanup) },
      result: { path: resultFile, sha256: hash(completed) },
      ...(before ? { sessions: { before: before.source, during: snapshots.map(snapshot => snapshot.source), ...(after ? { after: after.source } : {}) } } : {}) }] })
    if (!qualified) throw new EvalFailure("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED", 2)
    if (settled[1].status === "rejected") throw new EvalFailure("MANAGEMENT_SESSION_OBSERVATION_UNCONFIRMED", 2)
    return result
  } finally { active.delete(evidence.file) }
}

async function registerManagementInventory(input: InventoryInput, lease: SlotLease) {
  return withManagementInventoryWrite(input.journal, async () => {
    const command = await readLeaseReceipt(input.journal)
    if (!object(command) || command.kind !== "unactivated-preparation" || command.phase !== "cli_admitted" || command.commandId !== input.commandId ||
      JSON.stringify(command.identity) !== JSON.stringify(input.identity)) throw new EvalFailure("MANAGEMENT_ADMISSION_UNCONFIRMED", 2)
    const registered = managementBindings(command.managementInventories, path.dirname(input.file))
    const entry = { file: input.file, leaseToken: input.leaseToken, slotId: input.slotId, profileDir: input.profileDir }
    if (await lstat(`${input.file}.sealed.json`).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error }))
      throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_SEALED", 2)
    const existing = registered.find(candidate => candidate.slotId === input.slotId)
    if (existing && JSON.stringify(existing) !== JSON.stringify(entry) || registered.some(candidate => candidate.slotId !== input.slotId &&
      (candidate.file === input.file || candidate.profileDir === input.profileDir || candidate.leaseToken === input.leaseToken)))
      throw new EvalFailure("MANAGEMENT_INVENTORY_CONFLICT", 2)
    await lease.assertHeld()
    if (JSON.stringify(await readLeaseReceipt(input.journal)) !== JSON.stringify(command)) throw new EvalFailure("MANAGEMENT_INVENTORY_CONFLICT", 2)
    if (!existing) await writeLeaseReceipt(input.journal, { ...command, managementInventories: [...registered, entry] })
  })
}

/** Freezes one slot's producers; peers retain their admission and no cleanup rights are granted. */
export async function sealManagementProcessInventory(file: SlotFile, server: Awaited<ReturnType<typeof acquireResourceLease>>, lease: SlotLease, inventoryFile: string) {
  return withManagementInventoryWrite(server.reservation.journal, async () => {
    await server.assertHeld()
    await lease.assertHeld()
    const journal = server.reservation.journal, identity = server.reservation.identity
    const origin = await readLeaseReceipt(lease.receipt), command = await readLeaseReceipt(journal)
    if (!identity || server.reservation.state !== "retained" || server.reservation.owner.pid !== process.pid ||
      server.reservation.key !== `server:${identity.containerId}` || lease.recoveryOnly || JSON.stringify(lease.identity) !== JSON.stringify(identity) ||
      !object(origin) || origin.journal !== journal || origin.commandId !== server.reservation.commandId ||
      !object(command) || command.version !== 2 || command.kind !== "unactivated-preparation" || command.phase !== "cli_admitted" ||
      command.commandId !== server.reservation.commandId || JSON.stringify(command.identity) !== JSON.stringify(identity) ||
      !Array.isArray(command.slotIds) || !command.slotIds.includes(lease.slot.id) || path.dirname(inventoryFile) !== file.controller.stateDir ||
      !file.slots.some(slot => JSON.stringify(slot) === JSON.stringify(lease.slot))) throw new EvalFailure("MANAGEMENT_ADMISSION_UNCONFIRMED", 2)
    const binding = managementBindings(command.managementInventories, file.controller.stateDir).find(entry => entry.slotId === lease.slot.id)
    if (!binding || binding.file !== inventoryFile || binding.leaseToken !== lease.token || binding.profileDir !== lease.slot.profileDir)
      throw new EvalFailure("MANAGEMENT_INVENTORY_CONFLICT", 2)
    if (active.has(inventoryFile)) throw new EvalFailure("MANAGEMENT_PROCESS_BUSY", 2)
    const inventory = await readManagementProcessInventory({ ...binding, journal, commandId: command.commandId, identity, producerPid: process.pid })
    const receipt = { version: 2, kind: "management-process-seal", journal, commandId: command.commandId, identity,
      leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, inventory: inventory.source }
    const target = `${inventoryFile}.sealed.json`
    const existing = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error })
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(receipt)) throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
    await server.assertHeld()
    await lease.assertHeld()
    if (active.has(inventoryFile)) throw new EvalFailure("MANAGEMENT_PROCESS_BUSY", 2)
    if (hash(await readLeaseReceipt(inventoryFile)) !== inventory.source.sha256 || hash(await readLeaseReceipt(journal)) !== hash(command))
      throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
    if (existing === undefined) await writeLeaseReceipt(target, receipt)
    return { status: "sealed" as const, inventory: inventory.source, source: { path: target, sha256: hash(receipt) } }
  })
}

/** Called under the admin inventory lock; closes producer admission, without granting cleanup or release. */
export async function sealManagementProcessInventories(file: SlotFile, server: Awaited<ReturnType<typeof acquireResourceLease>>, slots: SlotLease[], expectedHash: string) {
  return withManagementInventoryWrite(server.reservation.journal, async () => {
    await server.assertHeld()
    const journal = server.reservation.journal, identity = server.reservation.identity
    const command = await readLeaseReceipt(journal)
    if (!identity || server.reservation.state !== "retained" || server.reservation.owner.pid !== process.pid ||
      server.reservation.key !== `server:${identity.containerId}` || !object(command) || command.version !== 2 ||
      command.kind !== "unactivated-preparation" || command.phase !== "cli_admitted" || command.commandId !== server.reservation.commandId ||
      JSON.stringify(command.identity) !== JSON.stringify(identity) || hash(command) !== expectedHash || !slots.length ||
      JSON.stringify(command.slotIds) !== JSON.stringify(slots.map(lease => lease.slot.id)) || new Set(slots.map(lease => lease.slot.id)).size !== slots.length)
      throw new EvalFailure("MANAGEMENT_ADMISSION_UNCONFIRMED", 2)
    const bindings = managementBindings(command.managementInventories, file.controller.stateDir)
    if (bindings.some(entry => !slots.some(lease => lease.slot.id === entry.slotId && lease.token === entry.leaseToken && lease.slot.profileDir === entry.profileDir)))
      throw new EvalFailure("MANAGEMENT_INVENTORY_CONFLICT", 2)
    const sources = []
    for (const lease of slots) {
      await lease.assertHeld()
      const origin = await readLeaseReceipt(lease.receipt)
      if (lease.recoveryOnly || JSON.stringify(lease.identity) !== JSON.stringify(identity) || !object(origin) || origin.journal !== journal ||
        origin.commandId !== command.commandId || !file.slots.some(slot => JSON.stringify(slot) === JSON.stringify(lease.slot)))
        throw new EvalFailure("MANAGEMENT_ADMISSION_UNCONFIRMED", 2)
      const entry = bindings.find(entry => entry.slotId === lease.slot.id)
      if (!entry) continue
      if (active.has(entry.file)) throw new EvalFailure("MANAGEMENT_PROCESS_BUSY", 2)
      const inventory = await readManagementProcessInventory({ ...entry, journal, commandId: server.reservation.commandId, identity, producerPid: process.pid })
      if (new Set(inventory.processes.map(process => process.owner.id)).size !== inventory.processes.length ||
        new Set(inventory.processes.map(process => process.source.path)).size !== inventory.processes.length)
        throw new EvalFailure("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED", 2)
      sources.push(inventory.source)
    }
    for (const source of sources) {
      if (hash(await readLeaseReceipt(source.path)) !== source.sha256) throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
    }
    if (bindings.some(entry => active.has(entry.file))) throw new EvalFailure("MANAGEMENT_PROCESS_BUSY", 2)
    await server.assertHeld()
    await Promise.all(slots.map(lease => lease.assertHeld()))
    if (hash(await readLeaseReceipt(journal)) !== expectedHash) throw new EvalFailure("MANAGEMENT_INVENTORY_CONFLICT", 2)
    const sealed = { ...command, phase: "finalizing", managementSources: sources }
    await writeLeaseReceipt(journal, sealed)
    return sealed
  })
}

function managementBindings(value: unknown, directory: string) {
  const saved = value === undefined ? [] : value
  if (!Array.isArray(saved)) throw new EvalFailure("MANAGEMENT_INVENTORY_CONFLICT", 2)
  const entries = saved.map((entry: unknown) => {
    if (!object(entry) || Object.keys(entry).length !== 4 || typeof entry.file !== "string" || path.resolve(entry.file) !== entry.file ||
      path.dirname(entry.file) !== directory || typeof entry.slotId !== "string" || !entry.slotId || typeof entry.leaseToken !== "string" || !entry.leaseToken ||
      typeof entry.profileDir !== "string" || !path.isAbsolute(entry.profileDir) || path.resolve(entry.profileDir) !== entry.profileDir)
      throw new EvalFailure("MANAGEMENT_INVENTORY_CONFLICT", 2)
    return { file: entry.file, leaseToken: entry.leaseToken, slotId: entry.slotId, profileDir: entry.profileDir }
  })
  if (["file", "slotId", "leaseToken", "profileDir"].some(key => new Set(entries.map(entry => entry[key as keyof typeof entry])).size !== entries.length))
    throw new EvalFailure("MANAGEMENT_INVENTORY_CONFLICT", 2)
  return entries
}

async function withManagementInventoryWrite<T>(journal: string, callback: () => Promise<T>) {
  const pending = (registrations.get(journal) ?? Promise.resolve()).then(callback)
  const settled = pending.then(() => {}, () => {})
  registrations.set(journal, settled)
  try { return await pending } finally { if (registrations.get(journal) === settled) registrations.delete(journal) }
}

export async function readManagementProcessInventory(input: InventoryInput) {
  const inventory = await readInventory(input)
  const processes = []
  for (const entry of inventory.processes) processes.push(await readManagementProcess(input, entry))
  if (JSON.stringify(await readInventory(input)) !== JSON.stringify(inventory)) throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
  const source = { path: input.file, sha256: hash(inventory) }
  const sealed = await readLeaseReceipt(`${input.file}.sealed.json`).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error })
  if (sealed !== undefined && JSON.stringify(sealed) !== JSON.stringify({ version: 2, kind: "management-process-seal", journal: input.journal,
    commandId: input.commandId, identity: input.identity, leaseToken: input.leaseToken, slotId: input.slotId, profileDir: input.profileDir, inventory: source }))
    throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_CHANGED", 2)
  return { processes, source }
}

export async function readManagementProcess(input: InventoryInput, entry: unknown) {
  if (!object(entry) || Object.keys(entry).length !== 5 + Number(entry.sessions !== undefined) + Number(entry.result !== undefined) || entry.state !== "confirmed" || !object(entry.owner) || entry.owner.kind !== "slot" ||
    typeof entry.owner.id !== "string" || !entry.owner.id.startsWith(`${input.commandId}:${input.slotId}:`) || typeof entry.directory !== "string" ||
    !Array.isArray(entry.operation) || entry.operation.length !== 2 || !entry.operation.every(value => typeof value === "string") ||
    !operations.has(entry.operation.join(" ")) || !object(entry.proof) ||
    entry.proof.path !== path.join(entry.directory, "process-cleanup.json") || typeof entry.proof.sha256 !== "string")
    throw new EvalFailure("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED", 2)
  await privateDirectory(entry.directory)
  const proof = await readLeaseReceipt(entry.proof.path).catch(() => null)
  const qualified = qualifyClosedProcessEvidence(proof, { owner: { kind: "slot", id: entry.owner.id }, producerPid: input.producerPid })
  if (!qualified || hash(proof) !== entry.proof.sha256) throw new EvalFailure("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED", 2)
  const sessions = entry.sessions === undefined ? undefined : await readManagementSessions(input, entry.sessions, qualified)
  const result = entry.result === undefined ? undefined : await readManagementResult(input, entry)
  return { owner: qualified.owner, operation: entry.operation, launcher: qualified.launcher, identities: qualified.identities,
    startedAt: qualified.startedAt, finishedAt: qualified.finishedAt,
    source: { path: entry.proof.path, sha256: entry.proof.sha256 }, ...(sessions ? { sessions } : {}), ...(result ? { result } : {}) }
}

async function readManagementResult(input: InventoryInput, entry: Record<string, unknown>) {
  if (!object(entry.result) || Object.keys(entry.result).length !== 2 || entry.result.path !== path.join(String(entry.directory), "management-result.json"))
    throw new EvalFailure("MANAGEMENT_RESULT_UNCONFIRMED", 2)
  const value = await readLeaseReceipt(String(entry.result.path)).catch(() => null)
  if (!object(value) || Object.keys(value).length !== 15 || value.version !== 2 || value.kind !== "management-command-result" ||
    hash(value) !== entry.result.sha256 || JSON.stringify(value.identity) !== JSON.stringify(input.identity) || value.commandId !== input.commandId ||
    value.leaseToken !== input.leaseToken || value.slotId !== input.slotId || value.profileDir !== input.profileDir ||
    JSON.stringify(value.owner) !== JSON.stringify(entry.owner) || JSON.stringify(value.operation) !== JSON.stringify(entry.operation) ||
    JSON.stringify(value.process) !== JSON.stringify(entry.proof) || !Number.isSafeInteger(value.exitCode) || typeof value.timedOut !== "boolean" ||
    typeof value.interrupted !== "boolean" || typeof value.stdoutSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.stdoutSha256) ||
    value.reply !== null && (!object(value.reply) || Object.keys(value.reply).length !== 6 ||
      [value.reply.url, value.reply.username].some(value => value !== null && typeof value !== "string") ||
      [value.reply.hasApiKey, value.reply.ok].some(value => value !== null && typeof value !== "boolean") ||
      value.reply.code !== null && value.reply.code !== "LOGINOM_CONNECTION_VALID" || !["verified", "failed", "unknown"].includes(String(value.reply.browser))))
    throw new EvalFailure("MANAGEMENT_RESULT_UNCONFIRMED", 2)
  return { exitCode: value.exitCode as number, timedOut: value.timedOut, interrupted: value.interrupted, stdoutSha256: value.stdoutSha256,
    reply: value.reply as Record<string, unknown> | null, source: { path: String(entry.result.path), sha256: String(entry.result.sha256) } }
}

async function readManagementSessions(input: InventoryInput, value: unknown, window: { startedAt: string; finishedAt: string }) {
  if (!object(value) || Object.keys(value).length !== (value.during === undefined ? 2 : 3) || value.during !== undefined && !Array.isArray(value.during))
    throw new EvalFailure("MANAGEMENT_SESSION_SCOPE_INVALID", 2)
  const { readAdminSessionInventory } = await import("./loginom-admin")
  const snapshots = await Promise.all([value.before, value.after, ...(value.during as unknown[] ?? [])].map(source => {
    if (!object(source) || Object.keys(source).length !== 2 || typeof source.path !== "string" || typeof source.sha256 !== "string")
      throw new EvalFailure("MANAGEMENT_SESSION_SCOPE_INVALID", 2)
    return readAdminSessionInventory({ controller: { stateDir: path.dirname(input.file) } }, input.identity, { path: source.path, sha256: source.sha256 })
  }))
  const before = snapshots[0]!, after = snapshots[1]!
  if (before.source.path === after.source.path || Date.parse(before.observation.finishedAt) > Date.parse(window.startedAt) ||
    Date.parse(after.observation.startedAt) < Date.parse(window.finishedAt) ||
    new Set(snapshots.map(snapshot => snapshot.source.path)).size !== snapshots.length || snapshots.slice(2).some(snapshot =>
      Date.parse(snapshot.observation.startedAt) > Date.parse(window.finishedAt) || Date.parse(snapshot.observation.finishedAt) < Date.parse(window.startedAt)))
    throw new EvalFailure("MANAGEMENT_SESSION_SCOPE_INVALID", 2)
  return { before, during: snapshots.slice(2), after }
}

async function readInventory(input: InventoryInput) {
  await privateDirectory(path.dirname(input.file))
  const inventory = await readLeaseReceipt(input.file).catch(() => null), command = await readLeaseReceipt(input.journal).catch(() => null)
  const expected = { version: 2, kind: "management-processes", commandId: input.commandId, journal: input.journal, identity: input.identity,
    leaseToken: input.leaseToken, slotId: input.slotId, profileDir: input.profileDir }
  if (!object(inventory) || Object.keys(inventory).length !== 9 || !Array.isArray(inventory.processes) ||
    !object(command) || command.commandId !== input.commandId || JSON.stringify(command.identity) !== JSON.stringify(input.identity) ||
    Object.entries(expected).some(([key, value]) => JSON.stringify(inventory[key]) !== JSON.stringify(value)))
    throw new EvalFailure("MANAGEMENT_PROCESS_INVENTORY_UNCONFIRMED", 2)
  return inventory as Record<string, unknown> & { processes: unknown[] }
}

async function privateDirectory(directory: string) {
  const root = await lstat(directory).catch(() => undefined)
  if (!path.isAbsolute(directory) || await realpath(directory).catch(() => undefined) !== directory || !root?.isDirectory() || root.isSymbolicLink() ||
    root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700) throw new EvalFailure("MANAGEMENT_PROCESS_PRIVATE", 2)
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
