import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const project = fileURLToPath(new URL("../../../", import.meta.url))
const workflow = Bun.YAML.parse(await Bun.file(join(project, ".github/workflows/secrets.yml")).text()) as {
  on: Record<string, { branches?: string[]; tags?: string[] }>
  jobs: { "secret-scan": { steps: { name?: string; uses?: string; run?: string; with?: { ref?: string } }[] } }
}
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: root })
  if (result.exitCode) throw new Error("Fixture git command failed")
  return result.stdout.toString().trim()
}

async function repo() {
  const root = await mkdtemp(join(tmpdir(), "secret-workflow-"))
  roots.push(root)
  git(root, "init", "-q")
  git(root, "config", "user.name", "Secret workflow test")
  git(root, "config", "user.email", "test@example.invalid")
  await mkdir(join(root, "packages/script/src"), { recursive: true })
  await Bun.write(
    join(root, "packages/script/src/secret-scan.ts"),
    Bun.file(join(project, "packages/script/src/secret-scan.ts")),
  )
  await Bun.write(join(root, ".gitleaks-version"), Bun.file(join(project, ".gitleaks-version")))
  await Bun.write(join(root, ".gitleaks.toml"), "[extend]\nuseDefault = true\n")
  await Bun.write(join(root, ".gitignore"), "node_modules\n")
  await Bun.write(
    join(root, "package.json"),
    '{"scripts":{"secrets":"bun --no-install packages/script/src/secret-scan.ts"}}',
  )
  await symlink(join(project, "node_modules"), join(root, "node_modules"), "dir")
  git(root, "add", ".")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "trusted scanner")
  return root
}

function scan(root: string, env: Record<string, string>) {
  const step = workflow.jobs["secret-scan"].steps.find((step) => step.name === "Scan only incoming commits")
  if (!step?.run) throw new Error("Scan step missing")
  const result = Bun.spawnSync(["bash", "-e", "-o", "pipefail", "-c", step.run], {
    cwd: root,
    env: { ...process.env, ...env },
  })
  return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }
}

test("PR scan runs trusted base code and blocks a head that replaces the scanner and policy", async () => {
  expect(workflow.on.pull_request).toBeUndefined()
  expect(workflow.on.pull_request_target?.branches).toContain("loginom")
  expect(workflow.jobs["secret-scan"].steps[0].with?.ref).toBe(
    "${{ github.event.pull_request.base.sha || github.sha }}",
  )
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  const token = "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k"
  await Bun.write(join(root, "config.txt"), `token=${token}\n`)
  await Bun.write(join(root, "packages/script/src/secret-scan.ts"), "await Bun.write('untrusted-executed', 'yes')\n")
  await Bun.write(join(root, "package.json"), '{"scripts":{"secrets":"touch untrusted-executed"}}')
  await Bun.write(join(root, ".gitleaks.toml"), '[allowlist]\nregexes = [".*"]\n')
  git(root, "add", ".")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "hostile head")
  const head = git(root, "rev-parse", "HEAD")
  git(root, "checkout", "-q", "--detach", base)
  const result = scan(root, { EVENT: "pull_request_target", BASE: base, HEAD: head, BEFORE: "" })
  expect(result.code).toBe(2)
  expect(result.output).toContain("github-pat")
  expect(result.output).not.toContain(token)
  expect(await Bun.file(join(root, "untrusted-executed")).exists()).toBe(false)
})

test("push of a new annotated tag scans its incoming commits", async () => {
  expect(workflow.on.push.tags).toContain("**")
  const root = await repo()
  git(root, "update-ref", "refs/remotes/origin/loginom", "HEAD")
  await Bun.write(join(root, "config.txt"), "token=" + "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  git(root, "add", ".")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "incoming")
  git(root, "tag", "-am", "release", "release")
  const result = scan(root, {
    EVENT: "push",
    BASE: "",
    HEAD: git(root, "rev-parse", "release"),
    BEFORE: "0".repeat(40),
  })
  expect(result.code).toBe(2)
  expect(result.output).toContain("github-pat")
})

test("updated annotated tag retains a secret removed before its final commit", async () => {
  const root = await repo()
  git(root, "tag", "-am", "old", "old")
  await Bun.write(join(root, "config.txt"), "token=" + "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  git(root, "add", ".")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "added")
  git(root, "rm", "-q", "config.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "removed")
  git(root, "tag", "-am", "new", "new")
  const result = scan(root, {
    EVENT: "push",
    BASE: "",
    HEAD: git(root, "rev-parse", "new"),
    BEFORE: git(root, "rev-parse", "old"),
  })
  expect(result.code).toBe(2)
  expect(result.output).toContain("github-pat")
})

for (const event of ["push", "pull_request_target"]) {
  test(`clean ${event} range passes from the trusted checkout`, async () => {
    const root = await repo()
    const base = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/loginom", base)
    await Bun.write(join(root, "readme.txt"), "ordinary change\n")
    git(root, "add", ".")
    git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "clean")
    const head = git(root, "rev-parse", "HEAD")
    git(root, "checkout", "-q", "--detach", base)
    const result = scan(root, { EVENT: event, BASE: base, HEAD: head, BEFORE: "0".repeat(40) })
    expect(result.code).toBe(0)
    expect(result.output).toContain('"status":"clean"')
    expect(result.output).toContain('"commits":1')
  })
}

test("new tag without the loginom baseline fails closed", async () => {
  const root = await repo()
  const result = scan(root, { EVENT: "push", BASE: "", HEAD: git(root, "rev-parse", "HEAD"), BEFORE: "0".repeat(40) })
  expect(result.code).not.toBe(0)
  expect(result.output).not.toContain('"status":"clean"')
})

for (const secret of [false, true]) {
  test(`force push with an unavailable before object ${secret ? "blocks an intermediate secret" : "scans the clean range"}`, async () => {
    const root = await repo()
    git(root, "update-ref", "refs/remotes/origin/loginom", "HEAD")
    await Bun.write(
      join(root, "config.txt"),
      secret ? "token=" + "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k" : "ordinary change\n",
    )
    git(root, "add", ".")
    git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "incoming")
    git(root, "rm", "-q", "config.txt")
    git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "removed")
    const result = scan(root, {
      EVENT: "push",
      BASE: "",
      HEAD: git(root, "rev-parse", "HEAD"),
      BEFORE: "1".repeat(40),
    })
    expect(result.code).toBe(secret ? 2 : 0)
    expect(result.output).toContain(secret ? "github-pat" : '"commits":2')
  })
}

test("force push with an available divergent before scans from the common ancestor", async () => {
  const root = await repo()
  const base = git(root, "rev-parse", "HEAD")
  await Bun.write(join(root, "config.txt"), "token=" + "ghp_" + "tR7mPQ2x9L4n6V1s3X5z0C8w2B7d4F6h9J1k")
  git(root, "add", ".")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "shared secret")
  const shared = git(root, "rev-parse", "HEAD")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-qm", "old tip")
  const before = git(root, "rev-parse", "HEAD")
  git(root, "checkout", "-q", "--detach", shared)
  git(root, "rm", "-q", "config.txt")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "new tip")
  // The common ancestor itself is trusted history, so neither it nor older commits are incoming.
  const result = scan(root, { EVENT: "push", BASE: base, HEAD: git(root, "rev-parse", "HEAD"), BEFORE: before })
  expect(result.code).toBe(0)
  expect(result.output).toContain('"commits":1')
})

test("unavailable before without a usable baseline fails closed", async () => {
  const root = await repo()
  const head = git(root, "rev-parse", "HEAD")
  const env = { EVENT: "push", BASE: "", HEAD: head, BEFORE: "1".repeat(40) }
  expect(scan(root, env).code).not.toBe(0)
  git(root, "update-ref", "refs/remotes/origin/loginom", head)
  const result = scan(root, env)
  expect(result.code).not.toBe(0)
  expect(result.output).not.toContain('"status":"clean"')
})
