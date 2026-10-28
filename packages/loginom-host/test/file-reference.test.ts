import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, unlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileReferences, inspectReferenceFile, verifyReferenceFile } from "../src/file-reference"
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

test.each(["LOGINOM_UPLOAD_CANCELLED", "LOGINOM_UPLOAD_UNCERTAIN"])("%s survives the Host error chain", (code) => {
  const original = Object.assign(Error(code), { details: { path: "/private/source", bytes: "SECRET" } })
  const received = hostException(hostFailure(original))
  expect(received.message).toBe(code)
  expect(hostErrorText(received)).not.toMatch(/SECRET|private/)
})

test("original grant binds path, owner and optional exact digest without staging or permission changes", () =>
  fixture(async (root) => {
    const store = fileReferences(join(root, "references")),
      source = join(root, "source.csv")
    await writeFile(source, "region;amount\nNorth;25\n", { mode: 0o640 })
    const snapshot = { ...(await inspectReferenceFile(source)), sha256: null }
    const reference = await store.reserve(owner, "source.csv", snapshot)
    expect(reference.snapshot).toEqual(snapshot)
    expect(await readdir(root)).toEqual(["source.csv"])
    expect(JSON.stringify(reference)).not.toMatch(/North;25|"(?:data|base64|buffer)":/)
    for (const binding of [
      { ...owner, chat: "foreign" },
      { ...owner, userMessage: "other" },
      { ...owner, generation: 8 },
      { ...owner, run: "other" },
    ])
      await expect(store.commit(binding, reference)).rejects.toThrow("LOGINOM_INPUT_INVALID")
    for (const forged of [
      { ...reference, grant: "forged" },
      { ...reference, snapshot: { ...snapshot, canonical_path: join(root, "other") } },
      { ...reference, snapshot: { ...snapshot, sha256: "0".repeat(64) } },
    ])
      await expect(store.commit(owner, forged)).rejects.toThrow("LOGINOM_INPUT_INVALID")
    expect(await store.commit(owner, reference)).toEqual(reference)
    expect(await store.commit(owner, reference)).toEqual(reference)
    expect((await stat(source)).mode & 0o777).toBe(0o640)
    await store.close()
    expect(await readFile(source, "utf8")).toContain("North;25")
    expect(await readdir(root)).toEqual(["source.csv"])
  }))

for (const change of ["inode", "mtime", "size", "bytes", "symlink", "missing"] as const)
  test(`grant refuses original ${change} changes before upload without deleting it`, () =>
    fixture(async (root) => {
      const source = join(root, "source.csv"),
        store = fileReferences(join(root, "references"))
      await writeFile(source, "original")
      const snapshot = { ...(await inspectReferenceFile(source)), sha256: null }
      const reference = await store.reserve(owner, "source.csv", snapshot)
      if (["inode", "symlink", "missing"].includes(change)) {
        await unlink(source)
        if (change === "inode") await writeFile(source, "original")
        if (change === "symlink") {
          const other = join(root, "other.csv")
          await writeFile(other, "original")
          await symlink(other, source)
        }
      } else if (change === "mtime") await utimes(source, new Date(), new Date(snapshot.mtime + 1000))
      else await writeFile(source, change === "size" ? "longer original" : "modified")
      await expect(store.commit(owner, reference)).rejects.toThrow("LOGINOM_FILE_CHANGED")
      await expect(verifyReferenceFile(snapshot)).rejects.toThrow("LOGINOM_FILE_CHANGED")
      await store.close()
      if (change !== "missing")
        expect(await readFile(source, "utf8")).toBe(
          change === "bytes" ? "modified" : change === "size" ? "longer original" : "original",
        )
    }))

test("discard and cancellation never remove the original", () =>
  fixture(async (root) => {
    const source = join(root, "source.csv"),
      store = fileReferences(join(root, "references"))
    await writeFile(source, "original")
    const snapshot = { ...(await inspectReferenceFile(source)), sha256: null }
    const reference = await store.reserve(owner, "source.csv", snapshot)
    await expect(verifyReferenceFile(snapshot, { signal: AbortSignal.abort() })).rejects.toThrow(
      "LOGINOM_UPLOAD_CANCELLED",
    )
    await store.discard(owner, reference.grant)
    await expect(store.commit(owner, reference)).rejects.toThrow("LOGINOM_INPUT_INVALID")
    await store.close()
    expect(await readFile(source, "utf8")).toBe("original")
  }))

test("startup removes recognized own legacy copies and retains unknown entries and symlink targets", () =>
  fixture(async (root) => {
    const staging = join(root, "references"),
      grant = "a".repeat(64),
      directory = join(staging, grant),
      name = grant + "-old.csv"
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeFile(
      join(directory, "grant.json"),
      JSON.stringify({ version: 1, grant, directory, name, path: join(directory, name) }),
    )
    await writeFile(join(directory, name), "old snapshot")
    const foreign = join(root, "foreign")
    await mkdir(foreign)
    await writeFile(join(foreign, "keep.csv"), "keep")
    await symlink(foreign, join(staging, "b".repeat(64)))
    await writeFile(join(staging, "unknown"), "keep")
    const store = fileReferences(staging)
    await store.cleanup()
    expect((await readdir(staging)).sort()).toEqual(["b".repeat(64), "unknown"])
    expect(await readFile(join(foreign, "keep.csv"), "utf8")).toBe("keep")
    await store.close()
  }))
