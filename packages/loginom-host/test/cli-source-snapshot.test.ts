import { expect, spyOn, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, lstat, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliSourceSnapshot } from "../script/cli-source-snapshot"

test.skipIf(process.platform === "win32")("snapshot preserves clean and dirty git source identity", async () => {
  const repo = await mkdtemp(join(tmpdir(), "cli source snapshot-"))
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: repo })
    if (result.exitCode !== 0) throw Error(result.stderr.toString())
    return result.stdout.toString().trim()
  }
  try {
    git("init", "--quiet")
    git("config", "core.autocrlf", "false")
    await writeFile(join(repo, "tracked.txt"), "before\n")
    await chmod(join(repo, "tracked.txt"), 0o644)
    await writeFile(join(repo, "deleted.txt"), "removed\n")
    git("add", ".")
    git(
      "-c",
      "user.name=Snapshot Test",
      "-c",
      "user.email=snapshot@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    )
    const sourceCommit = git("rev-parse", "HEAD")
    const clean = await cliSourceSnapshot(repo)
    expect(clean.sourceCommit).toBe(sourceCommit)
    expect(clean.sourceDirty).toBe(false)
    expect(JSON.stringify(await cliSourceSnapshot(repo))).toBe(JSON.stringify(clean))

    await writeFile(join(repo, "tracked.txt"), "after\n")
    await rm(join(repo, "deleted.txt"))
    await writeFile(join(repo, "untracked\nfile.txt"), Buffer.from([0, 255, 10]))
    await chmod(join(repo, "untracked\nfile.txt"), 0o644)
    await symlink("tracked.txt", join(repo, "link"))
    const regularMode = (await lstat(join(repo, "tracked.txt"))).mode
    const linkMode = (await lstat(join(repo, "link"))).mode
    // Fixed fixture order and bytes, including the deleted path and link target.
    const sourceTreeSha256 = createHash("sha256")
      .update(
        "deleted.txt\0deleted\0link\0" +
          linkMode +
          "\0tracked.txt\0tracked.txt\0" +
          regularMode +
          "\0after\n\0untracked\nfile.txt\0" +
          regularMode +
          "\0",
      )
      .update(Buffer.from([0, 255, 10, 0]))
      .digest("hex")
    const sync = spyOn(Bun, "spawnSync")
    try {
      expect(JSON.stringify(await cliSourceSnapshot(repo))).toBe(
        JSON.stringify({ sourceCommit, sourceTreeSha256, sourceDirty: true }),
      )
      expect(sync.mock.calls.map(([command]) => command)).toEqual([
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        ["git", "rev-parse", "HEAD"],
        ["git", "status", "--porcelain"],
      ])
    } finally {
      sync.mockRestore()
    }
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test("snapshot reports a nonzero git exit with the command and stderr", async () => {
  const repo = await mkdtemp(join(tmpdir(), "cli-snapshot-no-git-"))
  try {
    await expect(cliSourceSnapshot(repo)).rejects.toThrow(
      /CLI_SOURCE_SNAPSHOT_GIT_FAILED: git ls-files.*exitCode=128.*fatal:/s,
    )
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test("snapshot bounds synchronous git calls and identifies an actual child timeout", async () => {
  const spawnSync = Bun.spawnSync
  const sync = spyOn(Bun, "spawnSync").mockImplementationOnce(() =>
    spawnSync([process.execPath, "-e", "while (true) {}"], {
      timeout: 30,
      killSignal: "SIGKILL",
      stdout: "pipe",
      stderr: "pipe",
    }),
  )
  try {
    await expect(cliSourceSnapshot(process.cwd())).rejects.toThrow(
      "CLI_SOURCE_SNAPSHOT_GIT_TIMEOUT: git ls-files --cached --others --exclude-standard -z timeout=120000ms",
    )
    expect(sync).toHaveBeenCalledWith(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
      killSignal: "SIGKILL",
    })
  } finally {
    sync.mockRestore()
  }
})
