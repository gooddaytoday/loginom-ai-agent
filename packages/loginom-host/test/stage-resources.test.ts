import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { actionCatalogForPlatform, catalogForTarget, setLinuxSandboxMode, stageResources } from "../script/stage-resources"
import release from "../../product/loginom-release.json"
import { productSkillsDirectory } from "@loginom-ai-agent/product/skills"
import { verifyBundledSkills } from "../src/bundled-skills"

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

test("native catalog selection retains Linux pins and admits only the reviewed macOS catalog", () => {
  expect(catalogForTarget("linux-x64")).toEqual({
    actionManifestUri: release.actionManifestUri,
    actionManifestSha256: release.actionManifestSha256,
  })
  expect(catalogForTarget("darwin-arm64")).toEqual({
    actionManifestUri:
      "viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.14-rc6-macos-candidate/manifest.json",
    actionManifestSha256: "d26ce18ab9ef3285d5bac7aff1d17d4968defb1d41ebd7cbbda8d9cbede07255",
  })
  expect(catalogForTarget("win32-x64")).toEqual(actionCatalogForPlatform("win32"))
  expect(() => catalogForTarget("darwin-x64")).toThrow("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
})

// These fixtures exercise POSIX paths and symlink semantics before input execution.
const posixTest = test.skipIf(process.platform !== "linux" && process.platform !== "darwin")
const target = { platform: process.platform, arch: process.arch }

posixTest("resource outputs cannot overlap the canonical product skills input", async () => {
  const original = await readFile(join(productSkillsDirectory, "loginom-automation/SKILL.md"), "utf8")
  for (const destination of [productSkillsDirectory, join(productSkillsDirectory, "generated")]) {
    await expect(stageResources({ destination, node: "/missing/node", browsers: "/missing/browser", target, flavor: "cli" }))
      .rejects.toThrow("LOGINOM_BUILD_OUTPUT_OVERLAP")
  }
  expect(await readFile(join(productSkillsDirectory, "loginom-automation/SKILL.md"), "utf8")).toBe(original)
})

posixTest("resource staging fails closed for unpinned native targets and unsafe output paths", async () => {
  const input = {
    destination: "/tmp/loginom-resource-test",
    node: "/missing/node",
    browsers: "/missing/browser",
    target: { platform: "win32", arch: "x64" },
    flavor: "cli" as const,
  }
  await expect(stageResources(input)).rejects.toThrow("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
  await expect(stageResources({ ...input, target, destination: "relative" })).rejects.toThrow(
    "LOGINOM_ABSOLUTE_PATH_REQUIRED",
  )
  await expect(stageResources({ ...input, target, destination: "/" })).rejects.toThrow("LOGINOM_BUILD_OUTPUT_OVERLAP")
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

test.skipIf(process.platform !== "linux")("linux sandbox mode keeps the setuid bit", async () => {
  const root = await mkdtemp(join(tmpdir(), "sandbox-mode-"))
  try {
    const file = join(root, "chrome-sandbox")
    await writeFile(file, "sandbox")
    await setLinuxSandboxMode(file)
    expect((await stat(file)).mode & 0o7777).toBe(0o4755)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// Full staging uses the same pinned Node distribution and Chromium as release builds.
// Release/acceptance runners provide these paths; the small boundary tests above do not need them.
test.skipIf(!process.env.LOGINOM_AI_AGENT_TEST_NODE || !process.env.LOGINOM_AI_AGENT_TEST_BROWSERS)(
  "full resource staging delivers the canonical product skills before inventory",
  async () => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE!
    const browsers = process.env.LOGINOM_AI_AGENT_TEST_BROWSERS!
    const root = await mkdtemp(join(tmpdir(), "loginom-stage-product-skills-"))
    try {
      const destination = join(root, "resources")
      await stageResources({ destination, node, browsers, target, flavor: "cli" })
      const skills = await verifyBundledSkills(destination)
      expect(skills.map((skill) => skill.name).toSorted()).toEqual(["loginom-automation", "package-docs"])
      const manifest = await Bun.file(join(destination, "resource-manifest.json")).json()
      for (const path of [
        "loginom-automation/SKILL.md",
        "loginom-automation/references/workflow.md",
        "package-docs/SKILL.md",
        "package-docs/assets/fonts/OFL.txt",
      ]) {
        expect(await readFile(join(destination, "skills", path)))
          .toEqual(await readFile(join(productSkillsDirectory, path)))
        expect(manifest.files.some((file: { path: string }) => file.path === "skills/" + path)).toBe(true)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  300000,
)
