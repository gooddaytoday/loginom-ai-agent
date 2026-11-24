// Which Location belongs to a dashboard (B2.9b, guarantee G1): the four folder cases of 0.4
// `v0.4.0:packages/opencode/test/product/dashboard-session.test.ts`, on the plugin's `Dashboard.isWork`, plus the latch.
// 0.4's first case also compared the root with `dashboardDataRoot(process.env)` of `product`, the root Desktop and the
// CLI computed themselves; in OpenCode 2 the server prepares the folders (B2.9h), so only its own root counts.
// The root is under the server's data directory, which each case points at a temporary directory of its own
// (`fixture/temporary-data.ts`) and removes with its folders.
import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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
