import { expect, test } from "bun:test"
import { manualEditNotice } from "../src/manual-edits"

test("manual edits invalidate prior verification and keep the model notice concise", () => {
  const rename = { kind: "node_renamed" as const, guid: "import", from: "Импорт", to: "Продажи" }
  const removeLink = {
    kind: "link_removed" as const,
    link: { source: "import", output: "out", target: "group", input: "in" },
    sourceLabel: "Импорт",
    targetLabel: "Группировка",
  }
  expect(manualEditNotice([rename, removeLink], "call", "settled")).toEqual({
    text: "Учёл ваши правки в Loginom: переименовали «Импорт» → «Продажи», удалили связь «Импорт» → «Группировка».",
    loginom: {
      v: 1,
      operationId: "call",
      state: "settled",
      manualEdits: [rename, removeLink],
      verificationStale: true,
    },
  })
  const edits = Array.from({ length: 20 }, () => ({ ...rename, to: "a\nb".repeat(1000) }))
  const notice = manualEditNotice(edits, "call", "running")
  expect(notice?.loginom.manualEdits).toEqual(edits)
  expect(notice?.text.length).toBeLessThan(320)
  expect(notice?.text).not.toContain("\n")
  expect(notice?.text).toEndWith("ещё 17.")
  expect(manualEditNotice([], "call", "settled")).toBeUndefined()
})
