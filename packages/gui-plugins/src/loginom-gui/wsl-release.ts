import { rm } from "node:fs/promises"
import { downloadWslArchive } from "@loginom-ai-agent/product/wsl-release"
import { isUpdateTransportError, updateAssetUrl, updateKeys, UpdateHttpError, type UpdateSource } from "../update-feed"

export async function downloadWslRelease(input: {
  sources: readonly UpdateSource[]
  version: string
  destination: string
  get: (url: string) => Promise<Response>
  keys?: readonly string[]
}) {
  if (!input.sources.length) throw Error("WSL_CLI_RELEASE_UNAVAILABLE")
  const release = `releases/${encodeURIComponent(input.version)}/`

  for (const [index, source] of input.sources.entries()) {
    const feed =
      source.kind === "github" ? new URL(`v${encodeURIComponent(input.version)}/`, source.download).href : source.feed

    const fallback = source.kind === "github" && index + 1 < input.sources.length

    try {
      return await downloadWslArchive({
        version: input.version,
        destination: input.destination,
        keys: input.keys ?? updateKeys,
        get: async (name) => {
          try {
            return await input.get(updateAssetUrl(source, feed, release + name))
          } catch (error) {
            if (!fallback && error instanceof UpdateHttpError && error.statusCode === 404)
              return new Response(null, { status: 404 })
            throw error
          }
        },
      })
    } catch (error) {
      const network = error instanceof Error && isUpdateTransportError(error)
      const notFound = error instanceof UpdateHttpError && error.statusCode === 404

      if (fallback && (notFound || network)) {
        // A failed stream may have left a partial archive. Re-read the signed checksum on the next source.
        await rm(input.destination, { force: true })
        continue
      }

      if (network) throw Error("WSL_CLI_NETWORK_ERROR")
      throw error
    }
  }

  throw Error("WSL_CLI_RELEASE_UNAVAILABLE")
}
