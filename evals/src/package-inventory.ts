import path from "node:path"
import { lstat, realpath } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { readLeaseReceipt } from "./lease"
import type { ServerIdentity } from "./slots"

type Collection = { objectId: string; name: string; sessionType: number; packageCount: number; packages: {
  objectId: string; name: string; path: string; readOnly: boolean; referenceCount: number;
  progress: null | { percent: number; startedAt: string } }[] }

/** Replays an immutable descriptor observation; this grants no ownership or cleanup. */
export async function readAdminPackageInventory(file: { controller: { stateDir: string } }, identity: ServerIdentity, source: { path: string; sha256: string }) {
  const directory = path.dirname(source.path)
  if (path.dirname(directory) !== file.controller.stateDir || !/^admin-[a-zA-Z0-9_-]+$/.test(path.basename(directory)) ||
    path.resolve(source.path) !== source.path || !/^[a-f0-9]{64}$/.test(source.sha256)) throw new EvalFailure("PACKAGE_INVENTORY_UNCONFIRMED", 2)
  const info = await lstat(directory).catch(() => undefined)
  if (!info?.isDirectory() || info.isSymbolicLink() ||
    info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700 || await realpath(directory).catch(() => undefined) !== directory)
    throw new EvalFailure("PACKAGE_INVENTORY_UNCONFIRMED", 2)
  const receipt = await readLeaseReceipt(source.path).catch(() => null)
  if (!object(receipt) || Object.keys(receipt).length !== 5 || receipt.version !== 2 || receipt.kind !== "admin-package-inventory" ||
    hash(receipt) !== source.sha256 || JSON.stringify(receipt.identity) !== JSON.stringify(identity) ||
    !object(receipt.command) || Object.keys(receipt.command).length !== 2 || !object(receipt.reply) || Object.keys(receipt.reply).length !== 4 ||
    receipt.reply.v !== 1 || receipt.reply.outcome !== "confirmed" || typeof receipt.reply.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(receipt.reply.id) ||
    path.basename(source.path) !== `package-inventory-${receipt.reply.id}.json` ||
    receipt.command.path !== path.join(directory, "commands", `${receipt.reply.id}.json`) || !object(receipt.reply.data) ||
    Object.keys(receipt.reply.data).length !== 2 || JSON.stringify(receipt.reply.data.identity) !== JSON.stringify(identity) || !Array.isArray(receipt.reply.data.collections) ||
    !receipt.reply.data.collections.every(collection) || new Set(receipt.reply.data.collections.map(value => value.objectId)).size !== receipt.reply.data.collections.length)
    throw new EvalFailure("PACKAGE_INVENTORY_UNCONFIRMED", 2)
  const command = await readLeaseReceipt(receipt.command.path).catch(() => null)
  if (!object(command) || Object.keys(command).length !== 10 || command.version !== 1 || command.kind !== "loginom-admin-command" ||
    hash(command) !== receipt.command.sha256 || command.id !== receipt.reply.id || command.op !== "inspect" || command.state !== "confirmed" ||
    JSON.stringify(command.expectedIdentity) !== JSON.stringify(identity) || command.desiredHash !== hash({ packages: true }) ||
    command.replyHash !== hash(receipt.reply) || typeof command.at !== "string" || !Number.isFinite(Date.parse(command.at)) ||
    typeof command.settledAt !== "string" || !Number.isFinite(Date.parse(command.settledAt)) || Date.parse(command.settledAt) < Date.parse(command.at))
    throw new EvalFailure("PACKAGE_INVENTORY_UNCONFIRMED", 2)
  if (hash(await readLeaseReceipt(source.path)) !== source.sha256 || hash(await readLeaseReceipt(receipt.command.path)) !== receipt.command.sha256)
    throw new EvalFailure("PACKAGE_INVENTORY_UNCONFIRMED", 2)
  return { identity, collections: receipt.reply.data.collections as Collection[], observation: { startedAt: command.at, finishedAt: command.settledAt }, source }
}

function collection(value: unknown): value is Collection {
  return object(value) && Object.keys(value).length === 5 && typeof value.objectId === "string" && Boolean(value.objectId) && typeof value.name === "string" &&
    Number.isSafeInteger(value.sessionType) && Number(value.sessionType) >= 0 && Number.isSafeInteger(value.packageCount) && Number(value.packageCount) >= 0 &&
    Array.isArray(value.packages) && value.packageCount === value.packages.length && value.packages.every(descriptor) &&
    new Set(value.packages.map(item => item.objectId)).size === value.packages.length
}

function descriptor(value: unknown): value is Collection["packages"][number] {
  return object(value) && Object.keys(value).length === 6 && typeof value.objectId === "string" && Boolean(value.objectId) &&
    typeof value.name === "string" && typeof value.path === "string" && typeof value.readOnly === "boolean" && Number.isSafeInteger(value.referenceCount) &&
    (value.progress === null || object(value.progress) && Object.keys(value.progress).length === 2 && Number.isFinite(value.progress.percent) &&
      typeof value.progress.startedAt === "string" && Number.isFinite(Date.parse(value.progress.startedAt)))
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
