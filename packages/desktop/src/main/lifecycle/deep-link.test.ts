import { describe, expect, test } from "bun:test"
import { protocolUrls, startupUrls } from "./deep-link"

// Fork (catalog CAT-09): the product scheme of 0.4, one for every channel.
describe("protocol links on the command line", () => {
  test("keeps only links of the product scheme", () => {
    const dashboard = "loginom-ai-agent://dashboard?id=1&action=create"

    expect(
      protocolUrls([
        "/opt/Loginom AI Agent/loginom-ai-agent",
        "--no-sandbox",
        "opencode://console/authorized?window=window-a",
        "loginom-ai-agent-beta://dashboard?id=1&action=create",
        dashboard,
      ]),
    ).toEqual([dashboard])
  })

  // Loginom AI Agent (B4.15): a link that launches the app, as 0.4 read it.
  test("reads the links the app started with from its command line on Linux only", () => {
    const dashboard = "loginom-ai-agent://dashboard?id=1&action=create"
    const argv = ["/opt/Loginom AI Agent/loginom-ai-agent", "--no-sandbox", "opencode://open?project=/repo", dashboard]

    expect(startupUrls(argv, "linux")).toEqual([dashboard])
    expect(startupUrls(argv, "darwin")).toEqual([])
    expect(startupUrls(argv, "win32")).toEqual([])
  })
})
