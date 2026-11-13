import type { CliSecrets } from "./credentials"
import { Option, Schema } from "effect"

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))
const decodeEnvelope = Schema.decodeUnknownOption(
  Schema.Struct({
    format: Schema.Literal("loginom-cli-secrets-v1"),
    protection: Schema.Literals(["plaintext", "dpapi", "keychain"]),
    payload: Schema.String,
  }),
)

export function cliCredentials(platform: NodeJS.Platform, paths?: { root: string; resources: string }) {
  if (!["linux", "win32", "darwin"].includes(platform)) throw new Error("LOGINOM_CREDENTIAL_PLATFORM_UNSUPPORTED")
  return {
    async encode(value: Record<string, unknown>): Promise<CliSecrets> {
      if (platform === "darwin" && paths) {
        const { cliKeychain } = await import("./cli-keychain")
        const { sealKeychain } = await import("./keychain-envelope")
        const identity = await cliKeychain(paths.root, paths.resources, true)
        try {
          return sealKeychain(value, identity.key, identity.profile)
        } finally {
          identity.key.fill(0)
        }
      }
      if (platform === "win32") {
        const { cliDpapi } = await import("./cli-dpapi")
        return {
          format: "loginom-cli-secrets-v1",
          protection: "dpapi",
          payload: (await cliDpapi("Protect", Buffer.from(JSON.stringify(value), "utf8"))).toString("base64"),
        }
      }
      if (platform !== "linux") throw new Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
      return {
        format: "loginom-cli-secrets-v1",
        protection: "plaintext",
        payload: JSON.stringify(value),
      }
    },
    async decode(input: unknown): Promise<unknown> {
      const parsed = decodeEnvelope(input)
      if (Option.isNone(parsed)) throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
      const value = parsed.value
      if (platform === "darwin" && paths) {
        if (value.protection !== "keychain" || value.payload.length > 2 * 1024 * 1024)
          throw Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
        const { cliKeychain } = await import("./cli-keychain")
        const { openKeychain } = await import("./keychain-envelope")
        const identity = await cliKeychain(paths.root, paths.resources, false)
        try {
          return openKeychain(value, identity.key, identity.profile)
        } finally {
          identity.key.fill(0)
        }
      }
      if (platform === "win32") {
        if (
          value.protection !== "dpapi" ||
          !value.payload ||
          value.payload.length > 2 * 1024 * 1024 ||
          Buffer.from(value.payload, "base64").toString("base64") !== value.payload
        )
          throw new Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
        const { cliDpapi } = await import("./cli-dpapi")
        const decoded = decode((await cliDpapi("Unprotect", Buffer.from(value.payload, "base64"))).toString("utf8"))
        if (Option.isNone(decoded)) throw new Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
        return decoded.value
      }
      if (platform !== "linux") throw new Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
      if (value.protection !== "plaintext") throw new Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
      const decoded = decode(value.payload)
      if (Option.isNone(decoded)) throw new Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
      return decoded.value
    },
  }
}
