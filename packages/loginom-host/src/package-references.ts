import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join, posix } from "node:path"
import { Schema } from "effect"
import { extractPackageReferences } from "./package-docs/extract"
import { StoragePackagePath, type FolderListing } from "./package-folder"
import {
  referenceChecksExcluded,
  referencesNotChecked,
  type ReadReferences,
  type Reference,
  type ReferenceResult,
  type ReferencingPackage,
} from "./package-references-contract"

const CopyState = Schema.Struct({
  pending: Schema.optional(Schema.Unknown),
  copy: Schema.optional(Schema.Struct({
    original: StoragePackagePath,
    path: StoragePackagePath,
    version: Schema.optional(StoragePackagePath),
    discarded: Schema.optional(Schema.Boolean),
    replacement: Schema.optional(Schema.Unknown),
  })),
})

export async function readReferenceTarget(root: string, input: ReadReferences, signal: AbortSignal) {
  const chat = createHash("sha256").update(input.sessionID).digest("hex")
  const file = join(root, "runtime", "generations", String(input.generation), "chats", chat, "package-copy.json")
  const content = await readFile(file, { encoding: "utf8", signal }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (content === undefined) return undefined
  const { pending, copy } = Schema.decodeUnknownSync(CopyState)(JSON.parse(content))
  if (pending !== undefined) throw Error("LOGINOM_PACKAGE_FOLDER_UNAVAILABLE")
  if (!copy || copy.replacement !== undefined || (copy.discarded && !copy.version)) return undefined
  return { originalPath: copy.original, copyPath: copy.version ?? copy.path }
}

type Storage = {
  list(folder: string, signal: AbortSignal): Promise<FolderListing>
  read(path: string, signal: AbortSignal): Promise<Uint8Array>
}

export async function scanPackageReferences(
  target: { originalPath: string; copyPath: string; homeFolder: string },
  withStorage: (work: (storage: Storage) => Promise<void>, signal: AbortSignal, deadline: number) => Promise<void>,
  signal: AbortSignal,
  timeoutMs = 60_000,
): Promise<ReferenceResult> {
  signal.throwIfAborted()
  if (target.originalPath === target.copyPath) return referencesNotChecked("no_copy")
  const deadline = Date.now() + timeoutMs
  const timer = AbortSignal.timeout(timeoutMs)
  const stop = AbortSignal.any([signal, timer])
  const packages: (typeof ReferencingPackage.Type)[] = []
  let packagesScanned = 0
  let foldersWithoutAccess = 0
  let complete = true
  let started = false
  let finished = false
  try {
    await withStorage(async (storage) => {
      const read = async (path: string) => extractPackageReferences(await storage.read(path, stop), stop)
      const original = await read(target.originalPath)
      const copy = await read(target.copyPath)
      stop.throwIfAborted()
      const targets = new Map(original.nodes.flatMap((node) => [node.guid, node.globalID].flatMap((guid) =>
        guid ? [[guid, node] as const] : [])))
      const inCopy = new Map(copy.nodes.map((node) => [node.guid, node]))
      started = true
      const folders = new Set([target.homeFolder, "/common"])
      for (const folder of folders) {
        stop.throwIfAborted()
        let listing: FolderListing
        try {
          listing = await storage.list(folder, stop)
          stop.throwIfAborted()
        } catch (error) {
          stop.throwIfAborted()
          complete = false
          if (error instanceof Error && error.message === "LOGINOM_PACKAGE_FOLDER_ACCESS_DENIED") foldersWithoutAccess++
          continue
        }
        for (const entry of listing.entries) {
          stop.throwIfAborted()
          if (entry.kind === "folder") {
            folders.add(entry.path)
            continue
          }
          if (entry.path === target.originalPath || entry.path === target.copyPath) continue
          try {
            const candidate = await read(entry.path)
            stop.throwIfAborted()
            packagesScanned++
            const pointsToOriginal = candidate.dependencies.some(({ guid, hint }) => {
              if (guid !== original.guid || !hint) return false
              const path = hint.replaceAll("\\", "/")
              return posix.resolve(posix.dirname(entry.path), path) === target.originalPath
            })
            if (!pointsToOriginal) continue
            const local = new Set(candidate.nodes.flatMap(({ guid, globalID }) => globalID ? [guid, globalID] : [guid]))
            const references = candidate.nodes.flatMap((node): (typeof Reference.Type)[] => {
              if (!node.targetGuid || local.has(node.targetGuid)) return []
              const source = targets.get(node.targetGuid)
              if (!source) return []
              const replacement = inCopy.get(source.guid)
              return [{ node: { guid: node.guid, label: node.label }, target: { guid: source.guid, label: source.label },
                copy: !replacement ? "node_missing" : !node.outputGuids.length ? "outputs_unknown" :
                  node.outputGuids.every((guid) => replacement.outputGuids.includes(guid)) ? "node_and_outputs_present" : "outputs_missing" }]
            })
            if (references.length) packages.push({ path: entry.path, name: entry.name, references })
          } catch {
            stop.throwIfAborted()
            complete = false
          }
        }
      }
      finished = true
    }, stop, deadline)
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof Error && error.message === "LOGINOM_RUNTIME_CLEANUP_FAILED") throw error
    if (!started) return referencesNotChecked(timer.aborted ? "time_limit" : "unavailable")
    complete = false
  }
  signal.throwIfAborted()
  const timedOut = timer.aborted && !finished
  return { status: "scanned", complete: complete && !timedOut, timedOut, packages,
    packagesScanned, foldersWithoutAccess, notChecked: referenceChecksExcluded }
}
