import path from "node:path"
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { EvalFailure } from "./fail"

/** Sibling of the product profile: resetProfile cannot remove the harness lock.
 * A stale lock requires inspection; PID alone never authorizes lock stealing.
 */
export async function acquireHarnessLease(profile: string) {
  await mkdir(path.resolve(profile), { recursive: true, mode: 0o700 })
  const profileDir = await realpath(profile)
  const directory = `${profileDir}.harness-lease`
  await mkdir(directory, { mode: 0o700 }).catch(() => {
    throw new EvalFailure(`Exclusive harness lease unavailable: ${directory}`, 2)
  })
  const info = await lstat(directory)
  const raw = await readFile(`/proc/${process.pid}/stat`, "utf8")
  const owner = JSON.stringify({ nonce: crypto.randomUUID(), pid: process.pid, uid: process.getuid?.(),
    starttime: raw.slice(raw.lastIndexOf(")") + 2).split(" ")[19] })
  await writeFile(path.join(directory, "owner.json"), owner, { flag: "wx", mode: 0o600 })
  return {
    directory,
    profileDir,
    async release() {
      const current = await lstat(directory)
      if (current.dev !== info.dev || current.ino !== info.ino || current.isSymbolicLink() ||
        await readFile(path.join(directory, "owner.json"), "utf8") !== owner)
        throw new EvalFailure("Harness lease identity changed", 1)
      await rm(directory, { recursive: true })
    },
  }
}
