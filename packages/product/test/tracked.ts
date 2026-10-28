import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, posix } from "node:path"

const SYMLINK = "120000"
const MAX_SYMLINK_HOPS = 8

type Entry = { mode: string; oid: string }

export function trackedSnapshot(root: string) {
  const merged = new Map<string, Entry>()
  const paths = new Set<string>()
  const listing = execFileSync("git", ["ls-files", "-z", "-s"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 29 })
  for (const line of listing.split("\0").filter(Boolean)) {
    const tab = line.indexOf("\t")
    const [mode, oid, stage] = line.slice(0, tab).split(" ")
    const path = line.slice(tab + 1)
    paths.add(path)
    if (stage === "0") merged.set(path, { mode: mode!, oid: oid! })
  }

  const readIndexed = (path: string, hops = 0): string => {
    const entry = merged.get(path)
    if (!entry) throw new Error(`${path} is missing from the working tree and has no merged index entry`)
    const blob = execFileSync("git", ["cat-file", "blob", entry.oid], { cwd: root, maxBuffer: 1 << 30 }).toString("utf8")
    if (entry.mode !== SYMLINK) return blob
    const target = posix.join(posix.dirname(path), blob)
    return hops < MAX_SYMLINK_HOPS && merged.has(target) ? readIndexed(target, hops + 1) : blob
  }

  const read = (path: string): string => {
    try {
      return readFileSync(join(root, path), "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      return readIndexed(path)
    }
  }

  return { paths: [...paths], read }
}
