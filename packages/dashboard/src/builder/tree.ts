import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { open, readdir, readFile, realpath } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"

export const BUILD_SIZE_LIMIT = 20 * 1024 * 1024

export async function treeHash(dir: string) {
  return (await readTree(dir)).hash
}

export async function verifiedBuildFile(dir: string, hash: string, name = "index.html") {
  try {
    if (await realpath(dir) !== resolve(dir)) return
    let remaining = BUILD_SIZE_LIMIT
    const tree = await readTree(dir, name, async path => {
      const bytes = await readBounded(path, remaining)
      remaining -= bytes.length
      return bytes
    })
    if (tree.hash === hash) return tree.selected
  } catch {
    // A missing or unreadable file invalidates the build.
  }
}

async function readTree(dir: string, name?: string, read: (path: string) => Promise<Buffer> = readFile) {
  const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .toSorted()
  const sha = createHash("sha256")
  let selected: Buffer | undefined
  for (const file of files) {
    const bytes = await read(join(dir, file))
    sha.update(file).update("\0").update(String(bytes.length)).update("\0").update(bytes)
    if (file === name) selected = bytes
  }
  return { hash: sha.digest("hex"), selected }
}

export async function readBounded(path: string, limit: number) {
  if (await realpath(path) !== resolve(path)) throw Error("DASHBOARD_FILE_LINK")
  const file = await openFile(path)
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size > limit) throw Error("DASHBOARD_FILE_LIMIT")
    const bytes = Buffer.alloc(Math.min(before.size + 1, limit + 1))
    let length = 0
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, length)
      if (!read.bytesRead) break
      length += read.bytesRead
    }
    const after = await file.stat()
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || length !== before.size || await realpath(path) !== resolve(path)) throw Error("DASHBOARD_FILE_CHANGED")
    return bytes.subarray(0, length)
  } finally {
    await file.close()
  }
}

async function openFile(path: string) {
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
  if (process.platform !== "linux") return open(path, flags)
  // Retain each directory while opening its child, so a rename cannot redirect a read.
  const parts = resolve(path).split("/").filter(Boolean)
  let directory = await open("/", constants.O_RDONLY | constants.O_DIRECTORY)
  try {
    for (const part of parts.slice(0, -1)) {
      const next = await open(`/proc/self/fd/${directory.fd}/${part}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      await directory.close()
      directory = next
    }
    return await open(`/proc/self/fd/${directory.fd}/${parts.at(-1)}`, flags)
  } finally {
    await directory.close()
  }
}
