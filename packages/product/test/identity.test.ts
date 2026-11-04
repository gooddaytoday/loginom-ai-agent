import { expect, test } from "bun:test"
import { Product, productChannel, productName, productSlug } from "../src/index"
import release from "../loginom-release.json"

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

test("Desktop may bake an update feed, while an empty build stays disabled", async () => {
  for (const feed of ["", "https://releases.example.test/agent/"]) {
    const build = await Bun.build({
      entrypoints: [new URL("../src/index.ts", import.meta.url).pathname],
      target: "bun",
      define: { __LOGINOM_AI_AGENT_UPDATE_FEED__: JSON.stringify(feed) },
    })
    expect(build.success).toBe(true)
    const module = await import(
      "data:text/javascript;base64," + Buffer.from(await build.outputs[0].text()).toString("base64")
    )
    expect(module.Product.updateFeed).toBe(feed || null)
    expect(module.Product.changelogFeed).toBeNull()
  }
})
