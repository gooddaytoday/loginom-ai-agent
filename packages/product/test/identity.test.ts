import { expect, test } from "bun:test"
import { Product, productChannel, productName, productSlug } from "../src/index"
import release from "../loginom-release.json"

test("first-run Loginom defaults use the public service address and no knowledge service is pinned", () => {
  expect(Product.connection.url).toBe("https://app.loginom.ai")
  expect("knowledgeEndpoint" in Product).toBe(false)
  expect(JSON.stringify(release)).not.toContain("mcp.loginom.ai")
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
