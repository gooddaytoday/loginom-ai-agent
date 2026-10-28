import { expect, test } from "bun:test"
import { Installation } from "../../src/installation"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

for (const method of ["curl", "npm", "yarn", "pnpm", "bun", "brew", "scoop", "choco", "unknown"] as const) {
  test(`does not resolve upstream updates for ${method}`, async () => {
    expect(await Installation.latest(method)).toBe(InstallationVersion)
  })
  test(`cannot replace Loginom with an upstream ${method} package`, async () => {
    await expect(Installation.upgrade(method, "999.0.0")).rejects.toThrow("Automatic CLI updates are not configured")
  })
  test(`cannot move Loginom to an upstream major release with ${method}`, async () => {
    await expect(Installation.upgradeMajor(method)).rejects.toThrow("Automatic CLI updates are not configured")
  })
}

test("reports manual package installation and a product user agent", async () => {
  expect(await Installation.method()).toBe("unknown")
  expect(Installation.userAgent("desktop")).toStartWith("loginom-ai-agent/")
})

test("the application runtime resolves the product installation service", async () => {
  const { AppRuntime } = await import("../../src/effect/app-runtime")
  const info = await AppRuntime.runPromise(Installation.use.info())
  expect(info).toEqual({ version: InstallationVersion, latest: InstallationVersion })
  expect(await AppRuntime.runPromise(Installation.use.method())).toBe("unknown")
})

test("the update check offers neither an upstream release nor the OpenCode 2 upgrade", async () => {
  const { upgrade } = await import("../../src/cli/upgrade")
  expect(await upgrade()).toBeUndefined()
})
