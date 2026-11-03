import { expect, test } from "bun:test"
import { setupCandidate } from "../../src/cli/loginom-management"
import type { Loginom } from "@opencode-ai/schema/loginom"

const current: Loginom.View = {
  revision: 4,
  generation: 2,
  url: "http://example.test/app/",
  username: "user",
  folder: "/user",
  hasPassword: true,
  state: "ready",
}

test("stdin setup distinguishes missing secrets, explicit empty password and replacements", () => {
  expect(setupCandidate("{}", current)).toEqual({
    revision: 4,
    url: "http://example.test/app/",
    username: "user",
    password: { operation: "preserve" },
  })
  expect(setupCandidate('{"password":""}', current).password).toEqual({ operation: "empty" })
  expect(setupCandidate('{"password":"new-password"}', current).password).toEqual({
    operation: "replace",
    value: "new-password",
  })
  // Older setup scripts may still send a key; the built-in knowledge key replaced it.
  for (const json of ['{"apiKey":"old-key"}', '{"apiKey":""}'])
    expect(setupCandidate(json, current)).not.toHaveProperty("apiKey")
  expect(() => setupCandidate('{"password":null}', current)).toThrow("CLI_SETUP_INVALID")
  expect(() => setupCandidate('{"folder":"/not-a-setup-field"}', current)).toThrow("CLI_SETUP_INVALID")
  expect(() => setupCandidate("secret-broken-json", current)).toThrow("CLI_SETUP_INVALID")
})
