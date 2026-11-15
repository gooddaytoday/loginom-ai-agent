export type CliSecrets = {
  format: "loginom-cli-secrets-v1"
  protection: "plaintext" | "dpapi" | "keychain"
  payload: string
}
export type CredentialCodec = {
  encode(value: Record<string, unknown>): unknown | Promise<unknown>
  decode(value: unknown): unknown | Promise<unknown>
}

type Protection = {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

// Linux intentionally stores plaintext. Other platforms must never silently fall back.
export function credentials(platform: NodeJS.Platform, protection?: Protection) {
  function requireProtection() {
    if (!protection?.isEncryptionAvailable()) throw new Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
    return protection
  }
  return {
    encode(value: Record<string, unknown>): unknown {
      if (platform === "linux") return value
      return { encrypted: requireProtection().encryptString(JSON.stringify(value)).toString("base64") }
    },
    decode(value: unknown): unknown {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
      if (platform === "linux") return value
      if (!("encrypted" in value) || typeof value.encrypted !== "string")
        throw new Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
      return JSON.parse(requireProtection().decryptString(Buffer.from(value.encrypted, "base64")))
    },
  }
}
