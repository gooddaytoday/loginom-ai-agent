import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { actionCatalogForPlatform, stageResources } from "../script/stage-resources"

test("resource staging selects the signed action catalog for the target platform", () => {
  expect(actionCatalogForPlatform("linux")).toEqual({
    actionManifestUri:
      "viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.14-rc6-linux-candidate/manifest.json",
    actionManifestSha256: "17764f9a8137b199e4d89d4bdeea1a004778f825d50bfba6b68d64a9f5a588a4",
  })
  expect(actionCatalogForPlatform("win32")).toEqual({
    actionManifestUri:
      "viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.14-rc6-windows-candidate/manifest.json",
    actionManifestSha256: "174258527893d1d8d5491407630b33ffdeef677aa83ad686945cc000f819beb8",
  })
  expect(() => actionCatalogForPlatform("freebsd")).toThrow("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
})

// These fixtures use Linux absolute paths and symlink semantics.
const linuxTest = test.skipIf(process.platform !== "linux")

linuxTest("resource staging fails closed for unpinned native targets and unsafe output paths", async () => {
  const input = {
    destination: "/tmp/loginom-resource-test",
    node: "/missing/node",
    browsers: "/missing/browser",
    target: { platform: "win32", arch: "x64" },
    flavor: "cli" as const,
  }
  await expect(stageResources(input)).rejects.toThrow("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
  await expect(
    stageResources({ ...input, target: { platform: "linux", arch: "x64" }, destination: "relative" }),
  ).rejects.toThrow("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  await expect(
    stageResources({ ...input, target: { platform: "linux", arch: "x64" }, destination: "/" }),
  ).rejects.toThrow("LOGINOM_BUILD_OUTPUT_OVERLAP")
})

linuxTest.each([
  { destination: "/missing/browser/output", browsers: "/missing/browser" },
  { destination: "/missing/browser/..nested", browsers: "/missing/browser" },
  { destination: "/missing/output", browsers: "/missing/output.staging/browser" },
  { destination: "/missing/output", browsers: "/missing/output.staging" },
  { destination: resolve(import.meta.dir, "../../loginom-runtime/generated"), browsers: "/missing/browser" },
])("resource output and staging cannot overlap inputs: %j", async (paths) => {
  await expect(
    stageResources({
      ...paths,
      node: "/missing/node",
      target: { platform: "linux", arch: "x64" },
      flavor: "cli",
    }),
  ).rejects.toThrow("LOGINOM_BUILD_OUTPUT_OVERLAP")
})

linuxTest("resource staging rejects existing aliases before touching inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-stage-alias-"))
  try {
    const browsers = join(root, "browsers")
    await mkdir(browsers)
    await writeFile(join(browsers, "keep"), "original")
    await symlink(browsers, join(root, "alias"))
    await symlink(browsers, join(root, "output.staging"))
    for (const destination of [join(root, "alias/new/nested"), join(root, "alias"), join(root, "output")]) {
      await expect(
        stageResources({
          destination,
          browsers,
          node: "/bin/true",
          target: { platform: "linux", arch: "x64" },
          flavor: "cli",
        }),
      ).rejects.toThrow("LOGINOM_BUILD_OUTPUT_OVERLAP")
      expect(await readFile(join(browsers, "keep"), "utf8")).toBe("original")
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
