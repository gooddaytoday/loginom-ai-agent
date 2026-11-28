import { expect, test } from "bun:test"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { downloadWslArchive } from "../src/wsl-release"

test.each([
  { archive: "Linux x64 CLI", error: undefined },
  { archive: "Different CLI", error: "WSL_CLI_CHECKSUM_MISMATCH" },
  { archive: "Linux x64 CLI", error: "WSL_CLI_SIGNATURE_INVALID" },
])("checks the signed Linux x64 archive before installation ($error)", async ({ archive, error }) => {
  const dir = await mkdtemp(join(tmpdir(), "wsl-release-"))
  const destination = join(dir, "download")
  const name = "loginom-ai-agent-cli-2.3.0-linux-x64.tar.gz"
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const digest = createHash("sha256").update("Linux x64 CLI").digest("hex")
  const checksum = `${digest}  ${name}\n`
  const signature = sign(null, Buffer.from(checksum), privateKey).toString("base64")
  const requests: string[] = []
  const assets = new Map([
    [name, archive],
    [name + ".sha256", error === "WSL_CLI_SIGNATURE_INVALID" ? checksum.replace("linux", "win32") : checksum],
    [name + ".sha256.sig", signature],
  ])

  try {
    const downloaded = downloadWslArchive({
      version: "2.3.0",
      destination,
      keys: [publicKey.export({ type: "spki", format: "pem" }).toString()],
      async get(asset) {
        requests.push(asset)
        return new Response(assets.get(asset), { status: assets.has(asset) ? 200 : 404 })
      },
    })
    if (error) await expect(downloaded).rejects.toThrow(error)
    else {
      expect(await downloaded).toBe(digest)
      expect(await readFile(destination, "utf8")).toBe(archive)
    }
    expect(requests).toEqual(
      error === "WSL_CLI_SIGNATURE_INVALID"
        ? [name + ".sha256", name + ".sha256.sig"]
        : [name + ".sha256", name + ".sha256.sig", name],
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
