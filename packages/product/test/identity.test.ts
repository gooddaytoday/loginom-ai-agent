import { expect, test } from "bun:test"
import { Product, productChannel, productName, productSlug } from "../src/index"
import release from "../loginom-release.json"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

test("bundled MCP and first-run Loginom defaults use the public service addresses", () => {
  expect(Product.knowledgeEndpoint).toBe("https://mcp.loginom.ai/mcp")
  expect(release.endpoint).toBe(Product.knowledgeEndpoint)
  expect(Product.connection.url).toBe("https://app.loginom.ai")
})

test("release channels cannot share application storage identity", () => {
  const channels = ["prod", "beta", "dev"] as const
  expect(new Set(channels.map((channel) => Product.channels[channel])).size).toBe(3)
  expect(new Set(channels.map(productSlug)).size).toBe(3)
  expect(new Set(channels.map(productName)).size).toBe(3)
  expect(productChannel("upstream")).toBe("dev")
  expect(productChannel(undefined)).toBe("dev")
})

test("identity cannot be changed after startup and has no update fallback", () => {
  expect(Object.isFrozen(Product)).toBe(true)
  expect(
    Object.values(Product)
      .filter((value) => value && typeof value === "object")
      .every(Object.isFrozen),
  ).toBe(true)
  expect(() => Object.assign(Product.channels, { prod: "upstream" })).toThrow()
  expect(Product.updateFeed).toBeNull()
  expect(Product.wordmark).toBe("Loginom AI")
})

test("the bundle bakes the feed parameter and defaults to disabled", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-update-feed-"))
  try {
    for (const [index, value] of [null, "", "https://example.test/updates/"].entries()) {
      const bundle = await Bun.build({
        entrypoints: [new URL("../src/index.ts", import.meta.url).pathname],
        target: "bun",
        define: { LOGINOM_AI_AGENT_UPDATE_FEED: JSON.stringify(value) },
      })
      expect(bundle.success).toBe(true)
      // macOS Bun resolves data: URLs as filesystem paths and can hit NameTooLong.
      // Separate files also avoid sharing the module cache between feed values.
      const output = join(directory, `product-${index}.mjs`)
      await writeFile(output, await bundle.outputs[0].text())
      const built = await import(pathToFileURL(output).href)
      expect(built.Product.updateFeed).toBe(value || null)
      expect(built.Product.changelogFeed).toBeNull()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
