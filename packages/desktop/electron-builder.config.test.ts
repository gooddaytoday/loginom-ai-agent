import { expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
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
    expect(config.extraResources).toContainEqual({
      from: "resources/skills",
      to: "skills",
    })
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

test("every resources/skills folder ships as an agent skill with a matching name and description", () => {
  const root = path.join(import.meta.dirname, "resources", "skills")
  const names = readdirSync(root).filter((name) => statSync(path.join(root, name)).isDirectory())
  expect(names.length).toBeGreaterThan(0)
  for (const name of names) {
    const file = path.join(root, name, "SKILL.md")
    expect(
      existsSync(file),
      `Add the product skill at resources/skills/${name}/SKILL.md. The whole resources/skills directory is packaged; do not add an extraResources entry.`,
    ).toBe(true)
    const frontmatter = skillFrontmatter(readFileSync(file, "utf8"))
    expect(frontmatter.name, `${name}: frontmatter name must equal the folder name`).toBe(name)
    expect(
      frontmatter.description.length,
      `${name}: frontmatter description is required or the model never sees the skill`,
    ).toBeGreaterThan(0)
  }
})

function skillFrontmatter(markdown: string) {
  const block = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ""
  const name = block.match(/^name:\s*(\S+)\s*$/m)?.[1] ?? ""
  const described = block.split(/^description:\s*/m)[1] ?? ""
  const description = described.replace(/^(?:>[+-]?|[|][+-]?)\s*/, "").trim()
  return { name, description }
}
