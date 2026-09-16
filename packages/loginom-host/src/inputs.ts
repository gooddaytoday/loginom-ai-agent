import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"

export type InputFile = { name: string; data: string }
// Only trusted user-message attachments reach this entrypoint. It accepts bytes, never model-selected OS paths.
export function inputStore(root: string) {
  return {
    async admit(chat: string, userMessage: string, files: InputFile[], folder: string) {
      if (!Array.isArray(files) || files.length > 8 || !chat || !userMessage) throw new Error("LOGINOM_INPUT_INVALID")
      const total = { bytes: 0 }
      const batch = files.map((file) => {
        if (typeof file.name !== "string" || typeof file.data !== "string" || file.data.length > 24 * 1024 * 1024)
          throw new Error("LOGINOM_INPUT_INVALID")
        const name = basename(file.name.replaceAll("\\", "/"))
        if (!name || name === "." || name === ".." || /[\x00-\x1f\x7f]/.test(name))
          throw new Error("LOGINOM_INPUT_INVALID")
        const bytes = Buffer.from(file.data, "base64")
        if (bytes.toString("base64") !== file.data || bytes.length > 16 * 1024 * 1024)
          throw new Error("LOGINOM_INPUT_INVALID")
        total.bytes += bytes.length
        return { name, bytes, sha256: createHash("sha256").update(bytes).digest("hex") }
      })
      if (
        total.bytes > 64 * 1024 * 1024 ||
        new Set(batch.map((file) => file.name.normalize("NFC").toLowerCase())).size !== batch.length
      )
        throw new Error("LOGINOM_INPUT_INVALID")
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
            name: `${identity}-${index}-${file.name.slice(-120)}`,
            bytes: file.bytes.length,
            sha256: file.sha256,
            upload: { directory: folder, overwrite: "reject" },
          }
        }),
      )
    },
  }
}
