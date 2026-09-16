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
