import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { Option, Schema } from "effect"
import type { CliSecrets, Secrets } from "./credentials"

const envelope = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      nonce: Schema.String,
      tag: Schema.String,
      ciphertext: Schema.String,
    }),
  ),
)
const secrets = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      apiKey: Schema.String,
      password: Schema.String,
    }),
  ),
)

// The key is supplied by Keychain; never persist it beside this envelope.
// Profile identity is authenticated so ciphertext cannot move to another profile.
export function sealKeychain(value: Secrets, key: Buffer, profile: string): CliSecrets {
  if (key.length !== 32 || !/^[a-f0-9]{64}$/.test(profile)) throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  const plaintext = Buffer.from(JSON.stringify({ apiKey: value.apiKey, password: value.password }), "utf8")
  if (plaintext.length > 1024 * 1024) throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  cipher.setAAD(Buffer.from(`loginom-cli-secrets-v1:${profile}`, "utf8"))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    format: "loginom-cli-secrets-v1",
    protection: "keychain",
    payload: JSON.stringify({
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    }),
  }
}

export function openKeychain(value: CliSecrets, key: Buffer, profile: string): Secrets {
  if (
    value.format !== "loginom-cli-secrets-v1" ||
    value.protection !== "keychain" ||
    value.payload.length > 2 * 1024 * 1024 ||
    key.length !== 32 ||
    !/^[a-f0-9]{64}$/.test(profile)
  )
    throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  const parsed = envelope(value.payload)
  if (Option.isNone(parsed)) throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  const nonce = base64(parsed.value.nonce)
  const tag = base64(parsed.value.tag)
  const ciphertext = base64(parsed.value.ciphertext)
  if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length > 1024 * 1024)
    throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  try {
    const cipher = createDecipheriv("aes-256-gcm", key, nonce)
    cipher.setAAD(Buffer.from(`loginom-cli-secrets-v1:${profile}`, "utf8"))
    cipher.setAuthTag(tag)
    const result = secrets(Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString("utf8"))
    if (Option.isNone(result)) throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
    return result.value
  } catch {
    throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  }
}

function base64(value: string) {
  const bytes = Buffer.from(value, "base64")
  if (bytes.toString("base64") !== value) throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  return bytes
}
