import { $ } from "bun"
import { createHash } from "node:crypto"
import { lstat, readFile, readlink } from "node:fs/promises"
import { join } from "node:path"

export async function cliSourceSnapshot(repo: string) {
  const paths = [
    ...new Set(
      (await $`git ls-files --cached --others --exclude-standard -z`.cwd(repo).text()).split("\0").filter(Boolean),
    ),
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
    sourceCommit: (await $`git rev-parse HEAD`.cwd(repo).text()).trim(),
    sourceTreeSha256: hash.digest("hex"),
    sourceDirty: !!(await $`git status --porcelain`.cwd(repo).text()).trim(),
  }
}
