import { describe, expect, test } from "bun:test"
import { cliProfile } from "../src/cli-profile"

describe("standalone CLI paths", () => {
  test("native defaults and channels", () => {
    expect(cliProfile({ platform: "linux", home: "/home/user", env: {}, channel: "prod" }).root).toBe(
      "/home/user/.config/com.loginom.aiagent/cli/profiles/default",
    )
    expect(
      cliProfile({ platform: "linux", home: "/home/user", env: { XDG_CONFIG_HOME: "/config" }, channel: "beta" }).root,
    ).toBe("/config/com.loginom.aiagent.beta/cli/profiles/default")
    expect(cliProfile({ platform: "darwin", home: "/Users/user", env: {}, channel: "dev" }).root).toBe(
      "/Users/user/Library/Application Support/com.loginom.aiagent.dev/cli/profiles/default",
    )
    expect(
      cliProfile({ platform: "win32", home: "C:\\Users\\user", env: { APPDATA: "C:\\Roaming" }, channel: "prod" }).root,
    ).toBe("C:\\Roaming\\com.loginom.aiagent\\cli\\profiles\\default")
  })
  test("explicit roots must be absolute and tmp stays inside cache", () => {
    expect(() => cliProfile({ root: "relative", channel: "prod" })).toThrow("PROFILE_ROOT_INVALID")
    const result = cliProfile({ root: "/bench/a", platform: "linux", channel: "prod" })
    expect(result.tmp).toBe("/bench/a/cache/tmp")
    expect(result.loginom).toBe("/bench/a/loginom")
  })
})
