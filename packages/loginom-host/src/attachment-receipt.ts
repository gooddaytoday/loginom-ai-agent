import { randomBytes } from "node:crypto"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"
import { inspectReferenceFile, type FileIdentity } from "./file-reference"
import { fileError, hostException } from "./errors"

// Native and backend processes share this private store. Renderer metadata is
// only an opaque lookup key; it cannot replace the original file fingerprint.
const root = join(homedir(), ".local", "state", "loginom-ai-agent", "attachment-receipts-v1")
const prefix = "loginom-attachment:"
export type AttachmentOwner = { session: string; message: string }
export type LocalAttachmentReference = {
  kind: "local_reference"
  sourcePath: string
  filename: string
  size: number
  lastModified: number
  mime: string
  receipt: string
}
type Receipt = { sourcePath: string; identity: FileIdentity }

export function attachmentReceiptID(value?: string) {
  if (!value?.startsWith(prefix)) return
  const id = value.slice(prefix.length)
  if (!/^[a-f0-9]{64}$/.test(id)) throw hostException("LOGINOM_INPUT_INVALID")
  return id
}
export function attachmentReceiptSource(reference: Pick<LocalAttachmentReference, "sourcePath" | "receipt">) {
  return {
    type: "file" as const,
    path: reference.sourcePath,
    text: { value: prefix + reference.receipt, start: 0, end: 0 },
  }
}

export async function createAttachmentReceipt(path: string, expected?: { size: number; lastModified: number }) {
  const sourcePath = resolve(path)
  const identity = await inspectReferenceFile(sourcePath).catch((error) => {
    throw fileError(error)
  })
  if (expected && (identity.size !== expected.size || Math.trunc(identity.mtime) !== expected.lastModified))
    throw hostException("LOGINOM_FILE_CHANGED")
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = await lstat(root)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (process.platform !== "win32" && (directory.mode & 0o777) !== 0o700)
  )
    throw hostException("LOGINOM_FILE_ACCESS_DENIED")
  const receipt = randomBytes(32).toString("hex")
  await writeFile(join(root, receipt + ".json"), JSON.stringify({ sourcePath, identity }), { flag: "wx", mode: 0o600 })
  return {
    kind: "local_reference" as const,
    sourcePath,
    filename: basename(sourcePath),
    size: identity.size,
    lastModified: Math.trunc(identity.mtime),
    mime: /\.xlsx$/i.test(sourcePath)
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : /\.lgp$/i.test(sourcePath)
        ? "application/x-loginom-package"
        : "text/plain",
    receipt,
  }
}

export async function readAttachmentReceipt(id: string, path: string, owner?: AttachmentOwner) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw hostException("LOGINOM_INPUT_INVALID")
  const receipt: Receipt = await readFile(join(root, id + ".json"), "utf8")
    .then(JSON.parse)
    .catch(() => {
      throw hostException("LOGINOM_INPUT_INVALID")
    })
  if (resolve(path) !== receipt.sourcePath) throw hostException("LOGINOM_INPUT_INVALID")
  if (owner) {
    const bound = await readFile(join(root, id + ".owner"), "utf8").catch(() => undefined)
    if (bound !== JSON.stringify(owner)) throw hostException("LOGINOM_INPUT_INVALID")
  }
  return receipt
}

export async function verifyAttachmentReceipt(id: string, path: string, owner?: AttachmentOwner) {
  const receipt = await readAttachmentReceipt(id, path, owner)
  const current = await inspectReferenceFile(receipt.sourcePath).catch((error) => {
    throw fileError(error)
  })
  if (JSON.stringify(current) !== JSON.stringify(receipt.identity)) throw hostException("LOGINOM_FILE_CHANGED")
  return receipt
}

export async function bindAttachmentReceipt(id: string, path: string, owner: AttachmentOwner) {
  const receipt = await verifyAttachmentReceipt(id, path)
  await writeFile(join(root, id + ".owner"), JSON.stringify(owner), { flag: "wx", mode: 0o600 }).catch(
    async (error) => {
      if (error.code !== "EEXIST") throw error
      if ((await readFile(join(root, id + ".owner"), "utf8")) !== JSON.stringify(owner))
        throw hostException("LOGINOM_INPUT_INVALID")
    },
  )
  return receipt
}
