import { expect, spyOn, test } from "bun:test"
import { chmod, mkdtemp, open, rm, writeFile, type FileHandle } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileSnapshot } from "../../src/util/file-snapshot"

test("snapshot accepts the explicit 16 MiB boundary and rejects a larger file", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-file-snapshot-"))
  try {
    const input = join(root, "large.bin")
    const limit = 16 * 1024 * 1024
    const handle = await open(input, "w")
    try {
      await handle.truncate(limit)
      expect((await fileSnapshot(input, limit)).length).toBe(limit)
      await handle.truncate(limit + 1)
      await expect(fileSnapshot(input, limit)).rejects.toMatchObject({
        message: "LOGINOM_FILE_TOO_LARGE",
        details: { actual: limit + 1, limit },
      })
    } finally {
      await handle.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("snapshot reports OS denial and a real file mutation during its read", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-file-snapshot-change-"))
  const path = join(directory, "private.csv")
  await writeFile(path, "original")
  try {
    await chmod(path, 0)
    await expect(fileSnapshot(path)).rejects.toMatchObject({ message: "LOGINOM_FILE_ACCESS_DENIED" })
    await chmod(path, 0o600)
    const handle = await open(path, "r")
    const prototype = Object.getPrototypeOf(handle) as FileHandle
    const read = prototype.read
    // Keep the real read; deterministically place a concurrent writer between
    // that read and the production final fstat, rather than racing a timer.
    const changed = spyOn(prototype, "read").mockImplementation(async function (
      this: FileHandle,
      ...args: Parameters<FileHandle["read"]>
    ) {
      const result = (await Reflect.apply(read, this, args)) as Awaited<ReturnType<FileHandle["read"]>>
      await writeFile(path, "changed-size")
      return result
    })
    try {
      await expect(fileSnapshot(path)).rejects.toMatchObject({ message: "LOGINOM_FILE_CHANGED" })
    } finally {
      changed.mockRestore()
      await handle.close()
    }
  } finally {
    await chmod(path, 0o600)
    await rm(directory, { recursive: true, force: true })
  }
})

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
    await expect(fileSnapshot(path)).rejects.toMatchObject({ message: "LOGINOM_FILE_TOO_LARGE" })
    await expect(fileSnapshot(directory)).rejects.toMatchObject({ message: "LOGINOM_FILE_NOT_REGULAR" })
    await expect(fileSnapshot(join(directory, "missing"))).rejects.toMatchObject({ message: "LOGINOM_FILE_NOT_FOUND" })
    if (process.platform === "linux") {
      const fifo = join(directory, "fifo")
      const child = Bun.spawn(["mkfifo", fifo])
      expect(await child.exited).toBe(0)
      await expect(fileSnapshot(fifo)).rejects.toMatchObject({ message: "LOGINOM_FILE_NOT_REGULAR" })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
