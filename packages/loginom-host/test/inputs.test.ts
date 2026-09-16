import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inputStore } from "../src/inputs"

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
