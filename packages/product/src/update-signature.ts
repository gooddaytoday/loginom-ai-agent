import { createPublicKey, verify } from "node:crypto"

export const UPDATE_PUBLIC_KEYS = Object.freeze([
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAekkV+yIMJpDlzXoJAWpT9ifgHKbKe5PJdtGC8FjmJ2c=\n-----END PUBLIC KEY-----\n",
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAuVor7DX+ReBZ+tg8gXaygsXqxF+WKA9dijYEIDNHTtc=\n-----END PUBLIC KEY-----\n",
])

/** Verify the downloaded bytes before parsing; either pinned key permits rotation. */
export function verifyUpdateSignature(
  bytes: Uint8Array,
  signature: string,
  keys: readonly string[] = UPDATE_PUBLIC_KEYS,
) {
  const encoded = signature.trim()
  if (!/^[A-Za-z0-9+/]{86}==$/.test(encoded)) return false
  const decoded = Buffer.from(encoded, "base64")
  if (decoded.toString("base64") !== encoded) return false
  return keys.some((pem) => {
    try {
      const key = createPublicKey(pem)
      return key.asymmetricKeyType === "ed25519" && verify(null, bytes, key, decoded)
    } catch {
      return false
    }
  })
}
