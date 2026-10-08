import { describe, expect, test } from "bun:test"
import { experimentalWebSocketsEnabled } from "../../src/plugin"

describe("plugin.openai.websocket rollout", () => {
  test("enables websockets by default only on pre-release channels", () => {
    expect(experimentalWebSocketsEnabled({ enabled: undefined, channel: "local" })).toBe(true)
    expect(experimentalWebSocketsEnabled({ enabled: undefined, channel: "dev" })).toBe(true)
    expect(experimentalWebSocketsEnabled({ enabled: undefined, channel: "beta" })).toBe(true)
    expect(experimentalWebSocketsEnabled({ enabled: undefined, channel: "latest" })).toBe(false)
    expect(experimentalWebSocketsEnabled({ enabled: undefined, channel: "prod" })).toBe(false)
  })

  test("explicit false disables websockets on pre-release and release channels", () => {
    for (const channel of ["local", "dev", "beta", "latest", "prod"])
      expect(experimentalWebSocketsEnabled({ enabled: false, channel })).toBe(false)
  })

  test("allows releases to opt in through the experimental flag", () => {
    expect(experimentalWebSocketsEnabled({ enabled: true, channel: "latest" })).toBe(true)
    expect(experimentalWebSocketsEnabled({ enabled: true, channel: "prod" })).toBe(true)
  })
})
