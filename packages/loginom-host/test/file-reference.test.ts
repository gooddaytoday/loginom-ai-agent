import { expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileReferences, inspectReferenceFile, stageReferenceFile, verifyReferenceFile } from "../src/file-reference"
import { hostException, hostFailure, hostErrorText } from "../src/errors"

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "loginom-reference-"))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
const owner = { chat: "chat", userMessage: "msg_original", generation: 7, run: "run" }

test.each(["LOGINOM_UPLOAD_CANCELLED", "LOGINOM_UPLOAD_UNCERTAIN"])(
  "%s survives the runtime and Host error chain without private details",
  (code) => {
    const original = Object.assign(Error(code), { details: { path: "/private/source", bytes: "SECRET" } })
    const received = hostException(hostFailure(original))
    expect(received.message).toBe(code)
    expect(hostErrorText(received)).toContain(code)
    expect(hostErrorText(received)).not.toMatch(/SECRET|private/)
  },
)

test("reference grant binds exact staging path, chat, original message, run and generation; no bytes in IPC", () =>
  fixture(async (root) => {
    const store = fileReferences(join(root, "references"))
    const source = join(root, "source.csv")
    await writeFile(source, "region;amount\nNorth;25\n")
    const slot = await store.reserve(owner, "source.csv")
    const reference = await stageReferenceFile(source, await inspectReferenceFile(source), slot)
    const ipc = JSON.parse(JSON.stringify(reference))
    expect(Object.keys(ipc).sort()).toEqual(["chat", "generation", "grant", "name", "snapshot", "userMessage"].sort())
    expect(JSON.stringify(ipc)).not.toContain("North;25")
    expect(JSON.stringify(ipc)).not.toMatch(/"(?:data|buffer|base64)":/)
    for (const binding of [
      { ...owner, chat: "foreign" },
      { ...owner, userMessage: "msg_other" },
      { ...owner, generation: 8 },
      { ...owner, run: "other" },
    ])
      await expect(store.commit(binding, reference)).rejects.toThrow("LOGINOM_INPUT_INVALID")
    await expect(store.commit(owner, { ...reference, grant: "forged" })).rejects.toThrow("LOGINOM_INPUT_INVALID")
    await expect(
      store.commit(owner, { ...reference, snapshot: { ...reference.snapshot, canonical_path: source } }),
    ).rejects.toThrow("LOGINOM_INPUT_INVALID")
    const admitted = await store.commit(owner, reference)
    expect(await store.commit(owner, reference)).toEqual(admitted)
    expect((await stat(slot.directory)).mode & 0o777).toBe(0o700)
    expect((await stat(slot.path)).mode & 0o777).toBe(0o400)
    expect(await readFile(slot.path, "utf8")).toBe(await readFile(source, "utf8"))
    await store.close()
    expect(await readdir(join(root, "references"))).toEqual([])
  }))

test("streaming stage checks exact-scan SHA and removes an unpublished changed snapshot", () =>
  fixture(async (root) => {
    const store = fileReferences(join(root, "references"))
    const source = join(root, "source.csv")
    await writeFile(source, "unchanged")
    const slot = await store.reserve(owner, "data.csv")
    await expect(
      stageReferenceFile(source, await inspectReferenceFile(source), slot, { sha256: "0".repeat(64) }),
    ).rejects.toThrow("LOGINOM_FILE_CHANGED")
    expect(await readdir(slot.directory)).toEqual(["grant.json"])
    await store.close()
  }))

for (const change of ["inode", "mtime", "size", "bytes", "symlink"] as const) {
  test(`stage refuses source ${change} changes between reads`, () =>
    fixture(async (root) => {
      const store = fileReferences(join(root, "references"))
      const source = join(root, "source.csv")
      await writeFile(source, Buffer.alloc(700000, 65))
      const identity = await inspectReferenceFile(source)
      const slot = await store.reserve(owner, "source.csv")
      let changed = false
      await expect(
        stageReferenceFile(source, identity, slot, {
          onProgress: async () => {
            if (changed) return
            changed = true
            if (change === "inode" || change === "symlink") {
              await unlink(source)
              if (change === "symlink") {
                const other = join(root, "other.csv")
                await writeFile(other, Buffer.alloc(700000, 65))
                await symlink(other, source)
              } else await writeFile(source, Buffer.alloc(700000, 65))
            } else if (change === "size") await writeFile(source, "short")
            else if (change === "bytes") await writeFile(source, Buffer.alloc(700000, 66))
            else {
              const { utimes } = await import("node:fs/promises")
              await utimes(source, new Date(), new Date(identity.mtime + 1000))
            }
          },
        }),
      ).rejects.toThrow("LOGINOM_FILE_CHANGED")
      expect(await readdir(slot.directory)).toEqual(["grant.json"])
      await store.close()
    }))
}

test("snapshot replacement or byte changes refuse reuse; cancellation releases only its own staging file", () =>
  fixture(async (root) => {
    const store = fileReferences(join(root, "references"))
    const source = join(root, "source.csv")
    await writeFile(source, Buffer.alloc(700000))
    const first = await store.reserve(owner, "first.csv")
    const second = await store.reserve(owner, "second.csv")
    const reference = await stageReferenceFile(source, await inspectReferenceFile(source), first)
    await store.commit(owner, reference)
    const controller = new AbortController()
    await expect(
      stageReferenceFile(source, await inspectReferenceFile(source), second, {
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toThrow("LOGINOM_UPLOAD_CANCELLED")
    expect(await readFile(first.path)).toHaveLength(700000)
    await chmod(first.path, 0o600)
    await writeFile(first.path, Buffer.alloc(700000, 1))
    await chmod(first.path, 0o400)
    await expect(verifyReferenceFile(reference.snapshot)).rejects.toThrow("LOGINOM_FILE_CHANGED")
    await expect(store.commit(owner, reference)).rejects.toThrow("LOGINOM_FILE_CHANGED")
    await store.close()
  }))
