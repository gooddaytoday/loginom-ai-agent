import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

const roots: string[] = []
const cli = fileURLToPath(new URL("../src/secret-scan.ts", import.meta.url))

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function repo() {
  const root = await mkdtemp(join(tmpdir(), "secret-test-"))
  roots.push(root)
  git(root, "init", "-q")
  git(root, "config", "user.name", "Secret scan test")
  git(root, "config", "user.email", "test@example.invalid")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "initial", "--allow-empty")
  return root
}

function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: root })
  if (result.exitCode) throw new Error("Fixture git command failed")
  return result.stdout.toString().trim()
}

function run(root: string, ...args: string[]) {
  return invoke(root, args)
}

function invoke(root: string, args: string[], input = "", env: Record<string, string> = {}) {
  const result = Bun.spawnSync([process.execPath, "--no-install", cli, ...args], {
    cwd: root,
    stdin: Buffer.from(input),
    env: { ...process.env, ...env },
  })
  return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }
}

test("staged scan blocks a secret without printing its value", async () => {
  const root = await repo()
  const token = "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k"
  await Bun.write(join(root, "config.txt"), `token=${token}\n`)
  git(root, "add", "config.txt")
  const result = run(root, "staged")
  expect(result.code).toBe(2)
  expect(result.output).toContain("config.txt")
  expect(result.output).toContain("github-pat")
  expect(result.output).not.toContain(token)
})

test("staged scan checks the indexed lgp even if the working copy is clean", async () => {
  const root = await repo()
  const token = "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k"
  await Bun.write(join(root, "settings.xml"), `<token>${token}</token>`)
  expect(Bun.spawnSync(["zip", "-q", "package.lgp", "settings.xml"], { cwd: root }).exitCode).toBe(0)
  git(root, "add", "package.lgp")
  await Bun.write(join(root, "package.lgp"), "clean working copy")
  const result = run(root, "staged")
  expect(result.code).toBe(2)
  expect(result.output).toContain("package.lgp!settings.xml")
  expect(result.output).not.toContain(token)
})

test("range scan finds a key added and removed in intermediate commits", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  await Bun.write(join(root, "config.txt"), "token=" + "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  git(root, "add", "config.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "added")
  git(root, "rm", "-q", "config.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "removed")
  expect(run(root, "range", base, "HEAD").code).toBe(2)
})

test("range scan reports the source SHA of an archive first created by a merge commit", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  git(root, "checkout", "-qb", "side")
  await Bun.write(join(root, "side.txt"), "side change")
  git(root, "add", "side.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "side")
  git(root, "checkout", "-qb", "topic", base)
  await Bun.write(join(root, "topic.txt"), "topic change")
  git(root, "add", "topic.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "topic")
  git(root, "merge", "--no-ff", "--no-commit", "side")
  const token = "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k"
  await Bun.write(join(root, "settings.xml"), `<token>${token}</token>`)
  expect(Bun.spawnSync(["zip", "-q", "package.lgp", "settings.xml"], { cwd: root }).exitCode).toBe(0)
  git(root, "add", "package.lgp")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "merge with new archive")
  const head = git(root, "rev-parse", "HEAD")
  const result = run(root, "range", base, head)
  expect(result.code).toBe(2)
  expect(result.output).toContain("package.lgp!settings.xml")
  expect(result.output).toContain(head)
  expect(result.output).not.toContain(token)
})

test("pre-push checks all outgoing commits, using the remote SHA from stdin", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  await Bun.write(join(root, "config.txt"), "token=" + "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  git(root, "add", "config.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "added")
  const head = git(root, "rev-parse", "HEAD")
  git(root, "remote", "add", "origin", "https://example.invalid/repo.git")
  git(root, "update-ref", "refs/remotes/origin/loginom", head)
  expect(invoke(root, ["push", "origin"], `refs/heads/topic ${head} refs/heads/topic ${base}\n`).code).toBe(2)
  expect(
    invoke(root, ["push", "https://example.invalid/repo.git"], `refs/heads/topic ${head} refs/heads/topic ${base}\n`)
      .code,
  ).toBe(2)
})

test("pre-push scans archive snapshots without changing the source repository under hook Git environment", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  const token = "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k"
  await Bun.write(join(root, "settings.xml"), `<token>${token}</token>`)
  expect(Bun.spawnSync(["zip", "-q", "package.lgp", "settings.xml"], { cwd: root }).exitCode).toBe(0)
  git(root, "add", "package.lgp")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "archive")
  const head = git(root, "rev-parse", "HEAD")
  const config = await Bun.file(join(root, ".git", "config")).bytes()
  const index = await Bun.file(join(root, ".git", "index")).bytes()
  const result = invoke(root, ["push", "origin"], `refs/heads/topic ${head} refs/heads/topic ${base}\n`, {
    GIT_DIR: join(root, ".git"),
  })
  expect(result.code).toBe(2)
  expect(result.output).toContain("package.lgp!settings.xml")
  expect(result.output).toContain("github-pat")
  expect(result.output).toContain(head)
  expect(result.output).not.toContain(token)
  expect(await Bun.file(join(root, ".git", "config")).bytes()).toEqual(config)
  expect(await Bun.file(join(root, ".git", "index")).bytes()).toEqual(index)
})

test("pre-push scans clean archives from a linked worktree without changing its source config or index", async () => {
  const source = await repo()
  const root = join(source, "linked")
  git(source, "worktree", "add", "-qb", "topic", root)
  const base = git(root, "rev-parse", "HEAD")
  await Bun.write(join(root, "settings.xml"), "safe")
  expect(Bun.spawnSync(["zip", "-q", "package.lgp", "settings.xml"], { cwd: root }).exitCode).toBe(0)
  git(root, "add", "package.lgp")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "archive")
  const directory = git(root, "rev-parse", "--absolute-git-dir")
  const head = git(root, "rev-parse", "HEAD")
  const config = await Bun.file(join(source, ".git", "config")).bytes()
  const index = await Bun.file(join(directory, "index")).bytes()
  const result = invoke(root, ["push", "origin"], `refs/heads/topic ${head} refs/heads/topic ${base}\n`, {
    GIT_DIR: directory,
  })
  expect(result.code).toBe(0)
  expect(result.output).toContain('"status":"clean"')
  expect(result.output).toContain('"archives":1')
  expect(await Bun.file(join(source, ".git", "config")).bytes()).toEqual(config)
  expect(await Bun.file(join(directory, "index")).bytes()).toEqual(index)
})

test("staged archive scan preserves source selection through an alternate Git index", async () => {
  const root = await repo()
  const token = "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k"
  await Bun.write(join(root, "settings.xml"), `<token>${token}</token>`)
  expect(Bun.spawnSync(["zip", "-q", "package.lgp", "settings.xml"], { cwd: root }).exitCode).toBe(0)
  git(root, "add", "package.lgp")
  const alternate = join(root, "alternate-index")
  await Bun.write(alternate, Bun.file(join(root, ".git", "index")))
  git(root, "reset", "-q", "HEAD", "--", "package.lgp")
  const config = await Bun.file(join(root, ".git", "config")).bytes()
  const index = await Bun.file(join(root, ".git", "index")).bytes()
  const staged = await Bun.file(alternate).bytes()
  const result = invoke(root, ["staged"], "", {
    GIT_DIR: join(root, ".git"),
    GIT_COMMON_DIR: join(root, ".git"),
    GIT_WORK_TREE: root,
    GIT_INDEX_FILE: alternate,
    GIT_OBJECT_DIRECTORY: join(root, ".git", "objects"),
  })
  expect(result.code).toBe(2)
  expect(result.output).toContain("package.lgp!settings.xml")
  expect(result.output).toContain("github-pat")
  expect(result.output).not.toContain(token)
  expect(await Bun.file(join(root, ".git", "config")).bytes()).toEqual(config)
  expect(await Bun.file(join(root, ".git", "index")).bytes()).toEqual(index)
  expect(await Bun.file(alternate).bytes()).toEqual(staged)
})

test("range scan finds a secret in a deleted intermediate lgp", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  await Bun.write(join(root, "settings.xml"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  expect(Bun.spawnSync(["zip", "-q", "package.lgp", "settings.xml"], { cwd: root }).exitCode).toBe(0)
  git(root, "add", "package.lgp")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "added")
  const added = git(root, "rev-parse", "HEAD")
  git(root, "rm", "-q", "package.lgp")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "removed")
  const result = run(root, "range", base, "HEAD")
  expect(result.code).toBe(2)
  expect(result.output).toContain("package.lgp!settings.xml")
  expect(result.output).toContain(added)
})

test("clean index ignores an unstaged key and empty changes return immediately", async () => {
  const root = await repo()
  expect(run(root, "staged").code).toBe(0)
  await Bun.write(join(root, "config.txt"), "safe")
  git(root, "add", "config.txt")
  await Bun.write(join(root, "config.txt"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  expect(run(root, "staged").code).toBe(0)
})

test("unreadable lgp blocks instead of returning clean", async () => {
  const root = await repo()
  await Bun.write(join(root, "broken.lgp"), "PK\x03\x04corrupt")
  git(root, "add", "broken.lgp")
  const result = run(root, "staged")
  expect(result.code).toBe(1)
  expect(result.output).toContain("incomplete")
})

test("audit covers side branches and current untracked files", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  git(root, "checkout", "-qb", "side")
  await Bun.write(join(root, "old.txt"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  git(root, "add", "old.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "side secret")
  git(root, "checkout", "-q", "--detach", base)
  await Bun.write(join(root, "new.txt"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  const result = run(root, "audit")
  expect(result.code).toBe(2)
  expect(result.output).toContain("old.txt")
  expect(result.output).toContain("new.txt")
})

test("audit scans the current snapshot independently of the source Git environment", async () => {
  const root = await repo()
  const token = "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k"
  await Bun.write(join(root, "new.txt"), `token=${token}`)
  const config = await Bun.file(join(root, ".git", "config")).bytes()
  const index = await Bun.file(join(root, ".git", "index")).bytes()
  const result = invoke(root, ["audit"], "", {
    GIT_DIR: join(root, ".git"),
    GIT_WORK_TREE: root,
    GIT_INDEX_FILE: join(root, ".git", "index"),
  })
  expect(result.code).toBe(2)
  expect(result.output).toContain("new.txt")
  expect(result.output).toContain("github-pat")
  expect(result.output).not.toContain(token)
  expect(await Bun.file(join(root, ".git", "config")).bytes()).toEqual(config)
  expect(await Bun.file(join(root, ".git", "index")).bytes()).toEqual(index)
})

test("new branches require a baseline and scan only commits beyond it", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  git(root, "remote", "add", "origin", "https://example.invalid/repo.git")
  const zeros = "0".repeat(40)
  expect(invoke(root, ["push", "origin"], `refs/heads/topic ${base} refs/heads/topic ${zeros}\n`).code).toBe(1)
  git(root, "update-ref", "refs/remotes/origin/loginom", base)
  await Bun.write(join(root, "config.txt"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  git(root, "add", "config.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "added")
  expect(
    invoke(root, ["push", "origin"], `refs/heads/topic ${git(root, "rev-parse", "HEAD")} refs/heads/topic ${zeros}\n`)
      .code,
  ).toBe(2)
})

test("multiple updates include force-pushed commits and skip deletions", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "old remote tip", "--allow-empty")
  const old = git(root, "rev-parse", "HEAD")
  git(root, "checkout", "-q", "--detach", base)
  await Bun.write(join(root, "config.txt"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  git(root, "add", "config.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "force tip")
  const deletion = `(delete) ${"0".repeat(40)} refs/heads/gone ${old}\n`
  expect(invoke(root, ["push", "origin"], deletion).code).toBe(0)
  expect(
    invoke(
      root,
      ["push", "origin"],
      deletion + `refs/heads/topic ${git(root, "rev-parse", "HEAD")} refs/heads/topic ${old}\n`,
    ).code,
  ).toBe(2)
})

test("range scan covers a secret introduced only by merge resolution", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  git(root, "checkout", "-qb", "topic")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "topic", "--allow-empty")
  git(root, "checkout", "-qb", "integration", base)
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "integration", "--allow-empty")
  git(root, "merge", "--no-ff", "--no-commit", "topic")
  await Bun.write(join(root, "config.txt"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  git(root, "add", "config.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "merge")
  expect(run(root, "range", base, "HEAD").code).toBe(2)
})

test("encrypted archives and missing scanner cannot pass", async () => {
  const root = await repo()
  await Bun.write(join(root, "settings.xml"), "safe")
  expect(Bun.spawnSync(["zip", "-q", "-P", "fixture", "package.lgp", "settings.xml"], { cwd: root }).exitCode).toBe(0)
  git(root, "add", "package.lgp")
  expect(run(root, "staged").code).toBe(1)
  expect(invoke(root, ["staged"], "", { GITLEAKS_BIN: "/missing/gitleaks" }).code).toBe(1)
})

test("archive scan keeps merged side history even when the archive was deleted", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  git(root, "checkout", "-qb", "side")
  await Bun.write(join(root, "settings.xml"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  Bun.spawnSync(["zip", "-q", "package.lgp", "settings.xml"], { cwd: root })
  git(root, "add", "package.lgp")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "added")
  git(root, "rm", "-q", "package.lgp")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "removed")
  git(root, "checkout", "-qb", "integration", base)
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "integration", "--allow-empty")
  git(root, "-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "-qm", "merge", "side")
  expect(run(root, "range", base, "HEAD").code).toBe(2)
})

test("nested lgp is scanned and corrupt nested zip cannot silently pass", async () => {
  for (const name of ["inner.lgp", "inner.zip"]) {
    const root = await repo()
    if (name.endsWith("lgp")) {
      await Bun.write(join(root, "settings.xml"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
      Bun.spawnSync(["zip", "-q", name, "settings.xml"], { cwd: root })
    } else await Bun.write(join(root, name), "PK\x03\x04corrupt")
    Bun.spawnSync(["zip", "-q", "outer.lgp", name], { cwd: root })
    git(root, "add", "outer.lgp")
    expect(run(root, "staged").code).toBe(name.endsWith("lgp") ? 2 : 1)
  }
})

test("archive text members are not mistaken for compressed data by their names", async () => {
  const root = await repo()
  await Bun.write(join(root, "gyro.zzz"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  Bun.spawnSync(["zip", "-q", "outer.lgp", "gyro.zzz"], { cwd: root })
  git(root, "add", "outer.lgp")
  expect(run(root, "staged").code).toBe(2)
})

test("audit scans Brazilian Markdown as text", async () => {
  const root = await repo()
  await Bun.write(join(root, "README.br.md"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  const result = run(root, "audit")
  expect(result.code).toBe(2)
  expect(result.output).toContain("README.br.md")
})

test("archive path aliases cannot overwrite a member containing a key", async () => {
  const root = await repo()
  await Bun.write(join(root, "secret.txt"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  expect(
    Bun.spawnSync(
      [
        "python3",
        "-c",
        "import zipfile,pathlib; z=zipfile.ZipFile('package.lgp','w'); z.writestr('dir/settings.xml',pathlib.Path('secret.txt').read_bytes()); z.writestr('dir/./settings.xml','safe'); z.close()",
      ],
      { cwd: root },
    ).exitCode,
  ).toBe(0)
  git(root, "add", "package.lgp")
  expect(run(root, "staged").code).toBe(1)
})

test("duplicate TAR entries cannot hide an earlier secret", async () => {
  const root = await repo()
  await Bun.write(join(root, "secret.txt"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  expect(
    Bun.spawnSync(
      [
        "python3",
        "-c",
        "import tarfile,io,pathlib; t=tarfile.open('package.tar','w'); a=pathlib.Path('secret.txt').read_bytes(); h=tarfile.TarInfo('dir/settings.xml'); h.size=len(a); t.addfile(h,io.BytesIO(a)); h=tarfile.TarInfo('dir/settings.xml'); h.size=4; t.addfile(h,io.BytesIO(b'safe')); t.close()",
      ],
      { cwd: root },
    ).exitCode,
  ).toBe(0)
  git(root, "add", "package.tar")
  expect(run(root, "staged").code).toBe(1)
})

test("valid TAR.GZ members are actually scanned", async () => {
  const root = await repo()
  await Bun.write(join(root, "settings.xml"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  expect(Bun.spawnSync(["tar", "-czf", "package.tar.gz", "settings.xml"], { cwd: root }).exitCode).toBe(0)
  git(root, "add", "package.tar.gz")
  const result = run(root, "staged")
  expect(result.code).toBe(2)
  expect(result.output).toContain("package.tar.gz!settings.xml")
})

test("TAR links are treated as metadata without following external targets", async () => {
  const root = await repo()
  await Bun.write(join(root, "outside.txt"), "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  expect(
    Bun.spawnSync(
      [
        "python3",
        "-c",
        "import tarfile,pathlib; t=tarfile.open('package.tar','w'); h=tarfile.TarInfo('link'); h.type=tarfile.SYMTYPE; h.linkname=str(pathlib.Path('outside.txt').resolve()); t.addfile(h); t.close()",
      ],
      { cwd: root },
    ).exitCode,
  ).toBe(0)
  git(root, "add", "package.tar")
  expect(run(root, "staged").code).toBe(0)
})

test("unsafe archive paths and third-level archives block incomplete scans", async () => {
  for (const unsafe of [true, false]) {
    const root = await repo()
    expect(
      Bun.spawnSync(
        [
          "python3",
          "-c",
          unsafe
            ? "import zipfile; z=zipfile.ZipFile('package.lgp','w'); z.writestr('../escape.txt','safe'); z.close()"
            : "import zipfile,io; data=b'safe'; names=['settings.txt','inner.lgp','middle.zip'];\nfor name in names:\n b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); z.writestr(name,data); z.close(); data=b.getvalue()\nopen('package.lgp','wb').write(data)",
        ],
        { cwd: root },
      ).exitCode,
    ).toBe(0)
    git(root, "add", "package.lgp")
    const result = run(root, "staged")
    expect(result.code).toBe(1)
    expect(result.output).toContain("incomplete")
  }
})

test("exceptions are exact and scanner configuration errors do not disclose input", async () => {
  const root = await repo()
  const token = "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k"
  await Bun.write(join(root, "fixture.txt"), token)
  git(root, "add", "fixture.txt")
  await Bun.write(
    join(root, ".gitleaks.toml"),
    `[extend]\nuseDefault = true\n[[rules]]\nid = "github-pat"\n[[rules.allowlists]]\ncondition = "AND"\npaths = ['(^|/)fixture[.]txt$']\nregexTarget = "secret"\nregexes = ['^${token}$']\n`,
  )
  expect(run(root, "staged").code).toBe(0)
  await Bun.write(join(root, "fixture.txt"), token.slice(0, -1) + "N")
  git(root, "add", "fixture.txt")
  expect(run(root, "staged").code).toBe(2)
  await Bun.write(join(root, "fixture.txt"), token)
  git(root, "add", "fixture.txt")
  await Bun.write(join(root, "other.txt"), token)
  git(root, "add", "other.txt")
  expect(run(root, "staged").code).toBe(2)
  await Bun.write(join(root, ".gitleaks.toml"), "invalid = [" + token)
  const result = run(root, "staged")
  expect(result.code).toBe(1)
  expect(result.output).not.toContain(token)
})
