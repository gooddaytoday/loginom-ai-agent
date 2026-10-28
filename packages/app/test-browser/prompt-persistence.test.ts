import { describe, expect, test } from "bun:test"
import type { AsyncStorage } from "@solid-primitives/storage"
import { createEffect, createRoot } from "solid-js"
import type { Platform } from "@/context/platform"
import { createPromptReady, createPromptSession } from "@/context/prompt-state"
import { ServerScope } from "@/utils/server-scope"
import { createDraftStore } from "@/utils/draft-store"

let read: ((value: string | null) => void) | undefined

const storage: AsyncStorage = {
  getItem: () => new Promise((resolve) => (read = resolve)),
  setItem: async () => undefined,
  removeItem: async () => undefined,
  clear: async () => undefined,
  key: async () => null,
  getLength: async () => 0,
  length: Promise.resolve(0),
}

const platform: Platform = {
  platform: "web",
  openExternal: () => undefined,
  restart: async () => undefined,
  notify: async () => undefined,
  draftStore: {
    ...storage,
    putBlob: async () => {
      throw new Error("putBlob is not used by this test")
    },
  },
}

describe("prompt persistence", () => {
  test("waits for an async draft to hydrate before reporting ready", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const session = createPromptSession(ServerScope.local, { draftID: "draft-async" }, undefined, platform)
        const ready = createPromptReady(() => session)

        expect(ready()).toBe(false)
        expect(session.current()[0]).toMatchObject({ type: "text", content: "" })

        read?.(
          JSON.stringify({
            prompt: [{ type: "text", content: "persisted draft", start: 0, end: 15 }],
            cursor: 15,
            context: { items: [] },
          }),
        )

        createEffect(() => {
          if (!ready()) return
          try {
            expect(session.current()[0]).toMatchObject({ type: "text", content: "persisted draft" })
            dispose()
            resolve()
          } catch (error) {
            dispose()
            reject(error)
          }
        })
      })
    })
  })
})

test("moves legacy image data URLs into blobs and hydrates object URLs", async () => {
  const documents = new Map<string, string>()
  const blobs = new Map<string, Blob>()
  const store = createDraftStore({
    get: async (key) => documents.get(key) ?? null,
    set: async (key, value) => void documents.set(key, value),
    remove: async (key) => void documents.delete(key),
    putBlob: async (blob) => {
      const id = String(blob.size)
      blobs.set(id, blob)
      return id
    },
    getBlob: async (id) => blobs.get(id) ?? null,
  })

  await store.setItem("prompt", JSON.stringify({ prompt: [{ type: "image", dataUrl: "data:image/png;base64,YQ==" }] }))
  expect(documents.get("prompt")).not.toContain("dataUrl")
  const value = JSON.parse((await store.getItem("prompt"))!)
  expect(value.prompt[0].blob.id).toBe("1")
  expect(value.prompt[0].blob.url).toStartWith("blob:")
})

test("does not let delayed blob migration overwrite a newer draft", async () => {
  const documents = new Map<string, string>()
  const migration = Promise.withResolvers<void>()
  const store = createDraftStore({
    get: async () => null,
    set: async (key, value) => void documents.set(key, value),
    remove: async () => undefined,
    putBlob: async () => {
      await migration.promise
      return "blob"
    },
    getBlob: async () => null,
  })
  const older = store.setItem(
    "prompt",
    JSON.stringify({ prompt: [{ type: "image", dataUrl: "data:image/png;base64,YQ==" }] }),
  )
  await Bun.sleep(0)
  await store.setItem("prompt", JSON.stringify({ prompt: [{ type: "text", content: "latest" }] }))
  migration.resolve()
  await older

  expect(documents.get("prompt")).toContain("latest")
})

test("restores a native reference descriptor without blob storage or re-reading the file", async () => {
  const documents = new Map<string, string>()
  const store = createDraftStore({
    get: async (key) => documents.get(key) ?? null,
    set: async (key, value) => void documents.set(key, value),
    remove: async () => undefined,
    putBlob: async () => {
      throw Error("reference must not become a blob")
    },
    getBlob: async () => null,
  })
  const reference = {
    kind: "local_reference",
    sourcePath: "/tmp/данные %#.csv",
    filename: "данные %#.csv",
    size: 5 * 1024 ** 3,
    lastModified: 123,
    mime: "text/plain",
    receipt: "c".repeat(64),
  }
  const prompt = [
    {
      type: "image",
      id: "native",
      filename: reference.filename,
      mime: reference.mime,
      sourcePath: reference.sourcePath,
      reference,
      blob: { id: "reference:" + reference.receipt, url: "" },
    },
  ]
  await store.setItem("native", JSON.stringify({ prompt }))
  const restored = JSON.parse((await store.getItem("native"))!).prompt[0]
  expect(restored.reference).toEqual(reference)
  expect(JSON.stringify(restored)).not.toMatch(/data:|base64/)
  expect(restored.blob.id).toBe("reference:" + reference.receipt)
})
