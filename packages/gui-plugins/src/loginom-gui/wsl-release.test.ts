import { expect, test } from "bun:test"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readUpdateSettings, UpdateHttpError, UpdateTransportError } from "../updater/signed-feed"
import { downloadWslRelease } from "./wsl-release"

const version = "2.3.0"
const archive = `loginom-ai-agent-cli-${version}-linux-x64.tar.gz`
const bytes = "Linux CLI"
const hash = createHash("sha256").update(bytes).digest("hex")
const checksum = `${hash}  ${archive}\n`
const { privateKey, publicKey } = generateKeyPairSync("ed25519")
const keys = [publicKey.export({ type: "spki", format: "pem" }).toString()]
const assets = [archive + ".sha256", archive + ".sha256.sig", archive]
const github = {
  api: "https://api.example.test/releases",
  download: "https://github.example.test/releases/download/",
}
const mirror = {
  endpoint: "https://store.example.test",
  bucket: "bucket",
  region: "us-east-1",
  accessKeyId: "test:access",
  secretAccessKey: "example-secret",
}

test.each(["github", "s3", "missing", "interrupted", "bad-signature"] as const)(
  "downloads the exact Desktop version using its configured release source (%s)",
  async (mode) => {
    const dir = await mkdtemp(join(tmpdir(), "wsl-release-source-"))
    const destination = join(dir, archive)
    const s3Path = join(dir, "updates-s3.json")
    if (mode !== "github") await writeFile(s3Path, JSON.stringify(mirror))
    const { sources } = readUpdateSettings({
      policyPath: join(dir, "missing-policy.json"),
      s3Path,
      feed: mode === "github" ? null : "https://bucket.store.example.test/",
      github: mode === "s3" ? null : github,
      preference: "unstable",
    })
    const seen: URL[] = []
    try {
      const download = downloadWslRelease({
        version,
        sources,
        destination,
        keys,
        get: async (target) => {
          const url = new URL(target)
          seen.push(url)
          const file = url.pathname.split("/").at(-1)
          const primary = url.hostname === "github.example.test"

          if (mode === "missing" && primary) throw new UpdateHttpError(404)
          if (file === assets[0]) return new Response(checksum)
          if (file === assets[1])
            return new Response(
              sign(null, Buffer.from(mode === "bad-signature" ? "tampered" : checksum), privateKey).toString("base64"),
            )
          if (mode === "interrupted" && primary)
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode("partial archive"))
                },
                async pull(controller) {
                  await Bun.sleep(5)
                  controller.error(new UpdateTransportError("LOGINOM_UPDATE_FEED_CONNECTION_CLOSED"))
                },
              }),
            )
          return new Response(bytes)
        },
      })

      if (mode === "bad-signature") {
        await expect(download).rejects.toThrow("WSL_CLI_SIGNATURE_INVALID")
      } else {
        expect(await download).toBe(hash)
        expect(await readFile(destination, "utf8")).toBe(bytes)
      }
      const fromGitHub = seen.filter((url) => url.hostname === "github.example.test")
      const fromMirror = seen.filter((url) => url.hostname === "bucket.store.example.test")
      expect(fromGitHub.map((url) => url.href)).toEqual(
        (mode === "s3" ? [] : mode === "missing" ? assets.slice(0, 1) : mode === "bad-signature" ? assets.slice(0, 2) : assets).map(
          (name) => `${github.download}v${version}/${name}`,
        ),
      )
      expect(fromMirror.map((url) => url.pathname)).toEqual(
        (mode === "github" || mode === "bad-signature" ? [] : assets).map((name) => `/releases/${version}/${name}`),
      )
      for (const url of fromMirror) {
        expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256")
        expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/)
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
)
