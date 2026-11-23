import { describe, expect, test } from "bun:test"
import { cliProfile, cliProfileService } from "../src/cli-profile"

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

describe("CLI profile services", () => {
  // Desktop takes constant ports below 0x7000 outside this range (decision В-97 п. 7, B4.9); services without an identity
  // listen on 0xc0de, fold into 0x7000-0x7fff on Windows, or take 13420 in a `prod` build.
  test("each channel's profiles get ports from its own quarter of 0x6000-0x6bff", () => {
    const roots = ["/home/a/.config/com.loginom.aiagent/cli/profiles/default", "/bench/a", "/bench/b", "C:\\Roaming\\x"]
    for (const [index, channel] of (["prod", "beta", "dev"] as const).entries())
      for (const root of roots) {
        const service = cliProfileService(root, channel)
        expect(service.port).toBeGreaterThanOrEqual(0x6000 + 0x400 * index)
        expect(service.port).toBeLessThan(0x6400 + 0x400 * index)
        expect(service.identity).toMatch(/^cli-[0-9a-f]{8}$/)
      }
  })

  test("the default profiles of the channels never share a port, and a root always gets the same service", () => {
    const ports = (["prod", "beta", "dev"] as const).map(
      (channel) =>
        cliProfileService(cliProfile({ platform: "linux", home: "/home/user", env: {}, channel }).root, channel).port,
    )
    expect(new Set(ports).size).toBe(3)
    expect(cliProfileService("/bench/a", "dev")).toEqual(cliProfileService("/bench/a", "dev"))
    expect(cliProfileService("/bench/a", "dev").identity).not.toBe(cliProfileService("/bench/b", "dev").identity)
  })
})
