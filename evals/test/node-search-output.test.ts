import { expect, test } from "bun:test"
import { readNodeEvents } from "../src/node-events"

function event(tool: string, output: string) {
  return JSON.stringify({ type: "tool_use", part: { id: "search", tool,
    state: { status: "completed", input: {}, output, time: { start: 1, end: 2 } } } })
}

test("search snippets containing source braces are not node receipts", () => {
  const output = 'Found 1 item(s):\nimport { t } from "testcafe";\n{"status":"SUCCEEDED"}'
  const parsed = readNodeEvents(event("loginom_find", output))
  expect(parsed.failures).toEqual([])
  expect(parsed.calls).toHaveLength(1)
  expect(parsed.calls[0]!.output).toEqual({})
})

test("malformed node receipt JSON still fails closed", () => {
  expect(() => readNodeEvents(event("loginom_dock_node_wait", '{"status":}'))).toThrow()
})
