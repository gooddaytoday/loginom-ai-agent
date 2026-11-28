import { addAbortListener } from "node:events"
import { join } from "node:path"
import { Readable } from "node:stream"
import { Product } from "@loginom-ai-agent/product"
import { session } from "electron"
import { updateProxy } from "../update-proxy"
import { updateRequest } from "../update-request"
import { readUpdateSettings, updatePolicyPath, UpdateHttpError, UpdateTransportError } from "../update-feed"
import { downloadWslRelease } from "./wsl-release"

export async function fetchWslRelease(input: {
  version: string
  destination: string
  signal: AbortSignal
  systemProxyEnabled: boolean
}) {
  const { sources } = readUpdateSettings({
    policyPath: updatePolicyPath(process.platform, process.env.ProgramData),
    s3Path: join(process.resourcesPath, "updates-s3.json"),
    feed: Product.updateFeed,
    github: Product.updateGithub,
    // Immutable release objects are independent of the update channel preference.
    preference: null,
  })

  if (!sources.length) throw Error("WSL_CLI_RELEASE_UNAVAILABLE")

  const transport = session.fromPartition("loginom-wsl-downloads")
  const proxy = updateProxy(process.env, input.systemProxyEnabled)
  await transport.setProxy(proxy.config)
  const { signal } = input

  return downloadWslRelease({
    ...input,
    sources,
    get: (url) =>
      new Promise<Response>((resolve, reject) => {
        if (signal.aborted) throw new UpdateTransportError("LOGINOM_UPDATE_FEED_TIMEOUT")

        const request = updateRequest(url, transport, (auth, callback) => {
          const selected = proxy.credentials(auth)

          if (selected) return callback(selected.username, selected.password)

          // SAFETY: Electron's login callback accepts zero arguments to cancel authentication.
          const cancel = callback as () => void
          cancel()
        })

        const cancel = addAbortListener(signal, () => {
          reject(new UpdateTransportError("LOGINOM_UPDATE_FEED_TIMEOUT"))
          request.abort()
        })

        request.once("close", () => cancel[Symbol.dispose]())
        request.on("error", (error) => {
          reject(error)
          request.abort()
        })
        request.on("response", (response) => {
          if (response.statusCode !== 200) {
            reject(new UpdateHttpError(response.statusCode))
            request.abort()

            return
          }

          // ClientRequest delivers a Node Readable at runtime.
          if (!(response instanceof Readable)) {
            reject(Error("WSL_CLI_DOWNLOAD_FAILED"))
            request.abort()

            return
          }

          response.once("aborted", () => {
            response.destroy(new UpdateTransportError("LOGINOM_UPDATE_FEED_CONNECTION_CLOSED"))
          })
          const body = Readable.toWeb(response)

          if (body instanceof ReadableStream) resolve(new Response(body))
          else {
            reject(Error("WSL_CLI_DOWNLOAD_FAILED"))
            request.abort()
          }
        })
        request.setHeader("Cache-Control", "no-cache")
        request.setHeader("User-Agent", Product.slug)
        request.end()
      }),
  })
}
