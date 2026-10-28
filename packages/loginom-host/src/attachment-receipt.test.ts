import { expect, test } from "bun:test"
import { mkdtemp, open, rm, stat, symlink, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createAttachmentReceipt, bindAttachmentReceipt, verifyAttachmentReceipt } from "./attachment-receipt"

test("native receipt retains a >4 GiB identity and binds it to exactly one message", async () => {
  const dir = await mkdtemp(join(tmpdir(), "receipt-"))
  const path = join(dir, "данные %#.csv")
  try {
    const handle = await open(path, "w")
    await handle.truncate(5 * 1024 ** 3)
    await handle.close()
    const reference = await createAttachmentReceipt(path)
    expect(reference.size).toBe(5 * 1024 ** 3)
    const owner = { session: "a", message: "b" }
    await bindAttachmentReceipt(reference.receipt, path, owner)
    await bindAttachmentReceipt(reference.receipt, path, owner)
    await verifyAttachmentReceipt(reference.receipt, path, owner)
    await expect(bindAttachmentReceipt(reference.receipt, path, { session: "a", message: "c" })).rejects.toMatchObject({
      message: "LOGINOM_INPUT_INVALID",
    })
    await writeFile(path, "changed")
    await expect(verifyAttachmentReceipt(reference.receipt, path, owner)).rejects.toMatchObject({
      message: "LOGINOM_FILE_CHANGED",
    })
    await unlink(path)
    await expect(verifyAttachmentReceipt(reference.receipt, path, owner)).rejects.toMatchObject({
      message: "LOGINOM_FILE_NOT_FOUND",
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("native stat refuses changed drag metadata and retargeted symlinks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "receipt-alias-"))
  try {
    const first = join(dir, "first.csv"),
      second = join(dir, "second.csv"),
      alias = join(dir, "alias.csv")
    await writeFile(first, "a")
    await writeFile(second, "b")
    const info = await stat(first)
    await expect(
      createAttachmentReceipt(first, { size: 2, lastModified: Math.trunc(info.mtimeMs) }),
    ).rejects.toMatchObject({ message: "LOGINOM_FILE_CHANGED" })
    await symlink(first, alias)
    const reference = await createAttachmentReceipt(alias)
    await unlink(alias)
    await symlink(second, alias)
    await expect(verifyAttachmentReceipt(reference.receipt, alias)).rejects.toMatchObject({
      message: "LOGINOM_FILE_CHANGED",
    })
    await expect(verifyAttachmentReceipt("../unknown", first)).rejects.toMatchObject({
      message: "LOGINOM_INPUT_INVALID",
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
