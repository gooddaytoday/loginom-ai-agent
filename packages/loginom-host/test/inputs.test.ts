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
    const repeated = await store.admit("chat-a", "user-a", first, "/user")
    expect(repeated[0]).toEqual({ ...a[0], name: repeated[0].name })
    expect(repeated[0].name).not.toBe(a[0].name)
    expect(repeated[0].upload).toEqual({ directory: "/user", overwrite: "reject" })
    const reopened = await inputStore(root).admit("chat-a", "user-a", first, "/user")
    expect(reopened[0].sourcePath).toBe(a[0].sourcePath)
    expect(reopened[0].sha256).toBe(a[0].sha256)
    expect(new Set([a[0].name, repeated[0].name, reopened[0].name]).size).toBe(3)
    expect(reopened[0].name.endsWith("-dataset.csv")).toBe(true)
    await expect(store.admit("chat-a", "user-a", second, "/user")).rejects.toThrow("LOGINOM_INPUT_IDENTITY_CONFLICT")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
