import { expect, test } from "bun:test"
import { loginomResultState, loginomResultSummary } from "../../src/session/loginom-result"

const reply = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value) }] })

test("control summaries use only top-level receipts and preserve text-only delivery", () => {
  const value = { operation_id: "op", status: "FAILED", error: { code: "FAILED", message: "Причина" } }
  expect(JSON.parse(loginomResultSummary(reply(value))!)).toMatchObject(value)
  expect(loginomResultSummary(reply({ rows: [value] }))).toBeUndefined()
  expect(loginomResultSummary({ content: [{ type: "text", text: "not JSON" }] })).toBeUndefined()
})

test("Dock action and node failures do not require the MCP error flag", () => {
  for (const status of ["FAILED", "AMBIGUOUS", "NOT_APPLIED"]) {
    expect(loginomResultState(reply({ operation_id: "op", status }))).toBe("failed")
    expect(loginomResultState(reply({ operation_id: "op", state: "settled", outcome: { status } }))).toBe("failed")
  }
  expect(loginomResultState({ content: [], structuredContent: { operation_id: "op", state: "failed" } })).toBe("failed")
  expect(loginomResultState({ content: [], isError: true })).toBe("failed")
  expect(
    loginomResultState(reply({ operation_id: "op", state: "settled", error: { code: "NODE_WORKER_REJECTED" } })),
  ).toBe("failed")
  expect(loginomResultState(reply({ operation_id: "op", state: "running" }))).toBe("pending")
})

test("running, repaired, and arbitrary data are not terminal failures", () => {
  for (const value of [
    { operation_id: "op", state: "settled", outcome: { status: "SUCCEEDED" } },
    { operation_id: "op", status: "SUCCEEDED", output: { status: "FAILED" } },
    { status: "FAILED" },
  ])
    expect(loginomResultState(reply(value))).toBe("completed")
  expect(loginomResultState({ content: [{ type: "text", text: "not json" }] })).toBe("completed")
})
