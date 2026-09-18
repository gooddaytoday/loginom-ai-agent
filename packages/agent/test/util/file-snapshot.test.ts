import { expect, test } from "bun:test"
import { mkdtemp, open, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileSnapshot } from "../../src/util/file-snapshot"

test("attachment snapshots preserve exact bytes and reject oversized or special files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-file-snapshot-"))
  try {
    const path = join(directory, "данные #1.csv")
    for (const bytes of [Buffer.alloc(0), Buffer.from("amount\n10\n20\n25\n"), Buffer.from([0, 255, 128, 10])]) {
      await writeFile(path, bytes)
      const snapshot = await fileSnapshot(path)
      await writeFile(path, "changed after admission")
      expect(snapshot).toEqual(bytes)
    }
    const handle = await open(path, "w")
    await handle.truncate(10 * 1024 * 1024 + 1)
    await handle.close()
    await expect(fileSnapshot(path)).rejects.toThrow("10 MiB")
    await expect(fileSnapshot(directory)).rejects.toThrow()
    if (process.platform === "linux") {
      const fifo = join(directory, "fifo")
      const child = Bun.spawn(["mkfifo", fifo])
      expect(await child.exited).toBe(0)
      await expect(fileSnapshot(fifo)).rejects.toThrow("special file")
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
