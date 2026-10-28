import { randomBytes } from "node:crypto"
import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { basename, isAbsolute, join } from "node:path"
import {
  verifyReferenceFile,
  type FileReference,
  type ReferenceSlot,
} from "../../loginom-runtime/client/lib/file-reference.mjs"

export {
  inspectReferenceFile,
  stageReferenceFile,
  verifyReferenceFile,
  referenceUploadBudget,
} from "../../loginom-runtime/client/lib/file-reference.mjs"
export type { FileIdentity, FileReference, ReferenceSlot } from "../../loginom-runtime/client/lib/file-reference.mjs"

export type ReferenceOwner = { chat: string; userMessage: string; generation: number; run: string }

// A random identifier alone grants nothing: it must match an in-process Host
// reservation, original input, generation, owner and the exact private path.
export function fileReferences(root: string) {
  const slots = new Map<string, { owner: ReferenceOwner; slot: ReferenceSlot; committed?: FileReference }>()
  const active = new Set<Promise<unknown>>()
  let closing = false
  async function tracked<T>(run: () => Promise<T>) {
    if (closing) throw Error("LOGINOM_HOST_CLOSED")
    const task = run()
    active.add(task)
    try {
      return await task
    } finally {
      active.delete(task)
    }
  }
  function owned(owner: ReferenceOwner, grant: string) {
    const entry = slots.get(grant)
    if (
      !entry ||
      !["chat", "userMessage", "generation", "run"].every(
        (key) => entry.owner[key as keyof ReferenceOwner] === owner[key as keyof ReferenceOwner],
      )
    )
      throw Error("LOGINOM_INPUT_INVALID")
    return entry
  }
  return {
    reserve(owner: ReferenceOwner, name: string) {
      return tracked(async () => {
        if (
          !isAbsolute(root) ||
          !owner.chat ||
          !owner.userMessage ||
          !owner.run ||
          !Number.isSafeInteger(owner.generation) ||
          owner.generation < 0 ||
          typeof name !== "string" ||
          !name ||
          /[\x00-\x1f\x7f]/.test(name)
        )
          throw Error("LOGINOM_INPUT_INVALID")
        if (slots.size >= 8) throw Error("LOGINOM_INPUT_INVALID")
        await mkdir(root, { recursive: true, mode: 0o700 })
        const info = await lstat(root)
        if (
          !info.isDirectory() ||
          info.isSymbolicLink() ||
          (process.platform !== "win32" && (info.mode & 0o777) !== 0o700)
        )
          throw Error("LOGINOM_INPUT_INVALID")
        const grant = randomBytes(32).toString("hex")
        const directory = join(await realpath(root), grant)
        const safe = basename(name.replaceAll("\\", "/"))
          .replace(/[\\/:<>"|?*%#\x00-\x1f\x7f]|[. ]+$/g, "_")
          .slice(-120)
        if (!safe || /\.lgp$/i.test(safe)) throw Error("LOGINOM_SCOPE_DENIED")
        const unique = grant + "-" + safe
        const slot = {
          grant,
          chat: owner.chat,
          userMessage: owner.userMessage,
          generation: owner.generation,
          name: unique,
          directory,
          path: join(directory, unique),
        }
        await mkdir(directory, { mode: 0o700 })
        try {
          await writeFile(join(directory, "grant.json"), JSON.stringify({ version: 1, ...owner, ...slot }), {
            flag: "wx",
            mode: 0o600,
          })
        } catch (error) {
          await rm(directory, { recursive: true, force: true })
          throw error
        }
        slots.set(grant, { owner: { ...owner }, slot })
        return structuredClone(slot)
      })
    },
    commit(owner: ReferenceOwner, reference: FileReference) {
      return tracked(async () => {
        const entry = owned(owner, reference?.grant)
        const slot = entry.slot
        if (
          !reference.snapshot ||
          reference.snapshot.canonical_path !== slot.path ||
          reference.name !== slot.name ||
          reference.chat !== slot.chat ||
          reference.userMessage !== slot.userMessage ||
          reference.generation !== slot.generation ||
          Object.keys(reference).sort().join(",") !== "chat,generation,grant,name,snapshot,userMessage"
        )
          throw Error("LOGINOM_INPUT_INVALID")
        const directory = await lstat(slot.directory)
        if (
          !directory.isDirectory() ||
          directory.isSymbolicLink() ||
          (await realpath(slot.directory)) !== slot.directory ||
          (process.platform !== "win32" && (directory.mode & 0o777) !== 0o700)
        )
          throw Error("LOGINOM_INPUT_INVALID")
        if (entry.committed && JSON.stringify(entry.committed) !== JSON.stringify(reference))
          throw Error("LOGINOM_FILE_CHANGED")
        await verifyReferenceFile(reference.snapshot)
        entry.committed = structuredClone(reference)
        await writeFile(join(slot.directory, "receipt.json"), JSON.stringify(reference), { mode: 0o600 })
        return structuredClone(reference)
      })
    },
    discard(owner: ReferenceOwner, grant: string) {
      return tracked(async () => {
        const entry = owned(owner, grant)
        if (entry.committed) throw Error("LOGINOM_INPUT_IDENTITY_CONFLICT")
        await rm(entry.slot.directory, { recursive: true, force: true })
        slots.delete(grant)
      })
    },
    // Caller must close the runtime/browser first. Never delete a snapshot that
    // an unconfirmed browser may still be consuming.
    async close() {
      closing = true
      await Promise.allSettled([...active])
      for (const entry of slots.values()) await rm(entry.slot.directory, { recursive: true, force: true })
      slots.clear()
    },
  }
}
