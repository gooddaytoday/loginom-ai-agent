import { expect, test } from "bun:test"
import { createHash, generateKeyPairSync } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { signRelease, signWslCandidate, verifySignedRelease } from "./update-feed"

test("release signing authenticates the standalone Linux CLI checksum", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wsl-update-feed-"))
  const version = "2.3.0"
  const archive = "loginom-ai-agent-cli-2.3.0-linux-x64.tar.gz"
  const installer = "loginom-ai-agent-fixture"
  const bytes = "desktop installer"
  const sha512 = createHash("sha512").update(bytes).digest("base64")
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const key = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const keys = [publicKey.export({ type: "spki", format: "pem" }).toString()]
  const writeSums = async () => {
    const names = (await readdir(dir)).filter((name) => name !== "SHA256SUMS.txt")
    const lines = await Promise.all(
      names.map(async (name) => {
        const hash = createHash("sha256")
          .update(await Bun.file(join(dir, name)).bytes())
          .digest("hex")
        return `${hash}  ${name}\n`
      }),
    )
    await Bun.write(join(dir, "SHA256SUMS.txt"), lines.join(""))
  }

  try {
    await Bun.write(join(dir, archive), "standalone Linux archive")
    await Bun.write(join(dir, installer), bytes)
    for (const name of ["latest.yml", "latest-linux.yml", "latest-mac.yml"]) {
      await Bun.write(
        join(dir, name),
        Bun.YAML.stringify({
          version,
          files: [{ url: installer, sha512, size: bytes.length }],
          path: installer,
          sha512,
        }),
      )
    }
    await writeSums()
    await signRelease(dir, version, version, key, keys)
    await writeSums()
    await verifySignedRelease(dir, version, keys)

    await Bun.write(join(dir, archive + ".sha256.sig"), "changed signature")
    await writeSums()
    await expect(verifySignedRelease(dir, version, keys)).rejects.toThrow("WSL_CLI_SIGNATURE_INVALID")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("the stand can sign a verified candidate without desktop updater metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wsl-candidate-signing-"))
  const name = "loginom-ai-agent-cli-2.3.0-linux-x64.tar.gz"
  const bytes = "candidate archive"
  const hash = (value: string) => createHash("sha256").update(value).digest("hex")
  const checksum = `${hash(bytes)}  ${name}\n`
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const key = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const keys = [publicKey.export({ type: "spki", format: "pem" }).toString()]
  try {
    await Bun.write(join(dir, name), bytes)
    await Bun.write(join(dir, name + ".sha256"), checksum)
    await Bun.write(join(dir, "SHA256SUMS.txt"), checksum + `${hash(checksum)}  ${name}.sha256\n`)
    await signWslCandidate(dir, "2.3.0", key, keys)
    expect(await Bun.file(join(dir, name + ".sha256.sig")).text()).toMatch(/^[A-Za-z0-9+/]{86}==\s*$/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
