import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"
import { Product, productName, productSlug } from "@loginom-ai-agent/product"
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import release from "../product/loginom-release.json"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { pathToFileURL } from "node:url"

for (const channel of ["dev", "beta", "prod"] as const) {
  test(`isolates the ${channel} package and cannot publish upstream`, async () => {
    const previous = process.env.LOGINOM_AI_AGENT_CHANNEL
    process.env.LOGINOM_AI_AGENT_CHANNEL = channel
    const module = await import(`./electron-builder.config.ts?channel=${channel}`)
    const config = module.default as Configuration
    if (previous === undefined) delete process.env.LOGINOM_AI_AGENT_CHANNEL
    else process.env.LOGINOM_AI_AGENT_CHANNEL = previous
    expect(config.appId).toBe(Product.channels[channel])
    expect(config.extraMetadata?.desktopName).toBe(`${Product.channels[channel]}.desktop`)
    expect(config.linux?.syncDesktopName).toBe(true)
    expect(config.linux?.executableName).toBe(productSlug(channel))
    expect(config.deb?.packageName).toBe(productSlug(channel))
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(Product.channels[channel])
    expect(config.publish).toBeNull()
    expect(config.protocols).toEqual({ name: Product.name, schemes: [Product.scheme] })
    expect(JSON.stringify(config)).not.toContain("opencode")
    expect(config.extraResources).not.toContainEqual(expect.objectContaining({ filter: ["opencode-cli*"] }))
    expect(config.linux?.target).toEqual(["AppImage", "deb"])
    expect(config.linux?.icon).toBe("resources/icons/linux")
    expect(config.win?.icon).toBe("resources/icons/icon.ico")
    expect(config.mac?.icon).toBe("resources/icons/icon.icns")
    expect(config.npmRebuild).toBe(false)
    expect(config.win?.executableName).toBe(productSlug(channel))
    expect(config.win?.requestedExecutionLevel).toBe("asInvoker")
    expect(config.win?.target).toEqual([{ target: "nsis", arch: ["x64"] }])
    expect(config.nsis).toEqual(
      expect.objectContaining({
        oneClick: true,
        perMachine: false,
        deleteAppDataOnUninstall: false,
        shortcutName: productName(channel),
      }),
    )
  })
}

test("macOS test packages use explicit ad-hoc arm64 signing without rewriting vendor resources", async () => {
  const config = (await import("./electron-builder.config")).default
  expect(config.mac?.minimumSystemVersion).toBe("14.0")
  expect(config.mac?.identity).toBe("-")
  expect(config.mac?.notarize).toBe(false)
  expect(config.dmg?.sign).toBe(false)
  expect(config.mac?.target).toEqual([
    { target: "dmg", arch: ["arm64"] },
    { target: "zip", arch: ["arm64"] },
  ])
  expect(config.mac?.signIgnore).toEqual(["/Contents/Resources/loginom/bin/", "/Contents/Resources/loginom/browsers/"])
  expect(JSON.stringify(config.extraResources)).not.toContain("native/")
})

test.skipIf(process.platform !== "linux")("Linux afterPack restores the current pinned Chromium sandbox mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-afterpack-"))
  try {
    const sandbox = join(root, `resources/loginom/browsers/chromium-${release.chromiumRevision}/chrome-linux64/chrome-sandbox`)
    await mkdir(dirname(sandbox), { recursive: true })
    await writeFile(sandbox, "fixture", { mode: 0o700 })
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node executable")
    // electron-builder executes this hook in Node. Bun 1.3.14's fs.chmod drops
    // setuid bits, so running the hook in the Bun test process is not faithful.
    const bundle = await Bun.build({ entrypoints: [join(import.meta.dir, "electron-builder.config.ts")], target: "node" })
    if (!bundle.success) throw Error("Could not bundle packaging hook")
    const module = join(root, "hook.mjs")
    await writeFile(module, await bundle.outputs[0].text())
    await promisify(execFile)(node, ["--input-type=module", "-e",
      `import config from ${JSON.stringify(pathToFileURL(module).href)};
       if (process.versions.node !== ${JSON.stringify(release.nodeVersion)}) throw Error('Unexpected Node version');
       await config.afterPack({appOutDir:${JSON.stringify(root)},electronPlatformName:'linux'});`,
    ])
    expect((await stat(sandbox)).mode & 0o7777).toBe(0o4755)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
