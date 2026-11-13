import { expect, test } from "bun:test"
import { Schema } from "effect"
import { Loginom } from "../src/loginom"

test("connection views keep Help readiness independent of browser status with explicit Dock state", () => {
  const view = {
    mode: "custom" as const,
    endpoint: "https://example.test/mcp",
    hasApiKey: true,
    server: "custom" as const,
    help: { state: "ready" as const },
    cloud: { connected: false },
    revision: 1,
    generation: 1,
    url: "http://example.test",
    username: "user",
    folder: "/user",
    hasPassword: false,
    state: "ready" as const,
  }
  expect(Schema.decodeUnknownSync(Loginom.View)(view)).toEqual(view)
  expect(Schema.encodeSync(Loginom.View)({ ...view, browser: undefined })).toEqual(view)
  for (const browser of [
    { state: "unknown" as const },
    { state: "verified" as const },
    { state: "failed" as const, failure: "LOGINOM_LOGIN_REJECTED" as const },
  ]) {
    expect(Schema.decodeUnknownSync(Loginom.View)({ ...view, browser })).toEqual({ ...view, browser })
    expect(Schema.encodeSync(Loginom.Validation)({ help: { state: "ready" }, validationId: "token", expiresAt: 1, browser })).toEqual({
      help: { state: "ready" },
      validationId: "token",
      expiresAt: 1,
      browser,
    })
  }
  expect(Schema.encodeSync(Loginom.Validation)({ help: { state: "ready" }, validationId: "token", expiresAt: 1, browser: undefined })).toEqual({
    help: { state: "ready" },
    validationId: "token",
    expiresAt: 1,
  })
})

test("browser failures carry only recognized codes", () => {
  for (const browser of [
    { state: "failed" },
    { state: "failed", failure: "PRIVATE-CREDENTIAL" },
    { state: "ready" },
    { state: "failed", failure: "LOGINOM_KNOWLEDGE_AUTH_FAILED" },
  ])
    expect(() => Schema.decodeUnknownSync(Loginom.BrowserStatus)(browser)).toThrow()
})
