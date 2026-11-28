import { createHash } from "node:crypto"
import { createWriteStream } from "node:fs"
import { Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { verifyUpdateSignature } from "./update-signature"

export function wslArchiveName(version: string) {
  if (!/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version)) throw Error("WSL_CLI_VERSION_INVALID")
  return `loginom-ai-agent-cli-${version}-linux-x64.tar.gz`
}

export function wslArchiveDigest(version: string, bytes: Uint8Array, signature: string, keys?: readonly string[]) {
  if (!verifyUpdateSignature(bytes, signature, keys)) throw Error("WSL_CLI_SIGNATURE_INVALID")

  const [digest, name] = new TextDecoder().decode(bytes).trimEnd().split("  ")
  if (!/^[a-f0-9]{64}$/.test(digest) || name !== wslArchiveName(version)) throw Error("WSL_CLI_CHECKSUM_INVALID")
  return digest
}

/** Stream the archive to a private staging path, then verify it before handing it to the installer. */
export async function downloadWslArchive(input: {
  version: string
  destination: string
  get: (name: string) => Promise<Response>
  keys?: readonly string[]
}) {
  const name = wslArchiveName(input.version)
  const checksum = await input.get(name + ".sha256")
  if (!checksum.ok) throw Error("WSL_CLI_METADATA_UNAVAILABLE")
  const bytes = new Uint8Array(await checksum.arrayBuffer())
  const signature = await input.get(name + ".sha256.sig")
  if (!signature.ok) throw Error("WSL_CLI_METADATA_UNAVAILABLE")

  const digest = wslArchiveDigest(input.version, bytes, await signature.text(), input.keys)
  const response = await input.get(name)
  if (!response.ok || !response.body) throw Error("WSL_CLI_ARCHIVE_UNAVAILABLE")

  const hash = createHash("sha256")
  await pipeline(
    response.body,
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk)
        callback(null, chunk)
      },
    }),
    createWriteStream(input.destination, { flags: "wx", mode: 0o600 }),
  )
  if (hash.digest("hex") !== digest) throw Error("WSL_CLI_CHECKSUM_MISMATCH")
  return digest
}
