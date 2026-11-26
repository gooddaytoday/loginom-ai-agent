import { describe, expect, test } from "bun:test"
import { render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { binaryReferenceMime } from "@/composer/attachments/binary-reference"
import { createComposerAttachments } from "@/composer/attachments/attachments"
import type { ComposerPrompt } from "@/composer/types"

function setup(local: boolean, getPathForFile?: (file: File) => string) {
  const [store, setStore] = createStore<{ prompt: ComposerPrompt }>({ prompt: [] })
  const uploads: string[] = []
  let attachments!: ReturnType<typeof createComposerAttachments>

  const dispose = render(() => {
    attachments = createComposerAttachments({
      capture: () => ({
        current: () => store.prompt,
        cursor: () => 0,
        set: (prompt) => setStore({ prompt }),
      }),
      editor: () => document.createElement("div"),
      focusEditor() {},
      addPart: () => false,
      setDraggingType() {},
      directory: () => "/repo",
      destination: () => ({
        input: { image: false, pdf: false },
        local,
        upload: async (file) => {
          uploads.push(file.name)

          return `/tmp/uploads/${file.name}`
        },
      }),
      isDialogActive: () => false,
      duplicate() {},
      onError: (error) => {
        throw error
      },
      onUploadError: (error) => {
        throw error
      },
      getPathForFile,
    })

    return null
  }, document.createElement("div"))

  return { attachments, store, uploads, dispose }
}

// Reading any byte of the file fails the test: a binary data file is attached by its path.
const unreadable = (name: string) => {
  const file = new File([Uint8Array.of(0, 255, 1, 2)], name)
  file.slice = () => {
    throw Error("must not read reference bytes")
  }

  return file
}

// The prompt is a store proxy with a generated id per part.
const plain = (prompt: ComposerPrompt) => prompt.map(({ id: _id, ...rest }) => rest)

describe("binary data attachments", () => {
  test.each([
    ["sales.DB", "application/octet-stream"],
    ["data.lgd", "application/octet-stream"],
    ["legacy.xls", "application/vnd.ms-excel"],
  ])("%s keeps its type", (name, mime) => {
    expect(binaryReferenceMime(name)).toBe(mime)
  })

  test("other names are not references", () => {
    expect(["sales.dbx", "db", "book.xlsx", "package.lgp", "notes.txt"].map(binaryReferenceMime)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  test.each([
    ["sales.DB", "application/octet-stream"],
    ["data.lgd", "application/octet-stream"],
    ["legacy.xls", "application/vnd.ms-excel"],
  ])("a local drop of %s is attached by path without reading its bytes", async (name, mime) => {
    const { attachments, store, uploads, dispose } = setup(true, (file) => `C:\\Datasets\\${file.name}`)

    expect(await attachments.addAttachments([unreadable(name)])).toBe(true)
    expect(plain(store.prompt)).toEqual([{ type: "path", filename: name, mime, path: `C:\\Datasets\\${name}` }])
    expect(uploads).toEqual([])
    dispose()
  })

  test("a file on a remote server is still uploaded with its type", async () => {
    const { attachments, store, uploads, dispose } = setup(false)

    await attachments.addAttachments([new File([Uint8Array.of(0, 1)], "legacy.xls")])
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(uploads).toEqual(["legacy.xls"])
    expect(plain(store.prompt)).toEqual([
      { type: "path", filename: "legacy.xls", mime: "application/vnd.ms-excel", path: "/tmp/uploads/legacy.xls" },
    ])
    dispose()
  })
})
