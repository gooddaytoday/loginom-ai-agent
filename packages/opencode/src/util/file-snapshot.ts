import { constants } from "node:fs"
import { open } from "node:fs/promises"

// Read only the explicitly attached file, with a bound on allocation and reads.
// O_NONBLOCK lets us reject a FIFO after fstat without waiting for a writer.
export async function fileSnapshot(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024)
      throw Error("Cannot attach local file larger than 10 MiB or a special file")
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (read.bytesRead === 0) break
      offset += read.bytesRead
    }
    const final = await handle.stat()
    if (offset !== bytes.length || final.size !== stat.size || final.mtimeMs !== stat.mtimeMs)
      throw Error("Attached file changed while being read")
    return bytes
  } finally {
    await handle.close()
  }
}
