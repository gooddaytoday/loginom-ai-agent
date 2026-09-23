import { expect, test } from "bun:test"
import type { ToolPart } from "@loginom-ai-agent/sdk/v2"
import { runToolOutcome } from "../../src/cli/run-outcome"

function part(tool: string, input: Record<string, unknown>, failed: boolean): ToolPart {
  return {
    id: "part",
    type: "tool",
    tool,
    callID: "call",
    sessionID: "session",
    messageID: "message",
    state: failed
      ? { status: "error", input, error: "failed", time: { start: 1, end: 2 } }
      : { status: "completed", input, output: "done", title: "done", metadata: {}, time: { start: 3, end: 4 } },
  }
}

test("a successful unrelated call cannot erase an unresolved failure", () => {
  const outcome = runToolOutcome()
  outcome.observe(part("apply", { operation_id: "one", value: 1 }, true))
  outcome.observe(part("read", { operation_id: "one", value: 1 }, false))
  outcome.observe(part("apply", { operation_id: "two", value: 1 }, false))
  expect(outcome.failed()).toBe(true)
  outcome.observe(part("apply", { operation_id: "one", value: 1 }, false))
  expect(outcome.failed()).toBe(false)
})

test("exact argument retry ignores object key order but preserves array order", () => {
  const outcome = runToolOutcome()
  outcome.observe(part("lookup", { b: { z: 1, a: 2 }, a: [1, 2] }, true))
  outcome.observe(part("lookup", { a: [2, 1], b: { a: 2, z: 1 } }, false))
  expect(outcome.failed()).toBe(true)
  outcome.observe(part("lookup", { a: [1, 2], b: { a: 2, z: 1 } }, false))
  expect(outcome.failed()).toBe(false)
})

test("invalid and MCP error markers cannot be mistaken for completed success", () => {
  const outcome = runToolOutcome()
  const result = part("probe", {}, false)
  if (result.state.status !== "completed") throw Error("invalid fixture")
  result.state.metadata.isError = true
  outcome.observe(result)
  expect(outcome.failed()).toBe(true)
  outcome.observe(part("probe", {}, false))
  expect(outcome.failed()).toBe(false)
  outcome.observe(part("invalid", { tool: "unknown", error: "not available" }, false))
  outcome.observe(part("probe", {}, false))
  expect(outcome.failed()).toBe(true)
})

test("an arbitrary MCP operation_id does not imply the Loginom operation contract", () => {
  const outcome = runToolOutcome()
  outcome.observe(part("generic_mcp", { operation_id: "one", value: 1 }, true))
  outcome.observe(part("generic_mcp", { operation_id: "one", value: 2 }, false))
  expect(outcome.failed()).toBe(true)
  outcome.observe(part("generic_mcp", { value: 1, operation_id: "one" }, false))
  expect(outcome.failed()).toBe(false)
})

test("a Loginom tool error does not fail the run", () => {
  const outcome = runToolOutcome()
  outcome.observe(part("loginom_dock_artifact_deliver", { operation_id: "deliver" }, true))
  expect(outcome.failed()).toBe(false)
  outcome.observe(part("bash", { command: "ls" }, true))
  expect(outcome.failed()).toBe(true)
  outcome.observe(part("invalid", { tool: "loginom_missing", error: "not available" }, false))
  expect(outcome.failed()).toBe(true)
})

test("a running Loginom retry does not fail the run", () => {
  const outcome = runToolOutcome()
  outcome.observe(part("loginom_apply", { operation_id: "one" }, true))
  const pending = part("loginom_apply", { operation_id: "one" }, false)
  if (pending.state.status !== "completed") throw Error("invalid fixture")
  pending.state.metadata.loginomPending = true
  outcome.observe(pending)
  expect(outcome.failed()).toBe(false)
})
