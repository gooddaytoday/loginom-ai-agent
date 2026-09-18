import { expect, test } from "bun:test"
import { setupCandidate } from "../../src/cli/loginom-management"
import type { Loginom } from "@loginom-ai-agent/schema/loginom"

const current: Loginom.View = {
  revision: 4,
  generation: 2,
  url: "http://example.test/app/",
  username: "user",
  folder: "/user",
  hasApiKey: true,
  hasPassword: true,
  state: "ready",
}

test("stdin setup distinguishes missing secrets, explicit empty password and replacements", () => {
  expect(setupCandidate("{}", current)).toMatchObject({
    revision: 4,
    apiKey: { operation: "preserve" },
    password: { operation: "preserve" },
  })
  expect(setupCandidate('{"password":""}', current).password).toEqual({ operation: "empty" })
  expect(setupCandidate('{"apiKey":"new-key","password":"new-password"}', current)).toMatchObject({
    apiKey: { operation: "replace", value: "new-key" },
    password: { operation: "replace", value: "new-password" },
  })
  expect(() => setupCandidate('{"apiKey":""}', current)).toThrow("LOGINOM_API_KEY_REQUIRED")
  expect(() => setupCandidate('{"password":null}', current)).toThrow("CLI_SETUP_INVALID")
  expect(() => setupCandidate('{"folder":"/not-a-setup-field"}', current)).toThrow("CLI_SETUP_INVALID")
  expect(() => setupCandidate("secret-broken-json", current)).toThrow("CLI_SETUP_INVALID")
})
