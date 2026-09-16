import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"
import { Product, productSlug } from "@loginom-ai-agent/product"

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
  })
}
