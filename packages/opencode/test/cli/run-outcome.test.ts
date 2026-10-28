import { expect, test } from "bun:test"
import type { ToolPart } from "@opencode-ai/sdk/v2"
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

function missing(filePath: string, input: Record<string, unknown> = {}) {
  const result = part("read", { filePath, ...input }, true)
  if (result.state.status !== "error") throw Error("invalid fixture")
  result.state.error = `File not found: ${filePath}`
  return result
}

test.each(["message", "next-message"])("a corrected missing read clears its failure in %s", (messageID) => {
  const outcome = runToolOutcome()
  outcome.observe(missing("/data/poitns.csv"))
  expect(outcome.failed()).toBe(true)
  outcome.observe({ ...part("read", { filePath: "/data/points.csv" }, false), messageID })
  expect(outcome.failed()).toBe(false)
})

test.each([
  { filePath: "/data/orders.csv" },
  { filePath: "/other/points.csv" },
  { filePath: "/data/points.txt" },
  { filePath: "/data/points.csv", offset: 20 },
])("an unrelated read does not repair a missing read: %j", (input) => {
  const outcome = runToolOutcome()
  outcome.observe(missing("/data/poitns.csv"))
  outcome.observe(part("read", input, false))
  expect(outcome.failed()).toBe(true)
})

test("only a successful read can repair the missing read", () => {
  const outcome = runToolOutcome()
  outcome.observe(missing("/data/poitns.csv"))
  outcome.observe(part("glob", { filePath: "/data/points.csv" }, false))
  outcome.observe(missing("/data/points.csv"))
  expect(outcome.failed()).toBe(true)
  const result = part("read", { filePath: "/data/points.csv" }, false)
  if (result.state.status !== "completed") throw Error("invalid fixture")
  result.state.metadata.isError = true
  outcome.observe(result)
  expect(outcome.failed()).toBe(true)
  outcome.observe(part("read", { filePath: "/data/points.csv" }, false))
  expect(outcome.failed()).toBe(false)
})

test("a corrected read preserves other unresolved failures", () => {
  const outcome = runToolOutcome()
  outcome.observe(missing("/data/poitns.csv"))
  outcome.observe(missing("/data/orders.csv"))
  outcome.observe(part("read", { filePath: "/data/points.csv" }, false))
  expect(outcome.failed()).toBe(true)
  outcome.observe(part("read", { filePath: "/data/orders.csv" }, false))
  expect(outcome.failed()).toBe(false)
})

test("a corrected path cannot repair a different read error", () => {
  const outcome = runToolOutcome()
  outcome.observe(part("read", { filePath: "/data/poitns.csv" }, true))
  outcome.observe(part("read", { filePath: "/data/points.csv" }, false))
  expect(outcome.failed()).toBe(true)
})

test("a pending or running corrected read cannot repair a failure", () => {
  const outcome = runToolOutcome()
  outcome.observe(missing("/data/poitns.csv"))
  const result = part("read", { filePath: "/data/points.csv" }, false)
  outcome.observe({ ...result, state: { status: "running", input: result.state.input, time: { start: 3 } } })
  expect(outcome.failed()).toBe(true)
})

test("a corrected read in another session cannot repair a failure", () => {
  const outcome = runToolOutcome()
  outcome.observe(missing("/data/poitns.csv"))
  outcome.observe({ ...part("read", { filePath: "/data/points.csv" }, false), sessionID: "other-session" })
  expect(outcome.failed()).toBe(true)
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

test("only unresolved scenario connection admission preserves the lazy preflight failure", () => {
  const outcome = runToolOutcome()
  const help = part("loginom_read", {}, true)
  if (help.state.status !== "error") throw Error("invalid fixture")
  help.state.error = "LOGINOM_CONNECTION_NOT_READY"
  outcome.observe(help)
  expect(outcome.connectionFailure()).toBeUndefined()

  const prepare = part("loginom_dock_prepare", {}, true)
  if (prepare.state.status !== "error") throw Error("invalid fixture")
  prepare.state.error = "LOGINOM_CONFIG_REQUIRED"
  outcome.observe(prepare)
  expect(outcome.connectionFailure()).toBe("LOGINOM_CONFIG_REQUIRED")
  outcome.observe(part("loginom_dock_diagnostics", {}, false))
  expect(outcome.connectionFailure()).toBe("LOGINOM_CONFIG_REQUIRED")
  const pending = part("loginom_dock_prepare", {}, false)
  if (pending.state.status !== "completed") throw Error("invalid fixture")
  pending.state.metadata.loginomPending = true
  outcome.observe(pending)
  expect(outcome.connectionFailure()).toBe("LOGINOM_CONFIG_REQUIRED")
  outcome.observe(part("loginom_dock_prepare", {}, false))
  expect(outcome.connectionFailure()).toBeUndefined()
  expect(outcome.failed()).toBe(false)
})

test.each([
  "LOGINOM_LOGIN_REJECTED",
  "LOGINOM_ACCOUNT_MISMATCH",
  "LOGINOM_LOGIN_UNAVAILABLE",
  "LOGINOM_BROWSER_START_FAILED",
])("lazy browser admission keeps the connection failure contract: %s", (failure) => {
  const outcome = runToolOutcome()
  const prepare = part("loginom_dock_prepare", {}, true)
  if (prepare.state.status !== "error") throw Error("invalid fixture")
  prepare.state.error = failure
  outcome.observe(prepare)
  expect(outcome.connectionFailure()).toBe("LOGINOM_CONNECTION_NOT_READY")
  outcome.observe(part("loginom_dock_prepare", {}, false))
  expect(outcome.connectionFailure()).toBeUndefined()
})
