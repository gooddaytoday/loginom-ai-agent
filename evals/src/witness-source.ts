import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type BigIntStats } from "node:fs"
import path from "node:path"

export type WitnessSource = ReturnType<typeof captureWitnessSource>

/** Read-only exact-byte binding. This captures no authority: only a reviewed root
 * policy may select expected bindings, and consumers still require native leases. */
export function captureWitnessSource(file: string, uid: number) {
  let fd: number | undefined
  try {
    if (!Number.isSafeInteger(uid) || uid < 0 || !path.isAbsolute(file) || path.resolve(file) !== file ||
      file.includes("\0") || realpathSync(file) !== file) throw Error()
    const before = lstatSync(file, { bigint: true })
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const opened = fstatSync(fd, { bigint: true })
    const expected = metadata(before, uid)
    if (JSON.stringify(metadata(opened, uid)) !== JSON.stringify(expected)) throw Error()
    const bytes = Buffer.alloc(Number(opened.size) + 1)
    let count = 0
    while (count < bytes.length) {
      const read = readSync(fd, bytes, count, bytes.length - count, count)
      if (read === 0) break
      count += read
    }
    if (BigInt(count) !== opened.size || realpathSync(file) !== file ||
      JSON.stringify(metadata(fstatSync(fd, { bigint: true }), uid)) !== JSON.stringify(expected) ||
      JSON.stringify(metadata(lstatSync(file, { bigint: true }), uid)) !== JSON.stringify(expected)) throw Error()
    return { file, uid, ...expected, sha256: new Bun.CryptoHasher("sha256").update(bytes.subarray(0, count)).digest("hex") }
  } catch { throw Error("WITNESS_SOURCE_CHANGED") }
  finally { if (fd !== undefined) closeSync(fd) }
}

export function validateWitnessSource(binding: WitnessSource) {
  const current = captureWitnessSource(binding.file, binding.uid)
  if (Object.keys(binding).length !== Object.keys(current).length ||
    Object.entries(current).some(([key, value]) => binding[key as keyof WitnessSource] !== value)) throw Error("WITNESS_SOURCE_CHANGED")
}

function metadata(stat: BigIntStats, uid: number) {
  if (!stat.isFile() || stat.uid !== BigInt(uid) || stat.nlink !== 1n || (stat.mode & 0o022n) !== 0n ||
    stat.size < 0n || stat.size > 65536n) throw Error()
  return { device: String(stat.dev), inode: String(stat.ino), mode: String(stat.mode), gid: String(stat.gid),
    bytes: String(stat.size), mtimeNs: String(stat.mtimeNs), ctimeNs: String(stat.ctimeNs) }
}
