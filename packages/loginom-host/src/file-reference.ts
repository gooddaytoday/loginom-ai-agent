import { randomBytes } from "node:crypto"
import { lstat, readFile, readdir, realpath, rm, rmdir } from "node:fs/promises"
import { basename, isAbsolute, join } from "node:path"
import {
  verifyReferenceFile,
  type FileReference,
  type ReferenceSnapshot,
} from "../../loginom-runtime/client/lib/file-reference.mjs"

export {
  inspectReferenceFile,
  verifyReferenceFile,
  referenceUploadBudget,
} from "../../loginom-runtime/client/lib/file-reference.mjs"
export type {
  FileIdentity,
  FileReference,
  ReferenceSnapshot,
} from "../../loginom-runtime/client/lib/file-reference.mjs"

export type ReferenceOwner = { chat: string; userMessage: string; generation: number; run: string }

// Only private backend authorization can reserve an original-file grant. No
// local copy, directory, receipt file, chmod or fsync is needed for admission.
export function fileReferences(root: string) {
  const slots = new Map<string, { owner: ReferenceOwner; reference: FileReference; committed: boolean }>()
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
    // Called at Host startup, before runtimes exist, under its profile guard.
    // Recognize only the previous private staging layout; never follow paths
    // from a legacy manifest or delete an unrecognized directory/file.
    async cleanup() {
      if (!isAbsolute(root)) throw Error("LOGINOM_INPUT_INVALID")
      const info = await lstat(root).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error
        return null
      })
      if (
        !info ||
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        (await realpath(root)) !== root ||
        (process.platform !== "win32" && ((info.mode & 0o777) !== 0o700 || info.uid !== process.getuid?.()))
      )
        return
      for (const grant of await readdir(root)) {
        if (!/^[a-f0-9]{64}$/.test(grant)) continue
        const directory = join(root, grant),
          current = await lstat(directory)
        if (
          !current.isDirectory() ||
          current.isSymbolicLink() ||
          (process.platform !== "win32" && (current.uid !== info.uid || (current.mode & 0o777) !== 0o700))
        )
          continue
        const manifest = await lstat(join(directory, "grant.json")).catch(() => null)
        if (!manifest?.isFile() || manifest.isSymbolicLink()) continue
        const slot = await readFile(join(directory, "grant.json"), "utf8")
          .then((text) => JSON.parse(text))
          .catch(() => null)
        if (
          slot?.version !== 1 ||
          slot.grant !== grant ||
          slot.directory !== directory ||
          typeof slot.name !== "string" ||
          basename(slot.name) !== slot.name ||
          !slot.name.startsWith(grant + "-") ||
          slot.path !== join(directory, slot.name)
        )
          continue
        const names = await readdir(directory)
        if (names.some((name) => !["grant.json", "receipt.json", slot.name].includes(name))) continue
        const files = await Promise.all(names.map((name) => lstat(join(directory, name))))
        if (
          files.some(
            (file) =>
              !file.isFile() || file.isSymbolicLink() || (process.platform !== "win32" && file.uid !== info.uid),
          )
        )
          continue
        await rm(directory, { recursive: true })
      }
      await rmdir(root).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error
      })
    },
    reserve(owner: ReferenceOwner, name: string, snapshot: ReferenceSnapshot) {
      return tracked(async () => {
        if (
          !owner.chat ||
          !owner.userMessage ||
          !owner.run ||
          !Number.isSafeInteger(owner.generation) ||
          owner.generation < 0 ||
          typeof name !== "string" ||
          !name ||
          /[\x00-\x1f\x7f]/.test(name) ||
          name !== basename(snapshot?.canonical_path ?? "")
        )
          throw Error("LOGINOM_INPUT_INVALID")
        if (slots.size >= 8) throw Error("LOGINOM_INPUT_INVALID")
        if (/\.lgp$/i.test(name)) throw Error("LOGINOM_SCOPE_DENIED")
        await verifyReferenceFile(snapshot)
        const reference = {
          grant: randomBytes(32).toString("hex"),
          chat: owner.chat,
          userMessage: owner.userMessage,
          generation: owner.generation,
          name,
          snapshot: structuredClone(snapshot),
        }
        slots.set(reference.grant, { owner: { ...owner }, reference, committed: false })
        return structuredClone(reference)
      })
    },
    commit(owner: ReferenceOwner, reference: FileReference) {
      return tracked(async () => {
        const entry = owned(owner, reference?.grant)
        if (JSON.stringify(entry.reference) !== JSON.stringify(reference)) throw Error("LOGINOM_INPUT_INVALID")
        await verifyReferenceFile(entry.reference.snapshot)
        entry.committed = true
        return structuredClone(entry.reference)
      })
    },
    discard(owner: ReferenceOwner, grant: string) {
      return tracked(async () => {
        if (owned(owner, grant).committed) throw Error("LOGINOM_INPUT_IDENTITY_CONFLICT")
        slots.delete(grant)
      })
    },
    async close() {
      closing = true
      await Promise.allSettled([...active])
      slots.clear()
    },
  }
}
