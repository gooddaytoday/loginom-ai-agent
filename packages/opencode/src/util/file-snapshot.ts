import { constants } from "node:fs"
import { open } from "node:fs/promises"
import { fileError, hostException } from "@loginom-ai-agent/loginom-host/errors"

// Read an authorized file, with a bound on allocation and reads.
// O_NONBLOCK lets us reject a FIFO after fstat without waiting for a writer.
export async function fileSnapshot(path: string, maxBytes = 10 * 1024 * 1024) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK).catch((error) => {
    throw fileError(error)
  })
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw hostException("LOGINOM_FILE_NOT_REGULAR")
    if (stat.size > maxBytes)
      throw hostException({ error: "LOGINOM_FILE_TOO_LARGE", details: { actual: stat.size, limit: maxBytes } })
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (read.bytesRead === 0) break
      offset += read.bytesRead
    }
    const final = await handle.stat()
    if (offset !== bytes.length || final.size !== stat.size || final.mtimeMs !== stat.mtimeMs)
      throw hostException("LOGINOM_FILE_CHANGED")
    return bytes
  } catch (error) {
    throw fileError(error)
  } finally {
    await handle.close()
  }
}
