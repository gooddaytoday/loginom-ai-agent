import { expect, test } from "bun:test"
import { homedir } from "node:os"
import { join } from "node:path"
import { dashboardDataRoot } from "../src/dashboard-root"

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
