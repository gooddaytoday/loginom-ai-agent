import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"
import { Product, productName, productSlug } from "@loginom-ai-agent/product"

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

test.skipIf(process.platform !== "darwin")("the read-only PR workflow enables only the configured ad-hoc signing gate", async () => {
  const workflow = Bun.YAML.parse(await Bun.file(new URL("../../.github/workflows/loginom-macos.yml", import.meta.url)).text()) as {
    on: Record<string, unknown>
    permissions: Record<string, string>
    jobs: { macos: { env: Record<string, string>; steps: { name?: string; env?: Record<string, string> }[] } }
  }
  expect(workflow.permissions).toEqual({ contents: "read" })
  expect(workflow.on.pull_request_target).toBeUndefined()
  expect(JSON.stringify(workflow)).not.toContain("secrets.")
  expect(workflow.jobs.macos.env.CSC_IDENTITY_AUTO_DISCOVERY).toBe("false")
  const build = workflow.jobs.macos.steps.find((step) => step.name === "Build and verify both products")
  expect(build?.env?.CSC_FOR_PULL_REQUEST).toBe("true")
  const config = (await import("./electron-builder.config")).default
  expect(config.mac?.identity).toBe("-")
  expect(config.mac?.notarize).toBe(false)
  expect(config.publish).toBeNull()
  // Exercise electron-builder's real PR decision in isolated child environments.
  // No signing identity lookup, certificate, keychain or application is invoked.
  const script = `
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.resolve('electron-builder'));
    const { isSignAllowed } = require('app-builder-lib/out/codeSign/macCodeSign');
    console.log(JSON.stringify(isSignAllowed(false)));
  `
  for (const [flag, expected] of [["false", false], [build?.env?.CSC_FOR_PULL_REQUEST, true]] as const) {
    const child = Bun.spawnSync([process.execPath, "-e", script], {
      cwd: import.meta.dir,
      env: { PATH: process.env.PATH, GITHUB_BASE_REF: "loginom", CSC_FOR_PULL_REQUEST: flag },
    })
    expect(child.exitCode).toBe(0)
    expect(child.stderr.toString()).toBe("")
    expect(JSON.parse(child.stdout.toString())).toBe(expected)
  }
})
