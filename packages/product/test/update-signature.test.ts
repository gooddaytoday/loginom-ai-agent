import { expect, test } from "bun:test"
import { generateKeyPairSync, sign } from "node:crypto"
import { UPDATE_PUBLIC_KEYS, verifyUpdateSignature } from "../src/update-signature"

const primary = generateKeyPairSync("ed25519")
const backup = generateKeyPairSync("ed25519")
const foreign = generateKeyPairSync("ed25519")
const keys = [primary, backup].map((pair) => pair.publicKey.export({ type: "spki", format: "pem" }).toString())
const bytes = Buffer.from("version: 0.4.0\n")

test("accepts exact bytes signed by either trusted Ed25519 key", () => {
  for (const pair of [primary, backup])
    expect(verifyUpdateSignature(bytes, sign(null, bytes, pair.privateKey).toString("base64"), keys)).toBe(true)
})

test("rejects foreign key, modified bytes, malformed base64 and missing signature", () => {
  const signature = sign(null, bytes, primary.privateKey).toString("base64")
  expect(verifyUpdateSignature(bytes, sign(null, bytes, foreign.privateKey).toString("base64"), keys)).toBe(false)
  expect(verifyUpdateSignature(Buffer.from("version: 0.4.1\n"), signature, keys)).toBe(false)
  for (const invalid of ["", "garbage", signature + "!", signature.slice(4)])
    expect(verifyUpdateSignature(bytes, invalid, keys)).toBe(false)
  expect(verifyUpdateSignature(bytes, signature)).toBe(false)
  expect(UPDATE_PUBLIC_KEYS).toHaveLength(2)
})
