import { expect, test } from "bun:test"
import { Schema } from "effect"
import { Loginom } from "../src/loginom"

test("connection views keep Help readiness independent of browser status and legacy views remain readable", () => {
  const legacy = {
    revision: 1,
    generation: 1,
    url: "http://example.test",
    username: "user",
    folder: "/user",
    hasApiKey: true,
    hasPassword: false,
    state: "ready" as const,
  }
  expect(Schema.decodeUnknownSync(Loginom.View)(legacy)).toEqual(legacy)
  expect(Schema.encodeSync(Loginom.View)({ ...legacy, browser: undefined })).toEqual(legacy)
  for (const browser of [
    { state: "unknown" as const },
    { state: "verified" as const },
    { state: "failed" as const, failure: "LOGINOM_LOGIN_REJECTED" as const },
  ]) {
    expect(Schema.decodeUnknownSync(Loginom.View)({ ...legacy, browser })).toEqual({ ...legacy, browser })
    expect(Schema.encodeSync(Loginom.Validation)({ validationId: "token", expiresAt: 1, browser })).toEqual({
      validationId: "token",
      expiresAt: 1,
      browser,
    })
  }
  expect(Schema.encodeSync(Loginom.Validation)({ validationId: "token", expiresAt: 1, browser: undefined })).toEqual({
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
