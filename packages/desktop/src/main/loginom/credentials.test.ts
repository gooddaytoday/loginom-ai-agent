import { expect, test } from "bun:test"
import { credentials } from "./credentials"

const secret = { apiKey: "test-key", password: "test-password" }
test("Linux uses the requested plaintext format without OS keyring", () => {
  const codec = credentials("linux")
  expect(codec.encode(secret)).toEqual(secret)
  expect(codec.decode(codec.encode(secret))).toEqual(secret)
})
for (const platform of ["darwin", "win32"] as const) {
  test(`${platform} fails without OS protection, never plaintext fallback`, () => {
    expect(() => credentials(platform).encode(secret)).toThrow("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
    expect(() => credentials(platform).decode(secret)).toThrow("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  })
  test(`${platform} refuses an unavailable OS storage adapter`, () => {
    const codec = credentials(platform, {
      isEncryptionAvailable: () => false,
      encryptString() { throw Error("UNEXPECTED_ENCRYPT") },
      decryptString() { throw Error("UNEXPECTED_DECRYPT") },
    })
    expect(() => codec.encode(secret)).toThrow("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
    expect(() => codec.decode({ encrypted: "protected" })).toThrow("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
  })
  test(`${platform} calls the OS protection adapter`, () => {
    const calls: string[] = []
    const codec = credentials(platform, {
      isEncryptionAvailable: () => true,
      encryptString(value) { calls.push(value); return Buffer.from("protected-by-test-adapter") },
      decryptString(value) { expect(value.toString()).toBe("protected-by-test-adapter"); return calls[0] },
    })
    const encoded = codec.encode(secret)
    expect(JSON.stringify(encoded)).not.toContain(secret.apiKey)
    expect(codec.decode(encoded)).toEqual(secret)
  })
}

test("Desktop codecs preserve cloud JSON objects without exposing them in protected envelopes", () => {
  const value = { kind: "loginom-cloud-v1", installationKey: "site-canary", email: "user@example.test", dock: { primary: { apiKey: "primary-canary" }, reserve: { apiKey: "reserve-canary" } } }
  expect(credentials("linux").decode(credentials("linux").encode(value))).toEqual(value)
  for (const platform of ["darwin", "win32"] as const) {
    const payloads: string[] = []
    const codec = credentials(platform, {
      isEncryptionAvailable: () => true,
      encryptString(value) { payloads.push(value); return Buffer.from("test-protected") },
      decryptString() { return payloads[0] },
    })
    const encoded = codec.encode(value)
    expect(JSON.stringify(encoded)).not.toContain(value.installationKey)
    expect(codec.decode(encoded)).toEqual(value)
  }
})
