import { expect, test } from "bun:test"
import { Installation } from "../../src/installation"
import { InstallationVersion } from "@loginom-ai-agent/core/installation/version"

for (const method of ["curl", "npm", "yarn", "pnpm", "bun", "brew", "scoop", "choco", "unknown"] as const) {
  test(`does not resolve upstream updates for ${method}`, async () => {
    expect(await Installation.latest(method)).toBe(InstallationVersion)
  })
  test(`cannot replace Loginom with an upstream ${method} package`, async () => {
    await expect(Installation.upgrade(method, "999.0.0")).rejects.toThrow("Automatic CLI updates are not configured")
  })
}

test("reports manual package installation and a product user agent", async () => {
  expect(await Installation.method()).toBe("unknown")
  expect(Installation.userAgent("desktop")).toStartWith("loginom-ai-agent/")
})

test("classifies release changes", () => {
  expect(Installation.getReleaseType("1.2.3", "2.0.0")).toBe("major")
  expect(Installation.getReleaseType("1.2.3", "1.3.0")).toBe("minor")
  expect(Installation.getReleaseType("1.2.3", "1.2.4")).toBe("patch")
})
