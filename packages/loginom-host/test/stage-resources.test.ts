import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { stageResources } from "../script/stage-resources"

// These fixtures exercise POSIX paths and symlink semantics before input execution.
const posixTest = test.skipIf(process.platform !== "linux" && process.platform !== "darwin")
const target = { platform: process.platform, arch: process.arch }

posixTest("resource staging fails closed for unpinned native targets and unsafe output paths", async () => {
  const input = {
    destination: "/tmp/loginom-resource-test",
    node: "/missing/node",
    browsers: "/missing/browser",
    target: { platform: "win32", arch: "x64" },
    flavor: "cli" as const,
  }
  await expect(stageResources(input)).rejects.toThrow("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
  await expect(
    stageResources({ ...input, target, destination: "relative" }),
  ).rejects.toThrow("LOGINOM_ABSOLUTE_PATH_REQUIRED")
  await expect(
    stageResources({ ...input, target, destination: "/" }),
  ).rejects.toThrow("LOGINOM_BUILD_OUTPUT_OVERLAP")
})

posixTest.each([
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
      target,
      flavor: "cli",
    }),
  ).rejects.toThrow("LOGINOM_BUILD_OUTPUT_OVERLAP")
})

posixTest("resource staging rejects existing aliases before touching inputs", async () => {
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
          target,
          flavor: "cli",
        }),
      ).rejects.toThrow("LOGINOM_BUILD_OUTPUT_OVERLAP")
      expect(await readFile(join(browsers, "keep"), "utf8")).toBe("original")
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
