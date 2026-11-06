import { expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { openKeychain, sealKeychain } from "../src/connection/keychain-envelope"

test("Keychain envelope encrypts UTF-8 secrets with fresh nonces and profile binding", () => {
  const key = randomBytes(32)
  const profile = "a".repeat(64)
  const value = { apiKey: "test-key-ключ", password: "пароль\nwith spaces" }
  const first = sealKeychain(value, key, profile)
  expect(first.protection).toBe("keychain")
  expect(first).not.toEqual(sealKeychain(value, key, profile))
  expect(first.payload).not.toContain(value.apiKey)
  expect(openKeychain(first, key, profile)).toEqual(value)
  expect(() => openKeychain(first, randomBytes(32), profile)).toThrow("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  expect(() => openKeychain(first, key, "b".repeat(64))).toThrow("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  for (const field of ["nonce", "tag", "ciphertext"]) {
    const payload = JSON.parse(first.payload)
    const bytes = Buffer.from(payload[field], "base64")
    bytes[0] ^= 1
    payload[field] = bytes.toString("base64")
    expect(() => openKeychain({ ...first, payload: JSON.stringify(payload) }, key, profile)).toThrow(
      "LOGINOM_CREDENTIAL_FORMAT_INVALID",
    )
  }
  expect(() => openKeychain({ ...first, protection: "plaintext" }, key, profile)).toThrow(
    "LOGINOM_CREDENTIAL_FORMAT_INVALID",
  )
  expect(() => openKeychain({ ...first, payload: "invalid-json" }, key, profile)).toThrow(
    "LOGINOM_CREDENTIAL_FORMAT_INVALID",
  )
  expect(() => sealKeychain(value, Buffer.alloc(16), profile)).toThrow("LOGINOM_CREDENTIAL_FORMAT_INVALID")
})

test("Keychain envelope preserves cloud JSON without interpreting connection secrets", () => {
  const value = { kind: "loginom-cloud-v1", installationKey: "site-canary", email: "user@example.test", dock: { primary: { apiKey: "primary-canary" }, reserve: { apiKey: "reserve-canary" } } }
  const key = randomBytes(32)
  expect(openKeychain(sealKeychain(value, key, "a".repeat(64)), key, "a".repeat(64))).toEqual(value)
})
