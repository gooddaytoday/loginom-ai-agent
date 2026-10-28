import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { hostException } from "./errors"

export type InputFile = { name: string; data: string }
// Only backend-authorized inputs reach this entrypoint. It accepts bytes, never model-selected OS paths.
export function inputStore(root: string) {
  return {
    async admit(chat: string, userMessage: string, files: InputFile[], folder: string) {
      if (!Array.isArray(files) || files.length > 8 || !chat || !userMessage) throw new Error("LOGINOM_INPUT_INVALID")
      const total = { bytes: 0 }
      const batch = files.map((file) => {
        if (typeof file.name !== "string" || typeof file.data !== "string") throw new Error("LOGINOM_INPUT_INVALID")
        if (file.data.length > 24 * 1024 * 1024) {
          // Preserve the encoded allocation guard. Classify canonical base64
          // without decoding an oversized payload into another full buffer.
          const tail = file.data.slice(-4)
          if (
            file.data.length % 4 ||
            /[^A-Za-z0-9+/]/.test(file.data.slice(0, -4)) ||
            Buffer.from(tail, "base64").toString("base64") !== tail
          )
            throw new Error("LOGINOM_INPUT_INVALID")
          throw hostException({
            error: "LOGINOM_FILE_TOO_LARGE",
            details: {
              actual: (file.data.length / 4) * 3 - (tail.endsWith("==") ? 2 : tail.endsWith("=") ? 1 : 0),
              limit: 16 * 1024 * 1024,
            },
          })
        }
        const name = basename(file.name.replaceAll("\\", "/"))
        if (!name || name === "." || name === "..") throw new Error("LOGINOM_INPUT_INVALID")
        const bytes = Buffer.from(file.data, "base64")
        if (bytes.toString("base64") !== file.data) throw new Error("LOGINOM_INPUT_INVALID")
        if (bytes.length > 16 * 1024 * 1024)
          throw hostException({
            error: "LOGINOM_FILE_TOO_LARGE",
            details: { actual: bytes.length, limit: 16 * 1024 * 1024 },
          })
        total.bytes += bytes.length
        return { name, bytes, sha256: createHash("sha256").update(bytes).digest("hex") }
      })
      if (new Set(batch.map((file) => file.name.normalize("NFC").toLowerCase())).size !== batch.length)
        throw new Error("LOGINOM_INPUT_INVALID")
      if (total.bytes > 64 * 1024 * 1024)
        throw hostException({
          error: "LOGINOM_FILE_TOO_LARGE",
          details: { actual: total.bytes, limit: 64 * 1024 * 1024 },
        })
      const identity = createHash("sha256")
        .update(JSON.stringify([chat, userMessage]))
        .digest("hex")
      const directory = join(root, identity)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const manifest = JSON.stringify(
        batch.map((file) => ({ name: file.name, bytes: file.bytes.length, sha256: file.sha256 })),
      )
      await writeFile(join(directory, "identity.json"), manifest, { mode: 0o600, flag: "wx" }).catch(
        async (error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") throw error
          if ((await readFile(join(directory, "identity.json"), "utf8")) !== manifest)
            throw new Error("LOGINOM_INPUT_IDENTITY_CONFLICT")
        },
      )
      return Promise.all(
        batch.map(async (file, index) => {
          const sourcePath = join(directory, String(index))
          await writeFile(sourcePath, file.bytes, { mode: 0o600, flag: "wx" }).catch(
            async (error: NodeJS.ErrnoException) => {
              if (error.code !== "EEXIST") throw error
              if (
                createHash("sha256")
                  .update(await readFile(sourcePath))
                  .digest("hex") !== file.sha256
              )
                throw new Error("LOGINOM_INPUT_IDENTITY_CONFLICT")
            },
          )
          return {
            sourcePath,
            name: `${identity}-${index}-${file.name.replace(/[\\/:<>"|?*%#\x00-\x1f\x7f]|[. ]+$/g, "_").slice(-120)}`,
            bytes: file.bytes.length,
            sha256: file.sha256,
            upload: { directory: folder, overwrite: "reject" },
          }
        }),
      )
    },
  }
}
