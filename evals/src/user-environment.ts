import path from "node:path"
import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"
import { parseSlots, type SlotFile, type SlotLease } from "./slots"

export async function stageUserPreparation(file: SlotFile, lease: SlotLease, desiredHash: string) {
  await lease.assertHeld()
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

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalFailure("USER_PREPARATION_UNCONFIRMED", 2)
  return value as Record<string, unknown>
}
