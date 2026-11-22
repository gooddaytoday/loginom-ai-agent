import { describe, expect, test } from "bun:test"
import path from "node:path"
import { cliProfile } from "@loginom-ai-agent/product/cli-profile"
import { appIdentity } from "./app-identity"

// Desktop 0.4 (a080f7725c:packages/desktop/src/main/index.ts:153-181) set the name, the app id and userData
// `<appData>/<appId>` by the packaged channel, dev when run from source. The literals are the 0.4 values; `profile` is
// the channel of the standalone CLI 0.4 profile that lives inside that userData.
describe("appIdentity", () => {
  test.each([
    { packaged: true, channel: "prod", name: "Loginom AI Agent", id: "com.loginom.aiagent", profile: "prod" },
    { packaged: true, channel: "beta", name: "Loginom AI Agent Beta", id: "com.loginom.aiagent.beta", profile: "beta" },
    { packaged: true, channel: "dev", name: "Loginom AI Agent Dev", id: "com.loginom.aiagent.dev", profile: "dev" },
    { packaged: true, channel: "local", name: "Loginom AI Agent Dev", id: "com.loginom.aiagent.dev", profile: "dev" },
    { packaged: false, channel: "prod", name: "Loginom AI Agent Dev", id: "com.loginom.aiagent.dev", profile: "dev" },
  ] as const)("packaged $packaged, channel $channel keeps the 0.4 identity $id", (input) => {
    const identity = appIdentity(input)

    expect(identity).toEqual({ name: input.name, id: input.id })
    // Electron's appData on Linux, where the CLI 0.4 profile also starts.
    expect(cliProfile({ channel: input.profile, platform: "linux", home: "/home/u", env: {} }).root).toBe(
      path.posix.join("/home/u/.config", identity.id, "cli", "profiles", "default"),
    )
  })
})
