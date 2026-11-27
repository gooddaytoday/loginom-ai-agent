import { expect, test } from "bun:test"
import { ownsIpc } from "@opencode/plugin/gui/host"
import { Schema } from "effect"
import { builtins } from "../main"
import { ReportSave } from "./contract"

test("Desktop routes report saving to the built-in Loginom main entry", () => {
  const owner = builtins.find((entry) => ownsIpc(entry.id, ReportSave.id))
  expect(owner?.id).toBe("loginom-gui")
  expect(owner?.mainEntry).toBeDefined()

  const { input, output } = ReportSave.spec.methods.write
  expect(Schema.encodeSync(input)({ title: "Save report", content: "{}" })).toEqual({
    title: "Save report",
    content: "{}",
  })
  expect(Schema.decodeUnknownSync(output)("/downloads/diagnostics.json")).toBe("/downloads/diagnostics.json")
  expect(Schema.decodeUnknownSync(output)(null)).toBeNull()
})
