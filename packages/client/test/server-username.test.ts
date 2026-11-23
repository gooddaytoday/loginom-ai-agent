import { afterEach, expect, test } from "bun:test"
import { ServerUsername } from "@opencode/schema/server-username"
import { username } from "../src/service-probe.js"

// Loginom AI Agent (B2.7a11): the service probe and the terminal handoff keep their own copy of the server's Basic
// user, because the Promise service entry bundles no module of `schema`. The copy must not drift from the server's.
const previous = process.env.LOGINOM_AI_AGENT_SERVER_USERNAME

afterEach(() => assign(previous))

test.each([undefined, "", "alice"])("agrees with the server's user when the variable is %p", (value) => {
  assign(value)
  expect(username()).toBe(ServerUsername.current())
})

test("is loginom-ai-agent by default", () => {
  assign(undefined)
  expect(username()).toBe("loginom-ai-agent")
})

function assign(value: string | undefined) {
  if (value === undefined) {
    delete process.env.LOGINOM_AI_AGENT_SERVER_USERNAME
    return
  }
  process.env.LOGINOM_AI_AGENT_SERVER_USERNAME = value
}
