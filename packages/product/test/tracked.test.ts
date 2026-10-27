import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { trackedSnapshot } from "./tracked"

let repo: string
const git = (...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo, stdio: "pipe" })
const put = (path: string, content: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), content)
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "tracked-snapshot-"))
  git("init", "-q")
  put("gen/client.gen.ts", "export const client = 1\n")
  put("src/index.ts", "export const index = 1\n")
  symlinkSync("../gen/client.gen.ts", join(repo, "src", "link.ts"))
  git("add", ".")
  git("commit", "-q", "-m", "init")
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("trackedSnapshot", () => {
  test("a tracked file deleted from the working tree is still listed and readable", () => {
    rmSync(join(repo, "gen"), { recursive: true })
    const snapshot = trackedSnapshot(repo)
    expect(snapshot.paths).toContain("gen/client.gen.ts")
    expect(snapshot.read("gen/client.gen.ts")).toBe("export const client = 1\n")
  })

  test("the content is the indexed one, not whatever the working tree holds now", () => {
    put("gen/client.gen.ts", "")
    expect(trackedSnapshot(repo).read("gen/client.gen.ts")).toBe("export const client = 1\n")
  })

  test("a staged change is part of the snapshot and an untracked file is not", () => {
    put("src/index.ts", "export const index = 2\n")
    git("add", "src/index.ts")
    put("src/untracked.ts", "export {}\n")
    const snapshot = trackedSnapshot(repo)
    expect(snapshot.read("src/index.ts")).toBe("export const index = 2\n")
    expect(snapshot.paths).not.toContain("src/untracked.ts")
  })

  test("a tracked symlink reads as the file it points to", () => {
    rmSync(join(repo, "gen"), { recursive: true })
    expect(trackedSnapshot(repo).read("src/link.ts")).toBe("export const client = 1\n")
  })
})
