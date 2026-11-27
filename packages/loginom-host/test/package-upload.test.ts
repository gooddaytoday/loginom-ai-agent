import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { UploadInput, validUpload } from "../src/package-upload"

describe("package copy input", () => {
  const upload = { generation: 1, name: "Продажи 2026.lgp", content: "ZGVtbw==" }

  test("accepts an ordinary package and rejects names that can escape or disguise it", () => {
    expect(Schema.is(UploadInput)(upload)).toBe(true)
    expect(validUpload(upload)).toBe(true)
    for (const name of ["../file.lgp", "root\\file.lgp", "/user/file.lgp", "file.lgp\n", "file.lgp.txt"])
      expect(Schema.is(UploadInput)({ ...upload, name })).toBe(false)
  })

  test("rejects zero bytes and malformed content", () => {
    for (const content of ["", "ZGVtbw", "ZGVt!bw==", "ZGVtbw==\n"])
      expect(validUpload({ ...upload, content })).toBe(false)
  })
})
