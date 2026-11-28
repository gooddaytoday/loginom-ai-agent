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
  const changes = { edits: [rename, removeLink], omitted: 0 }
  expect(manualEditNotice(changes, "operation", "settled")).toEqual({
    text: "Учёл ваши правки в Loginom: переименовали «Импорт» → «Продажи», удалили связь «Импорт» → «Группировка».",
    loginom: {
      v: 1,
      operationId: "operation",
      state: "settled",
      manualEdits: changes,
      verificationStale: true,
    },
  })
  const edits = Array.from({ length: 20 }, () => ({ ...rename, to: "a\nb".repeat(30) }))
  const notice = manualEditNotice({ edits, omitted: 10 }, undefined, "running")
  expect(notice?.loginom).toBeUndefined()
  expect(notice?.text.length).toBeLessThan(320)
  expect(notice?.text).not.toContain("\n")
  expect(notice?.text).toEndWith("ещё 27.")
  expect(manualEditNotice({ edits: [], omitted: 0 }, "operation", "settled")).toBeUndefined()
})
