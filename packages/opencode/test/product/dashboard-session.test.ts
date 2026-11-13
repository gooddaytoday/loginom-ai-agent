import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "../fixture/fixture"
import { Global } from "@opencode-ai/core/global"
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

test("dashboard paths stay within work for reading and src for writing, including inside a git repository", async () => {
  await using folder = await dashboardFolder()
  await using outside = await tmpdir()
  await mkdir(join(folder.work, "src"))
  await mkdir(join(folder.root, "control"))
  await Bun.write(join(folder.root, "control", "binding.json"), "synthetic")
  for (const file of ["src/main.tsx", "snapshot.json", "sample.json"])
    await Bun.write(join(folder.work, file), "synthetic")
  await symlink(join(folder.root, "control"), join(folder.work, "src", "link"), "dir")
  await symlink("main.tsx", join(folder.work, "src", "file.ts"))
  await symlink("../../control/new.json", join(folder.work, "src", "dangling.ts"))
  const git = join(process.env.XDG_DATA_HOME!, ".git")
  try {
    for (const repository of [false, true]) {
      if (repository) expect(Bun.spawnSync(["git", "init", process.env.XDG_DATA_HOME!]).exitCode).toBe(0)
      for (const target of [
        folder.work,
        join(folder.work, "snapshot.json"),
        join(folder.work, "src/main.tsx"),
        join(folder.work, "src/file.ts"),
      ])
        expect(DashboardSession.dashboardPathError(folder.work, target)).toBeUndefined()
      for (const target of [
        join(folder.root, "control/binding.json"),
        resolve(folder.work, "../control"),
        "/etc/hostname",
        Global.Path.data,
      ])
        expect(DashboardSession.dashboardPathError(folder.work, target)).toBe(
          "Сессия dashboard: доступна только рабочая папка",
        )
      for (const target of [join(folder.work, "src/main.tsx"), join(folder.work, "src/a/b.ts")])
        expect(DashboardSession.dashboardPathError(folder.work, target, true)).toBeUndefined()
      for (const target of [
        "sample.json",
        "snapshot.json",
        "vite.config.ts",
        "../control/binding.json",
        "src/../sample.json",
        "src/link/x.json",
        "src/link/binding.json",
      ])
        expect(DashboardSession.dashboardPathError(folder.work, resolve(folder.work, target), true)).toBe(
          "Сессия dashboard: запись разрешена только в src/",
        )
      for (const file of ["src/file.ts", "src/dangling.ts"])
        expect(DashboardSession.dashboardPathError(folder.work, join(folder.work, file), true)).toBe(
          "Сессия dashboard: запись в символьную ссылку запрещена",
        )
      expect(DashboardSession.dashboardPathError(folder.work, join(folder.work, "src/dangling.ts"))).toBe(
        "Сессия dashboard: путь ведёт в недоступную ссылку",
      )
      for (const write of [false, true])
        for (const target of [folder.work, "/etc/hostname", Global.Path.data, join(folder.work, "src/dangling.ts")])
          expect(DashboardSession.dashboardPathError(outside.path, target, write)).toBeUndefined()
    }
  } finally {
    await rm(git, { recursive: true, force: true })
  }
})
