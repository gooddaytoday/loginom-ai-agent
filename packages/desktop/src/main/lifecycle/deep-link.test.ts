import { describe, expect, test } from "bun:test"
import { consoleReturnWindow, protocolUrls } from "./deep-link"

describe("Console return deep links", () => {
  test("reads the originating Desktop window", () => {
    expect(consoleReturnWindow("loginom-ai-agent://console/authorized?window=window-a")).toBe("window-a")
    expect(consoleReturnWindow("loginom-ai-agent://console/authorized?window=window%20b")).toBe("window b")
  })

  test("rejects unrelated and malformed links", () => {
    expect(consoleReturnWindow("loginom-ai-agent://console/other?window=window-a")).toBeUndefined()
    expect(consoleReturnWindow("loginom-ai-agent://other/authorized?window=window-a")).toBeUndefined()
    expect(consoleReturnWindow("https://console/authorized?window=window-a")).toBeUndefined()
    expect(consoleReturnWindow("not a url")).toBeUndefined()
    expect(consoleReturnWindow("loginom-ai-agent://console/authorized")).toBeUndefined()
  })

  // Fork (catalog CAT-09): the OpenCode Desktop scheme is not the product's.
  test("rejects the OpenCode scheme", () => {
    expect(consoleReturnWindow("opencode://console/authorized?window=window-a")).toBeUndefined()
  })
})

// Fork (catalog CAT-09): the product scheme of 0.4, one for every channel.
describe("protocol links on the command line", () => {
  test("keeps only links of the product scheme", () => {
    const console = "loginom-ai-agent://console/authorized?window=window-a"
    const dashboard = "loginom-ai-agent://dashboard?id=1&action=create"

    expect(
      protocolUrls([
        "/opt/Loginom AI Agent/loginom-ai-agent",
        "--no-sandbox",
        console,
        "opencode://console/authorized?window=window-a",
        "loginom-ai-agent-beta://console/authorized?window=window-a",
        dashboard,
      ]),
    ).toEqual([console, dashboard])
  })

  // Dashboards of 0.4 open through the same scheme (B2.9); the parser passes them on without a target window.
  test("passes dashboard links through without a Console target", () => {
    expect(consoleReturnWindow("loginom-ai-agent://dashboard?id=1&action=create")).toBeUndefined()
  })
})
