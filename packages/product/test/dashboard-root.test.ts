import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { dashboardDataRoot, isDashboardWorkDirectory } from "../src/dashboard-root"

test("Desktop dashboard data follows the backend XDG channel directory", () => {
  expect(dashboardDataRoot({ XDG_DATA_HOME: "/fixture/data", LOGINOM_AI_AGENT_CHANNEL: "prod" })).toBe(
    join("/fixture/data", "loginom-ai-agent", "dashboards"),
  )
  expect(dashboardDataRoot({ XDG_DATA_HOME: "/fixture/data", LOGINOM_AI_AGENT_CHANNEL: "beta" })).toBe(
    join("/fixture/data", "loginom-ai-agent-beta", "dashboards"),
  )
})

test("Desktop dashboard data uses the home fallback when XDG is unset or empty", () => {
  for (const env of [{}, { XDG_DATA_HOME: "" }])
    expect(dashboardDataRoot(env)).toBe(join(homedir(), ".local", "share", "loginom-ai-agent", "dashboards"))
})

test("the guarded standalone CLI profile owns its dashboard data regardless of XDG and channel", () => {
  expect(
    dashboardDataRoot({
      LOGINOM_AI_AGENT_CLI_ROOT: "/fixture/profile",
      XDG_DATA_HOME: "/fixture/xdg",
      LOGINOM_AI_AGENT_CHANNEL: "beta",
    }),
  ).toBe(join("/fixture/profile", "data", "dashboards"))
})

test("only real work directories within the dashboard root identify dashboard chats", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "dashboard-work-"))
  const root = join(fixture, "profile", "dashboards")
  const work = join(root, "campaign", "work")
  const ordinary = join(fixture, "project", "dashboards", "campaign", "work")
  const alias = join(fixture, "dashboard-alias")
  try {
    await mkdir(work, { recursive: true })
    await mkdir(ordinary, { recursive: true })
    await symlink(work, alias, process.platform === "win32" ? "junction" : "dir")

    expect(isDashboardWorkDirectory(work, root)).toBe(true)
    expect(isDashboardWorkDirectory(alias, root)).toBe(true)
    expect(isDashboardWorkDirectory(ordinary, root)).toBe(false)
    expect(isDashboardWorkDirectory(join(root, "missing", "work"), root)).toBe(false)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
