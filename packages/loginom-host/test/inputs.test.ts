import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inputStore } from "../src/inputs"

test("server copy names satisfy upload, import and package path rules while preserving bytes and extensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-input-names-"))
  try {
    const names = [
      "Скидка 10%.csv",
      "План #2.lgp",
      "a:b?.xlsx",
      "control\u0001.csv",
      "конец. ",
      "a".repeat(140) + ".xlsx",
    ]
    const copies = ["Скидка 10_.csv", "План _2.lgp", "a_b_.xlsx", "control_.csv", "конец_", "a".repeat(115) + ".xlsx"]
    const files = names.map((name, index) => ({ name, data: Buffer.from([0, 255, index]).toString("base64") }))
    const admitted = await inputStore(root).admit("chat", "original", files, "/user")
    for (const [index, file] of admitted.entries()) {
      expect(file.name).toEndWith("-" + copies[index])
      expect(file.name).not.toMatch(/[\\/:<>"|?*%#\x00-\x1f\x7f]|[. ]$/)
      expect(await readFile(file.sourcePath)).toEqual(Buffer.from([0, 255, index]))
      expect(file.upload).toEqual({ directory: "/user", overwrite: "reject" })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("equal names in different chats bind different bytes and paths to the original user message", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-input-"))
  const store = inputStore(root)
  const first = [{ name: "dataset.csv", data: Buffer.from("Alpha,35\nBeta,20").toString("base64") }]
  const second = [{ name: "dataset.csv", data: Buffer.from("Alpha,100\nBeta,1").toString("base64") }]
  try {
    const a = await store.admit("chat-a", "user-a", first, "/user")
    const b = await store.admit("chat-b", "user-b", second, "/user")
    expect(a[0].sourcePath).not.toBe(b[0].sourcePath)
    expect(a[0].sha256).not.toBe(b[0].sha256)
    expect(await readFile(a[0].sourcePath, "utf8")).toBe("Alpha,35\nBeta,20")
    expect(await store.admit("chat-a", "user-a", first, "/user")).toEqual(a)
    await expect(store.admit("chat-a", "user-a", second, "/user")).rejects.toThrow("LOGINOM_INPUT_IDENTITY_CONFLICT")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
