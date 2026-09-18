import { mkdtemp, mkdir, symlink } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { cliCredentials } from "../src/connection/cli-credentials"
import { cliKeychain } from "../src/connection/cli-keychain"

// Manual native acceptance. Retain test profiles and their Keychain entries:
// this script never deletes user keys or modifies the default Keychain/settings.
if (process.platform !== "darwin" || process.arch !== "arm64") throw Error("MACOS_ARM64_REQUIRED")
const resources = process.argv[2]
if (!resources || !isAbsolute(resources))
  throw Error("Provide absolute resources directory containing bin/loginom-keychain")
const directory = await mkdtemp("/tmp/loginom-keychain-acceptance-")
const root = join(directory, "profile")
const other = join(directory, "other-profile")
await mkdir(root, { mode: 0o700 })
await mkdir(other, { mode: 0o700 })
const codec = cliCredentials("darwin", { root, resources })
const value = { apiKey: "keychain-acceptance-ключ", password: "test-password\nwith spaces" }
await rejects(() => cliKeychain(root, resources, false), "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
const first = await codec.encode(value)
const second = await codec.encode(value)
if (!("format" in first) || first.protection !== "keychain") throw Error("KEYCHAIN_ENVELOPE_MISSING")
if (JSON.stringify(first) === JSON.stringify(second) || JSON.stringify(first).includes(value.apiKey))
  throw Error("KEYCHAIN_CIPHERTEXT_INVALID")
if (JSON.stringify(await codec.decode(first)) !== JSON.stringify(value)) throw Error("KEYCHAIN_ROUNDTRIP_FAILED")
const reopened = cliCredentials("darwin", { root, resources })
if (JSON.stringify(await reopened.decode(first)) !== JSON.stringify(value)) throw Error("KEYCHAIN_REOPEN_FAILED")
await symlink(root, join(directory, "alias"))
if (
  JSON.stringify(await cliCredentials("darwin", { root: join(directory, "alias"), resources }).decode(first)) !==
  JSON.stringify(value)
)
  throw Error("KEYCHAIN_ALIAS_FAILED")
await rejects(
  () => cliCredentials("darwin", { root: other, resources }).decode(first),
  "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE",
)
const otherCodec = cliCredentials("darwin", { root: other, resources })
await otherCodec.encode(value)
await rejects(() => otherCodec.decode(first), "LOGINOM_CREDENTIAL_FORMAT_INVALID")
const payload = JSON.parse(first.payload)
const ciphertext = Buffer.from(payload.ciphertext, "base64")
ciphertext[0] ^= 1
payload.ciphertext = ciphertext.toString("base64")
await rejects(() => codec.decode({ ...first, payload: JSON.stringify(payload) }), "LOGINOM_CREDENTIAL_FORMAT_INVALID")
await rejects(
  () => cliCredentials("darwin", { root, resources: join(directory, "missing") }).decode(first),
  "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE",
)
await Bun.write(join(root, "test-envelope.json"), JSON.stringify(first), { mode: 0o600 })
await Bun.write(
  join(directory, "summary.json"),
  JSON.stringify({
    status: "PASS",
    platform: process.platform,
    arch: process.arch,
    resources,
    directory,
    checks: [
      "missing-read",
      "roundtrip",
      "fresh-nonce",
      "reopen",
      "canonical-alias",
      "profile-isolation",
      "tamper",
      "missing-helper",
    ],
  }),
)
console.log(JSON.stringify({ status: "PASS", evidence: directory, retainedTestKeychainEntries: 2 }))

async function rejects(run: () => unknown, expected: string) {
  const result = await Promise.resolve()
    .then(run)
    .then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.message : "unknown"),
    )
  if (result !== expected) throw Error("KEYCHAIN_EXPECTED_REJECTION_MISSING")
}
