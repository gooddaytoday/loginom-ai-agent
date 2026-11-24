import { expect, test } from "bun:test"
import { cp, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { actionCatalogForPlatform, catalogForTarget, setLinuxSandboxMode, stageResources } from "../script/stage-resources"
import release from "../../product/loginom-release.json"
import { productHelpDirectory, productSkillsDirectory } from "@loginom-ai-agent/product/skills"
import { dashboardResources } from "../../dashboard/src/agent/resources"
import { buildDashboard } from "../../dashboard/src/agent/build"
import { verifyBundledSkills } from "../src/bundled-skills"
import { ripgrepPins } from "../script/ripgrep-resource"
import { removeFixture } from "./remove-fixture"

test("resource staging selects the signed action catalog for the target platform", () => {
  expect(actionCatalogForPlatform("linux")).toEqual({
    actionManifestUri:
      "viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.11.16-rest-save-linux-candidate/manifest.json",
    actionManifestSha256: "118ee37cccf1a80fafa628b370786da9f9e753308c064ac460f83b40f98e8716",
  })
  expect(actionCatalogForPlatform("win32")).toEqual({
    actionManifestUri:
      "viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.11.16-rest-save-windows-candidate/manifest.json",
    actionManifestSha256: "0ac3ebe8ca6036012c521f2c4e70661c65ee3d073dfd2cd8d26f418a77e1c05d",
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
      "viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.11.16-rest-save-macos-candidate/manifest.json",
    actionManifestSha256: "da96c141cdf7df26680ff5a3ef026b6fc6d7b3473e684e26d4b083ba197c4b09",
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

posixTest("resource staging cannot overwrite the package-docs generator source", async () => {
  const source = resolve(import.meta.dir, "../src/package-docs")
  const before = await readFile(join(source, "extract.ts"))
  for (const destination of [source, join(source, "generated")]) {
    await expect(stageResources({ destination, node: "/missing/node", browsers: "/missing/browser", target, flavor: "cli" }))
      .rejects.toThrow("LOGINOM_BUILD_OUTPUT_OVERLAP")
  }
  expect(await readFile(join(source, "extract.ts"))).toEqual(before)
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
  { destination: resolve(import.meta.dir, "../../dashboard/generated"), browsers: "/missing/browser" },
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
// It stages the Desktop set: the CLI artifact build verifies its own (cli-manifest.ts), Desktop has no such build.
test.skipIf(!process.env.LOGINOM_AI_AGENT_TEST_NODE || !process.env.LOGINOM_AI_AGENT_TEST_BROWSERS)(
  "full resource staging inventories product skills and a buildable dashboard kit",
  async () => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE!
    const browsers = process.env.LOGINOM_AI_AGENT_TEST_BROWSERS!
    const root = await mkdtemp(join(tmpdir(), "loginom-stage-product-skills-"))
    try {
      const destination = join(root, "resources")
      await stageResources({ destination, node, browsers, target, flavor: "desktop" })
      // Loginom Help ships as inventoried resource files; no knowledge service key or endpoint is staged.
      await expect(stat(join(destination, "knowledge-key"))).rejects.toMatchObject({ code: "ENOENT" })
      expect(await readFile(join(destination, "help/help-manifest.json"), "utf8")).toBe(
        await readFile(join(productHelpDirectory, "help-manifest.json"), "utf8"),
      )
      for (const path of [
        "template/node_modules/typescript/bin/tsc",
        "template/node_modules/vite/bin/vite.js",
        "template/index.html",
        "template/tsconfig.json",
        "template/env.d.ts",
        "template/vite.config.mjs",
        "template/resolver.mjs",
        "template/scan.mjs",
        "template/src/main.tsx",
        "template/src/loginom.ts",
        "draft.js",
        "selfcheck.mjs",
      ]) expect(await Bun.file(join(destination, "dashboard", path)).exists()).toBe(true)
      await expect(stat(join(destination, "dashboard/template/node_modules/.bin"))).rejects.toMatchObject({ code: "ENOENT" })
      for (const [staged, source] of [["draft.js", "dist/draft.js"], ["selfcheck.mjs", "src/draft/selfcheck.mjs"]]) {
        expect(await readFile(join(destination, "dashboard", staged!)))
          .toEqual(await readFile(resolve(import.meta.dir, "../../dashboard", source!)))
      }
      const dashboard = dashboardResources(destination)
      const work = join(root, "work")
      await cp(join(dashboard.template, "src"), join(work, "src"), { recursive: true })
      const build = await buildDashboard({ work, template: dashboard.template, node: dashboard.node, out: join(root, "builds") })
      expect(build.ok, build.output).toBe(true)
      const skills = await verifyBundledSkills(destination)
      expect(skills.map((skill) => skill.name).toSorted()).toEqual(["loginom-automation", "loginom-dashboard", "package-docs"])
      const manifest = await Bun.file(join(destination, "resource-manifest.json")).json()
      // Desktop's service keeps its Loginom connection with the Keychain helper on macOS (B4.8c), as the CLI does.
      expect(manifest.files.some((file: { path: string }) => file.path === "bin/loginom-keychain")).toBe(
        process.platform === "darwin",
      )
      expect(manifest.files.some((file: { path: string }) => file.path === "skills/package-docs/scripts/package-docs.mjs")).toBe(true)
      expect(manifest.files.some((file: { path: string }) => file.path === "help/help-manifest.json")).toBe(true)
      expect(manifest.files.some((file: { path: string }) => file.path === "knowledge-key")).toBe(false)
      expect(manifest).not.toHaveProperty("endpoint")
      for (const path of ["dashboard/template/src/main.tsx", "dashboard/draft.js"]) {
        expect(manifest.files.some((file: { path: string }) => file.path === path)).toBe(true)
      }
      expect(await Bun.file(join(destination, "THIRD_PARTY_NOTICES.md")).text()).toContain("Golos")
      expect(await Bun.file(join(destination, "THIRD_PARTY_NOTICES.md")).text()).toContain("licenses/ripgrep/")
      const rg = process.platform === "win32" ? "ripgrep/rg.exe" : "ripgrep/rg"
      expect(manifest.files.some((file: { path: string }) => file.path === rg)).toBe(true)
      expect(manifest.files.some((file: { path: string }) => file.path === "licenses/ripgrep/LICENSE-MIT")).toBe(true)
      // The CLI that Desktop and the CLI artifact carry embeds loginom-ai-agent-pty (B2.7a9, B4.7c).
      expect(await Bun.file(join(destination, "THIRD_PARTY_NOTICES.md")).text()).toContain("licenses/loginom-ai-agent-pty/")
      const pty = await Bun.file(join(destination, "licenses/loginom-ai-agent-pty/inventory.json")).json()
      expect(pty.packages.some((pkg: { name: string }) => pkg.name === "loginom-ai-agent-pty")).toBe(true)
      expect(manifest.files.some((file: { path: string }) => file.path === "licenses/loginom-ai-agent-pty/inventory.json")).toBe(true)
      const version = Bun.spawnSync([join(destination, rg), "--version"]).stdout.toString()
      expect(version).toStartWith(`ripgrep ${ripgrepPins.version}`)
      const notices = await Bun.file(join(destination, "licenses/package-docs/inventory.json")).json()
      expect(notices.packages.some((pkg: { name: string }) => pkg.name === "@zip.js/zip.js")).toBe(true)
      expect(notices.packages.some((pkg: { name: string }) => pkg.name === "@xmldom/xmldom")).toBe(true)
      expect(await readFile(join(destination, "licenses/Golos-OFL.txt")))
        .toEqual(await readFile(join(productSkillsDirectory, "package-docs/assets/fonts/OFL.txt")))
      const script = join(destination, "skills/package-docs/scripts/package-docs.mjs")
      const alias = join(root, "docs entry alias")
      await symlink(dirname(script), alias, process.platform === "win32" ? "junction" : "dir")
      const environment = { LANG: "C.UTF-8", ...(process.platform === "win32"
        ? { SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT } : {}) }
      const skeleton = Bun.spawn([join(destination, manifest.node), "--preserve-symlinks-main", join(alias, "package-docs.mjs"), "skeleton", "--lgp",
        join(import.meta.dir, "fixtures/package-docs/demo.lgp"), "--directory", root],
        { cwd: root, env: environment, stdout: "pipe", stderr: "pipe" })
      const paths = new Response(skeleton.stdout).text()
      const errors = new Response(skeleton.stderr).text()
      expect(await skeleton.exited).toBe(0)
      expect(await errors).toBe("")
      const report = JSON.parse(await paths).report
      await writeFile(report, (await readFile(report, "utf8")).replace(/PLACEHOLDER_[A-Z_0-9]+/g, "Описание сценария."))
      const emit = Bun.spawn([join(destination, manifest.node), script, "emit", "--lgp",
        join(import.meta.dir, "fixtures/package-docs/demo.lgp"), "--directory", root],
        { cwd: root, env: environment, stdout: "pipe", stderr: "pipe" })
      const result = new Response(emit.stdout).text()
      const failure = new Response(emit.stderr).text()
      expect(await emit.exited).toBe(0)
      expect(await failure).toBe("")
      expect((await readFile(JSON.parse(await result).output)).subarray(0, 8).toString()).toBe("%PDF-1.4")
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
      // The pinned node.exe and rg.exe children above have exited, but Windows
      // can keep their copied images locked briefly afterwards (EBUSY).
      await removeFixture(root)
    }
  },
  300000,
)
