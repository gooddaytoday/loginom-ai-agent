import { createHash } from "node:crypto"
import { lstat, readFile, readlink } from "node:fs/promises"
import { join } from "node:path"

export async function cliSourceSnapshot(repo: string) {
  const paths = [
    ...new Set(git(repo, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)),
  ].sort()
  const hash = createHash("sha256")
  for (const path of paths) {
    const stat = await lstat(join(repo, path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    hash.update(path).update("\0")
    if (!stat) {
      hash.update("deleted\0")
      continue
    }
    hash.update(String(stat.mode)).update("\0")
    hash
      .update(stat.isSymbolicLink() ? await readlink(join(repo, path)) : await readFile(join(repo, path)))
      .update("\0")
  }
  return {
    sourceCommit: git(repo, ["rev-parse", "HEAD"]).trim(),
    sourceTreeSha256: hash.digest("hex"),
    sourceDirty: !!git(repo, ["status", "--porcelain"]).trim(),
  }
}

function git(repo: string, args: string[]) {
  // Bun's async shell can miss child exit on macOS; do not wait on its event loop.
  const result = Bun.spawnSync(["git", ...args], {
    cwd: repo,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
    killSignal: "SIGKILL",
  })
  if (result.exitedDueToTimeout) throw Error(`CLI_SOURCE_SNAPSHOT_GIT_TIMEOUT: git ${args.join(" ")} timeout=120000ms`)
  if (result.exitCode !== 0)
    throw Error(
      `CLI_SOURCE_SNAPSHOT_GIT_FAILED: git ${args.join(" ")} exitCode=${result.exitCode}: ${result.stderr.toString()}`,
    )
  return result.stdout.toString()
}
