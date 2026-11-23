import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { MainConfigFactory } from "electron-vite"
import { build } from "vite"
import createConfig from "./electron.vite.config"
import pkg from "./package.json"
import { CLI_BINARIES, nodePtyPackage } from "./script/utils"

const load = async (command: "build" | "serve") => ({
  config: await createConfig({ command, mode: command === "build" ? "production" : "development" }),
})

// Bundled into the main process, so the manifest must not also ship them as external packages.
const bundled = ["effect", "@effect/platform-node", "@effect/platform-node-shared", "drizzle-orm"]

test("minifies only builds, previews onboarding only in development, and ships sourcemaps and public assets", async () => {
  const previous = process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING
  const previousTarget = process.env.LOGINOM_AI_AGENT_TARGET

  try {
    process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING = "1"

    for (const command of ["build", "serve"] as const) {
      const result = await load(command)

      for (const target of [result.config.main, result.config.preload, result.config.renderer])
        expect(target?.build?.minify).toBe(command === "build")
      expect(result.config.renderer?.define?.["import.meta.env.LOGINOM_AI_AGENT_TEST_ONBOARDING"]).toBe(
        JSON.stringify(command === "serve"),
      )
    }

    delete process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING
    const serve = await load("serve")
    expect(serve.config.renderer?.define?.["import.meta.env.LOGINOM_AI_AGENT_TEST_ONBOARDING"]).toBe("false")

    for (const item of CLI_BINARIES) {
      process.env.LOGINOM_AI_AGENT_TARGET = item.target
      const main = (await load("build")).config.main
      expect(main?.build?.externalizeDeps).toEqual({
        exclude: bundled,
        include: [nodePtyPackage(item.target)],
      })
    }
  } finally {
    delete process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING
    delete process.env.LOGINOM_AI_AGENT_TARGET

    if (previous !== undefined) process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING = previous

    if (previousTarget !== undefined) process.env.LOGINOM_AI_AGENT_TARGET = previousTarget
  }

  const renderer = (await load("build")).config.renderer
  // Sentry uploads the renderer source maps, then deletes them.
  expect(renderer?.build?.sourcemap).toBe(true)

  // Vite resolves publicDir from the renderer root, not from the config file.
  const root = renderer?.root ?? ""
  const publicDir = renderer?.publicDir || ""
  expect(existsSync(path.resolve(import.meta.dirname, root, publicDir, "oc-theme-preload.js"))).toBe(true)
})

// Loginom AI Agent (B4.12): Product.updateFeed in main is the build's LOGINOM_AI_AGENT_UPDATE_FEED and nothing else, the
// same input electron-builder writes into app-update.yml. Without it the updater is off; there is no fallback feed.
test.each([
  { build: "no feed", feed: undefined, define: "null" },
  { build: "an empty feed", feed: "", define: "null" },
  {
    build: "a feed",
    feed: "  https://updates.example.test/loginom/  ",
    define: JSON.stringify("https://updates.example.test/loginom/"),
  },
])("a build with $build gives the main bundle the product update feed $define", async ({ feed, define }) => {
  const previous = process.env.LOGINOM_AI_AGENT_UPDATE_FEED

  try {
    if (feed === undefined) delete process.env.LOGINOM_AI_AGENT_UPDATE_FEED
    else process.env.LOGINOM_AI_AGENT_UPDATE_FEED = feed

    for (const command of ["build", "serve"] as const)
      expect((await load(command)).config.main?.define?.LOGINOM_AI_AGENT_UPDATE_FEED).toBe(define)
  } finally {
    delete process.env.LOGINOM_AI_AGENT_UPDATE_FEED

    if (previous !== undefined) process.env.LOGINOM_AI_AGENT_UPDATE_FEED = previous
  }
})

test("bundles one Effect runtime and Drizzle while keeping native dependencies external", async () => {
  for (const name of bundled) {
    expect(Object.keys(pkg.dependencies)).not.toContain(name)
    expect(Object.keys(pkg.optionalDependencies)).not.toContain(name)
  }

  expect(Object.keys(pkg.optionalDependencies).filter((name) => name.startsWith("@lydell/node-pty-"))).toEqual([
    "@lydell/node-pty-darwin-arm64",
    "@lydell/node-pty-darwin-x64",
    "@lydell/node-pty-linux-arm64",
    "@lydell/node-pty-linux-x64",
    "@lydell/node-pty-win32-arm64",
    "@lydell/node-pty-win32-x64",
  ])

  const previousTarget = process.env.LOGINOM_AI_AGENT_TARGET
  const previousFeed = process.env.LOGINOM_AI_AGENT_UPDATE_FEED
  // Build against the opposite architecture to prove cross-packaging resolves the target's native package, not the host's.
  const crossTarget = process.arch === "arm64" ? "windows-x64" : "windows-arm64"
  const crossNodePty = nodePtyPackage(crossTarget)

  try {
    process.env.LOGINOM_AI_AGENT_TARGET = crossTarget
    process.env.LOGINOM_AI_AGENT_UPDATE_FEED = "https://updates.example.test/loginom/"
    const result = await load("build")

    if (!result.config.main) throw new Error("Missing main-process build configuration")

    const config = await new MainConfigFactory(
      result.config.main,
      { configFile: false, mode: "production" },
      { root: import.meta.dirname },
    ).build()

    config.build = { ...config.build, minify: false, write: false }
    config.logLevel = "silent"
    const output = await build(config)

    const chunks = (Array.isArray(output) ? output : [output]).flatMap((item) =>
      "output" in item ? item.output.filter((entry) => entry.type === "chunk") : [],
    )

    expect(chunks.length).toBeGreaterThan(0)
    // Resource resolution must not depend on which lazy entry owns DesktopPaths.
    expect(chunks.every((chunk) => !chunk.fileName.includes("/"))).toBe(true)
    const imports = chunks.flatMap((chunk) => [...chunk.imports, ...chunk.dynamicImports])
    const modules = chunks.flatMap((chunk) => Object.keys(chunk.modules))

    for (const name of bundled) {
      expect(imports.filter((id) => id === name || id.startsWith(`${name}/`))).toEqual([])
      expect(modules.some((id) => id.includes(`/node_modules/${name}/`))).toBe(true)
    }

    const effect = modules.filter((id) => id.includes("/node_modules/effect/"))
    expect(new Set(effect.map((id) => id.split("/node_modules/effect/")[0])).size).toBe(1)
    expect(new Set(effect).size).toBe(effect.length)
    expect(imports).toContain("electron")
    expect(imports).toContain("node:sqlite")
    expect(chunks.some((chunk) => chunk.dynamicImports.includes("@zip.js/zip.js"))).toBe(true)
    expect(imports).toContain(crossNodePty)
    expect(imports).not.toContain(`@lydell/node-pty-${process.platform}-${process.arch}`)
    expect(modules.some((id) => id.includes("/node_modules/msgpackr"))).toBe(false)
    expect(chunks.some((chunk) => chunk.code.includes("msgpackr"))).toBe(false)
    // Loginom AI Agent (B4.12): the bundler folds the define into packages/product, so Product.updateFeed is the feed.
    const productFeed = /updateFeed: "https:\/\/updates\.example\.test\/loginom\/"/
    expect(chunks.some((chunk) => productFeed.test(chunk.code))).toBe(true)
  } finally {
    delete process.env.LOGINOM_AI_AGENT_TARGET
    delete process.env.LOGINOM_AI_AGENT_UPDATE_FEED

    if (previousTarget !== undefined) process.env.LOGINOM_AI_AGENT_TARGET = previousTarget

    if (previousFeed !== undefined) process.env.LOGINOM_AI_AGENT_UPDATE_FEED = previousFeed
  }
}, 30_000)
