// 0.4 `a080f7725c:packages/opencode/test/session/loginom-result.test.ts` without changes but the import, and the
// summary half of `loginom-truncation.test.ts`: OpenCode 2 truncates outside the plugin, so the truncation service is
// not part of this case (the Dock tool's own truncation is covered in `packages/server/test/loginom-dock-catalog.test.ts`).
import { expect, test } from "bun:test"
import { loginomResultState, loginomResultSummary } from "../src/loginom-result"

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

for (const status of ["AMBIGUOUS", "SUCCEEDED"])
  test("retains Loginom control state when a Unicode JSON table exceeds the backend limit: " + status, () => {
    const value = {
      operation_id: "large-table",
      status,
      state: "settled",
      phase: "read_output",
      node: { document_id: "document", workflow_id: "workflow", node_id: "node" },
      execution: { status: "completed", execution_id: "original-execution" },
      cleanup_complete: status === "SUCCEEDED",
      error: status === "AMBIGUOUS" ? { code: "READ_FAILED", message: "Ошибка чтения результата" } : null,
      next_step: { tool: "dock_operation_inspect", arguments: { operation_id: "large-table" } },
      output: { ports: [{ exact_table: { rows: [["Данные".repeat(12000)]] }, sample_complete: true }] },
    }
    const result = { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value }
    const summary = loginomResultSummary(result)
    if (!summary) throw Error("Expected control summary")
    const parsed = JSON.parse(summary)
    expect(parsed.execution).toEqual(value.execution)
    expect(parsed.node).toEqual(value.node)
    expect(parsed.error).toEqual(value.error)
    expect(parsed.next_step).toEqual(value.next_step)
    expect(parsed.status).toBe(status)
    expect(parsed.output).toBeUndefined()
    expect(parsed.data_delivery).toBe("omitted_by_backend_size_limit")
    expect(Buffer.byteLength(summary)).toBeLessThan(2048)
    expect(loginomResultState(result)).toBe(status === "SUCCEEDED" ? "completed" : "failed")
  })
