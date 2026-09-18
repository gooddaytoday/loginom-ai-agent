export type Secrets = { apiKey: string; password: string }
export type CliSecrets = {
  format: "loginom-cli-secrets-v1"
  protection: "plaintext" | "dpapi" | "keychain"
  payload: string
}
export type ProtectedSecrets = { encrypted: string } | Secrets | CliSecrets
export type CredentialCodec = {
  encode(value: Secrets): ProtectedSecrets | Promise<ProtectedSecrets>
  decode(value: ProtectedSecrets): Secrets | Promise<Secrets>
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
    encode(value: Secrets): ProtectedSecrets {
      if (platform === "linux") return { apiKey: value.apiKey, password: value.password }
      return { encrypted: requireProtection().encryptString(JSON.stringify(value)).toString("base64") }
    },
    decode(value: ProtectedSecrets): Secrets {
      if (platform === "linux" && "apiKey" in value) return { apiKey: value.apiKey, password: value.password }
      if (!("encrypted" in value)) throw new Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
      const decoded: unknown = JSON.parse(requireProtection().decryptString(Buffer.from(value.encrypted, "base64")))
      if (
        !decoded ||
        typeof decoded !== "object" ||
        !("apiKey" in decoded) ||
        !("password" in decoded) ||
        typeof decoded.apiKey !== "string" ||
        typeof decoded.password !== "string"
      ) {
        throw new Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
      }
      return { apiKey: decoded.apiKey, password: decoded.password }
    },
  }
}
