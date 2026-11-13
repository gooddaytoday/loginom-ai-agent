import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "../fixture/fixture"
import { dashboardDataRoot } from "@loginom-ai-agent/product/dashboard-root"
import { DashboardSession } from "../../src/product/dashboard-session"

async function dashboardFolder() {
  await mkdir(DashboardSession.dashboardRoot(), { recursive: true })
  const root = await mkdtemp(join(DashboardSession.dashboardRoot(), "fixture-"))
  await mkdir(join(root, "work"))
  return { root, work: join(root, "work"), [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
}

test("a dashboard work directory is recognized under the same root used by Desktop and CLI", async () => {
  await using folder = await dashboardFolder()
  expect(dashboardDataRoot(process.env)).toBe(DashboardSession.dashboardRoot())
  expect(DashboardSession.isDashboardWork(folder.work)).toBe(true)
  expect(DashboardSession.baseProfile(folder.work)).toBe("loginom-dashboard")
})

test("a regular file named work cannot select the dashboard profile", async () => {
  await using folder = await dashboardFolder()
  await rm(folder.work, { recursive: true })
  await Bun.write(folder.work, "synthetic file")
  expect(DashboardSession.isDashboardWork(folder.work)).toBe(false)
  expect(DashboardSession.baseProfile(folder.work)).toBe("default")
})

test("only the exact dashboard work directory selects the profile", async () => {
  await using folder = await dashboardFolder()
  await using outside = await tmpdir()
  await mkdir(join(folder.work, "src"))
  const direct = join(DashboardSession.dashboardRoot(), "work")
  await mkdir(direct)
  try {
    for (const directory of [
      folder.root,
      join(folder.work, "src"),
      direct,
      join(folder.root, "missing"),
      outside.path,
    ]) {
      expect(DashboardSession.isDashboardWork(directory)).toBe(false)
      expect(DashboardSession.baseProfile(directory)).toBe("default")
    }
    await mkdir(join(outside.path, "work"))
    expect(DashboardSession.isDashboardWork(join(outside.path, "work"))).toBe(false)
  } finally {
    await rm(direct, { recursive: true, force: true })
  }
})

test("the profile follows the real dashboard directory through an outside alias", async () => {
  await using folder = await dashboardFolder()
  await using outside = await tmpdir()
  const alias = join(outside.path, "dashboard-alias")
  await symlink(folder.work, alias, process.platform === "win32" ? "junction" : "dir")
  expect(DashboardSession.isDashboardWork(alias)).toBe(true)
  expect(DashboardSession.baseProfile(alias)).toBe("loginom-dashboard")
  await rm(folder.work, { recursive: true })
  await symlink(outside.path, folder.work, process.platform === "win32" ? "junction" : "dir")
  expect(DashboardSession.isDashboardWork(folder.work)).toBe(false)
  expect(DashboardSession.baseProfile(folder.work)).toBe("default")
})
