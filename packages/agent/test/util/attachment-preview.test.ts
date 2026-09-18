import { expect, test } from "bun:test"
import { attachmentPreview } from "../../src/util/attachment-preview"

test("small attachments retain their exact model text", () => {
  expect(attachmentPreview("amount\n10\n20\n")).toBe("amount\n10\n20\n")
})

test("previews enforce Read line, UTF-8 byte, and individual line limits", () => {
  for (const text of ["row\n".repeat(3000), ("я".repeat(1000) + "\n").repeat(100), "x".repeat(100000)]) {
    const preview = attachmentPreview(text + "HIDDEN_END")
    expect(Buffer.byteLength(preview)).toBeLessThan(51 * 1024)
    expect(preview.split("\n").length).toBeLessThanOrEqual(2002)
    expect(preview).toContain("preview truncated")
    expect(preview).not.toContain("HIDDEN_END")
  }
})
