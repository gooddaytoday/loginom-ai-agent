// Which Location belongs to a dashboard (B2.9b, guarantee G1): the four folder cases of 0.4
// `v0.4.0:packages/opencode/test/product/dashboard-session.test.ts`, on the plugin's `Dashboard.isWork`, plus the latch.
// 0.4's first case also compared the root with `dashboardDataRoot(process.env)` of `product`, the root Desktop and the
// CLI computed themselves; in OpenCode 2 the server prepares the folders (B2.9h), so only its own root counts.
// Its paths (B2.9c): the path case of the same file on `Dashboard.pathError`, and what the plugin's hooks ask of it
// (`settle`, `searchError`); the real tools on a server are `server/test/loginom-dashboard-files.test.ts`.
// The root is under the server's data directory, which each case points at a temporary directory of its own
// (`fixture/temporary-data.ts`) and removes with its folders.
import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { Global } from "@opencode/util/global"
import { Dashboard } from "../src/dashboard"
import { temporaryData } from "./fixture/temporary-data"

const link = process.platform === "win32" ? "junction" : "dir"

async function dashboardFolder() {
  const data = await temporaryData()
  await mkdir(Dashboard.root(), { recursive: true })
  const root = await mkdtemp(join(Dashboard.root(), "fixture-"))
  await mkdir(join(root, "work"))
  return { root, work: join(root, "work"), [Symbol.asyncDispose]: () => data[Symbol.asyncDispose]() }
}

async function outsideFolder() {
  const path = await mkdtemp(join(tmpdir(), "dashboard-outside-"))
  return { path, [Symbol.asyncDispose]: () => rm(path, { recursive: true, force: true }) }
}

test("a dashboard work directory is recognized under the server's data root", async () => {
  await using folder = await dashboardFolder()
  expect(Dashboard.isWork(folder.work)).toBe(true)
})

test("a regular file named work cannot select the dashboard profile", async () => {
  await using folder = await dashboardFolder()
  await rm(folder.work, { recursive: true })
  await Bun.write(folder.work, "synthetic file")
  expect(Dashboard.isWork(folder.work)).toBe(false)
})

test("only the exact dashboard work directory selects the profile", async () => {
  await using folder = await dashboardFolder()
  await using outside = await outsideFolder()
  await mkdir(join(folder.work, "src"))
  const direct = join(Dashboard.root(), "work")
  await mkdir(direct)
  for (const directory of [folder.root, join(folder.work, "src"), direct, join(folder.root, "missing"), outside.path])
    expect(Dashboard.isWork(directory)).toBe(false)
  await mkdir(join(outside.path, "work"))
  expect(Dashboard.isWork(join(outside.path, "work"))).toBe(false)
})

test("the profile follows the real dashboard directory through an outside alias", async () => {
  await using folder = await dashboardFolder()
  await using outside = await outsideFolder()
  const alias = join(outside.path, "dashboard-alias")
  await symlink(folder.work, alias, link)
  expect(Dashboard.isWork(alias)).toBe(true)
  await rm(folder.work, { recursive: true })
  await symlink(outside.path, folder.work, link)
  expect(Dashboard.isWork(folder.work)).toBe(false)
})

test("a Location's latch catches a folder that appears later and keeps it after the folder disappears", async () => {
  await using folder = await dashboardFolder()
  await rm(folder.work, { recursive: true })
  const dashboard = Dashboard.latch(folder.work)
  expect(dashboard()).toBe(false)
  await mkdir(folder.work)
  expect(dashboard()).toBe(true)
  await rm(folder.work, { recursive: true })
  expect(Dashboard.isWork(folder.work)).toBe(false)
  expect(dashboard()).toBe(true)
})

// 0.4's case ran twice, the second time inside a git repository: the check goes by the real path alone, whatever Core
// counts as the project. Its targets are absolute, as the hook resolves them; a relative one is resolved lexically, as
// Core resolves it. 0.4 also showed that an ordinary directory restricts nothing; here the hook asks only in a dashboard
// Location (the server's control case), and a work folder that disappeared refuses everything instead.
test("dashboard paths stay within work for reading and src for writing, including inside a git repository", async () => {
  await using folder = await dashboardFolder()
  await mkdir(join(folder.work, "src"))
  await mkdir(join(folder.root, "control"))
  await Bun.write(join(folder.root, "control", "binding.json"), "synthetic")
  for (const file of ["src/main.tsx", "snapshot.json", "sample.json"])
    await Bun.write(join(folder.work, file), "synthetic")
  await symlink(join(folder.root, "control"), join(folder.work, "src", "link"), link)
  await symlink("main.tsx", join(folder.work, "src", "file.ts"))
  await symlink("../../control/new.json", join(folder.work, "src", "dangling.ts"))
  for (const repository of [false, true]) {
    if (repository) expect(Bun.spawnSync(["git", "init", "-q", Global.Path.data]).exitCode).toBe(0)
    for (const target of [
      folder.work,
      join(folder.work, "snapshot.json"),
      join(folder.work, "src/main.tsx"),
      join(folder.work, "src/file.ts"),
    ])
      expect([repository, target, Dashboard.pathError(folder.work, target)]).toEqual([repository, target, undefined])
    for (const target of [
      join(folder.root, "control/binding.json"),
      resolve(folder.work, "../control"),
      "/etc/hostname",
      Global.Path.data,
      join(folder.work, "src/link/binding.json"),
    ])
      expect([target, Dashboard.pathError(folder.work, target)]).toEqual([target, Dashboard.outside])
    for (const target of [join(folder.work, "src/main.tsx"), join(folder.work, "src/a/b.ts")])
      expect([target, Dashboard.pathError(folder.work, target, true)]).toEqual([target, undefined])
    for (const target of [
      "sample.json",
      "snapshot.json",
      "vite.config.ts",
      "loginom-ai-agent.json",
      "../control/binding.json",
      "src/../sample.json",
      "src/link/x.json",
      "src/link/binding.json",
    ])
      expect([target, Dashboard.pathError(folder.work, resolve(folder.work, target), true)]).toEqual([
        target,
        Dashboard.srcOnly,
      ])
    for (const file of ["src/file.ts", "src/dangling.ts"])
      expect([file, Dashboard.pathError(folder.work, join(folder.work, file), true)]).toEqual([
        file,
        Dashboard.fileLink,
      ])
    expect(Dashboard.pathError(folder.work, join(folder.work, "src/dangling.ts"))).toBe(Dashboard.dangling)
    expect(Dashboard.pathError(folder.work, join(folder.work, "src/dangling.ts/inner.ts"))).toBe(Dashboard.dangling)
  }
  await rm(folder.work, { recursive: true })
  for (const write of [false, true])
    expect(Dashboard.pathError(folder.work, join(folder.work, "src/main.tsx"), write)).toBe(Dashboard.gone)
})

test("the dashboard's word on a request: outside refused, a write in src allowed, the rest left to the rules", async () => {
  await using folder = await dashboardFolder()
  await mkdir(join(folder.work, "src"))
  await mkdir(join(folder.root, "control"))
  const word = (action: string, ...resources: string[]) => Dashboard.settle(folder.work, { action, resources })
  // A resource is relative to the Location, or absolute outside it.
  expect(word("external_directory", join(folder.root, "control") + "/*")).toEqual({
    effect: "deny",
    message: Dashboard.deniedText(Dashboard.outside),
  })
  expect(word("edit", "src/main.tsx", "src/a/b.ts")).toEqual({ effect: "allow" })
  // `patch` asks for all its targets at once: one outside refuses the call.
  expect(word("edit", "src/main.tsx", "sample.json")).toEqual({
    effect: "deny",
    message: Dashboard.deniedText(Dashboard.srcOnly),
  })
  expect(word("read", "../control/binding.json")).toEqual({
    effect: "deny",
    message: Dashboard.deniedText(Dashboard.outside),
  })
  for (const [action, resources] of [
    ["read", ["sample.json", "src/main.tsx", "."]],
    ["read", ["skill://loginom-dashboard/SKILL.md"]],
    ["glob", ["../**"]],
    ["grep", ["\\.\\./control"]],
    ["dashboard_publish", ["*"]],
    ["skill", ["loginom-dashboard"]],
  ] as const)
    expect([action, resources, word(action, ...resources)]).toEqual([action, resources, undefined])
})

test("a dashboard search stays in the work folder: its path by the real path, `~` as Core expands it, no `..` in a glob", async () => {
  await using folder = await dashboardFolder()
  await using outside = await outsideFolder()
  await mkdir(join(folder.work, "src"))
  await mkdir(join(folder.root, "control"))
  await symlink(join(folder.root, "control"), join(folder.work, "src", "link"), link)
  for (const [tool, input] of [
    ["glob", { pattern: "**/*.tsx" }],
    ["glob", { pattern: "*", path: "src" }],
    ["grep", { pattern: "\\.\\./x", include: "*.tsx" }],
    ["grep", { pattern: "x", path: join(folder.work, "src") }],
    ["read", { path: "../control/binding.json" }],
  ] as const)
    expect([tool, input, Dashboard.searchError(folder.work, tool, input)]).toEqual([tool, input, undefined])
  for (const [tool, input] of [
    ["glob", { pattern: "*", path: ".." }],
    ["glob", { pattern: "../control/*" }],
    ["glob", { pattern: "src/../../control/*" }],
    ["glob", { pattern: "*", path: "src/link" }],
    ["glob", { pattern: "*", path: "~" }],
    ["glob", { pattern: "*", path: "~/" }],
    ["glob", { pattern: "*", path: outside.path }],
    ["grep", { pattern: "x", path: ".." }],
    ["grep", { pattern: "x", path: "src/link/binding.json" }],
    ["grep", { pattern: "x", include: "../control/*" }],
  ] as const)
    expect([tool, input, Dashboard.searchError(folder.work, tool, input)]).toEqual([tool, input, Dashboard.outside])
})
