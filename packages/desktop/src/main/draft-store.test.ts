import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { createDesktopDraftStore } from "./draft-store.ts"

test("flushes the latest buffered draft and stores blobs", () => {
  const store = createDesktopDraftStore(":memory:")
  store.set("prompt", "first")
  store.set("prompt", "latest")
  assert.equal(store.get("prompt"), "latest")
  store.flush()
  assert.equal(store.get("prompt"), "latest")

  const bytes = new TextEncoder().encode("image")
  const id = store.putBlob(bytes)
  const stored = store.getBlob(id)
  assert.ok(stored)
  assert.deepEqual(new Uint8Array(stored), bytes)
  store.close()
})

test("closing on exit persists a draft still inside the write buffer", () => {
  const directory = mkdtempSync(join(tmpdir(), "desktop-drafts-"))
  try {
    const filename = join(directory, "drafts.sqlite")
    const store = createDesktopDraftStore(filename)
    // Stored values are the renderer's serialized JSON documents.
    store.set("prompt", JSON.stringify({ text: "kept" }))
    store.set("removed", JSON.stringify({ text: "draft" }))
    store.flush()
    store.set("prompt", JSON.stringify({ text: "typed before exit" }))
    store.set("removed", null)
    store.close()

    const reopened = createDesktopDraftStore(filename)
    assert.equal(reopened.get("prompt"), JSON.stringify({ text: "typed before exit" }))
    assert.equal(reopened.get("removed"), null)
    reopened.close()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
