import { APICallError, type LanguageModelMiddleware } from "ai"
import { Global } from "@opencode-ai/core/global"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { open } from "node:fs/promises"
import path from "node:path"
import { isRecord } from "@/util/record"

// Playwright and the pinned Responses SDK both use base64 data URLs. Never retain the URL.
export function screenshotImageFact(url: unknown) {
  if (typeof url !== "string") return null
  const prefix = /^data:(image\/(?:png|jpeg|webp|gif));base64,/.exec(url)
  if (!prefix) return null
  const bytes = Buffer.from(url.slice(prefix[0].length), "base64")
  return { mime: prefix[1], bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }
}

export function screenshotDelivery(sessionID: string): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    async wrapStream({ doStream, params, model }) {
      if (model.provider !== "openai.responses") return doStream()
      const calls = params.prompt.flatMap((message) =>
        message.role === "tool"
          ? message.content.flatMap((part) =>
              part.type === "tool-result" && part.toolName === "loginom_browser_take_screenshot"
                ? [part.toolCallId]
                : [],
            )
          : [],
      )
      if (!calls.length) return doStream()

      // The pinned Responses SDK exposes its serialized inputs on both response paths.
      // Network failures have no response and cannot attest delivery.
      async function record(result: "stream" | "error", responseObserved: boolean, body: unknown) {
        const inputs = responseObserved && isRecord(body) && Array.isArray(body.input) ? body.input : undefined
        const attemptID = crypto.randomUUID()
        const lines = calls.map((callID) => {
          const output = inputs?.find(
            (item: unknown) => isRecord(item) && item.type === "function_call_output" && item.call_id === callID,
          )
          const images = !inputs ? null : output ? inputImages(output.output) : []
          return JSON.stringify({
            sessionID,
            attemptID,
            callID,
            result,
            responseObserved,
            outputPresent: inputs ? !!output : null,
            images,
          })
        })
        const file = await open(
          path.join(Global.Path.data, "browser-recovery-delivery.jsonl"),
          constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
          0o600,
        )
        try {
          await file.writeFile(lines.join("\n") + "\n")
        } finally {
          await file.close()
        }
      }

      try {
        const output = await doStream()
        await record("stream", output.response?.headers !== undefined, output.request?.body).catch(() => {})
        return output
      } catch (error) {
        const apiError = APICallError.isInstance(error) ? error : undefined
        await record("error", apiError?.responseHeaders !== undefined, apiError?.requestBodyValues).catch(() => {})
        throw error
      }
    },
  }
}

function inputImages(output: unknown) {
  if (typeof output === "string") return []
  if (!Array.isArray(output)) return null
  return output.flatMap((part: unknown) =>
    isRecord(part) && part.type === "input_image" ? [screenshotImageFact(part.image_url)] : [],
  )
}
