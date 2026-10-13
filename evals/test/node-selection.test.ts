import { expect, test } from "bun:test"
import { inspectSelection } from "../src/node-selection"

test.each(["pending", "running", "completed", "error"])(
  "standard rejects a JavaScript call in state %s even without a saved JS node",
  (status) => {
    const result = inspectSelection({
      mode: "standard",
      nodeTypes: ["TBGImportTextFile", "TBGExportTextFile"],
      parts: [{
        id: "part-js", type: "tool", tool: "loginom_dock_node_apply",
        state: { status, input: { target: { type: "programming.javascript" } } },
      }],
    })
    expect(result.jsCalls).toBe(1)
    expect(result.failures).toContain("JAVASCRIPT_NOT_ALLOWED")
  },
)

test.each(["TBGJavaScriptEngine", "TBGCodeModelComponentEngine"])(
  "standard rejects persisted JavaScript engine %s even without tool calls",
  (type) => {
    const result = inspectSelection({ mode: "standard", nodeTypes: [type], parts: [] })
    expect(result.jsNodes).toBe(1)
    expect(result.failures).toContain("JAVASCRIPT_NOT_ALLOWED")
  },
)

test("missing input remains incomplete instead of proving no JavaScript attempts", () => {
  const result = inspectSelection({
    mode: "standard",
    nodeTypes: null,
    parts: [{
      id: "part-incomplete", type: "tool", tool: "loginom_dock_node_apply",
      state: { status: "pending", input: {}, raw: "" },
    }],
  })
  expect(result.jsNodes).toBeNull()
  expect(result.failures).toContain("TOOL_INPUT_INCOMPLETE")
})
