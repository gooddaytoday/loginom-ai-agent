import { expect, test } from "bun:test"
import { cliCredentials } from "../src/connection/cli-credentials"
import { buildKeychain } from "../script/build-keychain"

test.skipIf(process.platform === "darwin")("Keychain host integration fails closed on another OS", async () => {
  const codec = cliCredentials("darwin", { root: "/private/profile", resources: "/private/resources" })
  await expect(codec.encode({ apiKey: "test", password: "" })).rejects.toThrow(
    "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE",
  )
  await expect(
    codec.decode({ format: "loginom-cli-secrets-v1", protection: "plaintext", payload: "{}" }),
  ).rejects.toThrow("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  await expect(buildKeychain("/tmp/keychain-test-must-not-build")).rejects.toThrow(
    "LOGINOM_NATIVE_RESOURCES_UNAVAILABLE",
  )
})
