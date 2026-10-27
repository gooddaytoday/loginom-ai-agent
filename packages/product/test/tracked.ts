import { execFileSync } from "node:child_process"
import { posix } from "node:path"

const SYMLINK = "120000"
const GITLINK = "160000"
const MAX_SYMLINK_HOPS = 8
const PRELOADED = /\.(ts|tsx|js|mjs|cjs|json|jsonc|ya?ml|ps1|sh|nix|toml|md|py)$/

type Entry = { mode: string; oid: string; stage: string; path: string }

const listIndex = (root: string): Entry[] =>
  execFileSync("git", ["ls-files", "-z", "-s"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 29 })
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t")
      const [mode, oid, stage] = line.slice(0, tab).split(" ")
      const path = line.slice(tab + 1)
      return { mode: mode!, oid: oid!, stage: stage!, path }
    })
    .filter((entry) => entry.stage === "0")

const readBlobs = (root: string, oids: string[]): Map<string, Buffer> => {
  const out = execFileSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: oids.join("\n") + "\n",
    maxBuffer: 1 << 30,
  })
  const blobs = new Map<string, Buffer>()
  let offset = 0
  for (const oid of oids) {
    const headerEnd = out.indexOf(0x0a, offset)
    const size = Number(out.subarray(offset, headerEnd).toString().split(" ")[2])
    blobs.set(oid, out.subarray(headerEnd + 1, headerEnd + 1 + size))
    offset = headerEnd + 1 + size + 1
  }
  return blobs
}

export function trackedSnapshot(root: string) {
  const entries = listIndex(root)
  const byPath = new Map(entries.map((entry) => [entry.path, entry]))
  const blobs = readBlobs(root, [...new Set(entries.filter((entry) => entry.mode !== GITLINK && PRELOADED.test(entry.path)).map((entry) => entry.oid))])
  const read = (path: string, hops = 0): string => {
    const entry = byPath.get(path)
    if (!entry || entry.mode === GITLINK) throw new Error(`${path} is not a tracked file`)
    const content = (blobs.get(entry.oid) ?? execFileSync("git", ["cat-file", "blob", entry.oid], { cwd: root, maxBuffer: 1 << 30 })).toString("utf8")
    if (entry.mode !== SYMLINK) return content
    const target = posix.join(posix.dirname(path), content)
    if (hops >= MAX_SYMLINK_HOPS || !byPath.has(target)) return content
    return read(target, hops + 1)
  }
  return { paths: entries.map((entry) => entry.path), read: (path: string) => read(path) }
}
