import path from "node:path"
import { closeSync, constants, fstatSync, openSync, readSync, type BigIntStats } from "node:fs"
import { dlopen } from "bun:ffi"

/** Filesystem authenticity only: callers must separately establish the host mount
 * context, pinned publisher, strict schema and matching native state. */
export function readRootWitnessFile(file: string, limit: number): Buffer {
  if (process.platform !== "linux" || !path.isAbsolute(file) || path.resolve(file) !== file || file.includes("\0") ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > 65536) throw Error("ROOT_WITNESS_FILE")
  const library = dlopen("libc.so.6", { openat: { args: ["i32", "cstring", "i32", "u32"], returns: "i32" } })
  const descriptors: { fd: number; stat: BigIntStats }[] = []
  try {
    const root = openSync("/", constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    descriptors.push({ fd: root, stat: fstatSync(root, { bigint: true }) })
    requireProtected(descriptors[0]!.stat, true)
    const components = file.slice(1).split("/")
    for (const [index, component] of components.entries()) {
      const directory = index < components.length - 1
      const fd = library.symbols.openat(descriptors.at(-1)!.fd, Buffer.from(component + "\0"),
        // Linux O_CLOEXEC is not exposed by Node's constants typings.
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | 0o2000000 |
        (directory ? constants.O_DIRECTORY : 0), 0)
      if (fd < 0) throw Error("ROOT_WITNESS_FILE")
      const stat = fstatSync(fd, { bigint: true })
      descriptors.push({ fd, stat })
      requireProtected(stat, directory)
    }
    const leaf = descriptors.at(-1)!
    if (leaf.stat.size > BigInt(limit)) throw Error("ROOT_WITNESS_FILE")
    const bytes = Buffer.alloc(Number(leaf.stat.size) + 1)
    let count = 0
    while (count < bytes.length) {
      const read = readSync(leaf.fd, bytes, count, bytes.length - count, count)
      if (read === 0) break
      count += read
    }
    if (BigInt(count) !== leaf.stat.size) throw Error("ROOT_WITNESS_FILE")
    for (const entry of descriptors) {
      const after = fstatSync(entry.fd, { bigint: true })
      for (const key of ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "ctimeNs", "mtimeNs"] as const)
        if (after[key] !== entry.stat[key]) throw Error("ROOT_WITNESS_FILE")
    }
    return bytes.subarray(0, count)
  } catch { throw Error("ROOT_WITNESS_FILE") }
  finally {
    for (const entry of descriptors.reverse()) closeSync(entry.fd)
    library.close()
  }
}

function requireProtected(stat: BigIntStats, directory: boolean) {
  if (stat.uid !== 0n || (stat.mode & 0o022n) !== 0n ||
    (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1n)) throw Error("ROOT_WITNESS_FILE")
}
