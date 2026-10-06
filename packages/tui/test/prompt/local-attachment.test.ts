import { describe, expect, test } from "bun:test"
import { readLocalAttachment, readLocalAttachmentWith } from "../../src/component/prompt/local-attachment"
import type { LocalFiles } from "../../src/component/prompt/local-attachment"
import { tmpdir } from "../fixture/fixture"
import path from "node:path"

function files(input: { mime: string; text?: string; bytes?: Uint8Array }): LocalFiles {
  return {
    mime: async () => input.mime,
    isFile: async () => true,
    readText: async () => input.text ?? "",
    readBytes: async () => input.bytes ?? new Uint8Array(),
  }
}

describe("prompt local attachments", () => {
  test("attaches a Loginom package by path without inlining its bytes", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "Сценарий с пробелами.LGP")
    await Bun.write(file, "<Package>private-tui-lgp-marker</Package>")
    expect(await readLocalAttachment(file)).toEqual({
      type: "path",
      mime: "application/x-loginom-package",
      path: file,
    })
  })

  test("checks a package's file type without reading text or bytes", async () => {
    const calls: string[] = []
    const attachment = await readLocalAttachmentWith(
      {
        mime: async () => "application/x-loginom-package",
        isFile: async () => {
          calls.push("stat")
          return true
        },
        readText: async () => {
          calls.push("text")
          throw Error("package text must not be read")
        },
        readBytes: async () => {
          calls.push("bytes")
          throw Error("package bytes must not be read")
        },
      },
      "/tmp/scenario.lgp",
    )
    expect(attachment?.type).toBe("path")
    expect(calls).toEqual(["stat"])
  })

  test("reads SVG attachments as text", async () => {
    expect(await readLocalAttachmentWith(files({ mime: "image/svg+xml", text: "<svg />" }), "/tmp/image.svg")).toEqual({
      type: "text",
      mime: "image/svg+xml",
      content: "<svg />",
    })
  })

  test("reads image and PDF attachments as bytes", async () => {
    const content = new Uint8Array([1, 2, 3])
    expect(await readLocalAttachmentWith(files({ mime: "application/pdf", bytes: content }), "/tmp/file.pdf")).toEqual({
      type: "binary",
      mime: "application/pdf",
      content,
    })
  })

  test("ignores unsupported and unreadable local files", async () => {
    expect(await readLocalAttachmentWith(files({ mime: "text/plain" }), "/tmp/file.txt")).toBeUndefined()
    expect(
      await readLocalAttachmentWith(
        {
          ...files({ mime: "image/png" }),
          readBytes: async () => Promise.reject(new Error("missing")),
        },
        "/tmp/missing.png",
      ),
    ).toBeUndefined()
  })
})
